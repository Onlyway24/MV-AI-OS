import type { AgentInvocation } from "../../contracts/agent-execution.js";
import type { JsonObject } from "../../contracts/json.js";
import { InvariantError } from "../../errors/core-error.js";
import type { PreparedExecution } from "../prepared-execution.js";

export function createAgentInvocation(
  prepared: PreparedExecution,
  invocationId: string,
): AgentInvocation {
  const step = prepared.task.plan.steps[0];
  if (step === undefined) {
    throw new InvariantError(
      "Prepared execution has no plan step",
      "agent_invocation",
    );
  }

  const input: JsonObject = {
    ...(prepared.context.constraints === undefined
      ? {}
      : { constraints: prepared.context.constraints }),
    ...(prepared.context.input === undefined
      ? {}
      : { data: prepared.context.input }),
    requestedOutput: prepared.context.requestedOutput,
  };
  const context: JsonObject = {
    actorId: prepared.context.actorId,
    contextId: prepared.context.contextId,
    ...(prepared.context.sessionId === undefined
      ? {}
      : { sessionId: prepared.context.sessionId }),
    supplementalContext: prepared.context.supplementalContext.map(
      ({ content, metadata, referenceId, source }) => ({
        content,
        ...(metadata === undefined ? {} : { metadata }),
        referenceId,
        source,
      }),
    ),
    taskType: prepared.context.taskType,
    workspaceId: prepared.context.workspaceId,
  };

  return Object.freeze({
    agent: Object.freeze({ ...step.agent }),
    attempt: prepared.task.attemptCount + 1,
    context,
    contractVersion: prepared.context.contractVersion,
    correlationId: prepared.context.correlationId,
    input,
    invocationId,
    limits: Object.freeze({
      ...step.limits,
      modelProfile: step.modelProfile,
    }),
    objective: step.objective,
    outputContract: Object.freeze({ ...step.expectedOutput }),
    permissions: Object.freeze([
      ...prepared.policyDecision.effectivePermissions,
    ]),
    taskId: prepared.task.taskId,
  });
}
