import type {
  AgentInvocation,
  AgentResult,
} from "../contracts/agent-execution.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { TaskResponse } from "../contracts/task-response.js";
import {
  AgentRuntimeError,
  InvariantError,
  RequestValidationError,
  normalizeCoreError,
} from "../errors/core-error.js";
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
} from "./models/task.js";
import type { PreparedExecution } from "./prepared-execution.js";
import {
  currentTimestamp,
  nextIdentifier,
} from "./runtime-values.js";

export class CoreBrain {
  readonly #dependencies: CoreBrainDependencies;

  public constructor(dependencies: CoreBrainDependencies) {
    this.#dependencies = dependencies;
  }

  public async prepare(value: unknown): Promise<PreparedExecution> {
    let request: RequestEnvelope | undefined;

    try {
      const validation = this.#dependencies.requestValidator.validate(value);
      if (!validation.ok) {
        throw new RequestValidationError(validation.issues);
      }

      request = validation.value;
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
      let task = createTask(request, taskId, createdAt);
      task = transitionTask(
        task,
        "validated",
        currentTimestamp(this.#dependencies.clock, "task_validation"),
      );

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
      task = transitionTask(
        task,
        "context_ready",
        currentTimestamp(this.#dependencies.clock, "context_assembly"),
      );

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
      this.#dependencies.logger.log({
        ...(request === undefined
          ? {}
          : {
              correlationId: request.correlationId,
              requestId: request.requestId,
            }),
        event: "core.request.failed",
        level: "error",
        message: normalized.message,
        metadata: {
          category: normalized.category,
          code: normalized.code,
          stage: normalized.stage,
        },
      });
      throw normalized;
    }
  }

  public async execute(value: unknown): Promise<TaskResponse> {
    const prepared = await this.prepare(value);
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
