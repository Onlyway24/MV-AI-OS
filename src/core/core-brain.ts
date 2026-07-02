import type { RequestEnvelope } from "../contracts/request-envelope.js";
import {
  InvariantError,
  RequestValidationError,
  normalizeCoreError,
} from "../errors/core-error.js";
import type { CoreBrainDependencies } from "./dependencies.js";
import { createExecutionPlan } from "./models/plan.js";
import {
  createTask,
  routeTask,
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
