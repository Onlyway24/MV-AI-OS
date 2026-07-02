import type {
  AgentInvocation,
  AgentResult,
} from "../contracts/agent-execution.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { TaskResponse } from "../contracts/task-response.js";
import {
  AgentRuntimeError,
  InvariantError,
  RequestAlreadyCompletedError,
  RequestIdConflictError,
  RequestValidationError,
  normalizeCoreError,
} from "../errors/core-error.js";
import { createRequestFingerprint } from "../persistence/request-identity.js";
import type { CoreBrainDependencies } from "./dependencies.js";
import { createAgentInvocation } from "./models/agent-invocation.js";
import {
  applyAgentResult,
  applyExecutionError,
} from "./models/execution-outcome.js";
import { createExecutionPlan } from "./models/plan.js";
import {
  createTask,
  routeTask,
  startTask,
  transitionTask,
  type TaskRecord,
} from "./models/task.js";
import type { PreparedExecution } from "./prepared-execution.js";
import { RepositoryBackedTaskLifecycle } from "./repository-backed-task-lifecycle.js";
import {
  currentTimestamp,
  nextIdentifier,
} from "./runtime-values.js";

export class CoreBrain {
  readonly #dependencies: CoreBrainDependencies;
  readonly #inFlightRequests = new Map<
    string,
    {
      readonly execution: Promise<TaskResponse>;
      readonly requestFingerprint: string;
    }
  >();
  readonly #lifecycle: RepositoryBackedTaskLifecycle;

