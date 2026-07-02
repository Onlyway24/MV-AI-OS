import type { AgentRegistry } from "../../agents/agent-registry.js";
import { RoutingError } from "../../errors/core-error.js";
import type {
  Clock,
  IdentifierGenerator,
} from "../dependencies.js";
import type { RoutingDecision } from "../models/decision.js";
import {
  currentTimestamp,
  nextIdentifier,
} from "../runtime-values.js";
import type { RouteInput, RouteResult, Router } from "./router.js";

export class RegistryRouter implements Router {
  readonly #registry: AgentRegistry;
  readonly #clock: Clock;
  readonly #identifiers: IdentifierGenerator;

  public constructor(
    registry: AgentRegistry,
    clock: Clock,
    identifiers: IdentifierGenerator,
  ) {
    this.#registry = registry;
    this.#clock = clock;
    this.#identifiers = identifiers;
  }

  public route(input: RouteInput): Promise<RouteResult> {
    const matches = this.#registry.findActiveByTaskType(
      input.task.intent.taskType,
    );

    if (matches.length === 0) {
      return Promise.reject(
        new RoutingError(
          "route_not_found",
          "No active agent supports the requested task type",
          { taskType: input.task.intent.taskType },
        ),
      );
    }

    if (matches.length > 1) {
      return Promise.reject(
        new RoutingError(
          "route_ambiguous",
          "More than one active agent supports the requested task type",
          {
            candidates: matches.map(({ agentId, version }) => ({
              agentId,
              version,
            })),
            taskType: input.task.intent.taskType,
          },
        ),
      );
    }

    const selected = matches[0];
    if (selected === undefined) {
      return Promise.reject(
        new RoutingError(
          "route_not_found",
          "No active agent supports the requested task type",
          { taskType: input.task.intent.taskType },
        ),
      );
    }

    const decision: RoutingDecision = Object.freeze({
      alternativesConsidered: Object.freeze([]),
      confidence: 1,
      contractVersion: "1",
      decidedAt: currentTimestamp(this.#clock, "routing"),
      decisionId: nextIdentifier(
        this.#identifiers,
        "decision",
        "routing",
      ),
      reasonCode: "single_task_type_match",
      selectedAgent: Object.freeze({
        agentId: selected.agentId,
        version: selected.version,
      }),
      taskId: input.task.taskId,
    });

    return Promise.resolve(Object.freeze({ agent: selected, decision }));
  }
}
