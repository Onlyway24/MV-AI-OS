import { MissionQualityGateInputValidator, MissionQualityGateReportValidator } from "./mission-quality-gate-validator.js";
import {
  MISSION_QUALITY_DIMENSIONS,
  MISSION_QUALITY_GATE_CONTRACT_VERSION,
  type MissionQualityDimension,
  type MissionQualityDimensionScore,
  type MissionQualityFinding,
  type MissionQualityGate,
  type MissionQualityGateInput,
  type MissionQualityGateReport,
} from "./mission-quality-gate.js";
import type { MissionPlan } from "./mission-plan.js";

const GENERIC_DIRECTIVE = /\b(?:do work|handle (?:the )?task|improve things|support(?: the)? task|generic|various tasks|as needed|etc\.?|tbd)\b/iu;
const EXTERNAL_ACTION = /(?:publish|publication|send|outreach|contact|delivery|sale)/iu;
const EVIDENCE_LANGUAGE = /(?:evidence|fact|source|uncertainty|research)/iu;

const REMEDIATION: Readonly<Record<MissionQualityDimension, string>> = {
  actionability: "Define concrete inputs, success criteria, stop conditions, and the first bounded action.",
  clarity: "Replace generic directives with a specific target, responsible agent, and bounded purpose.",
  differentiation: "State one evidence-testable difference from the obvious baseline and its tradeoff.",
  evidence_uncertainty: "Separate evidence needs from assumptions and avoid confidence that the plan cannot support.",
  feasibility: "Reduce scope, effort, or cost until the plan has a bounded path to a decision.",
  founder_alignment: "Tie the plan to the validated Founder Mission Brief, audience, and intended decision.",
  manual_work_efficiency: "Remove unnecessary handoffs or steps while preserving the required controls.",
  safety_control: "Add the exact approval and guardian controls required before any external or sensitive action.",
  specificity: "Define a concrete deliverable, evidence requirement, metric, decision, and execution boundary.",
  value: "State the operator or business value, measurable result, and decision the output enables.",
};

const STRENGTH: Readonly<Record<MissionQualityDimension, string>> = {
  actionability: "Concrete inputs, success criteria, stop conditions, and a first action are declared.",
  clarity: "Each step has a bounded purpose and a named accountable agent.",
  differentiation: "The recommended direction states a deliberate value rationale and tradeoff.",
  evidence_uncertainty: "The plan separates evidence needs from uncertainty before a decision.",
  feasibility: "Scope, effort, cost, and risks remain bounded for a non-executing plan.",
  founder_alignment: "The plan is anchored to the Founder Mission Brief as an explicit input.",
  manual_work_efficiency: "The plan uses a small, ordered team with no execution steps.",
  safety_control: "Approval, guardian, and non-execution controls are complete.",
  specificity: "The plan declares usable outputs, evidence needs, and measurable success.",
  value: "The plan declares a concrete operator or business outcome.",
};

export class MissionQualityGateValidationError extends Error {
  public constructor(
    message: string,
    public readonly issues: readonly { readonly code: string; readonly path: string }[],
  ) {
    super(message);
    this.name = "MissionQualityGateValidationError";
  }
}

export class DeterministicMissionQualityGate implements MissionQualityGate {
  readonly #inputValidator = new MissionQualityGateInputValidator();
  readonly #reportValidator = new MissionQualityGateReportValidator();

  public evaluate(input: MissionQualityGateInput): MissionQualityGateReport {
    const validated = this.#inputValidator.validate(input);
    if (!validated.ok) {
      throw new MissionQualityGateValidationError(
        "Mission Quality Gate input is invalid.",
        validated.issues.map(({ code, path }) => ({ code, path })),
      );
    }

    const report = evaluatePlan(validated.value.plan);
    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new MissionQualityGateValidationError(
        "Mission Quality Gate generated an invalid report.",
        reportValidation.issues.map(({ code, path }) => ({ code, path })),
      );
    }
    return deepFreeze(reportValidation.value);
  }
}

