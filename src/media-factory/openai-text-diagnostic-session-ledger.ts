import { DatabaseSync } from "node:sqlite";

export const OPENAI_TEXT_DIAGNOSTIC_SESSION_CONTRACT_VERSION = "1" as const;
export const OPENAI_TEXT_DIAGNOSTIC_OPERATIONS = Object.freeze([
  "OPENAI_TEXT_PLAIN_DIAGNOSTIC",
  "OPENAI_TEXT_STRUCTURED_DIAGNOSTIC",
] as const);

export type OpenAiTextDiagnosticOperation =
  (typeof OPENAI_TEXT_DIAGNOSTIC_OPERATIONS)[number];
export type OpenAiTextDiagnosticCostClassification =
  | "EFFECTIVE"
  | "ESTIMATED"
  | "RECONCILIATION_PENDING";
export type OpenAiTextDiagnosticSessionStatus =
  | "ACTIVE"
  | "CLOSED"
  | "DISABLED"
  | "EXPIRED"
  | "RELOCKED";

export interface OpenAiTextDiagnosticClock {
  now(): Date;
}

export interface OpenAiTextDiagnosticSessionLedgerOptions {
  readonly clock?: OpenAiTextDiagnosticClock;
  /** Calls already recorded today in the closed pilot ledger. */
  readonly priorLiveCallsToday: number;
  readonly path: string;
}

export interface OpenAiTextDiagnosticPreflight {
  readonly authorizedCalls: number;
  readonly maxCostUsd: number;
  readonly model: string;
  readonly reason?: string;
  readonly residualBudgetUsd: number;
  readonly status: "blocked" | "ready";
  readonly totalCallsToday: number;
}

export interface OpenAiTextDiagnosticSnapshot {
  readonly estimatedCostUsd: number;
  readonly expiresAt: string;
  readonly liveCalls: number;
  readonly priorLiveCallsToday: number;
  readonly reconciliationPendingCostUsd: number;
  readonly reservedCostUsd: number;
  readonly sessionId: string;
  readonly sessionResidualBudgetUsd: number;
  readonly status: OpenAiTextDiagnosticSessionStatus;
}

export class OpenAiTextDiagnosticSessionError extends Error {
  public readonly code:
    | "openai_text_diagnostic_operation_duplicate"
    | "openai_text_diagnostic_preflight_blocked"
    | "openai_text_diagnostic_session_not_found"
    | "openai_text_diagnostic_session_not_reconcilable";

