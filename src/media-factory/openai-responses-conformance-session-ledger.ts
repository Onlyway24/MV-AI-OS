import { DatabaseSync } from "node:sqlite";

export const OPENAI_RESPONSES_CONFORMANCE_OPERATION =
  "OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK" as const;
export const OPENAI_RESPONSES_CONFORMANCE_SESSION_CONTRACT_VERSION = "1" as const;
export const OPENAI_RESPONSES_CONFORMANCE_COST_CAP_USD = 0.01;
export const OPENAI_RESPONSES_CONFORMANCE_MAX_LIVE_CALLS = 1;

export type OpenAiResponsesConformanceCostClassification =
  | "ESTIMATED"
  | "RECONCILIATION_PENDING";
export type OpenAiResponsesConformanceSessionStatus =
  | "ACTIVE"
  | "CLOSED"
  | "DISABLED"
  | "EXPIRED"
  | "RELOCKED";

export interface OpenAiResponsesConformanceClock {
  now(): Date;
}

export interface OpenAiResponsesConformancePreflight {
  readonly authorizedCalls: number;
  readonly maxCostUsd: number;
  readonly model: string;
  readonly reason?: string;
  readonly residualBudgetUsd: number;
  readonly status: "blocked" | "ready";
  readonly totalCallsToday: number;
}

export interface OpenAiResponsesConformanceSnapshot {
  readonly estimatedCostUsd: number;
  readonly expiresAt: string;
  readonly liveCalls: number;
  readonly priorLiveCallsToday: number;
  readonly reconciliationPendingCostUsd: number;
  readonly reservedCostUsd: number;
  readonly sessionId: string;
  readonly sessionResidualBudgetUsd: number;
  readonly status: OpenAiResponsesConformanceSessionStatus;
}

export interface OpenAiResponsesConformanceSessionLedgerOptions {
  readonly clock?: OpenAiResponsesConformanceClock;
  readonly path: string;
  /** Closed historical sessions: Closure Run (1) plus text diagnosis (1). */
  readonly priorLiveCallsToday: number;
}

export class OpenAiResponsesConformanceSessionError extends Error {
  public readonly code:
    | "openai_responses_conformance_duplicate_operation"
    | "openai_responses_conformance_preflight_blocked"
    | "openai_responses_conformance_session_not_found"
    | "openai_responses_conformance_session_not_reconcilable";

  public constructor(
    code: OpenAiResponsesConformanceSessionError["code"],
  ) {
    super("OpenAI Responses conformance session was blocked safely");
    this.code = code;
  }
}

const DAILY_CALL_CAP = 8;
const NANODOLLARS_PER_USD = 1_000_000_000;
const OPERATION_CAP_MICRO_USD = 10_000_000;

/**
 * One isolated, one-use authorization ledger. It stores no prompt, response,
 * header, credential or raw request. Reserving the operation immediately
 * relocks the session so a second call is impossible even after a restart.
 */
export class OpenAiResponsesConformanceSessionLedger {
  readonly #clock: OpenAiResponsesConformanceClock;
  readonly #database: DatabaseSync;
  readonly #priorLiveCallsToday: number;

