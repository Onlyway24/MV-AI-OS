import { DEFAULT_AGENT_COMPANY_READINESS_INPUT, type AgentCompanyReadinessReviewInput } from "../assistants/agent-company-readiness-review.js";
import { DeterministicAgentCompanyReadinessEvaluator } from "../assistants/agent-company-readiness-review-service.js";
import type { AgentCompanyCapabilityId, AgentCompanyCapabilityRiskLevel } from "../assistants/agent-capability-registry.js";
import type { AgentCompanyRoleId } from "../assistants/agent-company-specification.js";
import type { AgentHandoffId } from "../assistants/agent-handoff-contracts.js";
import type { ResponsibilityAreaId } from "../assistants/inter-agent-responsibility-matrix.js";
import { FounderMissionBriefValidator } from "./founder-mission-brief-validator.js";
import type { FounderMissionBrief, FounderMissionType } from "./founder-mission-brief.js";
import { MISSION_PLAN_CONTRACT_VERSION, type MissionCostClass, type MissionEffortClass, type MissionPlan, type MissionPlanAgentReference, type MissionPlanStep, type MissionStepRiskLevel, type MissionStrategyOption } from "./mission-plan.js";
import { MissionPlanValidator } from "./mission-plan-validator.js";
import { MISSION_PLANNING_RESULT_CONTRACT_VERSION, type MissionPlanner, type MissionPlanningResult } from "./mission-planner.js";
import { MissionPlanningResultValidator } from "./mission-planner-validator.js";

interface ProfileStep {
  readonly capabilityIds: readonly AgentCompanyCapabilityId[];
  readonly costClass: MissionCostClass;
  readonly effortClass: MissionEffortClass;
  readonly expectedArtifact: string;
  readonly expectedSections: readonly string[];
  readonly handoffFromPrevious?: AgentHandoffId;
  readonly primaryAgentId: AgentCompanyRoleId;
  readonly purpose: string;
  readonly responsibilityAreaId: ResponsibilityAreaId;
  readonly slug: string;
  readonly title: string;
}

const PROFILES: Readonly<Record<FounderMissionType, readonly ProfileStep[]>> = {
  business_opportunity: [researchStep(), businessStep("business-opportunity", ["business-model-shaping", "mission-planning-support"], "research_to_business_strategy-handoff")],
  customer_delivery_preparation: [profileStep("delivery-package", "Prepare customer delivery package", "Create a review-ready delivery package without sending it.", "customer-delivery-agent", "customer-delivery-preparation", ["delivery-preparation", "fulfillment-checklist", "approval-ready-delivery-package"], "customer-delivery-package", ["deliverables", "missing inputs", "review status", "scope boundaries"], "high", "medium")],
  internal_operations: [engineeringStep("operations-improvement", "Prepare internal operations improvement")],
  market_research: [profileStep("market-research", "Prepare market evidence map", "Define competitors, market signals, customer needs, evidence gaps, and research boundaries.", "research-agent", "market-analysis", ["source-research", "competitor-research", "market-trend-mapping", "information-synthesis"], "market-research-brief", ["competitors", "evidence gaps", "market signals", "uncertainty"], "medium", "medium")],
  monetization_experiment: [researchStep(), businessStep("experiment-design", ["offer-design", "pricing-strategy-support"], "research_to_market_opportunity-handoff"), profileStep("finance-review", "Review experiment economics", "Review cost, budget impact, ROI assumptions, and pricing economics before Fabio decides.", "finance-cost-analyst", "pricing-support", ["cost-estimation", "roi-analysis", "budget-impact-review", "pricing-economics-support"], "monetization-economics-review", ["budget assumptions", "cost class", "pricing hypotheses", "risk notes"], "high", "medium", "business_to_pricing_review-handoff")],
  product_or_offer_design: [researchStep(), businessStep("offer-design", ["offer-design", "value-proposition-design"], "research_to_market_opportunity-handoff")],
  quality_improvement: [profileStep("quality-improvement", "Prepare quality improvement decision", "Identify specific output defects, acceptance criteria, and measurable remediation.", "content-director", "content-review", ["tone-message-quality-review", "quality-review-preparation"], "quality-improvement-brief", ["acceptance criteria", "defects", "remediation", "success measures"], "medium", "low")],
  risk_review: [profileStep("risk-review", "Prepare risk review", "Identify operational, claim, compliance, and escalation risks without providing binding legal approval.", "legal-risk-reviewer", "legal-risk-review", ["risk-identification", "compliance-sensitive-review", "legal-escalation-recommendation"], "risk-review-brief", ["blocked claims", "escalations", "risk findings", "safer options"], "high", "medium")],
  software_development: [engineeringStep("engineering-plan", "Prepare implementation plan")],
  content_strategy: [profileStep("content-strategy", "Prepare content strategy", "Create a target-specific content direction with concrete structure, value, evidence, and review boundaries.", "content-director", "content-direction", ["content-strategy", "carousel-structure", "script-direction", "tone-message-quality-review"], "content-strategy-brief", ["audience", "content structure", "evidence", "hooks", "quality boundaries"], "medium", "medium")],
};

