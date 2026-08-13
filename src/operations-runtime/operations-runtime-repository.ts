import type {
  OperationsJob,
  OperationsJobAttempt,
  OperationsJobSummary,
  OperationsJobSuccessor,
  OperationsProcessLease,
  OperationsRuntimeControl,
  OperationsRuntimeCounts,
  OperationsRuntimeUsageSummary,
  OperationsSchedule,
} from "./operations-runtime.js";

export interface OperationsRuntimeRepository {
  claimNextDue(input: {
    readonly fencingToken: number;
    readonly leaseId: string;
    readonly now: string;
    readonly workerId: string;
    readonly workspaceId: string;
  }): Promise<OperationsJob | undefined>;
  deleteProcessLease(input: {
    readonly fencingToken: number;
    readonly instanceId: string;
    readonly leaseKey: string;
    readonly version: number;
    readonly workspaceId: string;
  }): Promise<void>;
  deleteTerminalJob(jobId: string, expectation: { readonly version: number }): Promise<void>;
  getControl(workspaceId: string): Promise<OperationsRuntimeControl | undefined>;
  getJobById(jobId: string): Promise<OperationsJob | undefined>;
  getJobByOperationIdentity(workspaceId: string, operationIdentity: string): Promise<OperationsJob | undefined>;
  getSuccessorByPredecessor(workspaceId: string, predecessorJobId: string): Promise<OperationsJobSuccessor | undefined>;
  getProcessLease(workspaceId: string, leaseKey: string): Promise<OperationsProcessLease | undefined>;
  getScheduleById(scheduleId: string): Promise<OperationsSchedule | undefined>;
  insertAttempt(attempt: OperationsJobAttempt): Promise<void>;
  insertJob(job: OperationsJob): Promise<void>;
  insertProcessLease(lease: OperationsProcessLease): Promise<void>;
  insertSchedule(schedule: OperationsSchedule): Promise<void>;
  listAttempts(jobId: string): Promise<readonly OperationsJobAttempt[]>;
  listDueSchedules(workspaceId: string, now: string, limit: number): Promise<readonly OperationsSchedule[]>;
  listExpiredClaims(workspaceId: string, now: string, limit: number): Promise<readonly OperationsJob[]>;
  listJobsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly OperationsJobSummary[]>;
  listProcessLeases(workspaceId: string, role: OperationsProcessLease["role"], limit: number): Promise<readonly OperationsProcessLease[]>;
  listTerminalBefore(workspaceId: string, before: string, limit: number): Promise<readonly OperationsJob[]>;
  summarize(workspaceId: string): Promise<OperationsRuntimeCounts>;
  summarizeUsage(workspaceId: string): Promise<OperationsRuntimeUsageSummary>;
  updateControl(control: OperationsRuntimeControl, expectation: { readonly version: number }): Promise<void>;
  updateJob(job: OperationsJob, expectation: { readonly version: number }): Promise<void>;
  updateProcessLease(lease: OperationsProcessLease, expectation: { readonly version: number }): Promise<void>;
  updateSchedule(schedule: OperationsSchedule, expectation: { readonly version: number }): Promise<void>;
}
