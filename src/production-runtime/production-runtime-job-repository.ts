import type { ProductionRuntimeJob } from "./production-runtime-job.js";

export interface ProductionRuntimeJobUpdateExpectation { readonly version: number; }
export interface ProductionRuntimeJobCounts { readonly completed: number; readonly deadLetter: number; readonly queued: number; readonly retryScheduled: number; readonly running: number; }
export interface ProductionRuntimeJobRepository {
  claimNextDue(workspaceId: string, now: string, leaseExpiresAt: string): Promise<ProductionRuntimeJob | undefined>;
  getById(jobId: string): Promise<ProductionRuntimeJob | undefined>;
  insert(job: ProductionRuntimeJob): Promise<void>;
  listExpiredClaims(workspaceId: string, now: string, limit: number): Promise<readonly ProductionRuntimeJob[]>;
  summarize(workspaceId: string): Promise<ProductionRuntimeJobCounts>;
  update(job: ProductionRuntimeJob, expectation: ProductionRuntimeJobUpdateExpectation): Promise<void>;
}
