import { businessDateAt, type BusinessClockTime, ONLYWAY_BUSINESS_TIME_ZONE } from "../contracts/business-calendar.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import { OPERATIONS_JOB_TYPES, type OperationsJobPayload, type OperationsJobType, type OperationsSchedule } from "./operations-runtime.js";
import { createOperationsSchedule, type OperationsSchedulerService } from "./operations-scheduler-service.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

interface ScheduleSpec {
  readonly cadence: BusinessClockTime | number;
  readonly catchUpPolicy: OperationsSchedule["catchUpPolicy"];
  readonly jobType: OperationsJobType;
  readonly payload: OperationsJobPayload;
  readonly priority: number;
  readonly timeoutMs: number;
}

/** Complete, paid-call-free default catalog for supervised local staging. */
export function createDefaultOperationsScheduleCatalog(input: Readonly<{
  readonly actorId: string;
  readonly backupPolicyId: string;
  readonly clock: Clock;
  readonly firstRunAt?: string;
  readonly workspaceId: string;
}>): readonly OperationsSchedule[] {
  const now = input.clock.now();
  const firstRun = input.firstRunAt === undefined ? new Date(now.getTime() + MINUTE) : new Date(input.firstRunAt);
  if (!Number.isFinite(firstRun.getTime()) || firstRun.getTime() < now.getTime()) throw new RepositoryValidationError("Operations schedule catalog first run is invalid");
  const specs: readonly ScheduleSpec[] = Object.freeze([
    spec("MORNING_SYSTEM_BRIEF", { hour: 7, minute: 0 }, { businessDate: businessDateAt(firstRun) }, 80, 60_000, "CATCH_UP_ONE"),
    spec("AGENT_COMPANY_WORKDAY_START", { hour: 7, minute: 15 }, { budgetCents: 0, workdayId: `founder-workday-${businessDateAt(firstRun)}` }, 75, 600_000, "CATCH_UP_ONE"),
    spec("SOCIAL_SIGNAL_REFRESH", 6 * HOUR, { mode: "LOCAL_RECONCILIATION" }, 40, 60_000, "SKIP"),
    spec("EVIDENCE_FRESHNESS_CHECK", 6 * HOUR, {}, 65, 60_000, "CATCH_UP_ONE"),
    spec("PENDING_APPROVAL_REMINDER", HOUR, { delivery: "CONTROL_CENTER_ONLY" }, 55, 60_000, "SKIP"),
    spec("PRODUCTION_QUEUE_RECONCILIATION", 5 * MINUTE, { recoveryLimit: 10 }, 70, 120_000, "CATCH_UP_ONE"),
    spec("COST_AND_BUDGET_CHECK", HOUR, { window: "TODAY" }, 85, 60_000, "CATCH_UP_ONE"),
    spec("BACKUP_AND_RESTORE_VERIFICATION", { hour: 4, minute: 0 }, { backupPolicyId: input.backupPolicyId }, 90, 180_000, "CATCH_UP_ONE"),
    spec("STALE_TASK_DETECTION", 15 * MINUTE, { staleAfterSeconds: 3_600 }, 60, 60_000, "CATCH_UP_ONE"),
    spec("DAILY_OPERATING_REPORT", { hour: 20, minute: 0 }, { businessDate: businessDateAt(firstRun) }, 75, 120_000, "CATCH_UP_ONE"),
    spec("SECURITY_POSTURE_CHECK", 6 * HOUR, {}, 95, 120_000, "CATCH_UP_ONE"),
  ]);
  const schedules = specs.map((item, index) => {
    const nextRunAt = new Date(firstRun.getTime() + index * MINUTE);
    return createOperationsSchedule({
      actorId: input.actorId,
      budget: Object.freeze({ maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: item.jobType === "AGENT_COMPANY_WORKDAY_START" ? 100 : 25 }),
      cadence: typeof item.cadence === "number"
        ? Object.freeze({ intervalMs: item.cadence, kind: "FIXED_INTERVAL" as const })
        : Object.freeze({ ...item.cadence, kind: "CALENDAR_DAILY" as const, timeZone: ONLYWAY_BUSINESS_TIME_ZONE }),
      catchUpPolicy: item.catchUpPolicy,
      heartbeatIntervalMs: 5_000,
      jobType: item.jobType,
      leaseDurationMs: 30_000,
      nextRunAt: nextRunAt.toISOString(),
      owner: "operations-runtime",
      payload: item.payload,
      priority: item.priority,
      retryPolicy: Object.freeze({ automaticRetries: 2, initialBackoffMs: 30_000, maxBackoffMs: 300_000 }),
      scheduleId: `h24-${item.jobType.toLowerCase().replaceAll("_", "-")}`,
      status: "ENABLED",
      timeoutMs: item.timeoutMs,
      workspaceId: input.workspaceId,
    }, input.clock);
  });
  const types = new Set(schedules.map(({ jobType }) => jobType));
  if (schedules.length !== OPERATIONS_JOB_TYPES.length || types.size !== OPERATIONS_JOB_TYPES.length || OPERATIONS_JOB_TYPES.some((jobType) => !types.has(jobType))) throw new RepositoryValidationError("Operations schedule catalog is incomplete");
  return Object.freeze(schedules);
}

export async function registerDefaultOperationsScheduleCatalog(service: OperationsSchedulerService, schedules: readonly OperationsSchedule[]): Promise<readonly OperationsSchedule[]> {
  const registered: OperationsSchedule[] = [];
  for (const schedule of schedules) registered.push(await service.registerSchedule(schedule));
  return Object.freeze(registered);
}

function spec(jobType: OperationsJobType, cadence: ScheduleSpec["cadence"], payload: OperationsJobPayload, priority: number, timeoutMs: number, catchUpPolicy: OperationsSchedule["catchUpPolicy"]): ScheduleSpec { return Object.freeze({ cadence, catchUpPolicy, jobType, payload: Object.freeze(payload), priority, timeoutMs }); }
