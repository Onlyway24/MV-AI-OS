import { createHash } from "node:crypto";

import { BUSINESS_SCORE_CRITERIA, type BusinessArtifact, type BusinessMissionDossier, type BusinessMissionExecutionInput, type BusinessMissionReviewRequest } from "./business-mission.js";
import { BUSINESS_SCORE_WEIGHTS } from "./deterministic-opportunity-scorer.js";
import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";

const ID = /^[a-zA-Z0-9@._:-]{1,128}$/u;
const TEXT_MAX = 8_000;

export class BusinessMissionExecutionInputValidator implements Validator<BusinessMissionExecutionInput> {
  public validate(value: unknown): ValidationResult<BusinessMissionExecutionInput> {
    if (!record(value) || !mission(value.mission) || !Array.isArray(value.candidates) || value.candidates.length !== 3 || !value.candidates.every(candidate) || new Set(value.candidates.map((entry) => record(entry) ? entry.opportunityId : undefined)).size !== 3 || !commercialPlan(value.commercialPlan)) return invalid("Business Mission execution input is invalid");
    const plan = value.commercialPlan as Record<string, unknown>;
    const offer = plan.offer as Record<string, unknown>;
    if (!value.candidates.some((entry) => record(entry) && entry.opportunityId === offer.opportunityId)) return invalid("Business Mission commercial plan does not target a candidate");
    return valid(value as unknown as BusinessMissionExecutionInput);
  }
}

export class BusinessMissionReviewRequestValidator implements Validator<BusinessMissionReviewRequest> {
  public validate(value: unknown): ValidationResult<BusinessMissionReviewRequest> {
    if (!record(value) || !exactKeys(value, ["decision", "expectedVersion", "missionId", "note"]) || !["APPROVED", "REJECTED", "REVISION_REQUESTED"].includes(String(value.decision)) || !integer(value.expectedVersion, 0, Number.MAX_SAFE_INTEGER) || !id(value.missionId) || !text(value.note, 1, 2_000)) return invalid("Business Mission review request is invalid");
    return valid(value as unknown as BusinessMissionReviewRequest);
  }
}

