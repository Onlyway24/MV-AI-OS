import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import type { AuthorizedResearchMissionInput, RestrictedHttpsAcquisition } from "../../src/research/authorized-research.js";
import { AuthorizedResearchService } from "../../src/research/authorized-research-service.js";
import type { RestrictedHttpsClient } from "../../src/research/restricted-https-client.js";

describe("AuthorizedResearchService", () => {
  it("creates immutable snapshots, corroborated evidence and a durable replay-safe Evidence Pack", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T10:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const planes = new OperationalPlaneService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
    await registerSource(planes, "source-one", "https://one.example/research/");
    await registerSource(planes, "source-two", "https://two.example/research/");
    const https = new FixtureHttpsClient(new Map([
      ["https://one.example/research/report", document("Fonte Uno")],
      ["https://two.example/research/report", document("Fonte Due")],
    ]));
    const service = new AuthorizedResearchService({ actorId: "actor-local", clock, https, operationalPlanes: planes, repositories, workspaceId: "workspace-local" });

    const mission = await service.run(input());

    expect(mission).toMatchObject({ blockers: [], evidenceIds: ["evidence-one", "evidence-two"], packIds: ["pack-opportunity-one"], status: "READY", version: 1 });
    expect(mission.claimResults).toEqual([expect.objectContaining({ independentSourceCount: 2, requiredSourceCount: 2, status: "VERIFIED" })]);
    expect(https.calls).toBe(2);
    const snapshot = await repositories.transaction(({ authorizedResearch }) => authorizedResearch.getSnapshotById("research-day-001:evidence-one"));
    expect(snapshot).toMatchObject({ attribution: { authorOrPublisher: "Fonte Uno", origin: "PAGE_METADATA" }, contentPublishedAt: "2026-07-14T08:00:00.000Z", contentType: "text/html", evidenceId: "evidence-one", extractedTables: [[['Indicatore', 'Valore'], ['Domanda', 'Confermata']]], finalUrl: "https://one.example/research/report", redirectChain: [] });
    expect(snapshot?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const pack = await planes.inspectEvidencePack("pack-opportunity-one");
    expect(pack).toMatchObject({ evidenceIds: ["evidence-one", "evidence-two"], status: "READY" });
    await repositories.close();

    const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const replayHttps = new FixtureHttpsClient(new Map());
    const replayPlanes = new OperationalPlaneService({ actorId: "actor-local", clock, repositories: reopened, workspaceId: "workspace-local" });
    const replay = new AuthorizedResearchService({ actorId: "actor-local", clock, https: replayHttps, operationalPlanes: replayPlanes, repositories: reopened, workspaceId: "workspace-local" });
    expect(await replay.run(input())).toEqual(mission);
    expect(replayHttps.calls).toBe(0);
    await reopened.close();
  }));

  it("blocks the mission without creating evidence when required corroboration is insufficient", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T10:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const planes = new OperationalPlaneService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
    await registerSource(planes, "source-one", "https://one.example/research/");
    await registerSource(planes, "source-two", "https://two.example/research/");
    const service = new AuthorizedResearchService({
      actorId: "actor-local",
      clock,
      https: new FixtureHttpsClient(new Map([
        ["https://one.example/research/report", document("Fonte Uno")],
        ["https://two.example/research/report", document("Fonte Due", "La fonte non contiene la frase richiesta e non corrobora il claim.")],
      ])),
      operationalPlanes: planes,
      repositories,
      workspaceId: "workspace-local",
    });

    const mission = await service.run({ ...input(), missionId: "research-day-blocked", packs: [{ evidenceIds: ["evidence-one", "evidence-two"], opportunityId: "opportunity-one", packId: "pack-blocked" }] });

    expect(mission.status).toBe("BLOCKED");
    expect(mission.blockers).toEqual([expect.stringMatching(/fonti indipendenti 1\/2/iu)]);
    expect(mission.evidenceIds).toEqual([]);
    expect(await repositories.transaction(({ operationalPlanes }) => operationalPlanes.getEvidenceById("evidence-one"))).toBeUndefined();
    await repositories.close();
  }));

  it("blocks editorial pages that do not provide their own attribution", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T10:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const planes = new OperationalPlaneService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
    await planes.registerSource({ canonicalReference: "https://editorial.example/research/", category: "EDITORIAL", maxFreshnessDays: 10, name: "Editoriale", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "source-one", status: "AUTHORIZED" });
    await registerSource(planes, "source-two", "https://two.example/research/");
    const noAttribution = document("Editoriale").replace('<meta name="author" content="Editoriale">', "");
    const service = new AuthorizedResearchService({ actorId: "actor-local", clock, https: new FixtureHttpsClient(new Map([["https://one.example/research/report", noAttribution], ["https://two.example/research/report", document("Fonte Due")], ["https://editorial.example/research/report", noAttribution]])), operationalPlanes: planes, repositories, workspaceId: "workspace-local" });
    const changed = input();
    const firstTarget = changed.targets[0];
    const secondTarget = changed.targets[1];
    if (firstTarget === undefined || secondTarget === undefined) throw new Error("Research test fixture is incomplete");
    const mission = await service.run({ ...changed, missionId: "research-attribution-blocked", targets: [{ ...firstTarget, url: "https://editorial.example/research/report" }, secondTarget] });
    expect(mission).toMatchObject({ blockers: [expect.stringMatching(/attribution/iu)], status: "BLOCKED" });
    await repositories.close();
  }));
});

