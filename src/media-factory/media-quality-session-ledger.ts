import { DatabaseSync } from "node:sqlite";

export const MEDIA_QUALITY_SESSION_CONTRACT_VERSION = "1" as const;
export const MEDIA_QUALITY_DAILY_HARD_LIMIT_USD = 4;
export const MEDIA_QUALITY_SESSION_HARD_LIMIT_USD = 1;
export const MEDIA_QUALITY_MAX_LIVE_CALLS = 2;

export type MediaQualityOperation =
  | "GPT_IMAGE_2_MASTER"
  | "STRUCTURED_CONTENT_DIRECTION";
export type MediaQualityCostClassification =
  | "ESTIMATED"
  | "RECONCILIATION_PENDING";
export type MediaQualitySessionStatus =
  | "ACTIVE"
  | "CLOSED"
  | "DISABLED"
  | "EXPIRED"
  | "RELOCKED";

export interface MediaQualityClock { now(): Date; }
export interface MediaQualitySessionLedgerOptions {
  readonly clock?: MediaQualityClock;
  readonly path: string;
  readonly priorLiveCallsToday: number;
  readonly priorReservedExposureUsd: number;
}
export interface MediaQualityPreflight {
  readonly dailyResidualBudgetUsd: number;
  readonly maxCostUsd: number;
  readonly model: string;
  readonly operation: MediaQualityOperation;
  readonly reason?: string;
  readonly sessionResidualBudgetUsd: number;
  readonly status: "blocked" | "ready";
  readonly totalCallsToday: number;
}
export interface MediaQualityLedgerSnapshot {
  readonly estimatedCostUsd: number;
  readonly expiresAt: string;
  readonly imageCalls: number;
  readonly liveCalls: number;
  readonly priorLiveCallsToday: number;
  readonly priorReservedExposureUsd: number;
  readonly reconciliationPendingCostUsd: number;
  readonly reservedCostUsd: number;
  readonly sessionId: string;
  readonly sessionResidualBudgetUsd: number;
  readonly status: MediaQualitySessionStatus;
  readonly textCalls: number;
}

export class MediaQualitySessionError extends Error {
  public readonly code:
    | "media_quality_duplicate_operation"
    | "media_quality_preflight_blocked"
    | "media_quality_session_not_found"
    | "media_quality_session_not_reconcilable";
  public constructor(code: MediaQualitySessionError["code"]) {
    super("Media quality session was blocked safely");
    this.code = code;
  }
}

const NANODOLLARS_PER_USD = 1_000_000_000;
const DAILY_CALL_CAP = 8;

/** Restart-safe authorization for one structured and one image request. */
export class MediaQualitySessionLedger {
  readonly #clock: MediaQualityClock;
  readonly #database: DatabaseSync;
  readonly #priorLiveCallsToday: number;
  readonly #priorReservedExposureNanoUsd: number;