  public constructor(
    code: OpenAiTextDiagnosticSessionError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

const MICROS_PER_USD = 1_000_000;
const DAILY_PROVIDER_CALL_CAP = 8;
const SESSION_PROVIDER_CALL_CAP = 2;
const SESSION_COST_CAP_MICRO_USD = 20_000;
const OPERATION_COST_CAP_MICRO_USD = 10_000;

/**
 * A separate, one-use ledger for a text-only provider diagnosis. It is not a
 * continuation of the closed image-capable Closure Run and contains neither
 * prompts, outputs, raw HTTP bodies nor credentials.
 */
export class OpenAiTextDiagnosticSessionLedger {
  readonly #clock: OpenAiTextDiagnosticClock;
  readonly #database: DatabaseSync;
  readonly #priorLiveCallsToday: number;

  public constructor(options: OpenAiTextDiagnosticSessionLedgerOptions) {
    if (!Number.isSafeInteger(options.priorLiveCallsToday) || options.priorLiveCallsToday < 0 || options.priorLiveCallsToday > DAILY_PROVIDER_CALL_CAP) {
      throw new Error("The prior live-call count is invalid");
    }
    this.#clock = options.clock ?? { now: (): Date => new Date() };
    this.#priorLiveCallsToday = options.priorLiveCallsToday;
    this.#database = new DatabaseSync(options.path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS openai_text_diagnostic_sessions (
        session_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL CHECK (actor_id = 'Fabio'),
        created_at TEXT NOT NULL,
        enabled_at TEXT,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'DISABLED', 'EXPIRED', 'RELOCKED'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS openai_text_diagnostic_operations (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES openai_text_diagnostic_sessions(session_id),
        operation TEXT NOT NULL CHECK (operation IN ('OPENAI_TEXT_PLAIN_DIAGNOSTIC', 'OPENAI_TEXT_STRUCTURED_DIAGNOSTIC')),
        model_id TEXT NOT NULL,
        reserved_cost_microusd INTEGER NOT NULL,
        settled_cost_microusd INTEGER,
        cost_classification TEXT CHECK (cost_classification IN ('EFFECTIVE', 'ESTIMATED', 'RECONCILIATION_PENDING')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed')),
        reason_code TEXT,
        UNIQUE (session_id, operation)
      ) STRICT;
    `);
  }

  public createDisabled(input: { readonly expiresAt: string; readonly sessionId: string }): void {
    this.#transaction(() => {
      this.#database.prepare(`
        INSERT INTO openai_text_diagnostic_sessions
          (session_id, actor_id, created_at, expires_at, status)
        VALUES (?, 'Fabio', ?, ?, 'DISABLED')
      `).run(input.sessionId, this.#clock.now().toISOString(), input.expiresAt);
    });
  }

  public activate(sessionId: string): void {
    this.#transaction(() => {
      const session = this.#session(sessionId);
      if (session === undefined) throw notFound();
      if (session.status !== "DISABLED" || expired(session.expiresAt, this.#clock)) {
        this.#database.prepare("UPDATE openai_text_diagnostic_sessions SET status = 'EXPIRED' WHERE session_id = ?").run(sessionId);
        throw blocked("The text diagnostic session is not available for activation");
      }
      this.#database.prepare("UPDATE openai_text_diagnostic_sessions SET status = 'ACTIVE', enabled_at = ? WHERE session_id = ?").run(this.#clock.now().toISOString(), sessionId);
    });
  }

  public preflight(
    sessionId: string,
    operation: OpenAiTextDiagnosticOperation,
    model: string,
    maxCostUsd: number,
  ): OpenAiTextDiagnosticPreflight {
    this.#expireSessions();
    const session = this.#session(sessionId);
    const calls = this.#operationCount(sessionId);
    const residual = session === undefined ? 0 : this.#residualBudget(sessionId);
    const reason = session === undefined
      ? "session_not_found"
      : this.#blockingReason(sessionId, session, calls, operation, maxCostUsd, residual);
    return {
      authorizedCalls: calls,
      maxCostUsd,
      model,
      ...(reason === undefined ? {} : { reason }),
      residualBudgetUsd: microsToUsd(residual),
      status: reason === undefined ? "ready" : "blocked",
      totalCallsToday: this.#priorLiveCallsToday + calls,
    };
  }

  public reserve(input: {
    readonly maxCostUsd: number;
    readonly model: string;
    readonly operation: OpenAiTextDiagnosticOperation;
    readonly operationId: string;
    readonly sessionId: string;
  }): void {
    this.#transaction(() => {
      this.#expireSessionsInsideTransaction();
      const session = this.#session(input.sessionId);
      if (session === undefined) throw notFound();
      const calls = this.#operationCount(input.sessionId);
      const reason = this.#blockingReason(
        input.sessionId,
        session,
        calls,
        input.operation,
        input.maxCostUsd,
        this.#residualBudget(input.sessionId),
      );
      if (reason !== undefined) {
        if (reason === "operation_already_reserved") {
          throw new OpenAiTextDiagnosticSessionError(
            "openai_text_diagnostic_operation_duplicate",
            "The diagnostic operation has already been consumed",
          );
        }
        throw blocked("The text diagnostic preflight blocked this provider call");
      }
      this.#database.prepare(`
        INSERT INTO openai_text_diagnostic_operations
          (operation_id, session_id, operation, model_id, reserved_cost_microusd, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'reserved')
      `).run(
        input.operationId,
        input.sessionId,
        input.operation,
        input.model,
        usdToMicros(input.maxCostUsd),
        this.#clock.now().toISOString(),
      );
      if (this.#operationCount(input.sessionId) === SESSION_PROVIDER_CALL_CAP) {
        this.#database.prepare("UPDATE openai_text_diagnostic_sessions SET status = 'RELOCKED' WHERE session_id = ?").run(input.sessionId);
      }
    });
  }

  public reconcile(input: {
    readonly costClassification: OpenAiTextDiagnosticCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void {
    this.#transaction(() => {
      const row = this.#database.prepare(`
        SELECT session_id AS sessionId, status FROM openai_text_diagnostic_operations WHERE operation_id = ?
      `).get(input.operationId) as Record<string, unknown> | undefined;
      const costAllowed = input.costClassification === "RECONCILIATION_PENDING"
        ? input.costUsd === undefined
        : safeSettledCost(input.costUsd);
      if (row?.sessionId !== input.sessionId || row.status !== "reserved" || !costAllowed) {
        throw new OpenAiTextDiagnosticSessionError(
          "openai_text_diagnostic_session_not_reconcilable",
          "The text diagnostic operation cannot be reconciled",
        );
      }
      this.#database.prepare(`
        UPDATE openai_text_diagnostic_operations
        SET settled_cost_microusd = ?, cost_classification = ?, completed_at = ?, status = ?, reason_code = ?
        WHERE operation_id = ?
      `).run(
        input.costUsd === undefined ? null : usdToMicros(input.costUsd),
        input.costClassification,
        this.#clock.now().toISOString(),
        input.status,
        input.reasonCode ?? null,
        input.operationId,
      );
    });
  }

  public close(sessionId: string): void {
    this.#transaction(() => {
      this.#database.prepare(`
        UPDATE openai_text_diagnostic_sessions
        SET status = 'CLOSED'
        WHERE session_id = ? AND status IN ('ACTIVE', 'DISABLED', 'RELOCKED')
      `).run(sessionId);
    });
  }

  public snapshot(sessionId: string): OpenAiTextDiagnosticSnapshot {
    this.#expireSessions();
    const session = this.#session(sessionId);
    if (session === undefined) throw notFound();
    const costs = this.#costs(sessionId);
    const calls = this.#operationCount(sessionId);
    return {
      estimatedCostUsd: microsToUsd(costs.estimated),
      expiresAt: session.expiresAt,
      liveCalls: calls,
      priorLiveCallsToday: this.#priorLiveCallsToday,
      reconciliationPendingCostUsd: microsToUsd(costs.pending),
      reservedCostUsd: microsToUsd(costs.reserved),
      sessionId,
      sessionResidualBudgetUsd: microsToUsd(this.#residualBudget(sessionId)),
      status: session.status,
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
      UPDATE openai_text_diagnostic_sessions
      SET status = 'EXPIRED'
      WHERE status IN ('ACTIVE', 'DISABLED', 'RELOCKED') AND expires_at <= ?
    `).run(this.#clock.now().toISOString());
  }

  #session(sessionId: string): { readonly expiresAt: string; readonly status: OpenAiTextDiagnosticSessionStatus } | undefined {
    const row = this.#database.prepare(`
      SELECT expires_at AS expiresAt, status FROM openai_text_diagnostic_sessions WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown> | undefined;
    if (typeof row?.expiresAt !== "string" || !isStatus(row.status)) return undefined;
    return { expiresAt: row.expiresAt, status: row.status };
  }

  #operationCount(sessionId: string): number {
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS count FROM openai_text_diagnostic_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return integer(row.count);
  }

  #costs(sessionId: string): { readonly estimated: number; readonly pending: number; readonly reserved: number } {
    const row = this.#database.prepare(`
      SELECT
        COALESCE(SUM(reserved_cost_microusd), 0) AS reserved,
        COALESCE(SUM(CASE WHEN cost_classification IN ('ESTIMATED', 'EFFECTIVE') THEN settled_cost_microusd ELSE 0 END), 0) AS estimated,
        COALESCE(SUM(CASE WHEN cost_classification = 'RECONCILIATION_PENDING' THEN reserved_cost_microusd ELSE 0 END), 0) AS pending
      FROM openai_text_diagnostic_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return { estimated: integer(row.estimated), pending: integer(row.pending), reserved: integer(row.reserved) };
  }

