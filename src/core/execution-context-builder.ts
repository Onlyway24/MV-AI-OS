import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { ExecutionContext } from "./models/execution-context.js";

export interface BuildExecutionContextInput {
  readonly contextId: string;
  readonly taskId: string;
  readonly request: RequestEnvelope;
  readonly createdAt: string;
}

export interface ExecutionContextBuilder {
  build(input: BuildExecutionContextInput): Promise<ExecutionContext>;
}

export class RequestExecutionContextBuilder implements ExecutionContextBuilder {
  public build(
    input: BuildExecutionContextInput,
  ): Promise<ExecutionContext> {
    const { contextId, createdAt, request, taskId } = input;

    return Promise.resolve(
      Object.freeze({
        actorId: request.actorId,
        contractVersion: request.contractVersion,
        contextId,
        correlationId: request.correlationId,
        ...(request.constraints === undefined
          ? {}
          : { constraints: request.constraints }),
        createdAt,
        ...(request.input === undefined ? {} : { input: request.input }),
        instruction: request.instruction,
        requestId: request.requestId,
        requestedOutput: request.requestedOutput,
        ...(request.requestedWorkflow === undefined
          ? {}
          : { requestedWorkflow: request.requestedWorkflow }),
        ...(request.sessionId === undefined
          ? {}
          : { sessionId: request.sessionId }),
        supplementalContext: Object.freeze([]),
        taskId,
        taskType: request.taskType,
        workspaceId: request.workspaceId,
      }),
    );
  }
}
