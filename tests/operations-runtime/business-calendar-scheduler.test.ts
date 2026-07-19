import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  businessDateAt,
  businessDayWindow,
  calendarDailyOccurrenceAt,
  isBusinessDate,
  nextCalendarDailyOccurrence,
  ONLYWAY_BUSINESS_TIME_ZONE,
} from "../../src/contracts/business-calendar.js";
import { createDefaultOperationsScheduleCatalog } from "../../src/operations-runtime/operations-schedule-catalog.js";
import type { OperationsJobPayload, OperationsJobType } from "../../src/operations-runtime/operations-runtime.js";
import { createOperationsSchedule, OperationsSchedulerService } from "../../src/operations-runtime/operations-scheduler-service.js";
import { OperationsScheduleValidator } from "../../src/operations-runtime/operations-runtime-validator.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Onlyway business calendar", () => {
  it("uses the Europe/Rome date across local midnight and validates real dates", () => {
    expect(businessDateAt("2026-07-19T21:59:59.999Z")).toBe("2026-07-19");
    expect(businessDateAt("2026-07-19T22:00:00.000Z")).toBe("2026-07-20");
    expect(isBusinessDate("2028-02-29")).toBe(true);
    expect(isBusinessDate("2026-02-29")).toBe(false);
  });

  it("keeps a daily wall time across the 23-hour spring and 25-hour autumn days", () => {
    const spring = nextCalendarDailyOccurrence("2026-03-28T07:00:00.000Z", "2026-03-28T07:00:00.000Z", { hour: 8, minute: 0 });
    const autumn = nextCalendarDailyOccurrence("2026-10-24T06:00:00.000Z", "2026-10-24T06:00:00.000Z", { hour: 8, minute: 0 });
    expect(spring).toBe("2026-03-29T06:00:00.000Z");
    expect(Date.parse(spring) - Date.parse("2026-03-28T07:00:00.000Z")).toBe(23 * 60 * 60 * 1_000);
    expect(autumn).toBe("2026-10-25T07:00:00.000Z");
    expect(Date.parse(autumn) - Date.parse("2026-10-24T06:00:00.000Z")).toBe(25 * 60 * 60 * 1_000);
    const springWindow = businessDayWindow("2026-03-29");
    const autumnWindow = businessDayWindow("2026-10-25");
    expect(Date.parse(springWindow.endsAt) - Date.parse(springWindow.startsAt)).toBe(23 * 60 * 60 * 1_000);
    expect(Date.parse(autumnWindow.endsAt) - Date.parse(autumnWindow.startsAt)).toBe(25 * 60 * 60 * 1_000);
  });

  it("resolves spring gaps forward and autumn overlaps to the earlier occurrence", () => {
    expect(calendarDailyOccurrenceAt("2026-03-29", { hour: 2, minute: 30 })).toBe("2026-03-29T01:00:00.000Z");
    expect(calendarDailyOccurrenceAt("2026-10-25", { hour: 2, minute: 30 })).toBe("2026-10-25T00:30:00.000Z");
  });
});