  #residualBudget(sessionId: string): number {
    return Math.max(0, SESSION_COST_CAP_MICRO_USD - this.#costs(sessionId).reserved);
  }

  #blockingReason(
    sessionId: string,
    session: { readonly expiresAt: string; readonly status: OpenAiTextDiagnosticSessionStatus },
    calls: number,
    operation: OpenAiTextDiagnosticOperation,
    maxCostUsd: number,
    residual: number,
  ): string | undefined {
    const amount = safeReservationCost(maxCostUsd) ? usdToMicros(maxCostUsd) : Number.POSITIVE_INFINITY;
    if (session.status !== "ACTIVE") return "session_not_active";
    if (calls >= SESSION_PROVIDER_CALL_CAP) return "session_call_cap_reached";
    if (this.#priorLiveCallsToday + calls >= DAILY_PROVIDER_CALL_CAP) return "daily_call_cap_reached";
    if (this.#operationExists(sessionId, operation)) return "operation_already_reserved";
    if (amount > residual) return "session_budget_exceeded";
    return undefined;
  }

  #operationExists(
    sessionId: string,
    operation: OpenAiTextDiagnosticOperation,
  ): boolean {
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS count
      FROM openai_text_diagnostic_operations
      WHERE session_id = ? AND operation = ?
    `).get(sessionId, operation) as Record<string, unknown>;
    return integer(row.count) > 0;
  }
}

function isStatus(value: unknown): value is OpenAiTextDiagnosticSessionStatus {
  return value === "ACTIVE" || value === "CLOSED" || value === "DISABLED" || value === "EXPIRED" || value === "RELOCKED";
}

function expired(value: string, clock: OpenAiTextDiagnosticClock): boolean {
  return value <= clock.now().toISOString();
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function safeReservationCost(value: number): boolean {
  return Number.isFinite(value) && value > 0 && usdToMicros(value) <= OPERATION_COST_CAP_MICRO_USD;
}

function safeSettledCost(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && usdToMicros(value) <= SESSION_COST_CAP_MICRO_USD;
}

function usdToMicros(value: number): number {
  return Math.round(value * MICROS_PER_USD);
}

function microsToUsd(value: number): number {
  return value / MICROS_PER_USD;
}

function blocked(message: string): OpenAiTextDiagnosticSessionError {
  return new OpenAiTextDiagnosticSessionError("openai_text_diagnostic_preflight_blocked", message);
}

function notFound(): OpenAiTextDiagnosticSessionError {
  return new OpenAiTextDiagnosticSessionError("openai_text_diagnostic_session_not_found", "The text diagnostic session does not exist");
}