function evaluatePlan(plan: MissionPlan): MissionQualityGateReport {
  const genericDirective = containsGenericDirective(plan);
  const usefulOutputs = hasUsefulOutputs(plan);
  const completeDirective = hasCompleteDirective(plan, usefulOutputs, genericDirective);
  const externalSafetyDefects = findSafetyDefects(plan);
  const allRequirementsCovered = hasCompleteStepControls(plan);

  const scores = MISSION_QUALITY_DIMENSIONS.map((dimension) => {
    const score = scoreDimension(
      dimension,
      plan,
      genericDirective,
      usefulOutputs,
      completeDirective,
      externalSafetyDefects.length === 0 && allRequirementsCovered,
    );
    return {
      dimension,
      evidenceCodes: evidenceCodes(dimension, plan, genericDirective, usefulOutputs, completeDirective, externalSafetyDefects.length === 0 && allRequirementsCovered),
      score,
    } satisfies MissionQualityDimensionScore;
  });

  const blockingDefects = externalSafetyDefects.map((code) => finding(
    code,
    "safety_control",
    "blocking",
    "A required safety or approval control is missing from the non-executing plan.",
    REMEDIATION.safety_control,
  ));
  const warnings: MissionQualityFinding[] = [];
  if (genericDirective || !completeDirective) {
    warnings.push(finding(
      "anti-slop-incomplete-directive",
      "clarity",
      "warning",
      "The plan lacks one or more specific directive elements required for an accountable decision.",
      REMEDIATION.specificity,
    ));
  }
  if (genericDirective) {
    warnings.push(finding(
      "generic-filler",
      "clarity",
      "warning",
      "The plan contains generic filler rather than a bounded operator-facing directive.",
      REMEDIATION.clarity,
    ));
  }
  if (hasBoldOption(plan) && scores.find(({ dimension }) => dimension === "feasibility")?.score !== 8) {
    warnings.push(finding(
      "originality-does-not-compensate",
      "differentiation",
      "warning",
      "A differentiated option cannot compensate for an infeasible or insufficiently evidenced plan.",
      REMEDIATION.feasibility,
    ));
  }
  if (plan.summary.confidence === "high" && !hasEvidenceBoundary(plan)) {
    warnings.push(finding(
      "unsupported-certainty",
      "evidence_uncertainty",
      "warning",
      "A planning artifact cannot claim high confidence before its declared evidence work is complete.",
      REMEDIATION.evidence_uncertainty,
    ));
  }

  const weaknesses = scores
    .filter(({ score }) => score < 7)
    .map(({ dimension }) => finding(
      `low-${dimension.replace(/_/gu, "-")}`,
      dimension,
      dimension === "safety_control" && blockingDefects.length > 0 ? "blocking" : "warning",
      `The ${dimension.replace(/_/gu, " ")} dimension is below the required release threshold.`,
      REMEDIATION[dimension],
    ));
  const strengths = scores
    .filter(({ score }) => score >= 8)
    .map(({ dimension }) => finding(
      `strong-${dimension.replace(/_/gu, "-")}`,
      dimension,
      "info",
      STRENGTH[dimension],
      "Preserve this control or quality characteristic while remediating weaker dimensions.",
    ));

  const totalScore = scores.reduce((sum, { score }) => sum + score, 0);
  const approvalReady =
    totalScore >= 82 &&
    scores.every(({ score }) => score >= 7) &&
    blockingDefects.length === 0 &&
    usefulOutputs &&
    allRequirementsCovered &&
    !genericDirective;
  const status = blockingDefects.length > 0
    ? "BLOCKED"
    : approvalReady
      ? "APPROVAL_READY"
      : "REMEDIATION_REQUIRED";
  const releaseRecommendation = status === "BLOCKED"
    ? "DO_NOT_RELEASE"
    : status === "APPROVAL_READY"
      ? "APPROVE_FOR_FABIO_REVIEW"
      : "REMEDIATE_BEFORE_REVIEW";
  const remediationRecommendations = uniqueSorted([
    ...blockingDefects,
    ...weaknesses,
    ...warnings,
  ].map(({ recommendation }) => recommendation));

  return {
    blockingDefects: sortedFindings(blockingDefects),
    contractVersion: MISSION_QUALITY_GATE_CONTRACT_VERSION,
    nonExecuting: true,
    planId: plan.planId,
    releaseRecommendation,
    remediationRecommendations,
    scores,
    status,
    strengths: sortedFindings(strengths),
    totalScore,
    warnings: sortedFindings(warnings),
    weaknesses: sortedFindings(weaknesses),
  };
}

