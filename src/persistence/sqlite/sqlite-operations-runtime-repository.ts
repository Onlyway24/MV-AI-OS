import type { DatabaseSync } from "node:sqlite";

import { canonicalSha256 } from "../../contracts/canonical-fingerprint.js";
import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import { isOperationsJobTransitionAllowed, type OperationsJob, type OperationsJobAttempt, type OperationsJobSummary, type OperationsJobSuccessor, type OperationsProcessLease, type OperationsRuntimeControl, type OperationsRuntimeCounts, type OperationsRuntimeUsageSummary, type OperationsSchedule } from "../../operations-runtime/operations-runtime.js";
import type { OperationsRuntimeRepository } from "../../operations-runtime/operations-runtime-repository.js";
import { OperationsJobAttemptValidator, OperationsJobValidator, OperationsProcessLeaseValidator, OperationsRuntimeControlValidator, OperationsScheduleValidator } from "../../operations-runtime/operations-runtime-validator.js";
import { isSqliteConstraintError, SqliteRepositoryError } from "./sqlite-error.js";
import { assertActiveTransaction, type SqliteTransactionScope } from "./sqlite-transaction-scope.js";

export class SqliteOperationsRuntimeRepository implements OperationsRuntimeRepository {
  readonly #attemptValidator = new OperationsJobAttemptValidator();
  readonly #controlValidator = new OperationsRuntimeControlValidator();
  readonly #jobValidator = new OperationsJobValidator();
  readonly #leaseValidator = new OperationsProcessLeaseValidator();
  readonly #scheduleValidator = new OperationsScheduleValidator();

  public constructor(private readonly database: DatabaseSync, private readonly scope: SqliteTransactionScope) {}

  public claimNextDue(input: { readonly fencingToken: number; readonly leaseId: string; readonly now: string; readonly workerId: string; readonly workspaceId: string }): Promise<OperationsJob | undefined> {
    assertActiveTransaction(this.scope); assertId(input.workspaceId); assertId(input.workerId); assertId(input.leaseId); assertTimestamp(input.now); if (!Number.isSafeInteger(input.fencingToken) || input.fencingToken < 1) throw new RepositoryValidationError("Operations fencing token is invalid");
    const row = this.database.prepare("SELECT record_json FROM operations_jobs WHERE workspace_id = ? AND status IN ('QUEUED', 'RETRY_SCHEDULED') AND run_after <= ? ORDER BY priority DESC, run_after ASC, job_id ASC LIMIT 1").get(input.workspaceId, input.now);
    if (row === undefined) return Promise.resolve(undefined);
    const current = this.#decodeJob(row);
    const lease = { acquiredAt: input.now, expiresAt: new Date(Date.parse(input.now) + current.leaseDurationMs).toISOString(), fencingToken: input.fencingToken, heartbeatAt: input.now, leaseId: input.leaseId, workerId: input.workerId };
    const next = this.#job({ ...withoutJobRuntimeState(current), attempt: current.attempt + 1, lease, status: "RUNNING", updatedAt: input.now, version: current.version + 1 });
    this.#updateJobRow(next, current.version);
    return Promise.resolve(next);
  }

  public deleteProcessLease(input: { readonly fencingToken: number; readonly instanceId: string; readonly leaseKey: string; readonly version: number; readonly workspaceId: string }): Promise<void> {
    assertActiveTransaction(this.scope); assertId(input.workspaceId); assertId(input.leaseKey); assertId(input.instanceId);
    const result = this.database.prepare("DELETE FROM operations_process_leases WHERE workspace_id = ? AND lease_key = ? AND instance_id = ? AND fencing_token = ? AND version = ?").run(input.workspaceId, input.leaseKey, input.instanceId, input.fencingToken, input.version);
    if (result.changes !== 1) throw new RepositoryConflictError("Operations process lease changed before release");
    return Promise.resolve();
  }

