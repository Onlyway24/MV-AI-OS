import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CommandCenterActionService } from "../../src/command-center/command-center-action-service.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { PrivateCommandCenterServer } from "../../src/command-center/command-center-server.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalRuntime } from "../../src/runtime/create-local-runtime.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";
import type { LocalRuntimeConfig } from "../../src/runtime/local-runtime-config.js";

const START = "2026-07-14T12:05:00.000Z";

describe("Command Center Control Action Layer", () => {
  it("permits exactly one result when the confirmation is double-clicked, then rejects replay", async () => withHarness(async (harness) => {
    const proposal = await harness.propose("REJECT_CONTENT");
    const results = await Promise.all([
      harness.confirm(proposal),
      harness.confirm(proposal),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect((await harness.confirm(proposal)).status).toBe(409);
    await expect(harness.query.snapshot()).resolves.toMatchObject({
      productions: [expect.objectContaining({ status: "ARCHIVED", version: 1 })],
    });
  }));

  it("rejects an expired confirmation without changing the package", async () => withHarness(async (harness) => {
    const proposal = await harness.propose("REJECT_CONTENT");
    harness.clock.advance(5 * 60_000);
    expect((await harness.confirm(proposal)).status).toBe(409);
    await expect(harness.query.snapshot()).resolves.toMatchObject({
      productions: [expect.objectContaining({ status: "PENDING_FABIO_APPROVAL", version: 0 })],
    });
  }));

  it("rejects a confirmation that presents a stale package fingerprint", async () => withHarness(async (harness) => {
    const proposal = await harness.propose("REJECT_CONTENT");
    const stale = await harness.confirmResponse(proposal, "0".repeat(64));
    expect(stale.status).toBe(409);
    await expect(stale.text()).resolves.toContain("fingerprint indicato");
    expect((await harness.confirm(proposal)).status).toBe(200);
  }));

  it("survives a read refresh during review and retains the same pending confirmation", async () => withHarness(async (harness) => {
    const proposal = await harness.propose("REJECT_CONTENT");
    expect((await fetch(`${harness.origin}/`, { headers: { Cookie: harness.cookie } })).status).toBe(200);
    expect((await fetch(`${harness.origin}/api/overview`, { headers: { Cookie: harness.cookie } })).status).toBe(200);
    expect((await harness.confirm(proposal)).status).toBe(200);
  }));

  it("rejects a package that changed after the confirmation was opened because its fingerprint is stale", async () => withHarness(async (harness) => {
    const proposal = await harness.propose("REJECT_CONTENT");
    await createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock: harness.clock, repositories: harness.repositories, workspaceId: "workspace-local" }).execute({
      actorId: "actor-local",
      commandId: "external-review-after-proposal",
      contractVersion: "1",
      input: { decision: "REJECTED", expectedVersion: 0, note: "Revisione registrata dopo l'apertura della conferma.", productionId: PRODUCTION_ID },
      operation: "REVIEW_METODO_VELOCE_CONTENT",
      workspaceId: "workspace-local",
    });
    const response = await harness.confirm(proposal);
    expect(response.status).toBe(409);
    await expect(response.text()).resolves.toContain("fingerprint o versione non sono più validi");
  }));

  it("refuses approval for a package without an immutable Evidence Pack", async () => withHarness(async (harness) => {
    const response = await harness.proposeResponse("APPROVE_CONTENT");
    expect(response.status).toBe(409);
    await expect(response.text()).resolves.toContain("Evidence Pack immutabile");
  }));

  it("rejects a wrong CSRF token and a non-loopback Origin before proposing an action", async () => withHarness(async (harness) => {
    expect((await harness.proposeResponse("REJECT_CONTENT", { "X-Onlyway-Csrf": "0".repeat(64) })).status).toBe(403);
    expect((await harness.proposeResponse("REJECT_CONTENT", { Origin: "https://example.invalid" })).status).toBe(403);
    await expect(harness.query.snapshot()).resolves.toMatchObject({
      productions: [expect.objectContaining({ status: "PENDING_FABIO_APPROVAL", version: 0 })],
    });
  }));
});

const PRODUCTION_ID = "mv-content-control-action-001";

