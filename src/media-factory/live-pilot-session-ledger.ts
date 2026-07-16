import { DatabaseSync } from "node:sqlite";

export const LIVE_PILOT_SESSION_CONTRACT_VERSION = "1" as const;
export const LIVE_PILOT_OPERATIONS = Object.freeze([
  "OPENAI_TEXT_PROVIDER_SMOKE",
  "OPENAI_METODO_VELOCE_MASTER_IMAGE",
] as const);

export type LivePilotOperation = (typeof LIVE_PILOT_OPERATIONS)[number];
export type LivePilotSessionStatus =
  | "ACTIVE"
  | "CLOSED"
  | "DISABLED"
  | "EXPIRED"
  | "RELOCKED";

export interface LivePilotClock {
  now(): Date;
}

export interface LivePilotSessionLedgerOptions {
  readonly clock?: LivePilotClock;
  readonly path: string;
}

export interface CreateLivePilotSessionInput {
  readonly actorId: "Fabio";
  readonly expiresAt: string;
  readonly sessionId: string;
  readonly workspaceId: string;
}

export interface LivePilotSessionPreflight {
  readonly authorizedCounts: {
    readonly image: number;
    readonly providerCalls: number;
    readonly text: number;
  };
  readonly model: string;
  readonly reason?: string;
  readonly residualBudgetUsd: number;
  readonly status: "blocked" | "ready";
  readonly maxCostUsd: number;
}

export interface LivePilotReservation {
  readonly maxCostUsd: number;
  readonly operation: LivePilotOperation;
  readonly operationId: string;
  readonly sessionId: string;
}

export interface LivePilotLedgerSnapshot {
  readonly actualCostUsd: number;
  readonly actorId: "Fabio";
  readonly authorizedCounts: {
    readonly image: number;
    readonly providerCalls: number;
    readonly text: number;
  };
  readonly dailyResidualBudgetUsd: number;
  readonly expiresAt: string;
  readonly liveCalls: number;
  readonly reservedCostUsd: number;
  readonly sessionId: string;
  readonly sessionResidualBudgetUsd: number;
  readonly status: LivePilotSessionStatus;
  readonly workspaceId: string;
}

export class LivePilotSessionError extends Error {
  public readonly code:
    | "live_pilot_operation_duplicate"
    | "live_pilot_preflight_blocked"
    | "live_pilot_session_not_found"
    | "live_pilot_session_not_reconcilable";

