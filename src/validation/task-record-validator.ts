import type { AgentLimits } from "../agents/agent-manifest.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import type {
  AgentInvocationPlanStep,
  ExecutionPlan,
} from "../core/models/plan.js";
import type {
  TaskIntent,
  TaskRecord,
  TaskState,
} from "../core/models/task.js";
import {
  readAgentReference,
  readContractReference,
} from "./agent-contract-readers.js";
import { readErrorRecord } from "./error-record-reader.js";
import {
  readOptionalNumber,
  readOptionalString,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const TASK_STATES = new Set<TaskState>([
  "awaiting_approval",
  "awaiting_input",
  "cancelled",
  "completed",
  "context_ready",
  "failed",
  "received",
  "routed",
  "running",
  "validated",
  "workflow_pending",
]);

export class TaskRecordValidator implements Validator<TaskRecord> {
  public validate(value: unknown): ValidationResult<TaskRecord> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "task record must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const taskId = readRequiredString(record, "taskId", issues);
    const requestId = readRequiredString(record, "requestId", issues);
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const state = readRequiredString(record, "state", issues);
    const intent = readIntent(record.intent, "intent", issues);
    const plan =
      record.plan === undefined
        ? undefined
        : readPlan(record.plan, "plan", issues);
    const selectedAgent =
      record.selectedAgent === undefined
        ? undefined
        : readAgentReference(
            record.selectedAgent,
            "selectedAgent",
            issues,
          );
    const attemptCount = readRequiredInteger(
      record,
      "attemptCount",
      issues,
    );
    const createdAt = readRequiredString(record, "createdAt", issues);
    const updatedAt = readRequiredString(record, "updatedAt", issues);
    const resultRef = readOptionalString(record, "resultRef", issues);
    const error = readErrorRecord(record.error, "error", issues);

    if (
      state !== undefined &&
      !TASK_STATES.has(state as TaskState)
    ) {
      issues.push({
        code: "invalid_value",
        message: "state is not supported",
        path: "state",
      });
    }
    validateTimestamp(createdAt, "createdAt", issues);
    validateTimestamp(updatedAt, "updatedAt", issues);
    if (
      createdAt !== undefined &&
      updatedAt !== undefined &&
      Date.parse(updatedAt) < Date.parse(createdAt)
    ) {
      issues.push({
        code: "invalid_order",
        message: "updatedAt must not precede createdAt",
        path: "updatedAt",
      });
    }
    if (plan !== undefined && plan.taskId !== taskId) {
      issues.push({
        code: "ownership_mismatch",
        message: "plan.taskId must match taskId",
        path: "plan.taskId",
      });
    }
    if (
      selectedAgent !== undefined &&
      plan?.steps[0] !== undefined &&
      (plan.steps[0].agent.agentId !== selectedAgent.agentId ||
        plan.steps[0].agent.version !== selectedAgent.version)
    ) {
      issues.push({
        code: "ownership_mismatch",
        message: "selectedAgent must match the first plan step",
        path: "selectedAgent",
      });
    }
    if (
      (state === "routed" || state === "running") &&
      (plan === undefined || selectedAgent === undefined)
    ) {
      issues.push({
        code: "required",
        message: "routed and running tasks require plan and selectedAgent",
        path: "plan",
      });
    }
    if (state === "failed" && error === undefined) {
      issues.push({
        code: "required",
        message: "failed tasks require an error",
        path: "error",
      });
    }
    if (
      state !== undefined &&
      state !== "failed" &&
      error !== undefined
    ) {
      issues.push({
        code: "forbidden",
        message: "error is only allowed for failed tasks",
        path: "error",
      });
    }

    if (
      issues.length > 0 ||
      taskId === undefined ||
      requestId === undefined ||
      correlationId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      state === undefined ||
      !TASK_STATES.has(state as TaskState) ||
      intent === undefined ||
      attemptCount === undefined ||
      createdAt === undefined ||
      updatedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      actorId,
      attemptCount,
      correlationId,
      createdAt,
      ...(error === undefined ? {} : { error }),
      intent,
      ...(plan === undefined ? {} : { plan }),
      requestId,
      ...(resultRef === undefined ? {} : { resultRef }),
      ...(selectedAgent === undefined ? {} : { selectedAgent }),
      state: state as TaskState,
      taskId,
      updatedAt,
      workspaceId,
    });
  }
}

function readIntent(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): TaskIntent | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const taskType = readRequiredString(record, "taskType", issues, path);
  const method = readRequiredString(record, "method", issues, path);
  const confidence = readOptionalNumber(
    record,
    "confidence",
    issues,
    path,
    0,
  );
  if (confidence === undefined) {
    issues.push({
      code: "required",
      message: `${path}.confidence is required`,
      path: `${path}.confidence`,
    });
  }
  if (confidence !== undefined && confidence > 1) {
    issues.push({
      code: "invalid_number",
      message: `${path}.confidence must not exceed 1`,
      path: `${path}.confidence`,
    });
  }
  if (
    method !== undefined &&
    method !== "classified" &&
    method !== "declared"
  ) {
    issues.push({
      code: "invalid_value",
      message: `${path}.method is not supported`,
      path: `${path}.method`,
    });
  }
  if (
    taskType === undefined ||
    (method !== "classified" && method !== "declared") ||
    confidence === undefined ||
    confidence > 1
  ) {
    return undefined;
  }
  return { confidence, method, taskType };
}