function input(): AuthorizedResearchMissionInput {
  return {
    claims: [{ claimId: "claim-demand", contradictionPhrases: ["domanda smentita"], requiredPhrases: ["domanda verificata", "budget limitato"], riskDomain: "GENERAL", statement: "La domanda può essere verificata con un esperimento a budget limitato." }],
    maxBytesPerSource: 50_000,
    maxRedirects: 1,
    missionId: "research-day-001",
    packs: [{ evidenceIds: ["evidence-one", "evidence-two"], opportunityId: "opportunity-one", packId: "pack-opportunity-one" }],
    targets: [
      { claimIds: ["claim-demand"], evidenceId: "evidence-one", limitations: ["Non dimostra conversioni future."], sourceId: "source-one", url: "https://one.example/research/report" },
      { claimIds: ["claim-demand"], evidenceId: "evidence-two", limitations: ["Campione limitato al mercato osservato."], sourceId: "source-two", url: "https://two.example/research/report" },
    ],
    timeoutMs: 2_000,
  } as const;
}

function document(author: string, body = "La domanda verificata può essere valutata con budget limitato. Il rapporto descrive metodo, campione e limiti della rilevazione per consentire una verifica indipendente."): string {
  return `<html><head><title>Rapporto di mercato</title><meta name="author" content="${author}"><meta property="article:published_time" content="2026-07-14T08:00:00.000Z"></head><body><article>${body}</article><table><tr><th>Indicatore</th><th>Valore</th></tr><tr><td>Domanda</td><td>Confermata</td></tr></table></body></html>`;
}

async function registerSource(service: OperationalPlaneService, sourceId: string, canonicalReference: string): Promise<void> {
  await service.registerSource({ canonicalReference, category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: sourceId, permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: true, sourceId, status: "AUTHORIZED" });
}

class FixtureHttpsClient implements RestrictedHttpsClient {
  public calls = 0;
  public constructor(private readonly fixtures: ReadonlyMap<string, string>) {}
  public acquire(input: { readonly url: string }): Promise<RestrictedHttpsAcquisition> {
    this.calls += 1;
    const body = this.fixtures.get(input.url);
    if (body === undefined) return Promise.reject(new Error("Unexpected fixture acquisition"));
    return Promise.resolve(Object.freeze({ body, byteLength: new TextEncoder().encode(body).byteLength, contentType: "text/html", finalUrl: input.url, redirectChain: [] }));
  }
}

class FixedClock { public constructor(private readonly value: string) {} public now(): Date { return new Date(this.value); } }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-authorized-research-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