  public constructor(
    code: LivePilotSessionError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

const MICROS_PER_USD = 1_000_000;
const DAILY_HARD_STOP_MICRO_USD = 4 * MICROS_PER_USD;
const SESSION_HARD_STOP_MICRO_USD = 100_000;
const MAX_DAILY_PROVIDER_CALLS = 8;
const MAX_SESSION_PROVIDER_CALLS = 2;
const MAX_DAILY_IMAGE_GENERATIONS = 1;
const MAX_SESSION_IMAGE_GENERATIONS = 1;
const MAX_SESSION_TEXT_GENERATIONS = 1;

/**
 * A small isolated SQLite ledger for the one Closure Run.  Reservations are
 * made with BEGIN IMMEDIATE so a restart or competing process cannot spend a
 * second operation against the same session.  It contains no secret, prompt,
 * response body, image bytes, OAuth value, or cookie.
 */
export class LivePilotSessionLedger {
  readonly #clock: LivePilotClock;
  readonly #database: DatabaseSync;

  public constructor(options: LivePilotSessionLedgerOptions) {
    this.#clock = options.clock ?? { now: (): Date => new Date() };
    this.#database = new DatabaseSync(options.path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS live_pilot_sessions (
        session_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        enabled_at TEXT,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL,
        CHECK (actor_id = 'Fabio')
      ) STRICT;
      CREATE TABLE IF NOT EXISTS live_pilot_operations (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES live_pilot_sessions(session_id),
        operation TEXT NOT NULL,
        model_id TEXT NOT NULL,
        reserved_cost_microusd INTEGER NOT NULL,
        actual_cost_microusd INTEGER,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL,
        reason_code TEXT,
        UNIQUE (session_id, operation),
        CHECK (operation IN ('OPENAI_TEXT_PROVIDER_SMOKE', 'OPENAI_METODO_VELOCE_MASTER_IMAGE')),
        CHECK (status IN ('reserved', 'succeeded', 'failed'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS live_pilot_operations_started_at
      ON live_pilot_operations(started_at);
    `);
  }

  public createDisabled(input: CreateLivePilotSessionInput): void {
    this.#transaction(() => {
      this.#database.prepare(`
        INSERT INTO live_pilot_sessions
          (session_id, actor_id, workspace_id, created_at, expires_at, status)
        VALUES (?, ?, ?, ?, ?, 'DISABLED')
      `).run(
        input.sessionId,
        input.actorId,
        input.workspaceId,
        this.#clock.now().toISOString(),
        input.expiresAt,
      );
    });
  }

  public activate(sessionId: string): void {
    this.#transaction(() => {
      const row = this.#session(sessionId);
      if (row === undefined) throw notFound();
      if (row.status !== "DISABLED" || isExpired(row.expiresAt, this.#clock)) {
        this.#database.prepare("UPDATE live_pilot_sessions SET status = 'EXPIRED' WHERE session_id = ?").run(sessionId);
        throw blocked("The live pilot session is not available for activation");
      }
      this.#database.prepare("UPDATE live_pilot_sessions SET status = 'ACTIVE', enabled_at = ? WHERE session_id = ?").run(this.#clock.now().toISOString(), sessionId);
    });
  }

  public preflight(
    sessionId: string,
    operation: LivePilotOperation,
    model: string,
    maxCostUsd: number,
  ): LivePilotSessionPreflight {
    this.#expireSessions();
    const session = this.#session(sessionId);
    if (session === undefined) return blockedPreflight(model, maxCostUsd, "session_not_found", 0, 0, 0);
    const counts = this.#countsForSession(sessionId);
    const dailyCounts = this.#countsForToday();
    const available = this.#availableBudget(sessionId);
    const reason = this.#blockingReason(session, counts, dailyCounts, operation, maxCostUsd, available);
    return {
      authorizedCounts: counts,
      model,
      ...(reason === undefined ? {} : { reason }),
      residualBudgetUsd: microsToUsd(available.session),
      status: reason === undefined ? "ready" : "blocked",
      maxCostUsd,
    };
  }

  public reserve(input: LivePilotReservation): void {
    this.#transaction(() => {
      this.#expireSessionsInsideTransaction();
      const session = this.#session(input.sessionId);
      if (session === undefined) throw notFound();
      const counts = this.#countsForSession(input.sessionId);
      const dailyCounts = this.#countsForToday();
      const available = this.#availableBudget(input.sessionId);
      const reason = this.#blockingReason(
        session,
        counts,
        dailyCounts,
        input.operation,
        input.maxCostUsd,
        available,
      );
      if (reason !== undefined) {
        if (reason === "operation_already_reserved") {
          throw new LivePilotSessionError(
            "live_pilot_operation_duplicate",
            "The live pilot operation has already been consumed",
          );
        }
        throw blocked("The live pilot preflight blocked this provider call");
      }
      const now = this.#clock.now().toISOString();
      const amount = usdToMicros(input.maxCostUsd);
      this.#database.prepare(`
        INSERT INTO live_pilot_operations
          (operation_id, session_id, operation, model_id, reserved_cost_microusd, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'reserved')
      `).run(
        input.operationId,
        input.sessionId,
        input.operation,
        modelForOperation(input.operation),
        amount,
        now,
      );
      const after = this.#countsForSession(input.sessionId);
      if (after.providerCalls === MAX_SESSION_PROVIDER_CALLS) {
        this.#database.prepare("UPDATE live_pilot_sessions SET status = 'RELOCKED' WHERE session_id = ?").run(input.sessionId);
      }
    });
  }

  public reconcile(
    sessionId: string,
    operationId: string,
    result: { readonly actualCostUsd: number; readonly status: "failed" | "succeeded"; readonly reasonCode?: string },
  ): void {
    this.#transaction(() => {
      const row = this.#database.prepare(`
        SELECT session_id AS sessionId, status FROM live_pilot_operations WHERE operation_id = ?
      `).get(operationId) as { readonly sessionId?: unknown; readonly status?: unknown } | undefined;
      if (
        row?.sessionId !== sessionId ||
        row.status !== "reserved" ||
        !isReconciliationCost(result.actualCostUsd)
      ) {
        throw new LivePilotSessionError(
          "live_pilot_session_not_reconcilable",
          "The live pilot operation cannot be reconciled",
        );
      }
      this.#database.prepare(`
        UPDATE live_pilot_operations
        SET actual_cost_microusd = ?, completed_at = ?, status = ?, reason_code = ?
        WHERE operation_id = ?
      `).run(
        usdToMicros(result.actualCostUsd),
        this.#clock.now().toISOString(),
        result.status,
        result.reasonCode ?? null,
        operationId,
      );
      if (result.status === "failed") {
        this.#database.prepare("UPDATE live_pilot_sessions SET status = 'CLOSED' WHERE session_id = ? AND status = 'ACTIVE'").run(sessionId);
      }
    });
  }

  public close(sessionId: string): void {
    this.#transaction(() => {
      this.#database.prepare("UPDATE live_pilot_sessions SET status = 'CLOSED' WHERE session_id = ? AND status IN ('ACTIVE', 'DISABLED')").run(sessionId);
    });
  }

  public snapshot(sessionId: string): LivePilotLedgerSnapshot {
    this.#expireSessions();
    const session = this.#session(sessionId);
    if (session === undefined) throw notFound();
    const counts = this.#countsForSession(sessionId);
    const costs = this.#costsForSession(sessionId);
    const available = this.#availableBudget(sessionId);
    return {
      actualCostUsd: microsToUsd(costs.actual),
      actorId: session.actorId,
      authorizedCounts: counts,
      dailyResidualBudgetUsd: microsToUsd(available.daily),
      expiresAt: session.expiresAt,
      liveCalls: counts.providerCalls,
      reservedCostUsd: microsToUsd(costs.reserved),
      sessionId,
      sessionResidualBudgetUsd: microsToUsd(available.session),
      status: session.status,
      workspaceId: session.workspaceId,
    };
  }

  public closeDatabase(): void {
    this.#database.close();
  }

  #transaction(operation: () => void): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      operation();
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #expireSessions(): void {
    this.#transaction(() => {
      this.#expireSessionsInsideTransaction();
    });
  }

  #expireSessionsInsideTransaction(): void {
    this.#database.prepare(`
      UPDATE live_pilot_sessions
      SET status = 'EXPIRED'
      WHERE status IN ('ACTIVE', 'DISABLED', 'RELOCKED') AND expires_at <= ?
    `).run(this.#clock.now().toISOString());
  }

  #session(sessionId: string): SessionRow | undefined {
    const row = this.#database.prepare(`
      SELECT session_id AS sessionId, actor_id AS actorId, workspace_id AS workspaceId,
        expires_at AS expiresAt, status
      FROM live_pilot_sessions WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown> | undefined;
    if (
      row?.sessionId !== sessionId ||
      row.actorId !== "Fabio" ||
      typeof row.workspaceId !== "string" ||
      typeof row.expiresAt !== "string" ||
      !isSessionStatus(row.status)
    ) return undefined;
    return {
      actorId: "Fabio",
      expiresAt: row.expiresAt,
      status: row.status,
      workspaceId: row.workspaceId,
    };
  }

  #countsForSession(sessionId: string): LivePilotLedgerSnapshot["authorizedCounts"] {
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS providerCalls,
        SUM(CASE WHEN operation = 'OPENAI_TEXT_PROVIDER_SMOKE' THEN 1 ELSE 0 END) AS textCalls,
        SUM(CASE WHEN operation = 'OPENAI_METODO_VELOCE_MASTER_IMAGE' THEN 1 ELSE 0 END) AS imageCalls
      FROM live_pilot_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return {
      image: integer(row.imageCalls),
      providerCalls: integer(row.providerCalls),
      text: integer(row.textCalls),
    };
  }

  #costsForSession(sessionId: string): { readonly actual: number; readonly reserved: number } {
    const row = this.#database.prepare(`
      SELECT COALESCE(SUM(reserved_cost_microusd), 0) AS reserved,
        COALESCE(SUM(COALESCE(actual_cost_microusd, 0)), 0) AS actual
      FROM live_pilot_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return { actual: integer(row.actual), reserved: integer(row.reserved) };
  }

  #countsForToday(): LivePilotLedgerSnapshot["authorizedCounts"] {
    const today = this.#clock.now().toISOString().slice(0, 10);
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS providerCalls,
        SUM(CASE WHEN operation = 'OPENAI_TEXT_PROVIDER_SMOKE' THEN 1 ELSE 0 END) AS textCalls,
        SUM(CASE WHEN operation = 'OPENAI_METODO_VELOCE_MASTER_IMAGE' THEN 1 ELSE 0 END) AS imageCalls
      FROM live_pilot_operations WHERE substr(started_at, 1, 10) = ?
    `).get(today) as Record<string, unknown>;
    return {
      image: integer(row.imageCalls),
      providerCalls: integer(row.providerCalls),
      text: integer(row.textCalls),
    };
  }

  #availableBudget(sessionId: string): { readonly daily: number; readonly session: number } {
    const session = this.#costsForSession(sessionId);
    const today = this.#clock.now().toISOString().slice(0, 10);
    const daily = this.#database.prepare(`
      SELECT COALESCE(SUM(CASE WHEN actual_cost_microusd IS NULL THEN reserved_cost_microusd ELSE actual_cost_microusd END), 0) AS used
      FROM live_pilot_operations WHERE substr(started_at, 1, 10) = ?
    `).get(today) as Record<string, unknown>;
    return {
      daily: Math.max(0, DAILY_HARD_STOP_MICRO_USD - integer(daily.used)),
      session: Math.max(0, SESSION_HARD_STOP_MICRO_USD - Math.max(session.reserved, session.actual)),
    };
  }

  #blockingReason(
    session: SessionRow,
    counts: LivePilotLedgerSnapshot["authorizedCounts"],
    dailyCounts: LivePilotLedgerSnapshot["authorizedCounts"],
    operation: LivePilotOperation,
    maxCostUsd: number,
    available: { readonly daily: number; readonly session: number },
  ): string | undefined {
    const amount = isSafeUsd(maxCostUsd) ? usdToMicros(maxCostUsd) : Number.POSITIVE_INFINITY;
    if (session.status !== "ACTIVE") return "session_not_active";
    if (counts.providerCalls >= MAX_SESSION_PROVIDER_CALLS) return "session_call_cap_reached";
    if (dailyCounts.providerCalls >= MAX_DAILY_PROVIDER_CALLS) return "daily_call_cap_reached";
    if (operation === "OPENAI_TEXT_PROVIDER_SMOKE" && counts.text >= MAX_SESSION_TEXT_GENERATIONS) return "operation_already_reserved";
    if (operation === "OPENAI_METODO_VELOCE_MASTER_IMAGE" && counts.image >= MAX_SESSION_IMAGE_GENERATIONS) return "operation_already_reserved";
    if (operation === "OPENAI_METODO_VELOCE_MASTER_IMAGE" && dailyCounts.image >= MAX_DAILY_IMAGE_GENERATIONS) return "daily_image_cap_reached";
    if (amount > available.session) return "session_budget_exceeded";
    if (amount > available.daily) return "daily_budget_exceeded";
    return undefined;
  }
}

interface SessionRow {
  readonly actorId: "Fabio";
  readonly expiresAt: string;
  readonly status: LivePilotSessionStatus;
  readonly workspaceId: string;
}

function isSessionStatus(value: unknown): value is LivePilotSessionStatus {
  return value === "ACTIVE" || value === "CLOSED" || value === "DISABLED" || value === "EXPIRED" || value === "RELOCKED";
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function isExpired(expiresAt: string, clock: LivePilotClock): boolean {
  return expiresAt <= clock.now().toISOString();
}

function usdToMicros(value: number): number {
  return Math.round(value * MICROS_PER_USD);
}

function microsToUsd(value: number): number {
  return value / MICROS_PER_USD;
}

function isSafeUsd(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 0.1;
}

function isReconciliationCost(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 0.1;
}

function modelForOperation(operation: LivePilotOperation): string {
  return operation === "OPENAI_TEXT_PROVIDER_SMOKE" ? "gpt-4o-mini" : "gpt-image-1-mini";
}

function blocked(message: string): LivePilotSessionError {
  return new LivePilotSessionError("live_pilot_preflight_blocked", message);
}

function notFound(): LivePilotSessionError {
  return new LivePilotSessionError("live_pilot_session_not_found", "The live pilot session does not exist");
}

function blockedPreflight(
  model: string,
  maxCostUsd: number,
  reason: string,
  image: number,
  providerCalls: number,
  text: number,
): LivePilotSessionPreflight {
  return {
    authorizedCounts: { image, providerCalls, text },
    maxCostUsd,
    model,
    reason,
    residualBudgetUsd: 0,
    status: "blocked",
  };
}