  public constructor(options: OpenAiResponsesConformanceSessionLedgerOptions) {
    if (!Number.isSafeInteger(options.priorLiveCallsToday) || options.priorLiveCallsToday < 0 || options.priorLiveCallsToday > DAILY_CALL_CAP) {
      throw new Error("The previous live-call total is invalid");
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
      CREATE TABLE IF NOT EXISTS openai_responses_conformance_sessions (
        session_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL CHECK (actor_id = 'Fabio'),
        created_at TEXT NOT NULL,
        enabled_at TEXT,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'DISABLED', 'EXPIRED', 'RELOCKED'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS openai_responses_conformance_operations (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES openai_responses_conformance_sessions(session_id),
        operation TEXT NOT NULL CHECK (operation = 'OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK'),
        model_id TEXT NOT NULL,
        reserved_cost_microusd INTEGER NOT NULL,
        settled_cost_microusd INTEGER,
        cost_classification TEXT CHECK (cost_classification IN ('ESTIMATED', 'RECONCILIATION_PENDING')),
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
        INSERT INTO openai_responses_conformance_sessions
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
        this.#database.prepare("UPDATE openai_responses_conformance_sessions SET status = 'EXPIRED' WHERE session_id = ?").run(sessionId);
        throw blocked();
      }
      this.#database.prepare(`
        UPDATE openai_responses_conformance_sessions
        SET status = 'ACTIVE', enabled_at = ? WHERE session_id = ?
      `).run(this.#clock.now().toISOString(), sessionId);
    });
  }

  public preflight(sessionId: string, model: string, maxCostUsd: number): OpenAiResponsesConformancePreflight {
    this.#expireSessions();
    const session = this.#session(sessionId);
    const calls = this.#operationCount(sessionId);
    const residual = session === undefined ? 0 : this.#residualBudget(sessionId);
    const reason = session === undefined
      ? "session_not_found"
      : this.#blockingReason(sessionId, session, calls, maxCostUsd, residual);
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
    readonly operationId: string;
    readonly sessionId: string;
  }): void {
    this.#transaction(() => {
      this.#expireSessionsInsideTransaction();
      const session = this.#session(input.sessionId);
      const calls = this.#operationCount(input.sessionId);
      const reason = session === undefined
        ? "session_not_found"
        : this.#blockingReason(
          input.sessionId,
          session,
          calls,
          input.maxCostUsd,
          this.#residualBudget(input.sessionId),
        );
      if (reason !== undefined) {
        if (reason === "operation_already_reserved") {
          throw new OpenAiResponsesConformanceSessionError(
            "openai_responses_conformance_duplicate_operation",
          );
        }
        throw blocked();
      }
      this.#database.prepare(`
        INSERT INTO openai_responses_conformance_operations
          (operation_id, session_id, operation, model_id, reserved_cost_microusd, started_at, status)
        VALUES (?, ?, 'OPENAI_RESPONSES_PLAIN_CONFORMANCE_CHECK', ?, ?, ?, 'reserved')
      `).run(
        input.operationId,
        input.sessionId,
        input.model,
        usdToMicros(input.maxCostUsd),
        this.#clock.now().toISOString(),
      );
      this.#database.prepare(`
        UPDATE openai_responses_conformance_sessions SET status = 'RELOCKED' WHERE session_id = ?
      `).run(input.sessionId);
    });
  }

  public reconcile(input: {
    readonly costClassification: OpenAiResponsesConformanceCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void {
    this.#transaction(() => {
      const operation = this.#database.prepare(`
        SELECT session_id AS sessionId, status FROM openai_responses_conformance_operations
        WHERE operation_id = ?
      `).get(input.operationId) as Record<string, unknown> | undefined;
      const costAllowed = input.costClassification === "RECONCILIATION_PENDING"
        ? input.costUsd === undefined
        : safeSettledCost(input.costUsd);
      if (operation?.sessionId !== input.sessionId || operation.status !== "reserved" || !costAllowed) {
        throw new OpenAiResponsesConformanceSessionError(
          "openai_responses_conformance_session_not_reconcilable",
        );
      }
      this.#database.prepare(`
        UPDATE openai_responses_conformance_operations
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
        UPDATE openai_responses_conformance_sessions
        SET status = 'CLOSED'
        WHERE session_id = ? AND status IN ('ACTIVE', 'DISABLED', 'RELOCKED')
      `).run(sessionId);
    });
  }

  public snapshot(sessionId: string): OpenAiResponsesConformanceSnapshot {
    this.#expireSessions();
    const session = this.#session(sessionId);
    if (session === undefined) throw notFound();
    const costs = this.#costs(sessionId);
    return {
      estimatedCostUsd: microsToUsd(costs.estimated),
      expiresAt: session.expiresAt,
      liveCalls: this.#operationCount(sessionId),
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
      UPDATE openai_responses_conformance_sessions SET status = 'EXPIRED'
      WHERE status IN ('ACTIVE', 'DISABLED', 'RELOCKED') AND expires_at <= ?
    `).run(this.#clock.now().toISOString());
  }

  #session(sessionId: string): { readonly expiresAt: string; readonly status: OpenAiResponsesConformanceSessionStatus } | undefined {
    const row = this.#database.prepare(`
      SELECT expires_at AS expiresAt, status FROM openai_responses_conformance_sessions WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown> | undefined;
    return typeof row?.expiresAt === "string" && isStatus(row.status)
      ? { expiresAt: row.expiresAt, status: row.status }
      : undefined;
  }

  #operationCount(sessionId: string): number {
    const row = this.#database.prepare(`
      SELECT COUNT(*) AS count FROM openai_responses_conformance_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return integer(row.count);
  }