export class DeterministicMissionPlanner implements MissionPlanner {
  readonly #briefValidator = new FounderMissionBriefValidator();
  readonly #company: AgentCompanyReadinessReviewInput;
  readonly #planValidator: MissionPlanValidator;
  readonly #resultValidator: MissionPlanningResultValidator;

  public constructor(company: AgentCompanyReadinessReviewInput = DEFAULT_AGENT_COMPANY_READINESS_INPUT) {
    this.#company = company;
    this.#planValidator = new MissionPlanValidator(company);
    this.#resultValidator = new MissionPlanningResultValidator(company);
  }

  public plan(brief: FounderMissionBrief): MissionPlanningResult {
    const briefValidation = this.#briefValidator.validate(brief);
    if (!briefValidation.ok) return this.#finalize({ assumptions: [], briefId: safeBriefId(brief), clarificationQuestions: [], contractVersion: MISSION_PLANNING_RESULT_CONTRACT_VERSION, nonExecuting: true, rejectionCodes: uniqueSorted(briefValidation.issues.map(({ code }) => `brief-${normalizeId(code)}`)), status: "REJECTED" });
    const validBrief = briefValidation.value;
    const readiness = new DeterministicAgentCompanyReadinessEvaluator().evaluate(this.#company);
    if (readiness.summary.status !== "READY") return this.#finalize({ assumptions: validBrief.assumptions, briefId: validBrief.briefId, clarificationQuestions: [], contractVersion: MISSION_PLANNING_RESULT_CONTRACT_VERSION, nonExecuting: true, rejectionCodes: ["agent-company-not-ready"], status: "REJECTED" });
    if (validBrief.clarificationQuestions.length > 0) return this.#finalize({ assumptions: validBrief.assumptions, briefId: validBrief.briefId, clarificationQuestions: validBrief.clarificationQuestions, contractVersion: MISSION_PLANNING_RESULT_CONTRACT_VERSION, nonExecuting: true, rejectionCodes: [], status: "CLARIFICATION_REQUIRED" });
    const generatedPlan = buildPlan(validBrief, this.#company, readiness.reportId);
    if (!this.#planValidator.validate(generatedPlan).ok) return this.#finalize({ assumptions: validBrief.assumptions, briefId: validBrief.briefId, clarificationQuestions: [], contractVersion: MISSION_PLANNING_RESULT_CONTRACT_VERSION, nonExecuting: true, rejectionCodes: ["generated-plan-invalid"], status: "REJECTED" });
    return this.#finalize({ assumptions: validBrief.assumptions, briefId: validBrief.briefId, clarificationQuestions: [], contractVersion: MISSION_PLANNING_RESULT_CONTRACT_VERSION, nonExecuting: true, plan: generatedPlan, rejectionCodes: [], status: "PLAN_READY" });
  }

  #finalize(result: MissionPlanningResult): MissionPlanningResult {
    const validation = this.#resultValidator.validate(result);
    if (!validation.ok) throw new Error("deterministic mission planner produced an invalid result");
    return deepFreeze(validation.value);
  }
}

function buildPlan(brief: FounderMissionBrief, company: AgentCompanyReadinessReviewInput, readinessReportId: string): MissionPlan {
  const profile = PROFILES[brief.missionType];
  const steps = profile.map((definition, index) => buildStep(definition, index, brief, company));
  const strategyOptions = buildStrategies(brief);
  const approvalQueue = steps.filter(({ approvalRequirements }) => approvalRequirements.length > 0).map((step) => ({ approvalId: `${step.stepId}-approval`, requiredFor: step.approvalRequirements, stepIds: [step.stepId] }));
  const guardianReviewQueue = steps.filter(({ guardianRequirements }) => guardianRequirements.length > 0).map((step) => ({ domains: step.guardianRequirements, reviewId: `${step.stepId}-guardian`, stepIds: [step.stepId] }));
  const plan: MissionPlan = {
    briefId: brief.briefId,
    companyReadinessReportId: readinessReportId,
    contractVersion: MISSION_PLAN_CONTRACT_VERSION,
    control: {
      approvalQueue,
      criticalRisks: uniqueSorted([...brief.unknowns.map(({ impact }) => impact), ...brief.constraints.filter(({ kind }) => kind === "limit").map(({ description }) => description)]),
      evidenceRequirements: brief.evidenceExpectation.sourceRequirements,
      externalActionBoundary: { externalExecutionAllowed: false, nonExecuting: true, requestedActionTypes: brief.externalActionRequests.map(({ actionType }) => actionType) },
      firstConcreteAction: steps[0]?.title ?? "Answer the blocking mission question.",
      guardianReviewQueue,
      minimumAcceptableQuality: brief.qualityStandard.minimumAcceptableOutcome,
      rejectionReasons: [],
      successMetrics: brief.successMetrics.map(({ measurement, target }) => `${measurement}: ${target}`),
      totalCostClass: maximumCost(steps.map(({ costClass }) => costClass)),
      totalEffortClass: maximumEffort(steps.map(({ effortClass }) => effortClass)),
    },
    nonExecuting: true,
    planId: `plan-${brief.briefId.replace("@", "-")}`,
    steps,
    strategyOptions,
    summary: {
      assumptions: brief.assumptions.map(({ statement }) => statement),
      businessOrOperatorValue: brief.objective.businessValues.join(", "),
      confidence: brief.unknowns.length === 0 ? "high" : "medium",
      expectedFinalResult: brief.objective.desiredOutcome,
      normalizedObjective: brief.objective.statement,
      recommendedDirection: strategyOptions.find(({ strategyKind }) => strategyKind === "RECOMMENDED")?.description ?? "Use the smallest safe planning path.",
      unresolvedQuestions: brief.clarificationQuestions.map(({ question }) => question),
    },
  };
  return plan;
}

function buildStep(definition: ProfileStep, index: number, brief: FounderMissionBrief, company: AgentCompanyReadinessReviewInput): MissionPlanStep {
  const role = company.agentCompanyMap.roles.find(({ roleId }) => roleId === definition.primaryAgentId);
  if (role === undefined) throw new Error("mission profile references an unavailable role");
  const capabilities = definition.capabilityIds.map((id) => company.capabilityRegistry.capabilities.find(({ capabilityId }) => capabilityId === id));
  if (capabilities.some((value) => value === undefined)) throw new Error("mission profile references an unavailable capability");
  const resolvedCapabilities = capabilities.filter((value): value is NonNullable<typeof value> => value !== undefined);
  const handoff = definition.handoffFromPrevious === undefined ? undefined : company.handoffContracts.handoffs.find(({ handoffId }) => handoffId === definition.handoffFromPrevious);
  const permissionRuleIds = definition.capabilityIds.map((capabilityId) => {
    const rule = company.permissionMatrix.permissionRules.find((candidate) => candidate.capabilityId === capabilityId);
    if (rule === undefined) throw new Error("mission profile capability has no permission declaration");
    return rule.permissionId;
  });
  const guardians = uniqueSorted([...resolvedCapabilities.flatMap((capability) => capability.guardianRequirements.flatMap(({ domains }) => domains)), ...(handoff?.guardianRequirements.flatMap(({ domains }) => domains) ?? [])]);
  const approvals = uniqueSorted([...resolvedCapabilities.flatMap((capability) => capability.approvalRequirements.flatMap(({ requiredFor }) => requiredFor)), ...(handoff?.approvalRequirements.flatMap(({ requiredFor }) => requiredFor) ?? []), ...(index === PROFILES[brief.missionType].length - 1 ? brief.approvalPolicy.approvalRequiredFor : [])]);
  const stepId = `${String(index + 1).padStart(2, "0")}-${definition.slug}`;
  return {
    approvalRequirements: approvals,
    capabilityIds: definition.capabilityIds,
    costClass: definition.costClass,
    dependencies: index === 0 ? [] : [`${String(index).padStart(2, "0")}-${PROFILES[brief.missionType][index - 1]?.slug ?? "previous"}`],
    effortClass: definition.effortClass,
    expectedOutput: { artifactType: definition.expectedArtifact, description: `${definition.title} produces a structured artifact for Fabio review.`, requiredSections: definition.expectedSections },
    failureConditions: ["Required inputs, evidence boundaries, or a useful structured output cannot be defined."],
    guardianRequirements: guardians,
    handoffIds: handoff === undefined ? [] : [handoff.handoffId],
    nonExecuting: true,
    order: index + 1,
    permissionRuleIds,
    primaryAgent: agentReference(role.roleId, role.futureAgentSpecification.specificationId, role.futureAgentSpecification.version),
    purpose: definition.purpose,
    requiredInputs: index === 0 ? ["validated Founder Mission Brief"] : [`${String(index).padStart(2, "0")}-${PROFILES[brief.missionType][index - 1]?.slug ?? "previous"} output`],
    responsibilityAreaId: definition.responsibilityAreaId,
    riskLevel: maximumRisk(resolvedCapabilities.map(({ riskLevel }) => riskLevel)),
    stepId,
    stopConditions: ["Stop if the step would require undeclared capability, evidence fabrication, or external execution."],
    successCriteria: [`Produce ${definition.expectedArtifact} with every required section and explicit uncertainty.`],
    supportingAgents: [],
    title: definition.title,
  };
}

function buildStrategies(brief: FounderMissionBrief): readonly MissionStrategyOption[] {
  const options: MissionStrategyOption[] = [{ compromises: [], description: "Use the smallest sufficient Agent Company team to create the requested evidence and decision artifacts.", optionId: "recommended-smallest-safe-team", strategyKind: "RECOMMENDED", valueRationale: "Balances value, quality, feasibility, cost, and controlled risk." }];
  if ((brief.budget.status === "known" && (brief.budget.maximumAmount ?? Number.POSITIVE_INFINITY) <= 100) || brief.priority === "critical") options.push({ compromises: ["Narrower evidence depth and fewer optional outputs."], description: "Use a rapid validation path focused on the minimum decision-changing evidence.", optionId: "rapid-minimum-validation", strategyKind: "RAPID", valueRationale: "Reduces time and relative cost while keeping the first decision safe." });
  if (brief.originalityStandard.level === "high" && ["business_opportunity", "content_strategy", "monetization_experiment", "product_or_offer_design"].includes(brief.missionType)) options.push({ compromises: ["Higher evidence burden and review effort."], description: "Compare the obvious baseline with a target-specific differentiated option before recommendation.", optionId: "bold-differentiated-option", strategyKind: "BOLD", valueRationale: "Creates useful differentiation only when feasibility and evidence support it." });
  return options.sort((left, right) => left.optionId.localeCompare(right.optionId));
}

function researchStep(): ProfileStep { return profileStep("research-brief", "Prepare evidence brief", "Separate known facts, assumptions, market questions, and evidence gaps before business decisions.", "research-agent", "research", ["source-research", "information-synthesis"], "research-brief", ["evidence gaps", "known facts", "research questions", "uncertainty"], "medium", "low"); }
function businessStep(slug: string, capabilities: readonly AgentCompanyCapabilityId[], handoff: AgentHandoffId): ProfileStep { return profileStep(slug, "Prepare business decision", "Convert bounded evidence into a specific value proposition, decision, success measure, and next action.", "business-agent", "business-strategy", capabilities, "business-decision-brief", ["first action", "recommendation", "risks", "success measures"], "medium", "low", handoff); }
function engineeringStep(slug: string, title: string): ProfileStep { return profileStep(slug, title, "Define architecture, affected components, tests, safety invariants, acceptance criteria, verification, and rollback boundaries without deployment.", "developer-agent", "implementation-planning", ["implementation-planning", "technical-architecture-support", "code-change-planning", "test-planning-support"], "engineering-plan", ["acceptance criteria", "affected components", "rollback boundary", "safety invariants", "tests", "verification"], "high", "medium"); }
function profileStep(slug: string, title: string, purpose: string, primaryAgentId: AgentCompanyRoleId, responsibilityAreaId: ResponsibilityAreaId, capabilityIds: readonly AgentCompanyCapabilityId[], expectedArtifact: string, expectedSections: readonly string[], effortClass: MissionEffortClass, costClass: MissionCostClass, handoffFromPrevious?: AgentHandoffId): ProfileStep { return { capabilityIds, costClass, effortClass, expectedArtifact, expectedSections, ...(handoffFromPrevious === undefined ? {} : { handoffFromPrevious }), primaryAgentId, purpose, responsibilityAreaId, slug, title }; }
function agentReference(agentId: AgentCompanyRoleId, specificationId: string, version: string): MissionPlanAgentReference { return { agentId, specificationId, version }; }
function maximumRisk(values: readonly AgentCompanyCapabilityRiskLevel[]): MissionStepRiskLevel { return values.includes("high") ? "high" : values.includes("medium") ? "medium" : "low"; }
function maximumEffort(values: readonly MissionEffortClass[]): MissionEffortClass { return values.includes("high") ? "high" : values.includes("medium") ? "medium" : "low"; }
function maximumCost(values: readonly MissionCostClass[]): MissionCostClass { return values.includes("unknown") ? "unknown" : values.includes("high") ? "high" : values.includes("medium") ? "medium" : values.includes("low") ? "low" : "minimal"; }
function safeBriefId(brief: FounderMissionBrief): string { return typeof brief.briefId === "string" && /^[a-z0-9][a-z0-9@._-]*$/u.test(brief.briefId) ? brief.briefId : "invalid-founder-mission-brief"; }
function normalizeId(value: string): string { const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, ""); return normalized.length === 0 ? "invalid" : normalized; }
function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] { return [...new Set(values)].sort((left, right) => left.localeCompare(right)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const entry of Object.values(value)) deepFreeze(entry); return value; }
