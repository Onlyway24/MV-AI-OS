import { describe, expect, it } from "vitest";

import { RepositoryBackedDailyOperatingBriefSource } from "../../src/daily-brief/repository-backed-daily-operating-brief-source.js";
import type { RepositoryTransaction } from "../../src/persistence/repository-transaction.js";

describe("Repository-backed Daily Operating Brief source", () => {
  it("includes completed work only from the exact DST-safe Europe/Rome business date", async () => {
    const source = new RepositoryBackedDailyOperatingBriefSource();
    const snapshot = await source.snapshot(repositories({ jobs: [
      completed("old", "2026-03-28T22:59:59.999Z"),
      completed("spring-start", "2026-03-28T23:00:00.000Z"),
      completed("spring-end", "2026-03-29T21:59:59.999Z"),
      completed("next-day", "2026-03-29T22:00:00.000Z"),
    ] }), { actorId: "fabio", workspaceId: "workspace" }, new Date("2026-03-29T20:00:00.000Z"), "2026-03-29");

    expect(snapshot.workCompleted?.map(({ identity }) => identity)).toEqual(["spring-start", "spring-end"]);
  });

  it("includes durable Agent Company and Founder task receipts and blockers", async () => {
    const source = new RepositoryBackedDailyOperatingBriefSource();
    const snapshot = await source.snapshot(repositories({
      agentCompanyWorkdays: [{
        status: "BLOCKED",
        tasks: [
          { agentId: "onlyway-assistant", completedAt: "2026-07-19T08:00:00.000Z", status: "COMPLETED", workItemId: "agent-completed" },
          { agentId: "backup-guardian", blocker: { owner: "OPERATIONS_RUNTIME", reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, status: "BLOCKED", workItemId: "agent-blocked" },
          { agentId: "developer-agent", status: "RUNNING", workItemId: "agent-running" },
        ],
        workdayId: "agent-day",
      }],
      founderWorkdays: [{
        status: "BLOCKED",
        tasks: [
          { agentId: "onlyway-assistant", receipt: { completedAt: "2026-07-19T09:00:00.000Z" }, status: "COMPLETED", taskId: "founder-completed" },
          { agentId: "research-agent", blocker: { owner: "RESEARCH" }, status: "BLOCKED", taskId: "founder-blocked" },
          { agentId: "content-director", status: "AWAITING_DEPENDENCY", taskId: "founder-awaiting" },
        ],
        workdayId: "founder-day",
      }],
      jobs: [],
    }), { actorId: "fabio", workspaceId: "workspace" }, new Date("2026-07-19T12:00:00.000Z"), "2026-07-19");

    expect(snapshot.workCompleted?.map(({ identity }) => identity)).toEqual(["agent-completed", "founder-completed"]);
    expect(snapshot.blockedTasks).toEqual(expect.arrayContaining([
      { owner: "OPERATIONS_RUNTIME", reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED", taskId: "agent-blocked" },
      { owner: "RESEARCH", reasonCode: "FOUNDER_WORKDAY_INPUT_REQUIRED", taskId: "founder-blocked" },
    ]));
    expect(snapshot.workInProgress).toEqual(expect.arrayContaining([
      { identity: "agent-running", kind: "AGENT_COMPANY_TASK", status: "RUNNING" },
      { identity: "founder-awaiting", kind: "FOUNDER_WORKDAY_TASK", status: "AWAITING_DEPENDENCY" },
    ]));
  });

  it("fails aggregate task sections closed before they can exceed the validated contract bounds", async () => {
    const source = new RepositoryBackedDailyOperatingBriefSource();
    const tasks = [
      ...Array.from({ length: 501 }, (_, index) => ({ agentId: "backup-guardian", blocker: { owner: "OPERATIONS_RUNTIME", reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, status: "BLOCKED", workItemId: `blocked-${String(index)}` })),
      ...Array.from({ length: 501 }, (_, index) => ({ agentId: "onlyway-assistant", completedAt: "2026-07-19T08:00:00.000Z", status: "COMPLETED", workItemId: `completed-${String(index)}` })),
      ...Array.from({ length: 501 }, (_, index) => ({ agentId: "developer-agent", status: "RUNNING", workItemId: `running-${String(index)}` })),
    ];

    const snapshot = await source.snapshot(repositories({
      agentCompanyWorkdays: [{ status: "BLOCKED", tasks, workdayId: "bounded-day" }],
      jobs: [],
    }), { actorId: "fabio", workspaceId: "workspace" }, new Date("2026-07-19T12:00:00.000Z"), "2026-07-19");

    expect(snapshot.blockedTasks).toBeUndefined();
    expect(snapshot.workCompleted).toBeUndefined();
    expect(snapshot.workInProgress).toBeUndefined();
  });
});

function repositories(input: Readonly<{ readonly agentCompanyWorkdays?: readonly unknown[]; readonly founderWorkdays?: readonly unknown[]; readonly jobs: readonly unknown[] }>): RepositoryTransaction {
  const emptyList = (): Promise<readonly never[]> => Promise.resolve([]);
  return {
    agentCompanyWorkdays: { listByOwner: (identity: { readonly actorId: string; readonly workspaceId: string }) => {
      expect(identity).toEqual({ actorId: "fabio", workspaceId: "workspace" });
      return Promise.resolve(input.agentCompanyWorkdays ?? []);
    } },
    businessMissions: { listByWorkspaceId: emptyList },
    contentProductions: { listByWorkspaceId: emptyList },
    founderWorkdays: { listByWorkspaceId: () => Promise.resolve(input.founderWorkdays ?? []) },
    operationalPlanes: { listEvidencePacksByWorkspaceId: emptyList, listSocialLiveRecordsByWorkspaceId: emptyList },
    operationsControls: { listIncidents: emptyList },
    operationsRuntime: { getControl: () => Promise.resolve(undefined), listJobsByWorkspaceId: () => Promise.resolve(input.jobs), listProcessLeases: emptyList },
    productionRuntimeJobs: { summarize: () => Promise.resolve({ completed: 0, deadLetter: 0, queued: 0, retryScheduled: 0, running: 0 }) },
  } as unknown as RepositoryTransaction;
}

function completed(jobId: string, updatedAt: string): unknown {
  return { attempt: 1, jobId, jobType: "EVIDENCE_FRESHNESS_CHECK", owner: "operations", priority: 50, runAfter: updatedAt, scheduledFor: updatedAt, status: "COMPLETED", targetFingerprint: "a".repeat(64), updatedAt, version: 1 };
}