  #costs(sessionId: string): { readonly estimated: number; readonly pending: number; readonly reserved: number } {
    const row = this.#database.prepare(`
      SELECT
        COALESCE(SUM(reserved_cost_microusd), 0) AS reserved,
        COALESCE(SUM(CASE WHEN cost_classification = 'ESTIMATED' THEN settled_cost_microusd ELSE 0 END), 0) AS estimated,
        COALESCE(SUM(CASE WHEN cost_classification = 'RECONCILIATION_PENDING' THEN reserved_cost_microusd ELSE 0 END), 0) AS pending
      FROM openai_responses_conformance_operations WHERE session_id = ?
    `).get(sessionId) as Record<string, unknown>;
    return { estimated: integer(row.estimated), pending: integer(row.pending), reserved: integer(row.reserved) };
  }

  #residualBudget(sessionId: string): number {
    return Math.max(0, OPERATION_CAP_MICRO_USD - this.#costs(sessionId).reserved);
  }

  #blockingReason(
    sessionId: string,
    session: { readonly expiresAt: string; readonly status: OpenAiResponsesConformanceSessionStatus },
    calls: number,
    maxCostUsd: number,
    residual: number,
  ): string | undefined {
    const reservation = safeReservationCost(maxCostUsd)
      ? usdToMicros(maxCostUsd)
      : Number.POSITIVE_INFINITY;
    if (session.status !== "ACTIVE") return "session_not_active";
    if (calls >= OPENAI_RESPONSES_CONFORMANCE_MAX_LIVE_CALLS) return "session_call_cap_reached";
    if (this.#priorLiveCallsToday + calls >= DAILY_CALL_CAP) return "daily_call_cap_reached";
    if (this.#operationExists(sessionId)) return "operation_already_reserved";
    if (reservation > residual) return "session_budget_exceeded";
    return undefined;
  }

  #operationExists(sessionId: string): boolean {
    return this.#operationCount(sessionId) > 0;
  }
}

function isStatus(value: unknown): value is OpenAiResponsesConformanceSessionStatus {
  return value === "ACTIVE" || value === "CLOSED" || value === "DISABLED" || value === "EXPIRED" || value === "RELOCKED";
}

function expired(value: string, clock: OpenAiResponsesConformanceClock): boolean {
  return value <= clock.now().toISOString();
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}

function safeReservationCost(value: number): boolean {
  return Number.isFinite(value) && value > 0 && usdToMicros(value) <= OPERATION_CAP_MICRO_USD;
}

function safeSettledCost(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && usdToMicros(value) <= OPERATION_CAP_MICRO_USD;
}

function usdToMicros(value: number): number {
  return Math.round(value * NANODOLLARS_PER_USD);
}

function microsToUsd(value: number): number {
  return value / NANODOLLARS_PER_USD;
}

function blocked(): OpenAiResponsesConformanceSessionError {
  return new OpenAiResponsesConformanceSessionError(
    "openai_responses_conformance_preflight_blocked",
  );
}

function notFound(): OpenAiResponsesConformanceSessionError {
  return new OpenAiResponsesConformanceSessionError(
    "openai_responses_conformance_session_not_found",
  );
}
