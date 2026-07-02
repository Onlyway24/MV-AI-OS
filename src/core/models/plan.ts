import type {
  AgentLimits,
  AgentManifest,
  AgentReference,
  ContractReference,
} from "../../agents/agent-manifest.js";
import type { RequestContractVersion } from "../../contracts/request-envelope.js";

export interface AgentInvocationPlanStep {
  readonly stepId: string;
  readonly sequence: number;
  readonly kind: "agent.invoke";
  readonly status: "pending";
  readonly objective: string;
  readonly agent: AgentReference;
  readonly expectedOutput: ContractReference;
  readonly limits: AgentLimits;
  readonly modelProfile: string;
  readonly dependsOn: readonly string[];
}

export interface ExecutionPlan {
  readonly contractVersion: RequestContractVersion;
  readonly planId: string;
  readonly taskId: string;
  readonly status: "ready";
  readonly steps: readonly AgentInvocationPlanStep[];
  readonly createdAt: string;
}

interface CreateExecutionPlanInput {
  readonly planId: string;
  readonly stepId: string;
  readonly taskId: string;
  readonly objective: string;
  readonly agent: AgentManifest;
  readonly createdAt: string;
}

export function createExecutionPlan(
  input: CreateExecutionPlanInput,
): ExecutionPlan {
  const agent = Object.freeze({
    agentId: input.agent.agentId,
    version: input.agent.version,
  });
  const expectedOutput = Object.freeze({ ...input.agent.outputContract });
  const limits = Object.freeze({ ...input.agent.limits });
  const step = Object.freeze({
    agent,
    dependsOn: Object.freeze([]),
    expectedOutput,
    kind: "agent.invoke" as const,
    limits,
    modelProfile: input.agent.modelProfile,
    objective: input.objective,
    sequence: 1 as const,
    status: "pending" as const,
    stepId: input.stepId,
  });
  const steps: readonly AgentInvocationPlanStep[] = Object.freeze([step]);

  return Object.freeze({
    contractVersion: "1",
    createdAt: input.createdAt,
    planId: input.planId,
    status: "ready",
    steps,
    taskId: input.taskId,
  });
}
