import { DatabaseSync } from "node:sqlite";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import { SqliteVentureHoldingTransactionRunner } from "../../src/persistence/sqlite/sqlite-venture-holding-transaction-runner.js";
import type { FounderVenturePolicy, VentureAuditEvent, VentureCommandReceipt, VentureEvent, VentureKillSwitch } from "../../src/venture-holding/venture-domain.js";
import { validateVentureRecord, ventureFingerprint } from "../../src/venture-holding/venture-validator.js";

const NOW = "2026-07-23T08:00:00.000Z";
const LATER = "2026-07-23T09:00:00.000Z";
const paths: string[] = [];

afterEach(() => { paths.length = 0; });

describe("Venture Holding SQLite persistence", () => {
  it("validates strict JSON-safe contracts, appends by exact CAS, isolates identity, and recovers frozen records after restart", async () => {
    const path = await databasePath();
    const initial = policy(0);
    const validated = validateVentureRecord("FOUNDER_VENTURE_POLICY", initial);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(Object.isFrozen(validated.value)).toBe(true);
    expect(Object.isFrozen(validated.value.economicObjective)).toBe(true);
    expect(validateVentureRecord("FOUNDER_VENTURE_POLICY", { ...initial, untrusted: true }).ok).toBe(false);
    expect(validateVentureRecord("FOUNDER_VENTURE_POLICY", { ...initial, minimumMarginBps: { evidenceRefs: [], status: "AVAILABLE", value: Number.NaN } }).ok).toBe(false);

    const runner = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    await runner.transaction((repository) => repository.appendRecord("FOUNDER_VENTURE_POLICY", initial.policyId, initial));
    await expect(runner.transaction((repository) => repository.getRecord({ actorId: "other", entityId: initial.policyId, type: "FOUNDER_VENTURE_POLICY", workspaceId: "onlyway" }))).resolves.toBeUndefined();
    await expect(runner.transaction((repository) => repository.getRecord({ actorId: "fabio", entityId: initial.policyId, type: "FOUNDER_VENTURE_POLICY", workspaceId: "other" }))).resolves.toBeUndefined();

    const next = policy(1);
    await expect(runner.transaction((repository) => repository.appendRecord("FOUNDER_VENTURE_POLICY", next.policyId, next, 1))).rejects.toMatchObject({ code: "repository_record_invalid" });
    await runner.transaction((repository) => repository.appendRecord("FOUNDER_VENTURE_POLICY", next.policyId, next, 0));
    const history = await runner.transaction((repository) => repository.listRecords({ actorId: "fabio", limit: 10, type: "FOUNDER_VENTURE_POLICY", workspaceId: "onlyway" }));
    expect(history.map(({ version }) => version)).toEqual([1, 0]);
    await runner.close();

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    const restarted = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    const recovered = await restarted.transaction((repository) => repository.getRecord({ actorId: "fabio", entityId: initial.policyId, type: "FOUNDER_VENTURE_POLICY", version: 0, workspaceId: "onlyway" }));
    expect(recovered).toEqual(initial);
    expect(Object.isFrozen(recovered)).toBe(true);
    await restarted.close();
  });

  it("commits record, receipt, redacted audit, event, and kill switch atomically and rejects stale control writes", async () => {
    const path = await databasePath();
    const runner = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    const record = policy(0);
    const receipt = commandReceipt();
    const audit = auditEvent();
    const event = ventureEvent();
    const control = killSwitch(0, false, NOW);

    await expect(runner.transaction(async (repository) => {
      await repository.appendRecord("FOUNDER_VENTURE_POLICY", record.policyId, record);
      await repository.insertCommandReceipt(receipt);
      await repository.appendAudit(audit);
      await repository.appendEvent(event);
      await repository.setKillSwitch(control, "NOT_EXISTS");
      throw new Error("force rollback");
    })).rejects.toThrow("force rollback");

    const rolledBack = await runner.transaction(async (repository) => ({
      audit: await repository.listAudit(identity(), 10),
      control: await repository.getKillSwitch(identity()),
      events: await repository.listEvents(identity(), 0, 10),
      receipt: await repository.getCommandReceipt(identity(), "venture-idempotency"),
      record: await repository.getRecord({ ...identity(), entityId: record.policyId, type: "FOUNDER_VENTURE_POLICY" }),
    }));
    expect(rolledBack).toEqual({ audit: [], control: undefined, events: [], receipt: undefined, record: undefined });

    await runner.transaction(async (repository) => {
      await repository.appendRecord("FOUNDER_VENTURE_POLICY", record.policyId, record);
      await repository.insertCommandReceipt(receipt);
      await repository.appendAudit(audit);
      await repository.appendEvent(event);
      await repository.setKillSwitch(control, "NOT_EXISTS");
    });
    const committed = await runner.transaction(async (repository) => ({
      audit: await repository.listAudit(identity(), 10),
      control: await repository.getKillSwitch(identity()),
      events: await repository.listEvents(identity(), 0, 10),
      receipt: await repository.getCommandReceipt(identity(), "venture-idempotency"),
      receiptByCommand: await repository.getCommandReceiptByCommandId(identity(), receipt.commandId),
    }));
    expect(committed.audit).toEqual([audit]);
    expect(committed.events[0]).toMatchObject(event);
    expect(committed.events[0]?.sequence).toBe(1);
    expect(committed.receipt).toEqual(receipt);
    expect(committed.receiptByCommand).toEqual(receipt);
    expect(committed.control).toEqual(control);

    await expect(runner.transaction((repository) => repository.setKillSwitch(killSwitch(1, true, LATER), "NOT_EXISTS"))).rejects.toMatchObject({ code: "repository_conflict" });
    await runner.transaction((repository) => repository.setKillSwitch(killSwitch(1, true, LATER), 0));
    await expect(runner.transaction((repository) => repository.setKillSwitch(killSwitch(2, false, LATER), 0))).rejects.toMatchObject({ code: "repository_conflict" });
    await runner.close();
  });

  it("rejects corrupted durable JSON and migrates an exact version-31 database additively", async () => {
    const path = await databasePath();
    const initial = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    await initial.transaction((repository) => repository.appendRecord("FOUNDER_VENTURE_POLICY", "policy-one", policy(0)));
    await initial.close();

    const corrupt = new DatabaseSync(path);
    corrupt.prepare("UPDATE venture_records SET record_json = '{}' WHERE workspace_id = ? AND actor_id = ? AND entity_id = ?").run("onlyway", "fabio", "policy-one");
    corrupt.close();
    const reader = new SqliteVentureHoldingTransactionRunner({ path, timeoutMs: 1_000 });
    await expect(reader.transaction((repository) => repository.getRecord({ ...identity(), entityId: "policy-one", type: "FOUNDER_VENTURE_POLICY" }))).rejects.toMatchObject({ code: "repository_record_invalid" });
    await reader.close();

    const migrationPath = await databasePath();
    const current = new SqliteVentureHoldingTransactionRunner({ path: migrationPath, timeoutMs: 1_000 });
    await current.close();
    const legacy = new DatabaseSync(migrationPath);
    legacy.exec(`
      DROP TABLE venture_audit_events;
      DROP TABLE venture_command_receipts;
      DROP TABLE venture_events;
      DROP TABLE venture_records;
      DROP TABLE venture_runtime_controls;
      DELETE FROM schema_migrations WHERE version = 32;
      PRAGMA user_version = 31;
    `);
    legacy.close();
    const migrated = new SqliteVentureHoldingTransactionRunner({ path: migrationPath, timeoutMs: 1_000 });
    await expect(migrated.transaction((repository) => repository.listRecords({ ...identity(), limit: 10, type: "VENTURE" }))).resolves.toEqual([]);
    await migrated.close();
    const inspected = new DatabaseSync(migrationPath);
    expect(inspected.prepare("PRAGMA user_version").get()?.user_version).toBe(32);
    expect(inspected.prepare("SELECT name FROM schema_migrations WHERE version = 32").get()?.name).toBe("onlyway_venture_holding_v1");
    inspected.close();
  });
});