export class BusinessMissionDossierValidator implements Validator<BusinessMissionDossier> {
  readonly #input = new BusinessMissionExecutionInputValidator();
  public validate(value: unknown): ValidationResult<BusinessMissionDossier> {
    if (!record(value) || value.contractVersion !== "1" || !id(value.actorId) || !id(value.workspaceId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !["APPROVED", "BLOCKED", "PENDING_FABIO_APPROVAL", "REJECTED", "REVISION_REQUESTED"].includes(String(value.status)) || value.externalActionsExecuted !== false || !hash(value.fingerprint)) return invalid("Business Mission dossier is invalid");
    const input = this.#input.validate({ candidates: value.candidates, commercialPlan: value.commercialPlan, mission: value.mission });
    if (!input.ok || !text(value.selectionExplanation, 1, TEXT_MAX)) return invalid("Business Mission dossier payload is invalid");
    const candidateIds = new Set(input.value.candidates.map(({ opportunityId }) => opportunityId));
    const packIds = input.value.candidates.map(({ evidencePackId }) => evidencePackId);
    if (!stringSetEquals(value.evidencePackIds, packIds) || !scorecards(value.scorecards, candidateIds, new Set(packIds)) || !economicsResults(value.economics) || !gates(value.gates)) return invalid("Business Mission dossier governed results are invalid");
    if (value.selectedOpportunityId !== undefined && (!id(value.selectedOpportunityId) || !candidateIds.has(value.selectedOpportunityId))) return invalid("Business Mission selected opportunity is invalid");
    if (value.status !== "BLOCKED" && value.selectedOpportunityId === undefined) return invalid("Business Mission decision is missing");
    if (!artifacts(value.artifacts, input.value.mission.missionId, value.selectedOpportunityId, packIds, value.status === "BLOCKED")) return invalid("Business Mission artifacts are invalid");
    if (!reviewState(value)) return invalid("Business Mission review state is invalid");
    const immutable = dossierFingerprint(value as unknown as BusinessMissionDossier);
    if (immutable !== value.fingerprint) return invalid("Business Mission dossier fingerprint is invalid");
    return valid(value as unknown as BusinessMissionDossier);
  }
}

const CONFIDENCE_FACTORS = Object.freeze({ HIGH: 1, LOW: 0.5, MEDIUM: 0.75, NONE: 0 } as const);
const ARTIFACT_MEDIA = Object.freeze({
  ECONOMICS_SHEET: "text/csv",
  EMAIL_SEQUENCE: "text/plain",
  FAQ: "text/markdown",
  LANDING_COPY: "text/plain",
  OFFER_DOCUMENT: "text/markdown",
  OPPORTUNITY_REPORT: "text/markdown",
  OUTREACH_SCRIPT: "text/plain",
  PRESENTATION: "text/html",
  SOCIAL_SUPPORT: "text/plain",
  VALIDATION_PLAN: "application/json",
} as const);

function scorecards(value: unknown, candidateIds: ReadonlySet<string>, packIds: ReadonlySet<string>): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const opportunities = new Set<string>();
  return value.every((card) => {
    if (!record(card) || !id(card.opportunityId) || opportunities.has(card.opportunityId) || !candidateIds.has(card.opportunityId) || !id(card.evidencePackId) || !packIds.has(card.evidencePackId) || !hash(card.evidencePackFingerprint) || typeof card.complete !== "boolean" || !Array.isArray(card.criteria) || card.criteria.length !== BUSINESS_SCORE_CRITERIA.length) return false;
    opportunities.add(card.opportunityId);
    const seen = new Set<string>();
    let total = 0;
    let adjusted = 0;
    let complete = true;
    for (const criterion of card.criteria) {
      if (!record(criterion) || !BUSINESS_SCORE_CRITERIA.includes(criterion.criterion as never) || seen.has(String(criterion.criterion)) || !number(criterion.weight, 1, 100) || criterion.weight !== BUSINESS_SCORE_WEIGHTS[criterion.criterion as keyof typeof BUSINESS_SCORE_WEIGHTS] || !["ASSUMPTION", "ESTIMATE", "MISSING", "REAL"].includes(String(criterion.dataKind)) || !["HIGH", "LOW", "MEDIUM", "NONE"].includes(String(criterion.confidence)) || !text(criterion.formula, 1, 2_000)) return false;
      seen.add(String(criterion.criterion));
      if (criterion.dataKind === "MISSING") {
        if (criterion.value !== undefined || criterion.evidenceId !== undefined || criterion.weightedContribution !== undefined || criterion.confidence !== "NONE") return false;
        complete = false;
        continue;
      }
      if (!number(criterion.value, 0, 100) || (criterion.evidenceId !== undefined && !id(criterion.evidenceId))) return false;
      const contribution = round(criterion.value * criterion.weight / 100);
      if (criterion.weightedContribution !== contribution) return false;
      total += contribution;
      adjusted += contribution * CONFIDENCE_FACTORS[criterion.confidence as keyof typeof CONFIDENCE_FACTORS];
    }
    if (card.complete !== complete) return false;
    if (!complete) return card.totalScore === undefined && card.confidenceAdjustedScore === undefined;
    return card.totalScore === round(total) && card.confidenceAdjustedScore === round(adjusted);
  });
}

function economicsResults(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const scenarios = new Set<string>();
  const fields = ["breakEvenClients", "contributionMarginCents", "fixedCostsCents", "grossMarginCents", "maximumSustainableCacCents", "netRevenueCents", "paybackMonths", "revenueCents", "variableCostsCents"];
  const valid = value.every((scenario) => {
    if (!record(scenario) || !["AMBITIOUS", "BASE", "PRUDENT"].includes(String(scenario.name)) || scenarios.has(String(scenario.name)) || !strings(scenario.sensitivity, 1, 20)) return false;
    scenarios.add(String(scenario.name));
    return fields.every((field) => calculatedValue(scenario[field]));
  });
  return valid && ["AMBITIOUS", "BASE", "PRUDENT"].every((name) => scenarios.has(name));
}