  public constructor(dependencies: CoreBrainDependencies) {
    this.#dependencies = dependencies;
    this.#lifecycle = new RepositoryBackedTaskLifecycle(
      dependencies.repositories,
      dependencies.identifiers,
    );
  }

  public async prepare(value: unknown): Promise<PreparedExecution> {
    const request = this.#validatedRequest(value);
    const prepared = await this.#prepare(request, false);
    if (!isPreparedExecution(prepared)) {
      throw new RequestAlreadyCompletedError(
        prepared.requestId,
        prepared.taskId,
      );
    }
    return prepared;
  }

  async #prepare(
    request: RequestEnvelope,
    returnFailureResponse: boolean,
  ): Promise<PreparedExecution | TaskResponse> {
    let task: TaskRecord | undefined;
    let taskAccepted = false;

    try {
      this.#dependencies.logger.log({
        correlationId: request.correlationId,
        event: "core.request.validated",
        level: "info",
        message: "Request envelope validated",
        requestId: request.requestId,
      });

      const createdAt = currentTimestamp(
        this.#dependencies.clock,
        "task_creation",
      );
      const taskId = nextIdentifier(
        this.#dependencies.identifiers,
        "task",
        "task_creation",
      );
      task = createTask(request, taskId, createdAt);
      const acceptance = await this.#lifecycle.accept(request, task);
      if (acceptance.kind === "replayed") {
        this.#dependencies.logger.log({
          correlationId: request.correlationId,
          event: "core.request.replayed",
          level: "info",
          message: "Stored task response returned for duplicate request",
          requestId: request.requestId,
          taskId: acceptance.task.taskId,
        });
        return acceptance.response;
      }
      task = acceptance.task;
      taskAccepted = true;

      const validatedTask = transitionTask(
        task,
        "validated",
        currentTimestamp(this.#dependencies.clock, "task_validation"),
      );
      await this.#lifecycle.transition(task, validatedTask, {
        action: "task.validate",
        eventType: "task.validated",
      });
      task = validatedTask;

      const context = await this.#dependencies.contextBuilder.build({
        contextId: nextIdentifier(
          this.#dependencies.identifiers,
          "context",
          "context_assembly",
        ),
        createdAt: currentTimestamp(
          this.#dependencies.clock,
          "context_assembly",
        ),
        memory: this.#dependencies.memoryService,
        request,
        taskId,
      });
      assertContextOwnership(context, request, taskId);
      const contextReadyTask = transitionTask(
        task,
        "context_ready",
        currentTimestamp(this.#dependencies.clock, "context_assembly"),
      );
      await this.#lifecycle.transition(task, contextReadyTask, {
        action: "context.assemble",
        eventType: "task.context_ready",
        metadata: {
          contextId: context.contextId,
          supplementalContextCount: context.supplementalContext.length,
        },
      });
      task = contextReadyTask;

      const route = await this.#dependencies.router.route({
        context,
        task,
      });
      const { agent, decision } = route;
      assertRouteOwnership(agent.agentId, agent.version, decision, taskId);
      const plan = createExecutionPlan({
        agent,
        createdAt: currentTimestamp(
          this.#dependencies.clock,
          "plan_creation",
        ),
        objective: request.instruction,
        planId: nextIdentifier(
          this.#dependencies.identifiers,
          "plan",
          "plan_creation",
        ),
        stepId: nextIdentifier(
          this.#dependencies.identifiers,
          "plan_step",
          "plan_creation",
        ),
        taskId,
      });
      const routedTask = routeTask(
        task,
        decision,
        plan,
        currentTimestamp(this.#dependencies.clock, "task_routing"),
      );
      await this.#lifecycle.transition(task, routedTask, {
        action: "task.route",
        eventType: "task.routed",
        metadata: {
          agentId: decision.selectedAgent.agentId,
          agentVersion: decision.selectedAgent.version,
          decisionId: decision.decisionId,
          planId: plan.planId,
        },
      });

      this.#dependencies.logger.log({
        correlationId: request.correlationId,
        event: "core.task.routed",
        level: "info",
        message: "Task routed and execution plan prepared",
        metadata: {
          agentId: decision.selectedAgent.agentId,
          agentVersion: decision.selectedAgent.version,
          decisionId: decision.decisionId,
          planId: plan.planId,
        },
        requestId: request.requestId,
        taskId,
      });

      return Object.freeze({
        context,
        decision,
        task: routedTask,
      });
    } catch (error) {
      const normalized = normalizeCoreError(error, "core_brain");
      let failureResponse: TaskResponse | undefined;
      if (
        task !== undefined &&
        taskAccepted &&
        normalized.stage !== "persistence"
      ) {
        const occurredAt = currentTimestamp(
          this.#dependencies.clock,
          "task_failure",
        );
        const outcome = applyExecutionError(
          task,
          normalized.toRecord(occurredAt),
          occurredAt,
        );
        const response = this.#validatedResponse(outcome.response);
        failureResponse = response;
        await this.#lifecycle.complete(
          task,
          outcome.task,
          response,
          {
            action: "task.prepare",
            eventType: "task.failed",
            metadata: {
              category: normalized.category,
              code: normalized.code,
              stage: normalized.stage,
            },
            outcome: "failure",
          },
        );
      }
      this.#dependencies.logger.log({
        correlationId: request.correlationId,
        event: "core.request.failed",
        level: "error",
        message: normalized.message,
        metadata: {
          category: normalized.category,
          code: normalized.code,
          stage: normalized.stage,
        },
        requestId: request.requestId,
      });
      if (returnFailureResponse && failureResponse !== undefined) {
        return failureResponse;
      }
      throw normalized;
    }
  }

  public async execute(value: unknown): Promise<TaskResponse> {
    const request = this.#validatedRequest(value);
    const requestFingerprint = createRequestFingerprint(request);
    const inFlight = this.#inFlightRequests.get(request.requestId);
    if (inFlight !== undefined) {
      if (inFlight.requestFingerprint !== requestFingerprint) {
        throw new RequestIdConflictError(request.requestId);
      }
      return inFlight.execution;
    }

    const execution = this.#execute(request);
    this.#inFlightRequests.set(
      request.requestId,
      Object.freeze({ execution, requestFingerprint }),
    );
    try {
      return await execution;
    } finally {
      const current = this.#inFlightRequests.get(request.requestId);
      if (current?.execution === execution) {
        this.#inFlightRequests.delete(request.requestId);
      }
    }
  }

  async #execute(request: RequestEnvelope): Promise<TaskResponse> {
    const preparation = await this.#prepare(request, true);
    if (!isPreparedExecution(preparation)) {
      return preparation;
    }
    const prepared = preparation;
    const invocation = createAgentInvocation(
      prepared,
      nextIdentifier(
        this.#dependencies.identifiers,
        "invocation",
        "agent_invocation",
      ),
    );
    const runningTask = startTask(
      prepared.task,
      currentTimestamp(this.#dependencies.clock, "agent_invocation"),
    );
    await this.#lifecycle.transition(prepared.task, runningTask, {
      action: "agent.invoke",
      eventType: "agent.started",
      metadata: {
        agentId: invocation.agent.agentId,
        agentVersion: invocation.agent.version,
        invocationId: invocation.invocationId,
      },
    });

    this.#dependencies.logger.log({
      correlationId: prepared.context.correlationId,
      event: "core.agent.started",
      level: "info",
      message: "Agent invocation started",
      metadata: {
        agentId: invocation.agent.agentId,
        agentVersion: invocation.agent.version,
        invocationId: invocation.invocationId,
      },
      requestId: prepared.context.requestId,
      taskId: prepared.task.taskId,
    });

    try {
      const candidate = await this.#dependencies.agentRuntime.execute(
        invocation,
      );
      const resultValidation =
        this.#dependencies.agentResultValidator.validate(candidate);
      if (!resultValidation.ok) {
        throw new AgentRuntimeError(
          "agent_result_invalid",
          "Agent Runtime returned an invalid result",
          {
            issues: resultValidation.issues.map(
              ({ code, message, path }) => ({
                code,
                message,
                path,
              }),
            ),
          },
        );
      }

      const result = resultValidation.value;
      assertResultOwnership(result, invocation);
      const outcome = applyAgentResult(
        runningTask,
        result,
        currentTimestamp(this.#dependencies.clock, "result_synthesis"),
      );
      const response = this.#validatedResponse(outcome.response);
      await this.#lifecycle.complete(
        runningTask,
        outcome.task,
        response,
        {
          action: "agent.result.process",
          eventType:
            response.status === "completed"
              ? "task.completed"
              : response.status === "failed"
                ? "task.failed"
                : "task.paused",
          metadata: {
            agentStatus: result.status,
            invocationId: invocation.invocationId,
          },
          outcome: response.status === "failed" ? "failure" : "success",
        },
      );

      this.#dependencies.logger.log({
        correlationId: prepared.context.correlationId,
        event:
          response.status === "completed"
            ? "core.task.completed"
            : response.status === "failed"
              ? "core.task.failed"
              : "core.task.paused",
        level: response.status === "failed" ? "error" : "info",
        message: "Agent result processed",
        metadata: {
          agentStatus: result.status,
          invocationId: invocation.invocationId,
          taskStatus: response.status,
        },
        requestId: prepared.context.requestId,
        taskId: prepared.task.taskId,
      });

      return response;
    } catch (error) {
      const normalized = normalizeCoreError(error, "agent_execution");
      const occurredAt = currentTimestamp(
        this.#dependencies.clock,
        "result_synthesis",
      );
      const outcome = applyExecutionError(
        runningTask,
        normalized.toRecord(occurredAt),
        occurredAt,
      );
      const response = this.#validatedResponse(outcome.response);
      await this.#lifecycle.complete(
        runningTask,
        outcome.task,
        response,
        {
          action: "agent.result.process",
          eventType: "task.failed",
          metadata: {
            category: normalized.category,
            code: normalized.code,
            invocationId: invocation.invocationId,
            stage: normalized.stage,
          },
          outcome: "failure",
        },
      );

      this.#dependencies.logger.log({
        correlationId: prepared.context.correlationId,
        event: "core.task.failed",
        level: "error",
        message: normalized.message,
        metadata: {
          category: normalized.category,
          code: normalized.code,
          invocationId: invocation.invocationId,
          stage: normalized.stage,
        },
        requestId: prepared.context.requestId,
        taskId: prepared.task.taskId,
      });

      return response;
    }
  }

  #validatedResponse(response: TaskResponse): TaskResponse {
    const validation =
      this.#dependencies.taskResponseValidator.validate(response);
    if (!validation.ok) {
      throw new InvariantError(
        "Core Brain generated an invalid TaskResponse",
        "result_synthesis",
        {
          issues: validation.issues.map(({ code, message, path }) => ({
            code,
            message,
            path,
          })),
        },
      );
    }
    return validation.value;
  }

  #validatedRequest(value: unknown): RequestEnvelope {
    const validation = this.#dependencies.requestValidator.validate(value);
    if (validation.ok) {
      return validation.value;
    }

    const error = new RequestValidationError(validation.issues);
    this.#dependencies.logger.log({
      event: "core.request.failed",
      level: "error",
      message: error.message,
      metadata: {
        category: error.category,
        code: error.code,
        stage: error.stage,
      },
    });
    throw error;
  }
}