function scoreDimension(
  dimension: MissionQualityDimension,
  plan: MissionPlan,
  genericDirective: boolean,
  usefulOutputs: boolean,
  completeDirective: boolean,
  controlsComplete: boolean,
): number {
  switch (dimension) {
    case "clarity":
      return !genericDirective && completeDirective ? 8 : 3;
    case "specificity":
      return usefulOutputs && plan.control.evidenceRequirements.length > 0 && plan.control.successMetrics.length > 0 ? 9 : 4;
    case "actionability":
      return hasActionableSteps(plan) && completeDirective ? 9 : 4;
    case "value":
      return hasConcreteValue(plan) ? 8 : 3;
    case "differentiation":
      return hasBoldOption(plan) ? 9 : hasRecommendedTradeoff(plan) ? 7 : 4;
    case "founder_alignment":
      return plan.steps.some((step) => step.requiredInputs.some((input) => /founder mission brief/iu.test(input))) && hasBoundedText(plan.summary.normalizedObjective) && hasBoundedText(plan.summary.recommendedDirection) ? 9 : 3;
    case "feasibility":
      if (plan.control.totalCostClass === "high" || plan.control.totalCostClass === "unknown" || plan.steps.length > 4) return 3;
      return plan.control.totalCostClass === "medium" || plan.control.totalEffortClass === "high" ? 7 : 8;
    case "manual_work_efficiency":
      return plan.steps.length <= 3 && plan.control.totalEffortClass !== "high" ? 8 : 4;
    case "evidence_uncertainty":
      return hasEvidenceBoundary(plan) ? 8 : 3;
    case "safety_control":
      return controlsComplete ? 8 : 0;
  }
}

function evidenceCodes(
  dimension: MissionQualityDimension,
  plan: MissionPlan,
  genericDirective: boolean,
  usefulOutputs: boolean,
  completeDirective: boolean,
  controlsComplete: boolean,
): readonly string[] {
  switch (dimension) {
    case "clarity": return genericDirective || !completeDirective ? ["anti-slop-gap"] : ["bounded-directives"];
    case "specificity": return usefulOutputs && plan.control.successMetrics.length > 0 ? ["defined-deliverables-and-metrics"] : ["missing-output-or-metric"];
    case "actionability": return hasActionableSteps(plan) && completeDirective ? ["actionable-step-controls"] : ["missing-action-controls"];
    case "value": return hasConcreteValue(plan) ? ["declared-operator-value"] : ["unclear-operator-value"];
    case "differentiation": return hasBoldOption(plan) ? ["evidence-gated-differentiation"] : hasRecommendedTradeoff(plan) ? ["declared-tradeoff"] : ["missing-differentiation"];
    case "founder_alignment": return plan.steps.some((step) => step.requiredInputs.some((input) => /founder mission brief/iu.test(input))) ? ["founder-brief-input"] : ["missing-founder-brief-input"];
    case "feasibility": return plan.control.totalCostClass !== "high" && plan.control.totalCostClass !== "unknown" && plan.control.totalEffortClass !== "high" ? ["bounded-scope"] : ["excessive-cost-or-effort"];
    case "manual_work_efficiency": return plan.steps.length <= 3 && plan.control.totalEffortClass !== "high" ? ["small-sufficient-team"] : ["excessive-manual-work"];
    case "evidence_uncertainty": return hasEvidenceBoundary(plan) ? ["evidence-boundary"] : ["unsupported-certainty"];
    case "safety_control": return controlsComplete ? ["complete-nonexecution-controls"] : ["missing-safety-control"];
  }
}

function hasCompleteDirective(plan: MissionPlan, usefulOutputs: boolean, genericDirective: boolean): boolean {
  return !genericDirective &&
    plan.steps.every((step) => step.primaryAgent.agentId.length > 0 && hasBoundedText(step.purpose)) &&
    usefulOutputs &&
    plan.control.evidenceRequirements.length > 0 &&
    plan.control.successMetrics.length > 0 &&
    hasBoundedText(plan.summary.expectedFinalResult) &&
    hasBoundedText(plan.summary.recommendedDirection);
}

function hasUsefulOutputs(plan: MissionPlan): boolean {
  return plan.steps.every((step) =>
    hasBoundedText(step.expectedOutput.description) &&
    step.expectedOutput.requiredSections.length >= 2 &&
    step.expectedOutput.requiredSections.every((section) => hasUsefulSection(section)),
  );
}

