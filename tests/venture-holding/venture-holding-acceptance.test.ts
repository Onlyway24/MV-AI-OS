import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryBackedCommandCenterVentureQuery } from "../../src/command-center/repository-backed-venture-query.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { SqliteVentureHoldingTransactionRunner } from "../../src/persistence/sqlite/sqlite-venture-holding-transaction-runner.js";
import { VentureCommandBoundary, ventureCommandFingerprint } from "../../src/venture-holding/venture-command-boundary.js";
import type { VentureCommand } from "../../src/venture-holding/venture-domain.js";
import { VentureHoldingService } from "../../src/venture-holding/venture-holding-service.js";
import { OnlywayVenture001Factory } from "../../src/venture-holding/onlyway-venture-001.js";
import { assertVentureStageTransition } from "../../src/venture-holding/venture-stage-machine.js";
import { validateVentureRecord, ventureFingerprint } from "../../src/venture-holding/venture-validator.js";

const NOW = "2026-07-23T00:00:00.000Z";
const identity = Object.freeze({ actorId: "fabio", workspaceId: "onlyway" });
const clock = Object.freeze({ now: () => new Date(NOW) });
const paths: string[] = [];

afterEach(() => { paths.length = 0; });

describe("Onlyway Venture Holding acceptance", () => {
  it("runs Venture #001 once, replays safely and recovers its exact locked dossier after restart", async () => {
    const path = await databasePath();
    const core = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const venture = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    const service = new VentureHoldingService({ ...identity, clock, coreRepositories: core, repositories: venture });

    const first = await service.runOnlywayVenture001();
    const replay = await service.runOnlywayVenture001();
    expect(first).toMatchObject({ evidencePackCount: 0, externalEffects: "ZERO" });
    expect(first.package).toMatchObject({ state: "AWAITING_FABIO", externalEffects: "ZERO" });
    expect(first.package.opportunities).toHaveLength(3);
    expect(first.package.scorecards).toHaveLength(3);
    expect(first.package.economics).toHaveLength(3);
    expect(first.package.experiments).toHaveLength(3);
    expect(first.package.artifacts).toHaveLength(12);
    expect(first.package.opportunities.every(({ demand, willingnessToPay }) => demand === "DEMAND_NOT_VERIFIED" && willingnessToPay === "DEMAND_NOT_VERIFIED")).toBe(true);
    expect(first.package.economics.every(({ status }) => status === "NOT_AVAILABLE")).toBe(true);
    expect(first.package.experiments.every(({ observations }) => observations.length === 0)).toBe(true);
    expect(first.package.venture).toMatchObject({ approvalState: "AWAITING_FABIO", externalActions: "LOCKED", publication: "LOCKED", stage: "EVIDENCE_INSUFFICIENT" });
    expect(first.package.capitalProposal).toMatchObject({ externalActionsExecuted: false, spendAuthorized: false, status: "CAPITAL_ALLOCATION_PROPOSAL" });
    expect(first.command.replayed).toBe(false);
    expect(replay.command).toMatchObject({ replayed: true, externalEffects: "ZERO" });
    expect(replay.command.receipt.fingerprint).toBe(first.command.receipt.fingerprint);

    const persisted = await venture.transaction(async (repository) => ({
      audit: await repository.listAudit(identity, 10),
      events: await repository.listEvents(identity, 0, 10),
      receipts: await repository.listRecords({ ...identity, limit: 10, type: "VENTURE_RECEIPT" }),
      ventures: await repository.listRecords({ ...identity, limit: 10, type: "VENTURE" }),
    }));
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.events).toHaveLength(1);
    expect(persisted.receipts).toHaveLength(1);
    expect(persisted.receipts[0]).toMatchObject({ externalEffects: "ZERO", operation: "RUN_VENTURE_001", status: "COMMITTED" });
    expect(persisted.ventures).toHaveLength(1);
    const streamed = await core.transaction(({ operationalEvents }) => operationalEvents.listAfter(identity.workspaceId, 0, 10));
    expect(streamed).toHaveLength(1);
    expect(streamed[0]).toMatchObject({ aggregateType: "VENTURE", eventType: "VENTURE_STATE_CHANGED", safeSummaryCode: "venture_state_changed" });

    const view = await new RepositoryBackedCommandCenterVentureQuery({ ...identity, repositories: venture }).snapshot();
    expect(view).toMatchObject({ coverage: "COMPLETE", externalActions: "LOCKED", publication: "LOCKED" });
    expect(view.opportunities).toHaveLength(3);
    expect(view.ventures).toHaveLength(1);
    expect(view.decisions).toHaveLength(1);
    expect(view.health.reasonCode).toBe("FOUNDER_INPUT_REQUIRED");
    const foreign = await new RepositoryBackedCommandCenterVentureQuery({ actorId: "other-actor", repositories: venture, workspaceId: identity.workspaceId }).snapshot();
    expect(foreign.portfolio).toBeNull();
    expect(foreign.ventures).toEqual([]);

    await Promise.all([core.close(), venture.close()]);
    const restarted = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    const recovered = await restarted.transaction((repository) => repository.getRecord({ ...identity, entityId: "onlyway-venture-001", type: "VENTURE" }));
    expect(recovered?.fingerprint).toBe(first.package.venture.fingerprint);
    expect(recovered).toMatchObject({ externalActions: "LOCKED", publication: "LOCKED", stage: "EVIDENCE_INSUFFICIENT" });
    await restarted.close();
  });

  it("blocks every new mutation under the kill switch and never auto-activates a Venture", async () => {
    const path = await databasePath();
    const core = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const venture = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    const boundary = new VentureCommandBoundary({ ...identity, clock, repositories: venture });
    const base = {
      ...identity,
      commandId: "venture-kill-switch-enable",
      contractVersion: "1" as const,
      expectedVersion: "NOT_EXISTS" as const,
      idempotencyKey: "venture-kill-switch-enable",
      input: Object.freeze({ enabled: true }),
      operation: "SET_KILL_SWITCH" as const,
      targetFingerprint: "NOT_AVAILABLE" as const,
      targetId: "venture-kill-switch",
      targetType: "VENTURE_CONTROL" as const,
    };
    const command: VentureCommand = Object.freeze({ ...base, requestFingerprint: ventureCommandFingerprint(base) });
    await expect(boundary.setKillSwitch(command, true)).resolves.toMatchObject({ externalEffects: "ZERO", replayed: false });
    await expect(new VentureHoldingService({ ...identity, clock, coreRepositories: core, repositories: venture }).runOnlywayVenture001()).rejects.toMatchObject({ code: "repository_conflict" });
    expect(() => { assertVentureStageTransition({ from: "LAUNCH_READY", to: "ACTIVE" }); }).toThrow(/requires an exact Fabio resume decision/u);
    await Promise.all([core.close(), venture.close()]);
  });

  it("rejects credential-shaped content before it can become a durable Venture artifact", () => {
    const base = {
      actorId: identity.actorId,
      allowedUse: "INTERNAL_PACKAGE_ONLY" as const,
      artifactId: "unsafe-artifact",
      authoringAgent: "security-test",
      content: "Bearer abcdefghijklmnopqrstuvwxyz123456",
      contractVersion: "1" as const,
      createdAt: NOW,
      evidenceRefs: [],
      externalActionsExecuted: false,
      kind: "RISK_REGISTER" as const,
      mediaType: "text/markdown" as const,
      reviewState: "BLOCKED" as const,
      tombstoned: false,
      updatedAt: NOW,
      ventureId: "onlyway-venture-001",
      version: 0,
      workspaceId: identity.workspaceId,
    };
    expect(validateVentureRecord("VENTURE_ARTIFACT", { ...base, fingerprint: ventureFingerprint(base) }).ok).toBe(false);
  });

  it("rejects active Venture records and simulated evidence used as a commercial signal", () => {
    const package_ = new OnlywayVenture001Factory().create({ ...identity, evidencePacks: [], now: NOW });
    const activeBase = { ...package_.venture, stage: "ACTIVE" as const };
    expect(validateVentureRecord("VENTURE", { ...activeBase, fingerprint: ventureFingerprint(activeBase) }).ok).toBe(false);

    const original = package_.experiments[0];
    expect(original).toBeDefined();
    if (original === undefined) throw new Error("Venture experiment fixture is unavailable");
    const observation = { evidenceRefs: [], kind: "SIMULATED" as const, metricId: original.metrics[0]?.metricId ?? "metric-one", observationId: "simulated-observation", observedAt: NOW, value: "positive" };
    const experimentBase = { ...original, decision: { decisionId: "simulated-decision", observationRefs: [observation.observationId], outcome: "SIGNAL_POSITIVE" as const, reasonCodes: ["SIMULATED_ONLY"] }, observations: [observation], status: "COMPLETED" as const };
    expect(validateVentureRecord("VENTURE_EXPERIMENT", { ...experimentBase, fingerprint: ventureFingerprint(experimentBase) }).ok).toBe(false);
  });
});

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-venture-acceptance-"));
  const path = join(directory, "runtime.sqlite");
  paths.push(path);
  return path;
}
