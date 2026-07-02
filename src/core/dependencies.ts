import type { AgentRuntime } from "../agents/agent-runtime.js";
import type { AgentResult } from "../contracts/agent-execution.js";
import type { RequestEnvelope } from "../contracts/request-envelope.js";
import type { TaskResponse } from "../contracts/task-response.js";
import type { Logger } from "../logging/logger.js";
import type { MemoryReader } from "../memory/memory-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { PolicyDecision } from "../policy/policy-decision.js";
import type { PolicyEvaluator } from "../policy/policy-evaluator.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import type { ExecutionContextBuilder } from "./execution-context-builder.js";
import type { Router } from "./routing/router.js";

export type { Clock } from "../ports/clock.js";

export type IdentifierScope =
  | "audit"
  | "context"
  | "decision"
  | "invocation"
  | "plan"
  | "plan_step"
  | "policy_decision"
  | "task";

export interface IdentifierGenerator {
  next(scope: IdentifierScope): string;
}

export interface CoreBrainDependencies {
  readonly agentResultValidator: Validator<AgentResult>;
  readonly agentRuntime: AgentRuntime;
  readonly clock: Clock;
  readonly contextBuilder: ExecutionContextBuilder;
  readonly identifiers: IdentifierGenerator;
  readonly logger: Logger;
  readonly memoryService: MemoryReader;
  readonly policyDecisionValidator: Validator<PolicyDecision>;
  readonly policyEvaluator: PolicyEvaluator;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<RequestEnvelope>;
  readonly router: Router;
  readonly taskResponseValidator: Validator<TaskResponse>;
}
