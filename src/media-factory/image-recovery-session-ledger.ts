import { DatabaseSync } from "node:sqlite";

export const IMAGE_RECOVERY_CONTRACT_VERSION = "1" as const;
export const IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD = 4;
export const IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD = 0.3;
export const IMAGE_RECOVERY_MAX_CALLS = 1;

const NANODOLLARS_PER_USD = 1_000_000_000;

export type ImageRecoverySessionStatus = "ACTIVE" | "CLOSED" | "DISABLED" | "EXPIRED" | "RELOCKED";
export type ImageRecoveryOperationStatus = "failed" | "reserved" | "succeeded" | "uncertain";
export type ImageRecoveryCostClassification = "ESTIMATED" | "RECONCILIATION_PENDING";

export interface ImageRecoveryClock { now(): Date; }

export interface ImageRecoverySessionLedgerOptions {
  readonly clock?: ImageRecoveryClock;
  readonly path: string;
  readonly priorLiveCallsToday: number;
  readonly priorPendingExposureUsd: number;
}

export interface ImageRecoverySnapshot {
  readonly callCount: 0 | 1;
  readonly estimatedCostUsd: number;
  readonly expiresAt: string;
  readonly priorLiveCallsToday: number;
  readonly priorPendingExposureUsd: number;
  readonly reconciliationPendingCostUsd: number;
  readonly reservedCostUsd: number;
  readonly sessionId: string;
  readonly status: ImageRecoverySessionStatus;
}

export interface ImageRecoveryReceiptRow {
  readonly clientRequestId: string;
  readonly completedAt?: string;
  readonly costClassification?: ImageRecoveryCostClassification;
  readonly idempotencyKeyFingerprint: string;
  readonly modelId: string;
  readonly operationId: string;
  readonly reasonCode?: string;
  readonly requestFingerprint: string;
  readonly reservedCostUsd: number;
  readonly settledCostUsd?: number;
  readonly startedAt: string;
  readonly status: ImageRecoveryOperationStatus;
  readonly xRequestId?: string;
}

export class ImageRecoveryLedgerError extends Error {
  public readonly code: "image_recovery_blocked" | "image_recovery_duplicate" | "image_recovery_not_found" | "image_recovery_not_reconcilable";
  public constructor(code: ImageRecoveryLedgerError["code"]) {
    super("Image recovery session was blocked safely");
    this.code = code;
  }
}

/** Restart-safe one-call authorization. Reserving the operation relocks the session immediately. */
export class ImageRecoverySessionLedger {
  readonly #clock: ImageRecoveryClock;
  readonly #database: DatabaseSync;
  readonly #priorLiveCallsToday: number;
  readonly #priorPendingExposureNanoUsd: number;