describe("calendar-aware Operations scheduler", () => {
  it("materializes local Daily and Founder identities after UTC midnight and advances by calendar day", async () => {
    const { repositories, root } = await fixture();
    roots.push(root);
    const clock = new MutableClock("2026-07-19T22:30:00.000Z");
    const service = scheduler(repositories, clock, "scheduler-midnight");
    const schedule = calendarSchedule(clock, "calendar-midnight", "MORNING_SYSTEM_BRIEF", { businessDate: "2026-07-20" }, 0, 30);
    const founder = calendarSchedule(clock, "calendar-founder", "AGENT_COMPANY_WORKDAY_START", { budgetCents: 0, workdayId: "founder-workday-2026-07-20" }, 0, 30);
    await service.registerSchedule(schedule);
    await service.registerSchedule(founder);
    const tick = await service.tick();
    expect(tick).toMatchObject({ status: "SCHEDULED" });
    expect(tick.enqueuedJobIds).toHaveLength(2);

    const state = await repositories.transaction(async ({ operationsRuntime }) => ({
      founder: await operationsRuntime.getJobByOperationIdentity("workspace", operationIdentity(founder.scheduleId, founder.nextRunAt)),
      job: await operationsRuntime.getJobByOperationIdentity("workspace", operationIdentity(schedule.scheduleId, schedule.nextRunAt)),
      schedule: await operationsRuntime.getScheduleById(schedule.scheduleId),
    }));
    expect(state.job?.payload).toEqual({ businessDate: "2026-07-20" });
    expect(state.founder?.payload).toEqual({ budgetCents: 0, workdayId: "founder-workday-2026-07-20" });
    expect(state.schedule?.nextRunAt).toBe("2026-07-20T22:30:00.000Z");
    await service.close();
    await repositories.close();
  });

  it("advances a persisted calendar schedule safely over spring DST", async () => {
    const { repositories, root } = await fixture();
    roots.push(root);
    const clock = new MutableClock("2026-03-28T07:00:00.000Z");
    const service = scheduler(repositories, clock, "scheduler-spring");
    const schedule = calendarSchedule(clock, "calendar-spring", "DAILY_OPERATING_REPORT", { businessDate: "2026-03-28" }, 8, 0);
    await service.registerSchedule(schedule);
    await service.tick();
    await expect(repositories.transaction(({ operationsRuntime }) => operationsRuntime.getScheduleById(schedule.scheduleId))).resolves.toMatchObject({ nextRunAt: "2026-03-29T06:00:00.000Z" });
    await service.close();
    await repositories.close();
  });

  it("publishes four explicit Europe/Rome daily cadences and rejects other zones", () => {
    const clock = new MutableClock("2026-07-19T08:00:00.000Z");
    const catalog = createDefaultOperationsScheduleCatalog({ actorId: "fabio", backupPolicyId: "local-backup", clock, workspaceId: "workspace" });
    const daily = catalog.filter(({ cadence }) => cadence.kind === "CALENDAR_DAILY");
    expect(daily.map(({ jobType }) => jobType)).toEqual([
      "MORNING_SYSTEM_BRIEF",
      "AGENT_COMPANY_WORKDAY_START",
      "BACKUP_AND_RESTORE_VERIFICATION",
      "DAILY_OPERATING_REPORT",
    ]);
    expect(daily).toMatchObject([
      { cadence: { kind: "CALENDAR_DAILY", timeZone: ONLYWAY_BUSINESS_TIME_ZONE } },
      { cadence: { kind: "CALENDAR_DAILY", timeZone: ONLYWAY_BUSINESS_TIME_ZONE } },
      { cadence: { kind: "CALENDAR_DAILY", timeZone: ONLYWAY_BUSINESS_TIME_ZONE } },
      { cadence: { kind: "CALENDAR_DAILY", timeZone: ONLYWAY_BUSINESS_TIME_ZONE } },
    ]);
    const invalid = { ...daily[0], cadence: { hour: 8, kind: "CALENDAR_DAILY", minute: 0, timeZone: "UTC" } };
    expect(new OperationsScheduleValidator().validate(invalid).ok).toBe(false);
  });
});

async function fixture(): Promise<{ readonly repositories: SqliteRepositoryTransactionRunner; readonly root: string }> {
  const root = await mkdtemp(join(tmpdir(), "mv-ai-os-calendar-"));
  return { repositories: new SqliteRepositoryTransactionRunner({ path: join(root, "runtime.sqlite"), timeoutMs: 1_000 }), root };
}

function scheduler(repositories: SqliteRepositoryTransactionRunner, clock: MutableClock, instanceId: string): OperationsSchedulerService {
  return new OperationsSchedulerService({ actorId: "fabio", clock, instanceId, repositories, schedulerLeaseMs: 30_000, workspaceId: "workspace" });
}

function calendarSchedule(clock: MutableClock, scheduleId: string, jobType: OperationsJobType, payload: OperationsJobPayload, hour: number, minute: number) {
  return createOperationsSchedule({
    actorId: "fabio",
    budget: { maxCostCents: 0, maxProviderCalls: 0, maxToolCalls: 10 },
    cadence: { hour, kind: "CALENDAR_DAILY", minute, timeZone: ONLYWAY_BUSINESS_TIME_ZONE },
    catchUpPolicy: "CATCH_UP_ONE",
    heartbeatIntervalMs: 250,
    jobType,
    leaseDurationMs: 5_000,
    nextRunAt: clock.now().toISOString(),
    owner: "operations",
    payload,
    priority: 50,
    retryPolicy: { automaticRetries: 1, initialBackoffMs: 1_000, maxBackoffMs: 2_000 },
    scheduleId,
    status: "ENABLED",
    timeoutMs: 5_000,
    workspaceId: "workspace",
  }, clock);
}

function operationIdentity(scheduleId: string, scheduledFor: string): string {
  return `occ-${createHash("sha256").update(`${scheduleId}\n${scheduledFor}`, "utf8").digest("hex").slice(0, 48)}`;
}

class MutableClock {
  readonly #value: Date;

  public constructor(value: string) { this.#value = new Date(value); }
  public now(): Date { return new Date(this.#value); }
}