  public constructor(options: MediaQualitySessionLedgerOptions) {
    if (!validCount(options.priorLiveCallsToday, DAILY_CALL_CAP)) throw new Error("The previous live-call count is invalid");
    if (!validUsd(options.priorReservedExposureUsd, MEDIA_QUALITY_DAILY_HARD_LIMIT_USD)) throw new Error("The previous reserved exposure is invalid");
    this.#clock = options.clock ?? { now: (): Date => new Date() };
    this.#priorLiveCallsToday = options.priorLiveCallsToday;
    this.#priorReservedExposureNanoUsd = usdToNano(options.priorReservedExposureUsd);
    this.#database = new DatabaseSync(options.path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS media_quality_sessions (
        session_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL CHECK (actor_id = 'Fabio'),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'DISABLED', 'EXPIRED', 'RELOCKED'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS media_quality_operations (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES media_quality_sessions(session_id),
        operation TEXT NOT NULL CHECK (operation IN ('GPT_IMAGE_2_MASTER', 'STRUCTURED_CONTENT_DIRECTION')),
        model_id TEXT NOT NULL,
        reserved_cost_nanousd INTEGER NOT NULL,
        settled_cost_nanousd INTEGER,
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
      this.#database.prepare(`INSERT INTO media_quality_sessions
        (session_id, actor_id, created_at, expires_at, status)
        VALUES (?, 'Fabio', ?, ?, 'DISABLED')`).run(
        input.sessionId,
        this.#clock.now().toISOString(),
        input.expiresAt,
      );
    });
  }

  public activate(sessionId: string): void {
    this.#transaction(() => {
      const session = this.#session(sessionId);
      if (session === undefined) throw this.#notFound();
      if (session.status !== "DISABLED" || this.#expired(session.expiresAt)) {
        this.#database.prepare("UPDATE media_quality_sessions SET status = 'EXPIRED' WHERE session_id = ?").run(sessionId);
        throw this.#blocked();
      }
      this.#database.prepare("UPDATE media_quality_sessions SET status = 'ACTIVE' WHERE session_id = ?").run(sessionId);
    });
  }

  public preflight(input: {
    readonly maxCostUsd: number;
    readonly model: string;
    readonly operation: MediaQualityOperation;
    readonly sessionId: string;
  }): MediaQualityPreflight {
    this.#expire();
    const reason = this.#blockingReason(input);
    const costs = this.#costs(input.sessionId);
    const calls = this.#counts(input.sessionId);
    return {
      dailyResidualBudgetUsd: nanoToUsd(Math.max(0, usdToNano(MEDIA_QUALITY_DAILY_HARD_LIMIT_USD) - this.#priorReservedExposureNanoUsd - costs.reserved)),
      maxCostUsd: input.maxCostUsd,
      model: input.model,
      operation: input.operation,
      ...(reason === undefined ? {} : { reason }),
      sessionResidualBudgetUsd: nanoToUsd(Math.max(0, usdToNano(MEDIA_QUALITY_SESSION_HARD_LIMIT_USD) - costs.reserved)),
      status: reason === undefined ? "ready" : "blocked",
      totalCallsToday: this.#priorLiveCallsToday + calls.total,
    };
  }

  public reserve(input: {
    readonly maxCostUsd: number;
    readonly model: string;
    readonly operation: MediaQualityOperation;
    readonly operationId: string;
    readonly sessionId: string;
  }): void {
    this.#transaction(() => {
      this.#expireInsideTransaction();
      const reason = this.#blockingReason(input);
      if (reason !== undefined) {
        if (reason === "operation_already_consumed") throw new MediaQualitySessionError("media_quality_duplicate_operation");
        throw this.#blocked();
      }
      this.#database.prepare(`INSERT INTO media_quality_operations
        (operation_id, session_id, operation, model_id, reserved_cost_nanousd, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, 'reserved')`).run(
        input.operationId,
        input.sessionId,
        input.operation,
        input.model,
        usdToNano(input.maxCostUsd),
        this.#clock.now().toISOString(),
      );
      if (this.#counts(input.sessionId).total === MEDIA_QUALITY_MAX_LIVE_CALLS) {
        this.#database.prepare("UPDATE media_quality_sessions SET status = 'RELOCKED' WHERE session_id = ?").run(input.sessionId);
      }
    });
  }

  public reconcile(input: {
    readonly costClassification: MediaQualityCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: "failed" | "succeeded";
  }): void {
    this.#transaction(() => {
      const operation = this.#database.prepare("SELECT session_id AS sessionId, status FROM media_quality_operations WHERE operation_id = ?").get(input.operationId) as Record<string, unknown> | undefined;
      if (operation?.sessionId !== input.sessionId || operation.status !== "reserved" ||
        (input.costClassification === "ESTIMATED" && input.costUsd === undefined) ||
        (input.costUsd !== undefined && !validUsd(input.costUsd, MEDIA_QUALITY_SESSION_HARD_LIMIT_USD))) {
        throw new MediaQualitySessionError("media_quality_session_not_reconcilable");
      }
      this.#database.prepare(`UPDATE media_quality_operations
        SET settled_cost_nanousd = ?, cost_classification = ?, completed_at = ?, status = ?, reason_code = ?
        WHERE operation_id = ?`).run(
        input.costUsd === undefined ? null : usdToNano(input.costUsd),
        input.costClassification,
        this.#clock.now().toISOString(),
        input.status,
        input.reasonCode ?? null,
        input.operationId,
      );
      if (input.status === "failed") this.#database.prepare("UPDATE media_quality_sessions SET status = 'CLOSED' WHERE session_id = ?").run(input.sessionId);
    });
  }

  public close(sessionId: string): void {
    this.#transaction(() => {
      this.#database.prepare("UPDATE media_quality_sessions SET status = 'CLOSED' WHERE session_id = ? AND status IN ('ACTIVE', 'DISABLED', 'RELOCKED')").run(sessionId);
    });
  }

  public snapshot(sessionId: string): MediaQualityLedgerSnapshot {
    this.#expire();
    const session = this.#session(sessionId);
    if (session === undefined) throw this.#notFound();
    const counts = this.#counts(sessionId);
    const costs = this.#costs(sessionId);
    return {
      estimatedCostUsd: nanoToUsd(costs.estimated),
      expiresAt: session.expiresAt,
      imageCalls: counts.image,
      liveCalls: counts.total,
      priorLiveCallsToday: this.#priorLiveCallsToday,
      priorReservedExposureUsd: nanoToUsd(this.#priorReservedExposureNanoUsd),
      reconciliationPendingCostUsd: nanoToUsd(costs.pending),
      reservedCostUsd: nanoToUsd(costs.reserved),
      sessionId,
      sessionResidualBudgetUsd: nanoToUsd(Math.max(0, usdToNano(MEDIA_QUALITY_SESSION_HARD_LIMIT_USD) - costs.reserved)),
      status: session.status,
      textCalls: counts.text,
    };
  }

  public closeDatabase(): void { this.#database.close(); }

  #blockingReason(input: { readonly maxCostUsd: number; readonly operation: MediaQualityOperation; readonly sessionId: string }): string | undefined {
    const session = this.#session(input.sessionId);
    if (session === undefined) return "session_not_found";
    if (session.status !== "ACTIVE") return `session_${session.status.toLowerCase()}`;
    if (!validUsd(input.maxCostUsd, MEDIA_QUALITY_SESSION_HARD_LIMIT_USD)) return "invalid_cost_reservation";
    const counts = this.#counts(input.sessionId);
    if (counts.total + this.#priorLiveCallsToday >= DAILY_CALL_CAP) return "daily_call_cap";
    if (counts.total >= MEDIA_QUALITY_MAX_LIVE_CALLS) return "session_call_cap";
    if (input.operation === "STRUCTURED_CONTENT_DIRECTION" && counts.text >= 1) return "operation_already_consumed";
    if (input.operation === "GPT_IMAGE_2_MASTER" && counts.image >= 1) return "operation_already_consumed";
    if (input.operation === "GPT_IMAGE_2_MASTER" && !this.#structuredSucceeded(input.sessionId)) return "structured_direction_not_ready";
    const costs = this.#costs(input.sessionId);
    const reservation = usdToNano(input.maxCostUsd);
    if (costs.reserved + reservation > usdToNano(MEDIA_QUALITY_SESSION_HARD_LIMIT_USD)) return "session_budget_cap";
    if (costs.reserved + reservation + this.#priorReservedExposureNanoUsd > usdToNano(MEDIA_QUALITY_DAILY_HARD_LIMIT_USD)) return "daily_budget_cap";
    return undefined;
  }

  #structuredSucceeded(sessionId: string): boolean {
    const row = this.#database.prepare("SELECT status FROM media_quality_operations WHERE session_id = ? AND operation = 'STRUCTURED_CONTENT_DIRECTION'").get(sessionId) as Record<string, unknown> | undefined;
    return row?.status === "succeeded";
  }

  #counts(sessionId: string): { readonly image: number; readonly text: number; readonly total: number } {
    const row = this.#database.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN operation = 'GPT_IMAGE_2_MASTER' THEN 1 ELSE 0 END) AS image,
      SUM(CASE WHEN operation = 'STRUCTURED_CONTENT_DIRECTION' THEN 1 ELSE 0 END) AS text
      FROM media_quality_operations WHERE session_id = ?`).get(sessionId) as Record<string, unknown>;
    return { image: integer(row.image), text: integer(row.text), total: integer(row.total) };
  }

