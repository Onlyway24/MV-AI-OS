import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { GuardianConsultationDecision } from "./guardian-consultation.js";
import type { MainAssistantDelegationDecision } from "./main-assistant-delegation-policy.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  type MainAssistantSafetyDomain,
} from "./main-assistant-specification.js";
import type {
  MainAssistantInvocationIntent,
  MainAssistantInvocationRiskLevel,
} from "./main-assistant-runtime.js";
import type {
  OperatorDecision,
  OperatorDecisionCostPosture,
  OperatorDecisionKind,
} from "./operator-decision-engine.js";

export const MAIN_ASSISTANT_OPERATOR_PROTOCOL_CONTRACT_VERSION = "1" as const;

export type OperatorIntent = MainAssistantInvocationIntent;

export type OperatorProtocolDecision = OperatorDecisionKind;

export type OperatorProtocolRiskLevel = MainAssistantInvocationRiskLevel;

export type OperatorNextActionPriority = "primary" | "secondary";

export interface OperatorCommand {
  readonly actorId: string;
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly commandId: string;
  readonly constraints: readonly string[];
  readonly contractVersion: RequestContractVersion;
  readonly generatedAt: string;
  readonly intent: OperatorIntent;
  readonly objective: string;
  readonly requestedOutcome: string;
  readonly riskLevel: OperatorProtocolRiskLevel;
  readonly workspaceId: string;
}

export interface OperatorDecisionRequest {
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly command: OperatorCommand;
  readonly contractVersion: RequestContractVersion;
  readonly delegationDecision?: MainAssistantDelegationDecision;
  readonly guardianConsultation: GuardianConsultationDecision;
  readonly operatorDecision: OperatorDecision;
  readonly protocolRequestId: string;
}

export interface OperatorSafetyCheckSummary {
  readonly domain: MainAssistantSafetyDomain;
  readonly consulted: boolean;
}

export interface OperatorApprovalPrompt {
  readonly approvalId: string;
  readonly operation?: string;
  readonly reason: string;
  readonly title: string;
}

export interface OperatorClarificationRequest {
  readonly question: string;
  readonly questionId: string;
}

export interface OperatorRefusal {
  readonly reason: string;
  readonly refusalId: string;
}

export interface OperatorNextAction {
  readonly actionId: string;
  readonly description: string;
  readonly priority: OperatorNextActionPriority;
}

export interface OperatorDelegationSummary {
  readonly agentId: string;
  readonly category: string;
  readonly decision: MainAssistantDelegationDecision["decision"];
  readonly nonExecuting: true;
}

export interface OperatorMissionPlanSummary {
  readonly candidateId: string;
  readonly nonExecuting: true;
  readonly objective: string;
  readonly requestedOutcome: string;
  readonly steps: readonly string[];
}

export interface OperatorDecisionResponse {
  readonly approvalPrompts: readonly OperatorApprovalPrompt[];
  readonly assistantId: typeof ONLY_WAY_ASSISTANT_ID;
  readonly blockedReasons: readonly string[];
  readonly clarificationRequests: readonly OperatorClarificationRequest[];
  readonly contractVersion: RequestContractVersion;
  readonly costBudgetPosture?: OperatorDecisionCostPosture;
  readonly decision: OperatorProtocolDecision;
  readonly delegationSummary?: OperatorDelegationSummary;
  readonly generatedAt: string;
  readonly missionPlanSummary?: OperatorMissionPlanSummary;
  readonly missingInformation: readonly string[];
  readonly nextActions: readonly OperatorNextAction[];
  readonly nonExecuting: true;
  readonly protocolRequestId: string;
  readonly refusal?: OperatorRefusal;
  readonly responseId: string;
  readonly riskLevel: OperatorProtocolRiskLevel;
  readonly safetyChecksConsulted: readonly OperatorSafetyCheckSummary[];
  readonly summary: string;
  readonly understoodObjective: string;
}

export interface MainAssistantOperatorProtocol {
  respond(request: OperatorDecisionRequest): OperatorDecisionResponse;
}

export class MainAssistantOperatorProtocolValidationError extends Error {
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