  public deleteTerminalJob(jobId: string, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); assertId(jobId);
    const current = this.#selectJob(jobId);
    if (current?.version !== expectation.version || !["BLOCKED", "CANCELLED", "COMPLETED", "DEAD_LETTER", "FAILED"].includes(current.status)) throw new RepositoryConflictError("Operations terminal job is not eligible for retention cleanup");
    const usage = this.database.prepare(
      "SELECT COUNT(*) AS attempts, COALESCE(SUM(json_extract(record_json, '$.costCents')), 0) AS cost_cents, COALESCE(SUM(json_extract(record_json, '$.providerCalls')), 0) AS provider_calls, COALESCE(SUM(json_extract(record_json, '$.toolCalls')), 0) AS tool_calls, COALESCE(SUM(CASE WHEN json_type(record_json, '$.externalEffectsExecuted') = 'false' THEN 0 ELSE 1 END), 0) AS invalid_external_effects, COALESCE(SUM(CASE WHEN json_type(record_json, '$.costCents') = 'integer' AND json_type(record_json, '$.providerCalls') = 'integer' AND json_type(record_json, '$.toolCalls') = 'integer' THEN 0 ELSE 1 END), 0) AS invalid_usage FROM operations_job_attempts WHERE job_id = ?",
    ).get(jobId);
    if (usage === undefined || aggregate(usage.invalid_external_effects) !== 0 || aggregate(usage.invalid_usage) !== 0) throw new RepositoryValidationError("Operations retained usage is corrupted");
    const attempts = aggregate(usage.attempts);
    if (attempts > 0) this.database.prepare(
      "INSERT INTO operations_runtime_usage_rollups (workspace_id, attempts, cost_cents, provider_calls, tool_calls, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET attempts = attempts + excluded.attempts, cost_cents = cost_cents + excluded.cost_cents, provider_calls = provider_calls + excluded.provider_calls, tool_calls = tool_calls + excluded.tool_calls, updated_at = excluded.updated_at",
    ).run(current.workspaceId, attempts, aggregate(usage.cost_cents), aggregate(usage.provider_calls), aggregate(usage.tool_calls), current.updatedAt);
    const result = this.database.prepare("DELETE FROM operations_jobs WHERE job_id = ? AND version = ?").run(jobId, expectation.version);
    if (result.changes !== 1) throw new RepositoryConflictError("Operations terminal job changed during retention cleanup");
    return Promise.resolve();
  }

  public getControl(workspaceId: string): Promise<OperationsRuntimeControl | undefined> { assertActiveTransaction(this.scope); assertId(workspaceId); const row = this.database.prepare("SELECT record_json FROM operations_runtime_controls WHERE workspace_id = ?").get(workspaceId); return Promise.resolve(row === undefined ? undefined : this.#decodeControl(row)); }
  public getJobById(jobId: string): Promise<OperationsJob | undefined> { assertActiveTransaction(this.scope); assertId(jobId); return Promise.resolve(this.#selectJob(jobId)); }
  public getJobByOperationIdentity(workspaceId: string, operationIdentity: string): Promise<OperationsJob | undefined> { assertActiveTransaction(this.scope); assertId(workspaceId); assertId(operationIdentity); const row = this.database.prepare("SELECT record_json FROM operations_jobs WHERE workspace_id = ? AND operation_identity = ?").get(workspaceId, operationIdentity); return Promise.resolve(row === undefined ? undefined : this.#decodeJob(row)); }
  public getSuccessorByPredecessor(workspaceId: string, predecessorJobId: string): Promise<OperationsJobSuccessor | undefined> {
    assertActiveTransaction(this.scope); assertId(workspaceId); assertId(predecessorJobId);
    const row = this.database.prepare("SELECT successor_job_id FROM operations_job_successors WHERE workspace_id = ? AND predecessor_job_id = ?").get(workspaceId, predecessorJobId);
    if (row === undefined) return Promise.resolve(undefined);
    if (typeof row.successor_job_id !== "string") throw new RepositoryValidationError("Operations job successor reservation is corrupted");
    assertId(row.successor_job_id);
    return Promise.resolve(Object.freeze({ predecessorJobId, successorJobId: row.successor_job_id, workspaceId }));
  }
  public getProcessLease(workspaceId: string, leaseKey: string): Promise<OperationsProcessLease | undefined> { assertActiveTransaction(this.scope); assertId(workspaceId); assertId(leaseKey); const row = this.database.prepare("SELECT record_json FROM operations_process_leases WHERE workspace_id = ? AND lease_key = ?").get(workspaceId, leaseKey); return Promise.resolve(row === undefined ? undefined : this.#decodeLease(row)); }
  public getScheduleById(scheduleId: string): Promise<OperationsSchedule | undefined> { assertActiveTransaction(this.scope); assertId(scheduleId); const row = this.database.prepare("SELECT record_json FROM operations_schedules WHERE schedule_id = ?").get(scheduleId); return Promise.resolve(row === undefined ? undefined : this.#decodeSchedule(row)); }

  public insertAttempt(attempt: OperationsJobAttempt): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#attempt(attempt);
    try { this.database.prepare("INSERT INTO operations_job_attempts (attempt_id, job_id, workspace_id, attempt, finished_at, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(checked.attemptId, checked.jobId, checked.workspaceId, checked.attempt, checked.finishedAt, JSON.stringify(checked)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Operations job attempt already exists"); throw new SqliteRepositoryError("Operations job attempt write failed", "operations_job_attempt.insert"); }
    return Promise.resolve();
  }

  public insertJob(job: OperationsJob): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#job(job);
    if (checked.version !== 0 || checked.status !== "QUEUED" || checked.attempt !== 0) throw new RepositoryValidationError("New Operations job must be queued at version zero");
    this.database.exec("SAVEPOINT operations_job_insert");
    try {
      this.database.prepare("INSERT INTO operations_jobs (job_id, operation_identity, workspace_id, status, priority, run_after, lease_expires_at, version, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)").run(checked.jobId, checked.operationIdentity, checked.workspaceId, checked.status, checked.priority, checked.runAfter, checked.version, checked.updatedAt, JSON.stringify(checked));
      if (checked.predecessorJobId !== undefined) {
        this.database.prepare("INSERT INTO operations_job_successors (workspace_id, predecessor_job_id, successor_job_id, created_at) VALUES (?, ?, ?, ?)").run(checked.workspaceId, checked.predecessorJobId, checked.jobId, checked.createdAt);
      }
      this.database.exec("RELEASE SAVEPOINT operations_job_insert");
    } catch (error) {
      this.database.exec("ROLLBACK TO SAVEPOINT operations_job_insert");
      this.database.exec("RELEASE SAVEPOINT operations_job_insert");
      if (isSqliteConstraintError(error)) throw new RepositoryConflictError(checked.predecessorJobId === undefined ? "Operations job identity already exists" : "Operations predecessor already has a successor");
      throw new SqliteRepositoryError("Operations job write failed", "operations_job.insert");
    }
    return Promise.resolve();
  }

  public insertProcessLease(lease: OperationsProcessLease): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#processLease(lease);
    if (checked.version !== 0) throw new RepositoryValidationError("New Operations process lease must start at version zero");
    try { this.database.prepare("INSERT INTO operations_process_leases (workspace_id, lease_key, role, instance_id, expires_at, fencing_token, version, record_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.leaseKey, checked.role, checked.instanceId, checked.expiresAt, checked.fencingToken, checked.version, JSON.stringify(checked)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Operations process lease already exists"); throw new SqliteRepositoryError("Operations process lease write failed", "operations_process_lease.insert"); }
    return Promise.resolve();
  }

  public insertSchedule(schedule: OperationsSchedule): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#schedule(schedule);
    if (checked.version !== 0) throw new RepositoryValidationError("New Operations schedule must start at version zero");
    try { this.database.prepare("INSERT INTO operations_schedules (schedule_id, workspace_id, status, next_run_at, version, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?, ?)").run(checked.scheduleId, checked.workspaceId, checked.status, checked.nextRunAt, checked.version, checked.updatedAt, JSON.stringify(checked)); }
    catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Operations schedule already exists"); throw new SqliteRepositoryError("Operations schedule write failed", "operations_schedule.insert"); }
    return Promise.resolve();
  }

  public listAttempts(jobId: string): Promise<readonly OperationsJobAttempt[]> { assertActiveTransaction(this.scope); assertId(jobId); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_job_attempts WHERE job_id = ? ORDER BY attempt ASC").all(jobId).map((row) => this.#decodeAttempt(row)))); }
  public listDueSchedules(workspaceId: string, now: string, limit: number): Promise<readonly OperationsSchedule[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertTimestamp(now); assertLimit(limit, 100); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_schedules WHERE workspace_id = ? AND status = 'ENABLED' AND next_run_at <= ? ORDER BY next_run_at ASC, schedule_id ASC LIMIT ?").all(workspaceId, now, limit).map((row) => this.#decodeSchedule(row)))); }
  public listExpiredClaims(workspaceId: string, now: string, limit: number): Promise<readonly OperationsJob[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertTimestamp(now); assertLimit(limit, 100); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_jobs WHERE workspace_id = ? AND status = 'RUNNING' AND lease_expires_at <= ? ORDER BY lease_expires_at ASC, job_id ASC LIMIT ?").all(workspaceId, now, limit).map((row) => this.#decodeJob(row)))); }
  public listJobsByWorkspaceId(workspaceId: string, limit: number): Promise<readonly OperationsJobSummary[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertLimit(limit, 250); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_jobs WHERE workspace_id = ? ORDER BY updated_at DESC, job_id ASC LIMIT ?").all(workspaceId, limit).map((row) => jobSummary(this.#decodeJob(row))))); }
  public listProcessLeases(workspaceId: string, role: OperationsProcessLease["role"], limit: number): Promise<readonly OperationsProcessLease[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertLimit(limit, 100); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_process_leases WHERE workspace_id = ? AND role = ? ORDER BY lease_key ASC LIMIT ?").all(workspaceId, role, limit).map((row) => this.#decodeLease(row)))); }
  public listTerminalBefore(workspaceId: string, before: string, limit: number): Promise<readonly OperationsJob[]> { assertActiveTransaction(this.scope); assertId(workspaceId); assertTimestamp(before); assertLimit(limit, 1_000); return Promise.resolve(Object.freeze(this.database.prepare("SELECT record_json FROM operations_jobs WHERE workspace_id = ? AND status IN ('BLOCKED', 'CANCELLED', 'COMPLETED', 'DEAD_LETTER', 'FAILED') AND updated_at < ? ORDER BY updated_at ASC, job_id ASC LIMIT ?").all(workspaceId, before, limit).map((row) => this.#decodeJob(row)))); }

  public summarize(workspaceId: string): Promise<OperationsRuntimeCounts> {
    assertActiveTransaction(this.scope); assertId(workspaceId);
    const values: Record<OperationsJob["status"], number> = { BLOCKED: 0, CANCELLED: 0, COMPLETED: 0, DEAD_LETTER: 0, FAILED: 0, QUEUED: 0, RETRY_SCHEDULED: 0, RUNNING: 0 };
    for (const row of this.database.prepare("SELECT status, COUNT(*) AS count FROM operations_jobs WHERE workspace_id = ? GROUP BY status").all(workspaceId)) { if (typeof row.status !== "string" || !(row.status in values) || typeof row.count !== "number" || !Number.isSafeInteger(row.count)) throw new RepositoryValidationError("Operations job summary is corrupted"); values[row.status as OperationsJob["status"]] = row.count; }
    return Promise.resolve(Object.freeze({ blocked: values.BLOCKED, cancelled: values.CANCELLED, completed: values.COMPLETED, deadLetter: values.DEAD_LETTER, failed: values.FAILED, queued: values.QUEUED, retryScheduled: values.RETRY_SCHEDULED, running: values.RUNNING }));
  }

  public summarizeUsage(workspaceId: string): Promise<OperationsRuntimeUsageSummary> {
    assertActiveTransaction(this.scope); assertId(workspaceId);
    const row = this.database.prepare(
      "SELECT COUNT(*) AS attempts, COALESCE(SUM(json_extract(record_json, '$.costCents')), 0) AS cost_cents, COALESCE(SUM(json_extract(record_json, '$.providerCalls')), 0) AS provider_calls, COALESCE(SUM(json_extract(record_json, '$.toolCalls')), 0) AS tool_calls, COALESCE(SUM(CASE WHEN json_type(record_json, '$.externalEffectsExecuted') = 'false' THEN 0 ELSE 1 END), 0) AS invalid_external_effects, COALESCE(SUM(CASE WHEN json_type(record_json, '$.costCents') = 'integer' AND json_type(record_json, '$.providerCalls') = 'integer' AND json_type(record_json, '$.toolCalls') = 'integer' THEN 0 ELSE 1 END), 0) AS invalid_usage FROM operations_job_attempts WHERE workspace_id = ?",
    ).get(workspaceId);
    const rollup = this.database.prepare("SELECT attempts, cost_cents, provider_calls, tool_calls FROM operations_runtime_usage_rollups WHERE workspace_id = ?").get(workspaceId);
    if (row === undefined || aggregate(row.invalid_external_effects) !== 0 || aggregate(row.invalid_usage) !== 0) throw new RepositoryValidationError("Operations usage summary is corrupted");
    return Promise.resolve(Object.freeze({ attempts: sumAggregate(row.attempts, rollup?.attempts), costCents: sumAggregate(row.cost_cents, rollup?.cost_cents), externalEffectsExecuted: false, providerCalls: sumAggregate(row.provider_calls, rollup?.provider_calls), toolCalls: sumAggregate(row.tool_calls, rollup?.tool_calls) }));
  }

  public updateControl(control: OperationsRuntimeControl, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#control(control); const current = this.database.prepare("SELECT record_json FROM operations_runtime_controls WHERE workspace_id = ?").get(checked.workspaceId);
    if (current === undefined) { if (expectation.version !== 0 || checked.version !== 1) throw new RepositoryConflictError("Initial Operations runtime control version is invalid"); try { this.database.prepare("INSERT INTO operations_runtime_controls (workspace_id, version, kill_switch, maintenance_mode, updated_at, record_json) VALUES (?, ?, ?, ?, ?, ?)").run(checked.workspaceId, checked.version, checked.killSwitch, checked.maintenanceMode, checked.updatedAt, JSON.stringify(checked)); } catch (error) { if (isSqliteConstraintError(error)) throw new RepositoryConflictError("Operations runtime control changed during insert"); throw new SqliteRepositoryError("Operations runtime control write failed", "operations_runtime_control.insert"); } return Promise.resolve(); }
    const previous = this.#decodeControl(current); if (previous.version !== expectation.version || checked.version !== expectation.version + 1) throw new RepositoryConflictError("Operations runtime control changed after read");
    const result = this.database.prepare("UPDATE operations_runtime_controls SET version = ?, kill_switch = ?, maintenance_mode = ?, updated_at = ?, record_json = ? WHERE workspace_id = ? AND version = ?").run(checked.version, checked.killSwitch, checked.maintenanceMode, checked.updatedAt, JSON.stringify(checked), checked.workspaceId, expectation.version); if (result.changes !== 1) throw new RepositoryConflictError("Operations runtime control changed during update"); return Promise.resolve();
  }

  public updateJob(job: OperationsJob, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#job(job); const current = this.#selectJob(checked.jobId);
    if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || !sameJobIdentity(current, checked) || !isOperationsJobTransitionAllowed(current.status, checked.status) || (checked.status !== "RUNNING" && checked.attempt !== current.attempt) || (current.status === "RUNNING" && checked.status === "RUNNING" && checked.attempt !== current.attempt)) throw new RepositoryConflictError("Operations job transition is invalid");
    this.#updateJobRow(checked, expectation.version); return Promise.resolve();
  }

  public updateProcessLease(lease: OperationsProcessLease, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#processLease(lease); const current = this.#selectLease(checked.workspaceId, checked.leaseKey);
    if (current?.version !== expectation.version || checked.version !== expectation.version + 1 || current.workspaceId !== checked.workspaceId || current.leaseKey !== checked.leaseKey || current.role !== checked.role || checked.fencingToken < current.fencingToken || (checked.instanceId !== current.instanceId && checked.fencingToken <= current.fencingToken)) throw new RepositoryConflictError("Operations process lease transition is invalid");
    const result = this.database.prepare("UPDATE operations_process_leases SET role = ?, instance_id = ?, expires_at = ?, fencing_token = ?, version = ?, record_json = ? WHERE workspace_id = ? AND lease_key = ? AND version = ?").run(checked.role, checked.instanceId, checked.expiresAt, checked.fencingToken, checked.version, JSON.stringify(checked), checked.workspaceId, checked.leaseKey, expectation.version); if (result.changes !== 1) throw new RepositoryConflictError("Operations process lease changed during update"); return Promise.resolve();
  }

  public updateSchedule(schedule: OperationsSchedule, expectation: { readonly version: number }): Promise<void> {
    assertActiveTransaction(this.scope); const checked = this.#schedule(schedule); const row = this.database.prepare("SELECT record_json FROM operations_schedules WHERE schedule_id = ?").get(checked.scheduleId); if (row === undefined) throw new RepositoryConflictError("Operations schedule does not exist"); const current = this.#decodeSchedule(row);
    if (current.version !== expectation.version || checked.version !== expectation.version + 1 || !sameScheduleIdentity(current, checked)) throw new RepositoryConflictError("Operations schedule transition is invalid");
    const result = this.database.prepare("UPDATE operations_schedules SET status = ?, next_run_at = ?, version = ?, updated_at = ?, record_json = ? WHERE schedule_id = ? AND version = ?").run(checked.status, checked.nextRunAt, checked.version, checked.updatedAt, JSON.stringify(checked), checked.scheduleId, expectation.version); if (result.changes !== 1) throw new RepositoryConflictError("Operations schedule changed during update"); return Promise.resolve();
  }

  #updateJobRow(job: OperationsJob, version: number): void { const result = this.database.prepare("UPDATE operations_jobs SET status = ?, priority = ?, run_after = ?, lease_expires_at = ?, version = ?, updated_at = ?, record_json = ? WHERE job_id = ? AND version = ?").run(job.status, job.priority, job.runAfter, job.lease?.expiresAt ?? null, job.version, job.updatedAt, JSON.stringify(job), job.jobId, version); if (result.changes !== 1) throw new RepositoryConflictError("Operations job changed during update"); }
  #selectJob(jobId: string): OperationsJob | undefined { const row = this.database.prepare("SELECT record_json FROM operations_jobs WHERE job_id = ?").get(jobId); return row === undefined ? undefined : this.#decodeJob(row); }
  #selectLease(workspaceId: string, leaseKey: string): OperationsProcessLease | undefined { const row = this.database.prepare("SELECT record_json FROM operations_process_leases WHERE workspace_id = ? AND lease_key = ?").get(workspaceId, leaseKey); return row === undefined ? undefined : this.#decodeLease(row); }
  #decodeJob(row: Readonly<Record<string, unknown>>): OperationsJob { return this.#decode(row, (value) => this.#job(value), "Operations job"); }
  #decodeAttempt(row: Readonly<Record<string, unknown>>): OperationsJobAttempt { return this.#decode(row, (value) => this.#attempt(value), "Operations job attempt"); }
  #decodeSchedule(row: Readonly<Record<string, unknown>>): OperationsSchedule { return this.#decode(row, (value) => this.#schedule(value), "Operations schedule"); }
  #decodeControl(row: Readonly<Record<string, unknown>>): OperationsRuntimeControl { return this.#decode(row, (value) => this.#control(value), "Operations runtime control"); }
  #decodeLease(row: Readonly<Record<string, unknown>>): OperationsProcessLease { return this.#decode(row, (value) => this.#processLease(value), "Operations process lease"); }
  #decode<T>(row: Readonly<Record<string, unknown>>, validate: (value: unknown) => T, label: string): T { if (typeof row.record_json !== "string") throw new RepositoryValidationError(`${label} is corrupted`); try { return validate(JSON.parse(row.record_json)); } catch (error) { if (error instanceof RepositoryValidationError) throw error; throw new RepositoryValidationError(`${label} is corrupted`); } }
  #job(value: unknown): OperationsJob { return validated(value, this.#jobValidator, "Operations job"); }
  #attempt(value: unknown): OperationsJobAttempt { return validated(value, this.#attemptValidator, "Operations job attempt"); }
  #schedule(value: unknown): OperationsSchedule { return validated(value, this.#scheduleValidator, "Operations schedule"); }
  #control(value: unknown): OperationsRuntimeControl { return validated(value, this.#controlValidator, "Operations runtime control"); }
  #processLease(value: unknown): OperationsProcessLease { return validated(value, this.#leaseValidator, "Operations process lease"); }
}

function withoutJobRuntimeState(job: OperationsJob): Omit<OperationsJob, "block" | "cancellationRequestedAt" | "cancellationRequestedBy" | "lastFailure" | "lease" | "receipt"> { return { actorId: job.actorId, attempt: job.attempt, budget: job.budget, contractVersion: job.contractVersion, createdAt: job.createdAt, heartbeatIntervalMs: job.heartbeatIntervalMs, jobId: job.jobId, jobType: job.jobType, leaseDurationMs: job.leaseDurationMs, operationIdentity: job.operationIdentity, owner: job.owner, payload: job.payload, payloadFingerprint: job.payloadFingerprint, ...(job.predecessorJobId === undefined ? {} : { predecessorJobId: job.predecessorJobId }), priority: job.priority, recoveryStrategy: job.recoveryStrategy, retryPolicy: job.retryPolicy, runAfter: job.runAfter, ...(job.scheduleId === undefined ? {} : { scheduleId: job.scheduleId }), scheduledFor: job.scheduledFor, status: job.status, timeoutMs: job.timeoutMs, updatedAt: job.updatedAt, version: job.version, workspaceId: job.workspaceId }; }
function sameJobIdentity(left: OperationsJob, right: OperationsJob): boolean { return left.actorId === right.actorId && left.workspaceId === right.workspaceId && left.createdAt === right.createdAt && left.jobId === right.jobId && left.jobType === right.jobType && left.operationIdentity === right.operationIdentity && left.owner === right.owner && left.payloadFingerprint === right.payloadFingerprint && left.predecessorJobId === right.predecessorJobId && left.scheduleId === right.scheduleId && left.scheduledFor === right.scheduledFor && JSON.stringify(left.payload) === JSON.stringify(right.payload) && JSON.stringify(left.budget) === JSON.stringify(right.budget) && JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy) && left.timeoutMs === right.timeoutMs && left.leaseDurationMs === right.leaseDurationMs && left.heartbeatIntervalMs === right.heartbeatIntervalMs; }
function sameScheduleIdentity(left: OperationsSchedule, right: OperationsSchedule): boolean { return left.actorId === right.actorId && left.workspaceId === right.workspaceId && left.createdAt === right.createdAt && left.scheduleId === right.scheduleId && left.jobType === right.jobType && left.owner === right.owner && left.payloadFingerprint === right.payloadFingerprint && JSON.stringify(left.payload) === JSON.stringify(right.payload) && JSON.stringify(left.budget) === JSON.stringify(right.budget) && JSON.stringify(left.retryPolicy) === JSON.stringify(right.retryPolicy) && JSON.stringify(left.cadence) === JSON.stringify(right.cadence) && left.catchUpPolicy === right.catchUpPolicy && left.priority === right.priority && left.timeoutMs === right.timeoutMs && left.leaseDurationMs === right.leaseDurationMs && left.heartbeatIntervalMs === right.heartbeatIntervalMs; }
function jobSummary(job: OperationsJob): OperationsJobSummary { return Object.freeze({ attempt: job.attempt, ...(job.block === undefined ? {} : { blockCode: job.block.code }), ...(job.lastFailure === undefined ? {} : { failureCode: job.lastFailure.code }), jobId: job.jobId, jobType: job.jobType, owner: job.owner, ...(job.predecessorJobId === undefined ? {} : { predecessorJobId: job.predecessorJobId }), priority: job.priority, ...(job.receipt === undefined ? {} : { receipt: Object.freeze({ costCents: job.receipt.costCents, externalEffectsExecuted: false as const, outcome: job.receipt.outcome, providerCalls: job.receipt.providerCalls, toolCalls: job.receipt.toolCalls }) }), runAfter: job.runAfter, scheduledFor: job.scheduledFor, status: job.status, targetFingerprint: canonicalSha256(job), updatedAt: job.updatedAt, version: job.version }); }
function aggregate(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RepositoryValidationError("Operations usage aggregate is invalid"); return value; }
function sumAggregate(left: unknown, right: unknown): number { const total = aggregate(left) + (right === undefined ? 0 : aggregate(right)); if (!Number.isSafeInteger(total)) throw new RepositoryValidationError("Operations usage aggregate is invalid"); return total; }
function validated<T>(value: unknown, validator: { validate(value: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError(`${label} is invalid`, { issueCount: result.issues.length }); return result.value; }
function assertId(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError("Operations identifier is invalid"); }
function assertTimestamp(value: unknown): asserts value is string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new RepositoryValidationError("Operations timestamp is invalid"); }
function assertLimit(value: unknown, maximum: number): asserts value is number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) throw new RepositoryValidationError("Operations list limit is invalid"); }