function hasActionableSteps(plan: MissionPlan): boolean {
  return hasActionText(plan.control.firstConcreteAction) && plan.steps.every((step) =>
    step.requiredInputs.length > 0 &&
    step.successCriteria.length > 0 &&
    step.stopConditions.length > 0,
  );
}

function hasConcreteValue(plan: MissionPlan): boolean {
  return hasBoundedText(plan.summary.businessOrOperatorValue) &&
    hasBoundedText(plan.summary.expectedFinalResult) &&
    plan.control.successMetrics.length > 0 &&
    !GENERIC_DIRECTIVE.test(plan.summary.businessOrOperatorValue);
}

function hasRecommendedTradeoff(plan: MissionPlan): boolean {
  return plan.strategyOptions.some((option) =>
    option.strategyKind === "RECOMMENDED" &&
    hasBoundedText(option.description) &&
    hasBoundedText(option.valueRationale),
  );
}

function hasBoldOption(plan: MissionPlan): boolean {
  return plan.strategyOptions.some(({ strategyKind }) => strategyKind === "BOLD");
}

function hasEvidenceBoundary(plan: MissionPlan): boolean {
  return plan.control.evidenceRequirements.length > 0 && plan.steps.every((step) =>
    step.expectedOutput.requiredSections.some((section) => EVIDENCE_LANGUAGE.test(section)) ||
    [...step.failureConditions, ...step.stopConditions].some((condition) => EVIDENCE_LANGUAGE.test(condition)),
  );
}

function hasCompleteStepControls(plan: MissionPlan): boolean {
  return plan.steps.every((step) =>
    step.approvalRequirements.every((approval) => plan.control.approvalQueue.some((entry) => entry.stepIds.includes(step.stepId) && entry.requiredFor.includes(approval))) &&
    step.guardianRequirements.every((guardian) => plan.control.guardianReviewQueue.some((entry) => entry.stepIds.includes(step.stepId) && entry.domains.includes(guardian))),
  );
}

function findSafetyDefects(plan: MissionPlan): readonly string[] {
  const defects: string[] = [];
  if (!hasCompleteStepControls(plan)) defects.push("incomplete-step-controls");
  const requested = plan.control.externalActionBoundary.requestedActionTypes;
  if (requested.length > 0) {
    const approvals = new Set(plan.control.approvalQueue.flatMap((entry) => entry.requiredFor));
    if (!approvals.has("external_side_effect")) defects.push("missing-external-side-effect-approval");
    if (requested.some((action) => EXTERNAL_ACTION.test(action)) && !approvals.has("publish_or_send")) defects.push("missing-publish-or-send-approval");
  }
  return uniqueSorted(defects);
}

function containsGenericDirective(plan: MissionPlan): boolean {
  const text = [
    plan.summary.businessOrOperatorValue,
    plan.summary.expectedFinalResult,
    plan.summary.normalizedObjective,
    plan.summary.recommendedDirection,
    plan.control.firstConcreteAction,
    ...plan.steps.flatMap((step) => [
      step.title,
      step.purpose,
      step.expectedOutput.description,
    ]),
  ];
  return text.some((entry) => GENERIC_DIRECTIVE.test(entry) || entry.trim().length < 12) ||
    plan.steps.some((step) => step.expectedOutput.requiredSections.some((section) => GENERIC_DIRECTIVE.test(section)));
}

function hasBoundedText(value: string): boolean {
  return value.trim().length >= 24 && !GENERIC_DIRECTIVE.test(value);
}

function hasActionText(value: string): boolean {
  return value.trim().length >= 10 && !GENERIC_DIRECTIVE.test(value);
}

function hasUsefulSection(value: string): boolean {
  return value.trim().length >= 3 && !GENERIC_DIRECTIVE.test(value);
}

function finding(
  code: string,
  dimension: MissionQualityDimension,
  severity: MissionQualityFinding["severity"],
  message: string,
  recommendation: string,
): MissionQualityFinding {
  return { code, dimension, message, recommendation, severity };
}

function sortedFindings(findings: readonly MissionQualityFinding[]): readonly MissionQualityFinding[] {
  return [...findings].sort((left, right) => left.code.localeCompare(right.code));
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value)) deepFreeze(entry);
  return value;
}
