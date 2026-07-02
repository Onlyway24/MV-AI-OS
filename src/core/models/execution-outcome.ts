import type { AgentResult } from "../../contracts/agent-execution.js";
import type { ErrorRecord } from "../../contracts/error-record.js";
import type { TaskResponse } from "../../contracts/task-response.js";
import { InvariantError } from "../../errors/core-error.js";
import {
  failTask,
  transitionTask,
  type RunningTask,
  type TaskRecord,
} from "./task.js";

export interface ExecutionOutcome {
  readonly task: TaskRecord;
  readonly response: TaskResponse;
}

export function applyAgentResult(
  task: RunningTask,
  result: AgentResult,
  updatedAt: string,
): ExecutionOutcome {
  if (result.taskId !== task.taskId) {
    throw new InvariantError(
      "Agent result belongs to another task",
      "result_synthesis",
      {
        resultTaskId: result.taskId,
        taskId: task.taskId,
      },
    );
  }

  switch (result.status) {
    case "succeeded": {
      if (result.output === undefined) {
        throw new InvariantError(
          "Successful agent result has no output",
          "result_synthesis",
        );
      }
      const completedTask = transitionTask(task, "completed", updatedAt);
      return {
        response: createResponse(completedTask, {
          result: result.output,
          status: "completed",
        }),
        task: completedTask,
      };
    }
    case "needs_input": {
      const waitingTask = transitionTask(task, "awaiting_input", updatedAt);
      return {
        response: createResponse(waitingTask, {
          status: "needs_input",
          warnings: ["Agent requires additional input"],
        }),
        task: waitingTask,
      };
    }
    case "needs_approval": {
      const waitingTask = transitionTask(
        task,
        "awaiting_approval",
        updatedAt,
      );
      return {
        response: createResponse(waitingTask, {
          status: "awaiting_approval",
          warnings: ["Agent requires approval before continuing"],
        }),
        task: waitingTask,
      };
    }
    case "failed": {
      if (result.error === undefined) {
        throw new InvariantError(
          "Failed agent result has no error",
          "result_synthesis",
        );
      }
      return applyExecutionError(task, result.error, updatedAt);
    }
  }
}

export function applyExecutionError(
  task: TaskRecord,
  error: ErrorRecord,
  updatedAt: string,
): ExecutionOutcome {
  const failedTask = failTask(task, error, updatedAt);
  return {
    response: createResponse(failedTask, {
      error,
      status: "failed",
    }),
    task: failedTask,
  };
}

type ResponseValues =
  | {
      readonly status: "completed";
      readonly result: NonNullable<TaskResponse["result"]>;
      readonly warnings?: readonly string[];
    }
  | {
      readonly status: "awaiting_approval" | "needs_input";
      readonly warnings: readonly string[];
    }
  | {
      readonly status: "failed";
      readonly error: ErrorRecord;
      readonly warnings?: readonly string[];
    };

function createResponse(
  task: TaskRecord,
  values: ResponseValues,
): TaskResponse {
  return Object.freeze({
    approvals: Object.freeze([]),
    contractVersion: "1",
    correlationId: task.correlationId,
    createdAt: task.createdAt,
    ...("error" in values ? { error: values.error } : {}),
    requestId: task.requestId,
    ...("result" in values ? { result: values.result } : {}),
    status: values.status,
    taskId: task.taskId,
    updatedAt: task.updatedAt,
    warnings: Object.freeze(values.warnings ?? []),
  });
}
