import type { AgentReference } from "../../agents/agent-manifest.js";
import type { ErrorRecord } from "../../contracts/error-record.js";
import type { RequestEnvelope } from "../../contracts/request-envelope.js";
import { TaskStateError } from "../../errors/core-error.js";
import type { ExecutionPlan } from "./plan.js";
import type { RoutingDecision } from "./decision.js";

export type TaskState =
  | "awaiting_approval"
  | "awaiting_input"
  | "cancelled"
  | "completed"
  | "context_ready"
  | "failed"
  | "received"
  | "routed"
  | "running"
  | "validated"
  | "workflow_pending";

export interface TaskIntent {
  readonly taskType: string;
  readonly method: "classified" | "declared";
  readonly confidence: number;
}

export interface TaskRecord {
  readonly taskId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly state: TaskState;
  readonly intent: TaskIntent;
  readonly plan?: ExecutionPlan;
  readonly selectedAgent?: AgentReference;
  readonly attemptCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resultRef?: string;
  readonly error?: ErrorRecord;
}

export interface RoutedTask extends TaskRecord {
  readonly state: "routed";
  readonly plan: ExecutionPlan;
  readonly selectedAgent: AgentReference;
}

const ALLOWED_TRANSITIONS: Readonly<
  Record<TaskState, readonly TaskState[]>
> = {
  awaiting_approval: [
    "workflow_pending",
    "completed",
    "failed",
    "cancelled",
  ],
  awaiting_input: ["validated", "failed", "cancelled"],
  cancelled: [],
  completed: [],
  context_ready: ["routed", "failed", "cancelled"],
  failed: [],
  received: ["validated", "failed", "cancelled"],
  routed: ["running", "failed", "cancelled"],
  running: [
    "awaiting_input",
    "awaiting_approval",
    "workflow_pending",
    "completed",
    "failed",
    "cancelled",
  ],
  validated: ["context_ready", "failed", "cancelled"],
  workflow_pending: ["completed", "failed", "cancelled"],
};

export function createTask(
  request: RequestEnvelope,
  taskId: string,
  createdAt: string,
): TaskRecord {
  return Object.freeze({
    actorId: request.actorId,
    attemptCount: 0,
    correlationId: request.correlationId,
    createdAt,
    intent: Object.freeze({
      confidence: 1,
      method: "declared",
      taskType: request.taskType,
    }),
    requestId: request.requestId,
    state: "received",
    taskId,
    updatedAt: createdAt,
    workspaceId: request.workspaceId,
  });
}

export function isTaskTransitionAllowed(
  from: TaskState,
  to: TaskState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionTask(
  task: TaskRecord,
  nextState: Exclude<TaskState, "routed">,
  updatedAt: string,
): TaskRecord {
  assertTransition(task.state, nextState);
  return Object.freeze({
    ...task,
    state: nextState,
    updatedAt,
  });
}

export function routeTask(
  task: TaskRecord,
  decision: RoutingDecision,
  plan: ExecutionPlan,
  updatedAt: string,
): RoutedTask {
  assertTransition(task.state, "routed");

  if (decision.taskId !== task.taskId || plan.taskId !== task.taskId) {
    throw new TaskStateError("Routing artifacts belong to another task", {
      decisionTaskId: decision.taskId,
      planTaskId: plan.taskId,
      taskId: task.taskId,
    });
  }

  return Object.freeze({
    ...task,
    plan,
    selectedAgent: Object.freeze({ ...decision.selectedAgent }),
    state: "routed",
    updatedAt,
  });
}

function assertTransition(from: TaskState, to: TaskState): void {
  if (!isTaskTransitionAllowed(from, to)) {
    throw new TaskStateError(
      `Task cannot transition from ${from} to ${to}`,
      { from, to },
    );
  }
}