function isPreparedExecution(
  value: PreparedExecution | TaskResponse,
): value is PreparedExecution {
  return "context" in value && "decision" in value && "task" in value;
}

function assertContextOwnership(
  context: PreparedExecution["context"],
  request: RequestEnvelope,
  taskId: string,
): void {
  if (
    context.taskId !== taskId ||
    context.requestId !== request.requestId ||
    context.correlationId !== request.correlationId ||
    context.workspaceId !== request.workspaceId ||
    context.actorId !== request.actorId
  ) {
    throw new InvariantError(
      "Execution context ownership does not match the request",
      "context_assembly",
      {
        contextTaskId: context.taskId,
        requestId: request.requestId,
        taskId,
      },
    );
  }
}

function assertRouteOwnership(
  agentId: string,
  agentVersion: string,
  decision: PreparedExecution["decision"],
  taskId: string,
): void {
  if (
    decision.taskId !== taskId ||
    decision.selectedAgent.agentId !== agentId ||
    decision.selectedAgent.version !== agentVersion ||
    decision.reasonCode.trim().length === 0 ||
    !Number.isFinite(decision.confidence) ||
    decision.confidence < 0 ||
    decision.confidence > 1
  ) {
    throw new InvariantError(
      "Router returned inconsistent routing artifacts",
      "routing",
      {
        agentId,
        agentVersion,
        decisionTaskId: decision.taskId,
        taskId,
      },
    );
  }
}

function assertResultOwnership(
  result: AgentResult,
  invocation: AgentInvocation,
): void {
  if (
    result.invocationId !== invocation.invocationId ||
    result.taskId !== invocation.taskId ||
    result.agent.agentId !== invocation.agent.agentId ||
    result.agent.version !== invocation.agent.version
  ) {
    throw new AgentRuntimeError(
      "agent_result_invalid",
      "Agent result identity does not match its invocation",
      {
        invocationId: invocation.invocationId,
        resultInvocationId: result.invocationId,
        resultTaskId: result.taskId,
        taskId: invocation.taskId,
      },
    );
  }
}
