import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { MetodoVeloceContentProductionPackage } from "./metodo-veloce-content-production.js";

export type MetodoVeloceContentProductionRecordStatus = "APPROVED_FOR_SCHEDULING" | "ARCHIVED" | "BLOCKED" | "PENDING_FABIO_APPROVAL" | "SCHEDULED";
export type MetodoVeloceContentReviewDecision = "APPROVED" | "REJECTED";

export interface MetodoVeloceContentProductionReview {
  readonly decision: MetodoVeloceContentReviewDecision;
  readonly note: string;
  readonly reviewedAt: string;
  readonly reviewedBy: string;
}

export interface MetodoVeloceContentProductionSchedule {
  readonly scheduledFor: string;
}

export interface MetodoVeloceContentPerformanceMetrics {
  readonly conversions: number;
  readonly costCents: number;
  readonly leadCount: number;
  readonly reportedAt: string;
  readonly reportedBy: string;
  readonly saves: number;
  readonly views: number;
}

export interface MetodoVeloceContentArchive {
  readonly archivedAt: string;
  readonly reason: "MANUAL" | "REJECTED_BY_FABIO";
}

export interface MetodoVeloceContentProductionRecord {
  readonly actorId: string;
  readonly archive?: MetodoVeloceContentArchive;
  readonly contractVersion: RequestContractVersion;
  readonly createdAt: string;
  readonly metrics?: MetodoVeloceContentPerformanceMetrics;
  readonly package: MetodoVeloceContentProductionPackage;
  readonly productionId: string;
  readonly review?: MetodoVeloceContentProductionReview;
  readonly schedule?: MetodoVeloceContentProductionSchedule;
  readonly status: MetodoVeloceContentProductionRecordStatus;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface MetodoVeloceContentProductionReviewRequest {
  readonly decision: MetodoVeloceContentReviewDecision;
  readonly expectedVersion: number;
  readonly note: string;
  readonly productionId: string;
}

export interface MetodoVeloceContentProductionScheduleRequest {
  readonly expectedVersion: number;
  readonly productionId: string;
  readonly scheduledFor: string;
}

export interface MetodoVeloceContentProductionMetricsRequest {
  readonly conversions: number;
  readonly costCents: number;
  readonly expectedVersion: number;
  readonly leadCount: number;
  readonly productionId: string;
  readonly saves: number;
  readonly views: number;
}

export interface MetodoVeloceContentProductionArchiveRequest {
  readonly expectedVersion: number;
  readonly productionId: string;
  readonly reason: "MANUAL";
}

export function isMetodoVeloceContentProductionTransitionAllowed(from: MetodoVeloceContentProductionRecordStatus, to: MetodoVeloceContentProductionRecordStatus): boolean {
  if (from === "PENDING_FABIO_APPROVAL") return to === "APPROVED_FOR_SCHEDULING" || to === "ARCHIVED";
  if (from === "APPROVED_FOR_SCHEDULING") return to === "ARCHIVED" || to === "SCHEDULED";
  if (from === "SCHEDULED") return to === "ARCHIVED" || to === "SCHEDULED";
  return false;
}