function readPlan(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ExecutionPlan | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
    path,
  );
  const planId = readRequiredString(record, "planId", issues, path);
  const taskId = readRequiredString(record, "taskId", issues, path);
  const status = readRequiredString(record, "status", issues, path);
  const steps = readPlanSteps(record.steps, `${path}.steps`, issues);
  const createdAt = readRequiredString(record, "createdAt", issues, path);
  if (
    contractVersion !== undefined &&
    contractVersion !== REQUEST_CONTRACT_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `${path}.contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
      path: `${path}.contractVersion`,
    });
  }
  if (status !== undefined && status !== "ready") {
    issues.push({
      code: "invalid_value",
      message: `${path}.status must be ready`,
      path: `${path}.status`,
    });
  }
  validateTimestamp(createdAt, `${path}.createdAt`, issues);
  if (
    contractVersion !== REQUEST_CONTRACT_VERSION ||
    planId === undefined ||
    taskId === undefined ||
    status !== "ready" ||
    steps === undefined ||
    createdAt === undefined
  ) {
    return undefined;
  }
  return {
    contractVersion,
    createdAt,
    planId,
    status,
    steps,
    taskId,
  };
}

function readPlanSteps(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly AgentInvocationPlanStep[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }
  if (value.length === 0) {
    issues.push({
      code: "empty",
      message: `${path} must contain at least one step`,
      path,
    });
  }
  const steps: AgentInvocationPlanStep[] = [];
  for (const [index, candidate] of value.entries()) {
    const step = readPlanStep(
      candidate,
      `${path}[${String(index)}]`,
      issues,
    );
    if (step !== undefined) {
      steps.push(step);
    }
  }
  const stepIds = steps.map(({ stepId }) => stepId);
  const sequences = steps.map(({ sequence }) => sequence);
  if (new Set(stepIds).size !== stepIds.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not repeat step IDs`,
      path,
    });
  }
  if (new Set(sequences).size !== sequences.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not repeat sequence numbers`,
      path,
    });
  }
  return steps;
}

function readPlanStep(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentInvocationPlanStep | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const stepId = readRequiredString(record, "stepId", issues, path);
  const sequence = readRequiredInteger(
    record,
    "sequence",
    issues,
    path,
    1,
  );
  const kind = readRequiredString(record, "kind", issues, path);
  const status = readRequiredString(record, "status", issues, path);
  const objective = readRequiredString(record, "objective", issues, path);
  const agent = readAgentReference(record.agent, `${path}.agent`, issues);
  const expectedOutput = readContractReference(
    record.expectedOutput,
    `${path}.expectedOutput`,
    issues,
  );
  const limits = readAgentLimits(record.limits, `${path}.limits`, issues);
  const modelProfile = readRequiredString(
    record,
    "modelProfile",
    issues,
    path,
  );
  const dependsOn = readRequiredStringArray(
    record,
    "dependsOn",
    issues,
    path,
  );
  if (kind !== undefined && kind !== "agent.invoke") {
    issues.push({
      code: "invalid_value",
      message: `${path}.kind must be agent.invoke`,
      path: `${path}.kind`,
    });
  }
  if (status !== undefined && status !== "pending") {
    issues.push({
      code: "invalid_value",
      message: `${path}.status must be pending`,
      path: `${path}.status`,
    });
  }
  if (
    stepId === undefined ||
    sequence === undefined ||
    kind !== "agent.invoke" ||
    status !== "pending" ||
    objective === undefined ||
    agent === undefined ||
    expectedOutput === undefined ||
    limits === undefined ||
    modelProfile === undefined ||
    dependsOn === undefined
  ) {
    return undefined;
  }
  return {
    agent,
    dependsOn,
    expectedOutput,
    kind,
    limits,
    modelProfile,
    objective,
    sequence,
    status,
    stepId,
  };
}

function readAgentLimits(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentLimits | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const timeoutMs = readRequiredInteger(
    record,
    "timeoutMs",
    issues,
    path,
    1,
  );
  const maxToolCalls = readRequiredInteger(
    record,
    "maxToolCalls",
    issues,
    path,
  );
  const maxResultBytes = readRequiredInteger(
    record,
    "maxResultBytes",
    issues,
    path,
    1,
  );
  const maxTokens = readOptionalNumber(
    record,
    "maxTokens",
    issues,
    path,
    1,
  );
  const maxCostUsd = readOptionalNumber(
    record,
    "maxCostUsd",
    issues,
    path,
  );
  if (
    timeoutMs === undefined ||
    maxToolCalls === undefined ||
    maxResultBytes === undefined
  ) {
    return undefined;
  }
  return {
    ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
    maxResultBytes,
    ...(maxTokens === undefined ? {} : { maxTokens }),
    maxToolCalls,
    timeoutMs,
  };
}

function validateTimestamp(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path} must be a UTC RFC 3339 timestamp`,
      path,
    });
  }
}
