import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type {
  OperatorSafetyAutonomyDecision,
  OperatorSafetyReport,
  OperatorSafetyStatus,
} from "../guardians/operator-safety-report.js";
import type {
  MainAssistantEscalationType,
  MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";

export const MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION = "1" as const;

export type MainAssistantInvocationIntent =
  | "coordinate"
  | "decide"
  | "plan"
  | "review";

export type MainAssistantInvocationRiskLevel =
  | "normal"
  | "risky"
  | "sensitive";

export type MainAssistantResultStatus =
  | "accepted"
  | "attention_required"
  | "blocked"
  | "refused";

export type MainAssistantRuntimeSafetyDecision =
  | OperatorSafetyAutonomyDecision
  | "missing_operator_safety_report"
  | "operator_confirmation_required"
  | "unsafe_request_refused";

export interface MainAssistantSafetyPreflightContext {
  readonly operatorSafetyReport?: OperatorSafetyReport;
}

export interface MainAssistantInvocation {
  readonly actorId: string;
  readonly assistantId: string;
  readonly contractVersion: RequestContractVersion;
  readonly correlationId: string;
  readonly intent: MainAssistantInvocationIntent;
  readonly invocationId: string;
  readonly objective: string;
  readonly requestedAt: string;
  readonly requestedOperations: readonly MainAssistantEscalationType[];
  readonly requestedOutcome: string;
  readonly riskLevel: MainAssistantInvocationRiskLevel;
  readonly safetyPreflight?: MainAssistantSafetyPreflightContext;
  readonly workspaceId: string;
}

export interface MainAssistantResult {
  readonly actorId: string;
  readonly approvalRequired: boolean;
  readonly approvalsRequired: readonly MainAssistantEscalationType[];
  readonly assistantId: string;
  readonly blockers: readonly string[];
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly contractVersion: RequestContractVersion;
  readonly correlationId: string;
  readonly generatedAt: string;
  readonly intent: MainAssistantInvocationIntent;
  readonly invocationId: string;
  readonly operatorSafetyStatus: OperatorSafetyStatus | "missing";
  readonly operatorSummary: string;
  readonly recommendedDelegations: readonly string[];
  readonly recommendedNextActions: readonly string[];
  readonly safetyDecision: MainAssistantRuntimeSafetyDecision;
  readonly status: MainAssistantResultStatus;
  readonly workspaceId: string;
}

export interface MainAssistantRuntime {
  invoke(invocation: MainAssistantInvocation): MainAssistantResult;
}

export class MainAssistantRuntimeValidationError extends Error {
  public readonly issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }[];

  public constructor(
    message: string,
    issues: readonly {
      readonly code: string;
      readonly message: string;
      readonly path: string;
    }[],
  ) {
    super(message);
    this.issues = issues;
  }
}
