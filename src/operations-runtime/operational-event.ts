export const OPERATIONAL_EVENT_CONTRACT_VERSION = "1" as const;

export const OPERATIONAL_EVENT_TYPES = Object.freeze([
  "JOB_QUEUED",
  "JOB_LEASE_ACQUIRED",
  "JOB_HEARTBEAT",
  "JOB_BLOCKED",
  "JOB_COMPLETED",
  "JOB_RETRY_SCHEDULED",
  "JOB_FAILED",
  "JOB_DEAD_LETTER",
  "JOB_CANCELLED",
  "JOB_RECOVERED",
  "PRODUCTION_STATUS_CHANGED",
  "GATE_DECIDED",
  "APPROVAL_REQUESTED",
  "APPROVAL_RECORDED",
  "REVISION_REQUESTED",
  "AGENT_COMPANY_TASK_CHANGED",
  "DAILY_BRIEF_GENERATED",
  "FOUNDER_WORKDAY_CREATED",
  "FOUNDER_WORKDAY_UPDATED",
  "KILL_SWITCH_CHANGED",
  "HEALTH_STATE_CHANGED",
  "INCIDENT_ACKNOWLEDGED",
] as const);

export const OPERATIONAL_EVENT_AGGREGATE_TYPES = Object.freeze([
  "OPERATIONS_JOB",
  "CONTENT_PRODUCTION",
  "GATE",
  "APPROVAL",
  "PRODUCTION_REVISION",
  "AGENT_COMPANY_TASK",
  "DAILY_OPERATING_BRIEF",
  "FOUNDER_WORKDAY",
  "OPERATIONS_CONTROL",
  "INCIDENT",
] as const);

export const OPERATIONAL_EVENT_SUMMARY_CODES = Object.freeze([
  "job_queued",
  "job_lease_acquired",
  "job_heartbeat_recorded",
  "job_blocked",
  "job_completed",
  "job_retry_scheduled",
  "job_failed",
  "job_dead_lettered",
  "job_cancelled",
  "job_recovered",
  "production_status_changed",
  "gate_decision_recorded",
  "approval_requested",
  "approval_recorded",
  "production_revision_requested",
  "agent_company_task_changed",
  "daily_brief_generated",
  "founder_workday_created",
  "founder_workday_updated",
  "kill_switch_changed",
  "health_state_changed",
  "incident_acknowledged",
] as const);

export type OperationalEventType = typeof OPERATIONAL_EVENT_TYPES[number];
export type OperationalEventAggregateType = typeof OPERATIONAL_EVENT_AGGREGATE_TYPES[number];
export type OperationalEventSummaryCode = typeof OPERATIONAL_EVENT_SUMMARY_CODES[number];

/**
 * Redaction-safe event draft written atomically with an operational mutation.
 * No arbitrary summary, payload, prompt, transcript, path, token, or secret is
 * representable by this contract.
 */
export interface OperationalEventDraft {
  readonly aggregateType: OperationalEventAggregateType;
  readonly contractVersion: typeof OPERATIONAL_EVENT_CONTRACT_VERSION;
  readonly entityId: string;
  readonly entityVersion: number;
  readonly eventId: string;
  readonly eventType: OperationalEventType;
  readonly occurredAt: string;
  readonly safeSummaryCode: OperationalEventSummaryCode;
  readonly workspaceId: string;
}

/** Monotonic durable cursor is assigned by the repository. */
export interface OperationalEvent extends OperationalEventDraft {
  readonly sequence: number;
}

export interface OperationalEventCursorWindow {
  readonly latestSequence: number;
  readonly oldestSequence?: number;
}

export const OPERATIONAL_EVENT_SEMANTICS: Readonly<
  Record<OperationalEventType, Readonly<{
    readonly aggregateType: OperationalEventAggregateType;
    readonly safeSummaryCode: OperationalEventSummaryCode;
  }>>
> = Object.freeze({
  JOB_QUEUED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_queued" }),
  JOB_LEASE_ACQUIRED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_lease_acquired" }),
  JOB_HEARTBEAT: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_heartbeat_recorded" }),
  JOB_BLOCKED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_blocked" }),
  JOB_COMPLETED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_completed" }),
  JOB_RETRY_SCHEDULED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_retry_scheduled" }),
  JOB_FAILED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_failed" }),
  JOB_DEAD_LETTER: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_dead_lettered" }),
  JOB_CANCELLED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_cancelled" }),
  JOB_RECOVERED: Object.freeze({ aggregateType: "OPERATIONS_JOB", safeSummaryCode: "job_recovered" }),
  PRODUCTION_STATUS_CHANGED: Object.freeze({ aggregateType: "CONTENT_PRODUCTION", safeSummaryCode: "production_status_changed" }),
  GATE_DECIDED: Object.freeze({ aggregateType: "GATE", safeSummaryCode: "gate_decision_recorded" }),
  APPROVAL_REQUESTED: Object.freeze({ aggregateType: "APPROVAL", safeSummaryCode: "approval_requested" }),
  APPROVAL_RECORDED: Object.freeze({ aggregateType: "APPROVAL", safeSummaryCode: "approval_recorded" }),
  REVISION_REQUESTED: Object.freeze({ aggregateType: "PRODUCTION_REVISION", safeSummaryCode: "production_revision_requested" }),
  AGENT_COMPANY_TASK_CHANGED: Object.freeze({ aggregateType: "AGENT_COMPANY_TASK", safeSummaryCode: "agent_company_task_changed" }),
  DAILY_BRIEF_GENERATED: Object.freeze({ aggregateType: "DAILY_OPERATING_BRIEF", safeSummaryCode: "daily_brief_generated" }),
  FOUNDER_WORKDAY_CREATED: Object.freeze({ aggregateType: "FOUNDER_WORKDAY", safeSummaryCode: "founder_workday_created" }),
  FOUNDER_WORKDAY_UPDATED: Object.freeze({ aggregateType: "FOUNDER_WORKDAY", safeSummaryCode: "founder_workday_updated" }),
  KILL_SWITCH_CHANGED: Object.freeze({ aggregateType: "OPERATIONS_CONTROL", safeSummaryCode: "kill_switch_changed" }),
  HEALTH_STATE_CHANGED: Object.freeze({ aggregateType: "OPERATIONS_CONTROL", safeSummaryCode: "health_state_changed" }),
  INCIDENT_ACKNOWLEDGED: Object.freeze({ aggregateType: "INCIDENT", safeSummaryCode: "incident_acknowledged" }),
});