  public constructor(options: ImageRecoverySessionLedgerOptions) {
    if (!Number.isSafeInteger(options.priorLiveCallsToday) || options.priorLiveCallsToday < 0 || options.priorLiveCallsToday > 8) {
      throw new Error("Prior live-call count is invalid");
    }
    if (!validUsd(options.priorPendingExposureUsd, IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD)) {
      throw new Error("Prior pending exposure is invalid");
    }
    this.#clock = options.clock ?? { now: (): Date => new Date() };
    this.#priorLiveCallsToday = options.priorLiveCallsToday;
    this.#priorPendingExposureNanoUsd = usdToNano(options.priorPendingExposureUsd);
    this.#database = new DatabaseSync(options.path, {
      allowExtension: false,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    });
    this.#database.exec("PRAGMA foreign_keys = ON");
    this.#database.exec("PRAGMA synchronous = FULL");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS image_recovery_sessions (
        session_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL CHECK (actor_id = 'Fabio'),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'DISABLED', 'EXPIRED', 'RELOCKED'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS image_recovery_operations (
        operation_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE REFERENCES image_recovery_sessions(session_id),
        client_request_id TEXT NOT NULL UNIQUE,
        idempotency_key_fingerprint TEXT NOT NULL,
        request_fingerprint TEXT NOT NULL,
        model_id TEXT NOT NULL,
        reserved_cost_nanousd INTEGER NOT NULL,
        settled_cost_nanousd INTEGER,
        cost_classification TEXT CHECK (cost_classification IN ('ESTIMATED', 'RECONCILIATION_PENDING')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'succeeded', 'failed', 'uncertain')),
        x_request_id TEXT,
        reason_code TEXT
      ) STRICT;
    `);
  }

  public createDisabled(input: { readonly expiresAt: string; readonly sessionId: string }): void {
    this.#transaction(() => {
      this.#database.prepare(`INSERT INTO image_recovery_sessions
        (session_id, actor_id, created_at, expires_at, status)
        VALUES (?, 'Fabio', ?, ?, 'DISABLED')`).run(input.sessionId, this.#clock.now().toISOString(), input.expiresAt);
    });
  }

  public activate(sessionId: string): void {
    this.#transaction(() => {
      const session = this.#session(sessionId);
      if (session === undefined) throw new ImageRecoveryLedgerError("image_recovery_not_found");
      if (session.status !== "DISABLED" || Date.parse(session.expiresAt) <= this.#clock.now().getTime()) {
        this.#database.prepare("UPDATE image_recovery_sessions SET status = 'EXPIRED' WHERE session_id = ?").run(sessionId);
        throw new ImageRecoveryLedgerError("image_recovery_blocked");
      }
      this.#database.prepare("UPDATE image_recovery_sessions SET status = 'ACTIVE' WHERE session_id = ?").run(sessionId);
    });
  }

  public preflight(input: { readonly maxCostUsd: number; readonly sessionId: string }): Readonly<Record<string, unknown>> {
    this.#expire();
    const session = this.#session(input.sessionId);
    const callCount = this.#callCount(input.sessionId);
    const totalExposure = this.#priorPendingExposureNanoUsd + usdToNano(input.maxCostUsd);
    const reason = session === undefined ? "session_not_found"
      : session.status !== "ACTIVE" ? `session_${session.status.toLowerCase()}`
      : !validUsd(input.maxCostUsd, IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD) ? "invalid_cost_reservation"
      : callCount >= IMAGE_RECOVERY_MAX_CALLS ? "operation_already_consumed"
      : this.#priorLiveCallsToday + callCount >= 8 ? "daily_call_cap"
      : totalExposure > usdToNano(IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD) ? "daily_budget_cap"
      : undefined;
    return {
      dailyHardLimitUsd: IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD,
      maxCalls: IMAGE_RECOVERY_MAX_CALLS,
      maxCostUsd: input.maxCostUsd,
      maxImages: 1,
      maxRetries: 0,
      priorPendingExposureUsd: nanoToUsd(this.#priorPendingExposureNanoUsd),
      ...(reason === undefined ? {} : { reason }),
      sessionHardLimitUsd: IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD,
      status: reason === undefined ? "ready" : "blocked",
      totalCallsToday: this.#priorLiveCallsToday + callCount,
    };
  }

  public reserve(input: {
    readonly clientRequestId: string;
    readonly idempotencyKeyFingerprint: string;
    readonly maxCostUsd: number;
    readonly modelId: string;
    readonly operationId: string;
    readonly requestFingerprint: string;
    readonly sessionId: string;
  }): void {
    this.#transaction(() => {
      this.#expireInsideTransaction();
      const preflight = this.preflightWithoutTransaction(input.sessionId, input.maxCostUsd);
      if (preflight !== undefined) {
        if (preflight === "operation_already_consumed") throw new ImageRecoveryLedgerError("image_recovery_duplicate");
        throw new ImageRecoveryLedgerError("image_recovery_blocked");
      }
      this.#database.prepare(`INSERT INTO image_recovery_operations
        (operation_id, session_id, client_request_id, idempotency_key_fingerprint, request_fingerprint, model_id, reserved_cost_nanousd, started_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved')`).run(
        input.operationId,
        input.sessionId,
        input.clientRequestId,
        input.idempotencyKeyFingerprint,
        input.requestFingerprint,
        input.modelId,
        usdToNano(input.maxCostUsd),
        this.#clock.now().toISOString(),
      );
      this.#database.prepare("UPDATE image_recovery_sessions SET status = 'RELOCKED' WHERE session_id = ?").run(input.sessionId);
    });
  }

  public settle(input: {
    readonly costClassification: ImageRecoveryCostClassification;
    readonly costUsd?: number;
    readonly operationId: string;
    readonly reasonCode?: string;
    readonly sessionId: string;
    readonly status: Exclude<ImageRecoveryOperationStatus, "reserved">;
    readonly xRequestId?: string;
  }): void {
    this.#transaction(() => {
      const row = this.#database.prepare("SELECT session_id AS sessionId, status FROM image_recovery_operations WHERE operation_id = ?").get(input.operationId) as Record<string, unknown> | undefined;
      if (row?.sessionId !== input.sessionId || row.status !== "reserved" ||
        (input.costClassification === "ESTIMATED" && input.costUsd === undefined) ||
        (input.costUsd !== undefined && !validUsd(input.costUsd, IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD))) {
        throw new ImageRecoveryLedgerError("image_recovery_not_reconcilable");
      }
      this.#database.prepare(`UPDATE image_recovery_operations
        SET settled_cost_nanousd = ?, cost_classification = ?, completed_at = ?, status = ?, x_request_id = ?, reason_code = ?
        WHERE operation_id = ?`).run(
        input.costUsd === undefined ? null : usdToNano(input.costUsd),
        input.costClassification,
        this.#clock.now().toISOString(),
        input.status,
        input.xRequestId ?? null,
        input.reasonCode ?? null,
        input.operationId,
      );
      this.#database.prepare("UPDATE image_recovery_sessions SET status = 'CLOSED' WHERE session_id = ?").run(input.sessionId);
    });
  }

  public receipt(operationId: string): ImageRecoveryReceiptRow {
    const row = this.#database.prepare(`SELECT
      operation_id AS operationId, client_request_id AS clientRequestId,
      idempotency_key_fingerprint AS idempotencyKeyFingerprint, request_fingerprint AS requestFingerprint,
      model_id AS modelId, reserved_cost_nanousd AS reservedCost, settled_cost_nanousd AS settledCost,
      cost_classification AS costClassification, started_at AS startedAt, completed_at AS completedAt,
      status, x_request_id AS xRequestId, reason_code AS reasonCode
      FROM image_recovery_operations WHERE operation_id = ?`).get(operationId) as Record<string, unknown> | undefined;
    if (row === undefined || typeof row.operationId !== "string" || typeof row.clientRequestId !== "string" ||
      typeof row.idempotencyKeyFingerprint !== "string" || typeof row.requestFingerprint !== "string" ||
      typeof row.modelId !== "string" || typeof row.startedAt !== "string" || !operationStatus(row.status)) {
      throw new ImageRecoveryLedgerError("image_recovery_not_found");
    }
    return {
      clientRequestId: row.clientRequestId,
      idempotencyKeyFingerprint: row.idempotencyKeyFingerprint,
      modelId: row.modelId,
      operationId: row.operationId,
      requestFingerprint: row.requestFingerprint,
      reservedCostUsd: nanoToUsd(integer(row.reservedCost)),
      startedAt: row.startedAt,
      status: row.status,
      ...(typeof row.completedAt === "string" ? { completedAt: row.completedAt } : {}),
      ...(costClassification(row.costClassification) ? { costClassification: row.costClassification } : {}),
      ...(typeof row.settledCost === "number" ? { settledCostUsd: nanoToUsd(integer(row.settledCost)) } : {}),
      ...(typeof row.xRequestId === "string" ? { xRequestId: row.xRequestId } : {}),
      ...(typeof row.reasonCode === "string" ? { reasonCode: row.reasonCode } : {}),
    };
  }

  public snapshot(sessionId: string): ImageRecoverySnapshot {
    this.#expire();
    const session = this.#session(sessionId);
    if (session === undefined) throw new ImageRecoveryLedgerError("image_recovery_not_found");
    const row = this.#database.prepare(`SELECT COUNT(*) AS count,
      COALESCE(SUM(reserved_cost_nanousd), 0) AS reserved,
      COALESCE(SUM(CASE WHEN cost_classification = 'ESTIMATED' THEN settled_cost_nanousd ELSE 0 END), 0) AS estimated,
      COALESCE(SUM(CASE WHEN cost_classification = 'RECONCILIATION_PENDING' THEN reserved_cost_nanousd ELSE 0 END), 0) AS pending
      FROM image_recovery_operations WHERE session_id = ?`).get(sessionId) as Record<string, unknown>;
    const count = integer(row.count);
    return {
      callCount: count === 0 ? 0 : 1,
      estimatedCostUsd: nanoToUsd(integer(row.estimated)),
      expiresAt: session.expiresAt,
      priorLiveCallsToday: this.#priorLiveCallsToday,
      priorPendingExposureUsd: nanoToUsd(this.#priorPendingExposureNanoUsd),
      reconciliationPendingCostUsd: nanoToUsd(integer(row.pending)),
      reservedCostUsd: nanoToUsd(integer(row.reserved)),
      sessionId,
      status: session.status,
    };
  }

  public closeDatabase(): void { this.#database.close(); }

  private preflightWithoutTransaction(sessionId: string, maxCostUsd: number): string | undefined {
    const session = this.#session(sessionId);
    if (session === undefined) return "session_not_found";
    if (session.status !== "ACTIVE") return `session_${session.status.toLowerCase()}`;
    if (!validUsd(maxCostUsd, IMAGE_RECOVERY_SESSION_HARD_LIMIT_USD)) return "invalid_cost_reservation";
    if (this.#callCount(sessionId) >= 1) return "operation_already_consumed";
    if (this.#priorLiveCallsToday >= 8) return "daily_call_cap";
    if (this.#priorPendingExposureNanoUsd + usdToNano(maxCostUsd) > usdToNano(IMAGE_RECOVERY_DAILY_HARD_LIMIT_USD)) return "daily_budget_cap";
    return undefined;
  }

  #callCount(sessionId: string): number {
    const row = this.#database.prepare("SELECT COUNT(*) AS count FROM image_recovery_operations WHERE session_id = ?").get(sessionId) as Record<string, unknown>;
    return integer(row.count);
  }

  #session(sessionId: string): { readonly expiresAt: string; readonly status: ImageRecoverySessionStatus } | undefined {
    const row = this.#database.prepare("SELECT expires_at AS expiresAt, status FROM image_recovery_sessions WHERE session_id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (typeof row?.expiresAt !== "string" || !sessionStatus(row.status)) return undefined;
    return { expiresAt: row.expiresAt, status: row.status };
  }

  #expire(): void { this.#transaction(() => { this.#expireInsideTransaction(); }); }
  #expireInsideTransaction(): void {
    this.#database.prepare("UPDATE image_recovery_sessions SET status = 'EXPIRED' WHERE status IN ('ACTIVE', 'DISABLED') AND expires_at <= ?").run(this.#clock.now().toISOString());
  }
  #transaction(operation: () => void): void {
    this.#database.exec("BEGIN IMMEDIATE");
    try { operation(); this.#database.exec("COMMIT"); }
    catch (error) { this.#database.exec("ROLLBACK"); throw error; }
  }
}

function sessionStatus(value: unknown): value is ImageRecoverySessionStatus {
  return value === "ACTIVE" || value === "CLOSED" || value === "DISABLED" || value === "EXPIRED" || value === "RELOCKED";
}
function operationStatus(value: unknown): value is ImageRecoveryOperationStatus {
  return value === "reserved" || value === "succeeded" || value === "failed" || value === "uncertain";
}
function costClassification(value: unknown): value is ImageRecoveryCostClassification {
  return value === "ESTIMATED" || value === "RECONCILIATION_PENDING";
}
function integer(value: unknown): number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function validUsd(value: number, maximum: number): boolean { return Number.isFinite(value) && value >= 0 && value <= maximum; }
function usdToNano(value: number): number { return Math.round(value * NANODOLLARS_PER_USD); }
function nanoToUsd(value: number): number { return value / NANODOLLARS_PER_USD; }
