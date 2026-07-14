import type { MetodoVeloceContentProductionBrief } from "../content-production/metodo-veloce-content-production.js";

export const PRODUCTION_RUNTIME_CONTRACT_VERSION = "1" as const;

export type ProductionRuntimeJobStatus = "COMPLETED" | "DEAD_LETTER" | "QUEUED" | "RETRY_SCHEDULED" | "RUNNING";

export interface ProductionRuntimeJobError {
  readonly code: "lease_expired" | "runtime_execution_failed";
  readonly occurredAt: string;
}

export interface ProductionRuntimeJobResult {
  readonly productionId: string;
}

export interface ProductionRuntimeJob {
  readonly actorId: string;
  readonly attempt: number;
  readonly brief: MetodoVeloceContentProductionBrief;
  readonly contractVersion: "1";
  readonly createdAt: string;
  readonly jobId: string;
  readonly lastError?: ProductionRuntimeJobError;
  readonly leaseExpiresAt?: string;
  readonly maxAttempts: number;
  readonly result?: ProductionRuntimeJobResult;
  readonly runAfter: string;
  readonly status: ProductionRuntimeJobStatus;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface ProductionRuntimeEnqueueRequest {
  readonly brief: MetodoVeloceContentProductionBrief;
  readonly jobId: string;
  readonly runAfter: string;
}

export interface ProductionRuntimeHealthReport {
  readonly contractVersion: "1";
  readonly counts: Readonly<{ readonly completed: number; readonly deadLetter: number; readonly queued: number; readonly retryScheduled: number; readonly running: number }>;
  readonly deadLetterAttentionRequired: boolean;
  readonly status: "ATTENTION_REQUIRED" | "READY";
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface ProductionRuntimeRunResult {
  readonly contractVersion: "1";
  readonly job?: ProductionRuntimeJob;
  readonly recoveredExpiredClaims: number;
  readonly status: "COMPLETED" | "DEAD_LETTER" | "IDLE" | "RETRY_SCHEDULED";
  readonly unauthorizedExternalEffectOccurred: false;
}

export function isProductionRuntimeJobTransitionAllowed(from: ProductionRuntimeJobStatus, to: ProductionRuntimeJobStatus): boolean {
  return (from === "QUEUED" || from === "RETRY_SCHEDULED") ? to === "RUNNING" : from === "RUNNING" ? ["COMPLETED", "DEAD_LETTER", "RETRY_SCHEDULED"].includes(to) : false;
}