interface Harness {
  readonly clock: MutableClock;
  readonly cookie: string;
  readonly origin: string;
  readonly query: CommandCenterQueryService;
  readonly repositories: SqliteRepositoryTransactionRunner;
  confirm(proposal: Proposal): Promise<Response>;
  confirmResponse(proposal: Proposal, packageFingerprint: string): Promise<Response>;
  propose(action: "APPROVE_CONTENT" | "REJECT_CONTENT"): Promise<Proposal>;
  proposeResponse(action: "APPROVE_CONTENT" | "REJECT_CONTENT", headers?: Readonly<Record<string, string>>): Promise<Response>;
}

interface Proposal {
  readonly actionId: string;
  readonly confirmationToken: string;
  readonly summary: { readonly packageFingerprint: string };
}

async function withHarness(test: (harness: Harness) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-control-action-"));
  const path = join(directory, "runtime.sqlite");
  let repositories: SqliteRepositoryTransactionRunner | undefined;
  let server: PrivateCommandCenterServer | undefined;
  try {
    const clock = new MutableClock(START);
    const runtime = await createLocalRuntime(config(path), { clock });
    if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
    await runtime.executeWorkflowCommand({
      actorId: "actor-local",
      commandId: "control-action-package-001",
      contractVersion: "1",
      input: { brief: brief() },
      operation: "PRODUCE_METODO_VELOCE_CONTENT",
      workspaceId: "workspace-local",
    });
    await runtime.close();
    repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const query = new CommandCenterQueryService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
    const actions = new CommandCenterActionService({
      actorId: "actor-local",
      clock,
      commands: createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" }),
      repositories,
      workspaceId: "workspace-local",
    });
    server = new PrivateCommandCenterServer({ accessToken: "a".repeat(64), actionService: actions, port: 0, queryService: query });
    const started = await server.start();
    const origin = new URL(started.accessUrl).origin;
    const entry = await fetch(started.accessUrl, { redirect: "manual" });
    const cookie = entry.headers.get("set-cookie");
    if (cookie === null) throw new Error("Expected local session cookie");
    const session = await fetch(`${origin}/api/session`, { headers: { Cookie: cookie } });
    const { csrfToken } = await session.json() as { readonly csrfToken: string };
    const baseHeaders = Object.freeze({ "Content-Type": "application/json", Cookie: cookie, Origin: origin, "X-Onlyway-Csrf": csrfToken });
    await test({
      clock,
      cookie,
      origin,
      query,
      repositories,
      confirm: (proposal) => fetch(`${origin}/api/actions/confirm`, { body: JSON.stringify({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint }), headers: baseHeaders, method: "POST" }),
      confirmResponse: (proposal, packageFingerprint) => fetch(`${origin}/api/actions/confirm`, { body: JSON.stringify({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint }), headers: baseHeaders, method: "POST" }),
      propose: async (action) => {
        const response = await fetch(`${origin}/api/actions/propose`, { body: JSON.stringify({ action, productionId: PRODUCTION_ID }), headers: baseHeaders, method: "POST" });
        if (!response.ok) throw new Error(`Expected action proposal, received ${String(response.status)}`);
        return response.json() as Promise<Proposal>;
      },
      proposeResponse: (action, overrides = {}) => fetch(`${origin}/api/actions/propose`, { body: JSON.stringify({ action, productionId: PRODUCTION_ID }), headers: { ...baseHeaders, ...overrides }, method: "POST" }),
    });
  } finally {
    if (server !== undefined) {
      const started = await server.start();
      await started.close();
    }
    await repositories?.close();
    await rm(directory, { force: true, recursive: true });
  }
}

class MutableClock {
  #millis: number;
  public constructor(iso: string) { this.#millis = Date.parse(iso); }
  public advance(milliseconds: number): void { this.#millis += milliseconds; }
  public now(): Date { return new Date(this.#millis); }
}

function brief() {
  return {
    audience: "Founder che vogliono validare un'offerta prima di investire budget.",
    callToAction: "Salva il post e scegli un test piccolo per questa settimana.",
    contractVersion: "1",
    evidence: [{ evidenceId: "customer-note-1", sourceRef: "interview-2026-07", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }],
    language: "it",
    missionReference: "mission-control-action-1",
    objective: "educate",
    offer: "un percorso per validare offerte digitali",
    productionId: PRODUCTION_ID,
    topic: "come validare un'offerta prima di promuoverla",
  } as const;
}

function config(path: string): LocalRuntimeConfig {
  return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" };
}