function calculatedValue(value: unknown): boolean {
  if (!record(value) || !text(value.formula, 1, 2_000) || !["CALCULATED", "NOT_AVAILABLE"].includes(String(value.status))) return false;
  return value.status === "CALCULATED" ? number(value.value, -1_000_000_000_000, 1_000_000_000_000) : value.value === undefined;
}

function gates(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const names = new Set<string>();
  const valid = value.every((entry) => {
    if (!record(entry) || !["COST", "QUALITY", "RISK"].includes(String(entry.name)) || names.has(String(entry.name)) || !number(entry.score, 0, 100) || !["BLOCKED", "PASSED"].includes(String(entry.status)) || !strings(entry.findings, 0, 30)) return false;
    names.add(String(entry.name)); return true;
  });
  return valid && ["COST", "QUALITY", "RISK"].every((name) => names.has(name));
}

function artifacts(value: unknown, missionId: string, opportunityId: unknown, packIds: readonly string[], blocked: boolean): boolean {
  if (!Array.isArray(value) || (value.length !== 10 && !(blocked && value.length === 0))) return false;
  if (value.length === 0) return true;
  if (!id(opportunityId)) return false;
  const kinds = new Set<string>();
  const artifactIds = new Set<string>();
  const valid = value.every((entry) => {
    if (!record(entry) || !id(entry.artifactId) || artifactIds.has(entry.artifactId) || !Object.hasOwn(ARTIFACT_MEDIA, String(entry.kind)) || kinds.has(String(entry.kind)) || entry.mediaType !== ARTIFACT_MEDIA[entry.kind as keyof typeof ARTIFACT_MEDIA] || !text(entry.content, 1, 200_000) || entry.agent !== "artifact-producer@1.0.0" || entry.version !== 0 || entry.reviewStatus !== "PENDING" || entry.approvalStatus !== "PENDING" || entry.missionId !== missionId || entry.opportunityId !== opportunityId || !stringSetEquals(entry.evidencePackIds, packIds) || !hash(entry.fingerprint)) return false;
    kinds.add(String(entry.kind)); artifactIds.add(entry.artifactId);
    return entry.fingerprint === artifactFingerprint(entry as unknown as BusinessArtifact);
  });
  return valid && Object.keys(ARTIFACT_MEDIA).every((kind) => kinds.has(kind));
}

