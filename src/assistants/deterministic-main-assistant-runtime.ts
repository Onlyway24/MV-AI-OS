import type { OperatorSafetyReport } from "../guardians/operator-safety-report.js";
import {
  ONLY_WAY_ASSISTANT_ID,
  ONLY_WAY_ASSISTANT_SPECIFICATION,
  type MainAssistantEscalationType,
  type MainAssistantSafetyDomain,
  type MainAssistantSpecification,
} from "./main-assistant-specification.js";
import { MainAssistantSpecificationValidator } from "./main-assistant-specification-validator.js";
import {
  MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
  type MainAssistantInvocation,
  type MainAssistantResult,
  type MainAssistantRuntime,
  MainAssistantRuntimeValidationError,
} from "./main-assistant-runtime.js";
import {
  MainAssistantInvocationValidator,
  MainAssistantResultValidator,
} from "./main-assistant-runtime-validator.js";

const ESCALATION_ORDER: readonly MainAssistantEscalationType[] = [
  "cloud_or_vps_readiness",
  "external_side_effect",
  "increase_autonomy",
  "memory_write",
  "model_expansion",
  "publish_or_send",
  "tool_execution",
  "workflow_execution",
];

const SAFETY_DOMAIN_ORDER: readonly MainAssistantSafetyDomain[] = [
  "operator_safety",
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

export class DeterministicMainAssistantRuntime
  implements MainAssistantRuntime
{
  readonly #invocationValidator = new MainAssistantInvocationValidator();
  readonly #resultValidator = new MainAssistantResultValidator();
  readonly #specification: MainAssistantSpecification;

  public constructor(
    specification: MainAssistantSpecification = ONLY_WAY_ASSISTANT_SPECIFICATION,
  ) {
    const specificationValidation =
      new MainAssistantSpecificationValidator().validate(specification);
    if (!specificationValidation.ok) {
      throw new MainAssistantRuntimeValidationError(
        "Main Assistant specification is invalid",
        specificationValidation.issues,
      );
    }
    this.#specification = specificationValidation.value;
  }

  public invoke(invocation: MainAssistantInvocation): MainAssistantResult {
    const invocationValidation = this.#invocationValidator.validate(invocation);
    if (!invocationValidation.ok) {
      throw new MainAssistantRuntimeValidationError(
        "Main Assistant invocation is invalid",
        invocationValidation.issues,
      );
    }

    const validInvocation = invocationValidation.value;
    const report =
      validInvocation.safetyPreflight?.operatorSafetyReport;
    const riskyRequest = isRiskyRequest(validInvocation);
    const underSpecified = isUnderSpecified(validInvocation);
    const approvalsRequired = approvalsForOperations(
      validInvocation.requestedOperations,
      this.#specification,
    );
    const requiredSafetyDomains = requiredDomainsForOperations(
      validInvocation.requestedOperations,
      this.#specification,
      riskyRequest,
    );
    const checkedSafetyDomains = checkedDomainsFromReport(report);
    const missingRequiredDomains = requiredSafetyDomains.filter(
      (domain) => !checkedSafetyDomains.includes(domain),
    );

    const result = buildResult({
      approvalsRequired,
      checkedSafetyDomains,
      invocation: validInvocation,
      missingRequiredDomains,
      ...(report === undefined ? {} : { report }),
      riskyRequest,
      underSpecified,
    });
    const resultValidation = this.#resultValidator.validate(result);
    if (!resultValidation.ok) {
      throw new MainAssistantRuntimeValidationError(
        "Main Assistant runtime generated an invalid result",
        resultValidation.issues,
      );
    }
    return resultValidation.value;
  }
}

interface BuildResultInput {
  readonly approvalsRequired: readonly MainAssistantEscalationType[];
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly invocation: MainAssistantInvocation;
  readonly missingRequiredDomains: readonly MainAssistantSafetyDomain[];
  readonly report?: OperatorSafetyReport;
  readonly riskyRequest: boolean;
  readonly underSpecified: boolean;
}

function buildResult(input: BuildResultInput): MainAssistantResult {
  const {
    approvalsRequired,
    checkedSafetyDomains,
    invocation,
    missingRequiredDomains,
    report,
    riskyRequest,
    underSpecified,
  } = input;
  const reportStatus = report?.summary.status ?? "missing";

  if (underSpecified) {
    return baseResult(invocation, {
      approvalsRequired: [],
      blockers: [
        "The request is under-specified for a safe operator-facing decision.",
      ],
      checkedSafetyDomains,
      operatorSafetyStatus: reportStatus,
      operatorSummary:
        "Onlyway Assistant refused the request because it needs a clearer objective and desired outcome before coordination.",
      recommendedNextActions: [
        "Provide a concrete objective, desired output, and any relevant constraints.",
      ],
      safetyDecision: "unsafe_request_refused",
      status: "refused",
    });
  }

  if (report === undefined) {
    return baseResult(invocation, {
      approvalsRequired: [],
      blockers: riskyRequest
        ? [
            "Operator Safety Report is required before risky or escalation-oriented requests.",
          ]
        : [],
      checkedSafetyDomains,
      operatorSafetyStatus: "missing",
      operatorSummary: riskyRequest
        ? "Onlyway Assistant refused the request because risky escalation requires supplied Operator Safety context first."
        : "Onlyway Assistant can only give bounded guidance until Operator Safety context is supplied.",
      recommendedNextActions: [
        "Supply an Operator Safety Report before expanding autonomy, tools, workflows, publishing, persistence, or external side effects.",
      ],
      safetyDecision: "missing_operator_safety_report",
      status: riskyRequest ? "refused" : "attention_required",
    });
  }

  if (report.summary.status === "critical") {
    return baseResult(invocation, {
      approvalsRequired: [],
      blockers: [
        "Operator Safety is critical and blocks escalation.",
        ...criticalDomainBlockers(report),
      ],
      checkedSafetyDomains,
      operatorSafetyStatus: report.summary.status,
      operatorSummary: riskyRequest
        ? "Onlyway Assistant blocked escalation because Operator Safety contains critical findings."
        : "Onlyway Assistant found critical Operator Safety findings and will not move toward expanded capability.",
      recommendedNextActions: [
        "Resolve critical Operator Safety findings before escalation.",
      ],
      safetyDecision: report.summary.safetyToAutonomy,
      status: riskyRequest ? "blocked" : "attention_required",
    });
  }

  if (
    report.summary.status === "unknown" ||
    missingRequiredDomains.length > 0
  ) {
    return baseResult(invocation, {
      approvalsRequired: [],
      blockers: [
        "Required safety coverage is unknown or incomplete.",
        ...missingRequiredDomains.map(
          (domain) => `Missing required safety domain: ${domain}.`,
        ),
      ],
      checkedSafetyDomains,
      operatorSafetyStatus: report.summary.status,
      operatorSummary: riskyRequest
        ? "Onlyway Assistant refused escalation because required safety coverage is incomplete."
        : "Onlyway Assistant requires operator confirmation because safety coverage is incomplete.",
      recommendedNextActions: [
        "Provide current guardian coverage or explicitly confirm that this remains a bounded planning-only action.",
      ],
      safetyDecision: riskyRequest
        ? "unsafe_request_refused"
        : "operator_confirmation_required",
      status: riskyRequest ? "refused" : "attention_required",
    });
  }

  if (approvalsRequired.length > 0) {
    return baseResult(invocation, {
      approvalsRequired,
      blockers: [],
      checkedSafetyDomains,
      operatorSafetyStatus: report.summary.status,
      operatorSummary:
        "Onlyway Assistant validated the request boundary, but approval is required before any side-effecting or escalation behavior.",
      recommendedNextActions: [
        "Ask Fabio for explicit approval before executing or delegating the requested escalation.",
      ],
      safetyDecision:
        report.summary.status === "attention_required"
          ? "continue_with_attention"
          : report.summary.safetyToAutonomy,
      status: "attention_required",
    });
  }

  if (report.summary.status === "attention_required") {
    return baseResult(invocation, {
      approvalsRequired: [],
      blockers: [],
      checkedSafetyDomains,
      operatorSafetyStatus: report.summary.status,
      operatorSummary:
        "Onlyway Assistant accepted the bounded request with safety attention still visible to the operator.",
      recommendedNextActions: [
        "Proceed only inside current local, provider-neutral, side-effect-free boundaries.",
      ],
      safetyDecision: report.summary.safetyToAutonomy,
      status: "attention_required",
    });
  }

  return baseResult(invocation, {
    approvalsRequired: [],
    blockers: [],
    checkedSafetyDomains,
    operatorSafetyStatus: report.summary.status,
    operatorSummary:
      "Onlyway Assistant accepted the bounded operator request within the current safe runtime boundary.",
    recommendedNextActions: [
      "Proceed with a deterministic operator-facing response through existing MV AI OS boundaries.",
    ],
    safetyDecision: report.summary.safetyToAutonomy,
    status: "accepted",
  });
}

interface BaseResultOverrides {
  readonly approvalsRequired: readonly MainAssistantEscalationType[];
  readonly blockers: readonly string[];
  readonly checkedSafetyDomains: readonly MainAssistantSafetyDomain[];
  readonly operatorSafetyStatus: MainAssistantResult["operatorSafetyStatus"];
  readonly operatorSummary: string;
  readonly recommendedNextActions: readonly string[];
  readonly safetyDecision: MainAssistantResult["safetyDecision"];
  readonly status: MainAssistantResult["status"];
}

function baseResult(
  invocation: MainAssistantInvocation,
  overrides: BaseResultOverrides,
): MainAssistantResult {
  return {
    actorId: invocation.actorId,
    approvalRequired: overrides.approvalsRequired.length > 0,
    approvalsRequired: sortEscalations(overrides.approvalsRequired),
    assistantId: ONLY_WAY_ASSISTANT_ID,
    blockers: Object.freeze([...overrides.blockers]),
    checkedSafetyDomains: sortSafetyDomains(overrides.checkedSafetyDomains),
    contractVersion: MAIN_ASSISTANT_RUNTIME_CONTRACT_VERSION,
    correlationId: invocation.correlationId,
    generatedAt: invocation.requestedAt,
    intent: invocation.intent,
    invocationId: invocation.invocationId,
    operatorSafetyStatus: overrides.operatorSafetyStatus,
    operatorSummary: overrides.operatorSummary,
    recommendedDelegations: [],
    recommendedNextActions: Object.freeze([...overrides.recommendedNextActions]),
    safetyDecision: overrides.safetyDecision,
    status: overrides.status,
    workspaceId: invocation.workspaceId,
  };
}

function isRiskyRequest(invocation: MainAssistantInvocation): boolean {
  return (
    invocation.riskLevel !== "normal" ||
    invocation.requestedOperations.length > 0
  );
}

function isUnderSpecified(invocation: MainAssistantInvocation): boolean {
  return (
    countWords(invocation.objective) < 3 ||
    countWords(invocation.requestedOutcome) < 2
  );
}

function countWords(value: string): number {
  return value.trim().split(/\s+/u).filter((entry) => entry.length > 0).length;
}

function approvalsForOperations(
  operations: readonly MainAssistantEscalationType[],
  specification: MainAssistantSpecification,
): readonly MainAssistantEscalationType[] {
  const approved = new Set<MainAssistantEscalationType>();
  for (const requirement of specification.humanApprovalRequirements) {
    for (const operation of operations) {
      if (requirement.requiredFor.includes(operation)) {
        approved.add(operation);
      }
    }
  }
  return sortEscalations([...approved]);
}

function requiredDomainsForOperations(
  operations: readonly MainAssistantEscalationType[],
  specification: MainAssistantSpecification,
  riskyRequest: boolean,
): readonly MainAssistantSafetyDomain[] {
  const domains = new Set<MainAssistantSafetyDomain>();
  if (riskyRequest) {
    domains.add("operator_safety");
  }
  for (const requirement of specification.safetyPreflightRequirements) {
    if (
      operations.some((operation) =>
        requirement.requiredBefore.includes(operation),
      )
    ) {
      domains.add(requirement.domain);
    }
  }
  return sortSafetyDomains([...domains]);
}

function checkedDomainsFromReport(
  report: OperatorSafetyReport | undefined,
): readonly MainAssistantSafetyDomain[] {
  if (report === undefined) {
    return [];
  }
  return sortSafetyDomains([
    "operator_safety",
    ...report.summary.coverage.includedGuardians.map(
      (domain) => domain as MainAssistantSafetyDomain,
    ),
  ]);
}

function criticalDomainBlockers(
  report: OperatorSafetyReport,
): readonly string[] {
  return report.summary.criticalDomains.map(
    (domain) => `Critical safety domain: ${domain}.`,
  );
}

function sortEscalations(
  operations: readonly MainAssistantEscalationType[],
): readonly MainAssistantEscalationType[] {
  return Object.freeze(
    [...operations].sort(
      (left, right) =>
        ESCALATION_ORDER.indexOf(left) - ESCALATION_ORDER.indexOf(right),
    ),
  );
}

function sortSafetyDomains(
  domains: readonly MainAssistantSafetyDomain[],
): readonly MainAssistantSafetyDomain[] {
  return Object.freeze(
    [...new Set(domains)].sort(
      (left, right) =>
        SAFETY_DOMAIN_ORDER.indexOf(left) -
        SAFETY_DOMAIN_ORDER.indexOf(right),
    ),
  );
}