function policy(version: number): FounderVenturePolicy {
  const unknown = { reasonCode: "FOUNDER_INPUT_REQUIRED", status: "FOUNDER_INPUT_REQUIRED" } as const;
  const base = {
    acceptableAutomation: unknown,
    actorId: "fabio",
    allowedMarkets: unknown,
    allowedRevenueModels: unknown,
    approvalRequirements: ["FABIO_EXPLICIT", "FABIO_VERSION_BOUND"] as const,
    contractVersion: "1" as const,
    createdAt: NOW,
    customerModel: unknown,
    economicObjective: unknown,
    economicRisk: unknown,
    evidenceRequirements: unknown,
    forbiddenMarkets: unknown,
    killConditions: unknown,
    maximumCapitalMinorUnits: unknown,
    maximumDaysToFirstSignal: unknown,
    maximumDeliveryLoad: unknown,
    maximumFabioDependency: unknown,
    maximumFabioHoursPerWeek: unknown,
    minimumMarginBps: unknown,
    policyId: "policy-one",
    reputationalRisk: unknown,
    scaleConditions: unknown,
    updatedAt: version === 0 ? NOW : LATER,
    version,
    workspaceId: "onlyway",
  };
  return { ...base, fingerprint: ventureFingerprint(base) };
}

function commandReceipt(): VentureCommandReceipt {
  const base = { actorId: "fabio", commandId: "command-one", contractVersion: "1" as const, idempotencyKeyFingerprint: canonicalSha256("venture-idempotency"), recordedAt: NOW, requestFingerprint: canonicalSha256("request"), responseFingerprint: canonicalSha256("response"), resultRefs: [], status: "COMMITTED" as const, workspaceId: "onlyway" };
  return { ...base, fingerprint: ventureFingerprint(base) };
}

function auditEvent(): VentureAuditEvent {
  const base = { actorId: "fabio", commandId: "command-one", contractVersion: "1" as const, eventId: "audit-one", occurredAt: NOW, operation: "CREATE_POLICY" as const, outcome: "COMMITTED" as const, reasonCode: "VENTURE_POLICY_CREATED", targetId: "policy-one", targetType: "FOUNDER_VENTURE_POLICY" as const, workspaceId: "onlyway" };
  return { ...base, fingerprint: ventureFingerprint(base) };
}

function ventureEvent(): VentureEvent {
  const base = { actorId: "fabio", aggregateType: "FOUNDER_VENTURE_POLICY" as const, contractVersion: "1" as const, entityId: "policy-one", entityVersion: 0, eventId: "event-one", eventType: "RECORD_APPENDED" as const, occurredAt: NOW, safeSummaryCode: "venture_record_appended" as const, workspaceId: "onlyway" };
  return { ...base, fingerprint: ventureFingerprint(base) };
}

function killSwitch(version: number, enabled: boolean, updatedAt: string): VentureKillSwitch {
  const base = { actorId: "fabio", contractVersion: "1" as const, enabled, updatedAt, updatedBy: "fabio", version, workspaceId: "onlyway" };
  return { ...base, fingerprint: ventureFingerprint(base) };
}

function identity() { return { actorId: "fabio", workspaceId: "onlyway" } as const; }
async function databasePath(): Promise<string> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-venture-")); const path = join(directory, "runtime.sqlite"); paths.push(path); return path; }