  #costs(sessionId: string): { readonly estimated: number; readonly pending: number; readonly reserved: number } {
    const row = this.#database.prepare(`SELECT
      COALESCE(SUM(CASE WHEN cost_classification = 'ESTIMATED' THEN settled_cost_nanousd ELSE 0 END), 0) AS estimated,
      COALESCE(SUM(CASE WHEN cost_classification = 'RECONCILIATION_PENDING' THEN reserved_cost_nanousd ELSE 0 END), 0) AS pending,
      COALESCE(SUM(reserved_cost_nanousd), 0) AS reserved
      FROM media_quality_operations WHERE session_id = ?`).get(sessionId) as Record<string, unknown>;
    return { estimated: integer(row.estimated), pending: integer(row.pending), reserved: integer(row.reserved) };
  }

  #session(sessionId: string): { readonly expiresAt: string; readonly status: MediaQualitySessionStatus } | undefined {
    const row = this.#database.prepare("SELECT expires_at AS expiresAt, status FROM media_quality_sessions WHERE session_id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (typeof row?.expiresAt !== "string" || !sessionStatus(row.status)) return undefined;
    return { expiresAt: row.expiresAt, status: row.status };
  }

  #expire(): void { this.#transaction(() => { this.#expireInsideTransaction(); }); }
  #expireInsideTransaction(): void {
    this.#database.prepare("UPDATE media_quality_sessions SET status = 'EXPIRED' WHERE status IN ('ACTIVE', 'DISABLED', 'RELOCKED') AND expires_at <= ?").run(this.#clock.now().toISOString());
  }
  #expired(value: string): boolean { return Date.parse(value) <= this.#clock.now().getTime(); }
  #transaction(operation: () => void): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try { operation(); this.#database.exec("COMMIT"); }
    catch (error) { this.#database.exec("ROLLBACK"); throw error; }
  }
  #blocked(): MediaQualitySessionError { return new MediaQualitySessionError("media_quality_preflight_blocked"); }
  #notFound(): MediaQualitySessionError { return new MediaQualitySessionError("media_quality_session_not_found"); }
}

function sessionStatus(value: unknown): value is MediaQualitySessionStatus {
  return value === "ACTIVE" || value === "CLOSED" || value === "DISABLED" || value === "EXPIRED" || value === "RELOCKED";
}
function integer(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function validCount(value: number, maximum: number): boolean { return Number.isSafeInteger(value) && value >= 0 && value <= maximum; }
function validUsd(value: number, maximum: number): boolean { return Number.isFinite(value) && value >= 0 && value <= maximum; }
function usdToNano(value: number): number { return Math.round(value * NANODOLLARS_PER_USD); }
function nanoToUsd(value: number): number { return value / NANODOLLARS_PER_USD; }