function artifactFingerprint(artifact: BusinessArtifact): string {
  const value = { content: artifact.content, kind: artifact.kind, mediaType: artifact.mediaType, evidencePackIds: artifact.evidencePackIds, missionId: artifact.missionId, opportunityId: artifact.opportunityId, artifactId: artifact.artifactId };
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function reviewState(value: Record<string, unknown>): boolean {
  if (value.status === "BLOCKED" || value.status === "PENDING_FABIO_APPROVAL") return value.version === 0 && value.review === undefined;
  if (!record(value.review) || value.version !== 1 || value.review.decision !== value.status || !text(value.review.note, 1, 2_000) || !timestamp(value.review.reviewedAt) || !id(value.review.reviewedBy)) return false;
  return value.updatedAt === value.review.reviewedAt;
}

function stringSetEquals(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every(id) && new Set(value).size === value.length && expected.every((entry) => value.includes(entry));
}

export function dossierFingerprint(value: Omit<BusinessMissionDossier, "fingerprint" | "review" | "status" | "updatedAt" | "version"> | BusinessMissionDossier): string {
  const candidate = value as BusinessMissionDossier;
  const immutable = {
    actorId: candidate.actorId,
    artifacts: candidate.artifacts,
    candidates: candidate.candidates,
    commercialPlan: candidate.commercialPlan,
    contractVersion: candidate.contractVersion,
    createdAt: candidate.createdAt,
    economics: candidate.economics,
    evidencePackIds: candidate.evidencePackIds,
    externalActionsExecuted: candidate.externalActionsExecuted,
    gates: candidate.gates,
    mission: candidate.mission,
    scorecards: candidate.scorecards,
    selectedOpportunityId: candidate.selectedOpportunityId,
    selectionExplanation: candidate.selectionExplanation,
    workspaceId: candidate.workspaceId,
  };
  return createHash("sha256").update(JSON.stringify(immutable), "utf8").digest("hex");
}

function mission(value: unknown): boolean {
  if (!record(value) || !id(value.missionId) || !text(value.objective, 1, 4_000) || !integer(value.maxCapitalCents, 0, 1_000_000_000) || !integer(value.availableDays, 1, 3_650) || !strings(value.competencies, 0, 30) || !strings(value.assets, 0, 30) || !["HIGH", "LOW", "MEDIUM"].includes(String(value.riskTolerance)) || !text(value.geography, 1, 500) || !["B2B", "B2C", "BOTH"].includes(String(value.customerModel)) || !strings(value.revenueModels, 1, 20) || !strings(value.forbiddenActions, 1, 30) || !record(value.minimumThresholds)) return false;
  const thresholds = value.minimumThresholds;
  return integer(thresholds.maxValidationDays, 1, 3_650) && integer(thresholds.minGrossMarginBps, 0, 10_000) && number(thresholds.minOpportunityScore, 0, 100);
}

function candidate(value: unknown): boolean {
  if (!record(value) || !id(value.opportunityId) || !id(value.evidencePackId) || !text(value.title, 1, 500) || !text(value.problem, 1, 4_000) || !text(value.customer, 1, 2_000) || !text(value.demand, 1, 4_000) || !text(value.competition, 1, 4_000) || !text(value.entryBarrier, 1, 2_000) || !integer(value.capitalRequiredCents, 0, 1_000_000_000) || !integer(value.validationSpeedDays, 1, 3_650) || !integer(value.marginPotentialBps, 0, 10_000) || !["HIGH", "LOW", "MEDIUM"].includes(String(value.operationalComplexity)) || !["HIGH", "LOW", "MEDIUM"].includes(String(value.risk)) || !strings(value.assumptions, 0, 30) || !strings(value.missingInformation, 0, 30) || !Array.isArray(value.scoreInputs) || value.scoreInputs.length !== BUSINESS_SCORE_CRITERIA.length) return false;
  const seen = new Set<string>();
  return value.scoreInputs.every((entry) => {
    if (!record(entry) || !BUSINESS_SCORE_CRITERIA.includes(entry.criterion as never) || seen.has(String(entry.criterion)) || !["ASSUMPTION", "ESTIMATE", "MISSING", "REAL"].includes(String(entry.dataKind)) || !["HIGH", "LOW", "MEDIUM", "NONE"].includes(String(entry.confidence)) || !text(entry.formula, 1, 2_000)) return false;
    seen.add(String(entry.criterion));
    if (entry.dataKind === "MISSING") return entry.value === undefined && entry.evidenceId === undefined && entry.confidence === "NONE";
    return number(entry.value, 0, 100) && (entry.evidenceId === undefined || id(entry.evidenceId));
  });
}

function commercialPlan(value: unknown): boolean {
  if (!record(value) || !offer(value.offer) || !Array.isArray(value.economics) || value.economics.length !== 3 || !value.economics.every(economics) || new Set(value.economics.map((entry) => record(entry) ? entry.name : undefined)).size !== 3 || !Array.isArray(value.validation) || value.validation.length < 1 || value.validation.length > 20 || !value.validation.every(experiment) || !acquisition(value.acquisition)) return false;
  const scenarios = value.economics as readonly unknown[];
  return ["PRUDENT", "BASE", "AMBITIOUS"].every((name) => scenarios.some((entry) => record(entry) && entry.name === name));
}

function offer(value: unknown): boolean {
  return record(value) && id(value.opportunityId) && text(value.idealCustomer, 1, 2_000) && text(value.primaryProblem, 1, 2_000) && text(value.promisedOutcome, 1, 2_000) && text(value.mechanism, 1, 2_000) && strings(value.deliverables, 1, 30) && strings(value.limits, 1, 30) && strings(value.bonuses, 0, 30) && text(value.guarantee, 1, 2_000) && text(value.positioning, 1, 2_000) && text(value.differentiation, 1, 2_000) && strings(value.customerExclusions, 1, 30) && Array.isArray(value.objections) && value.objections.length > 0 && value.objections.every((entry) => record(entry) && text(entry.objection, 1, 1_000) && text(entry.response, 1, 2_000)) && Array.isArray(value.tiers) && value.tiers.length > 0 && value.tiers.every((entry) => record(entry) && text(entry.name, 1, 300) && strings(entry.deliverables, 1, 30) && (entry.priceCents === undefined || integer(entry.priceCents, 0, 1_000_000_000)));
}

function economics(value: unknown): boolean {
  if (!record(value) || !["AMBITIOUS", "BASE", "PRUDENT"].includes(String(value.name)) || !Array.isArray(value.provenance)) return false;
  const numericFields = ["acquisitionCostCents", "conversionRateBps", "deliveryCostCents", "fixedCostsCents", "hourlyCostCents", "humanHoursPerClient", "monthlyVolume", "priceCents", "refundRateBps", "taxRateBps", "toolCostsCents"];
  for (const field of numericFields) if (value[field] !== undefined && !number(value[field], 0, field.endsWith("Bps") ? 10_000 : 1_000_000_000)) return false;
  const declared = new Set<string>();
  if (!value.provenance.every((entry) => {
    if (!record(entry) || !numericFields.includes(String(entry.field)) || declared.has(String(entry.field)) || !["ASSUMPTION", "ESTIMATE", "REAL"].includes(String(entry.dataKind)) || !text(entry.note, 1, 2_000) || (entry.evidenceId !== undefined && !id(entry.evidenceId))) return false;
    declared.add(String(entry.field)); return true;
  })) return false;
  return numericFields.every((field) => value[field] === undefined || declared.has(field));
}

function experiment(value: unknown): boolean {
  return record(value) && id(value.experimentId) && text(value.hypothesis, 1, 2_000) && text(value.audience, 1, 1_000) && ["CONTENT_CTA", "INTERVIEWS", "LANDING_PAGE", "MANUAL_OUTREACH", "PILOT_PROPOSAL", "PREORDER", "SIMULATED_CAMPAIGN", "WAITLIST", "PRICE_TEST"].includes(String(value.method)) && text(value.assetNeeded, 1, 1_000) && integer(value.maxCostCents, 0, 1_000_000_000) && integer(value.durationDays, 1, 3_650) && integer(value.sampleSize, 1, 1_000_000) && text(value.primaryMetric, 1, 1_000) && text(value.minimumThreshold, 1, 1_000) && text(value.stopCondition, 1, 1_000) && text(value.nextDecision, 1, 1_000) && typeof value.authorizationRequired === "boolean";
}

function acquisition(value: unknown): boolean {
  return record(value) && Array.isArray(value.channels) && value.channels.length > 0 && value.channels.every((entry) => record(entry) && text(entry.channel, 1, 500) && text(entry.message, 1, 2_000) && integer(entry.priority, 1, 100)) && Array.isArray(value.emailSequence) && value.emailSequence.length > 0 && value.emailSequence.every((entry) => record(entry) && text(entry.subject, 1, 500) && text(entry.body, 1, 8_000)) && Array.isArray(value.faq) && value.faq.length > 0 && value.faq.every((entry) => record(entry) && text(entry.question, 1, 1_000) && text(entry.answer, 1, 4_000)) && record(value.landingCopy) && text(value.landingCopy.headline, 1, 1_000) && text(value.landingCopy.subheadline, 1, 2_000) && text(value.landingCopy.proof, 1, 2_000) && text(value.landingCopy.callToAction, 1, 500) && text(value.outreachScript, 1, 8_000) && strings(value.socialSupport, 1, 30);
}

function valid<T>(value: T): ValidationResult<T> { return validationSuccess(deepFreeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, 4_000)); }
function number(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max; }
function integer(value: unknown, min: number, max: number): value is number { return number(value, min, max) && Number.isSafeInteger(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
