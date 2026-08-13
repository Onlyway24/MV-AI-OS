import type { VentureExperiment } from "./venture-domain.js";

export const VENTURE_EXPERIMENT_TYPES = Object.freeze([
  "CONTENT_SIGNAL_TEST", "CUSTOMER_INTERVIEW", "DELIVERY_PROTOTYPE", "INTERNAL_TECH_PROTOTYPE", "LANDING_WAITLIST", "MANUAL_OUTREACH_DRAFT", "PILOT_OFFER", "PREORDER_PROPOSAL", "PRICE_TEST",
] as const);
export type VentureExperimentType = VentureExperiment["experimentType"];

export interface VentureExperimentPlan {
  readonly budgetMaximumMinorUnits: string;
  readonly durationDays: number;
  readonly evidenceRequired: readonly string[];
  readonly experimentId: string;
  readonly externalActionsProposed: readonly string[];
  readonly failureThreshold: string;
  readonly hypothesis: string;
  readonly method: VentureExperimentType;
  readonly nextDecision: string;
  readonly owner: string;
  readonly primaryMetric: string;
  readonly sampleMaximum: number;
  readonly secondaryMetrics: readonly string[];
  readonly stopCondition: string;
  readonly successThreshold: string;
  readonly target: string;
}

export interface VentureExperimentObservation {
  readonly evidenceRefs: readonly string[];
  readonly observationId: string;
  readonly observedAt: string;
  readonly source: "INTERNAL_SIMULATION" | "REAL";
  readonly value: string;
  readonly verificationStatus: "UNVERIFIED" | "VERIFIED";
}

export interface VentureExperimentDecision {
  readonly decision: "AWAITING_REAL_OBSERVATION" | "FOUNDER_REVIEW_REQUIRED" | "SIGNAL_NEGATIVE" | "SIGNAL_POSITIVE";
  readonly eligibleObservationIds: readonly string[];
  readonly experimentId: string;
  readonly externalActionsExecuted: false;
  readonly nextVentureStage: "PROPOSAL_ONLY";
  readonly reasonCode: "CONTRADICTORY_REAL_OBSERVATIONS" | "FAILURE_THRESHOLD_REACHED" | "NO_VERIFIED_REAL_OBSERVATION" | "SUCCESS_THRESHOLD_REACHED" | "THRESHOLD_NOT_REACHED";
  readonly simulatedObservationIds: readonly string[];
}

export class DeterministicVentureExperimentEngine {
  public decide(plan: VentureExperimentPlan, observations: readonly VentureExperimentObservation[]): VentureExperimentDecision {
    validatePlan(plan);
    const seen = new Set<string>();
    for (const observation of observations) {
      validateObservation(observation);
      if (seen.has(observation.observationId)) throw new Error("Venture experiment observation is duplicated");
      seen.add(observation.observationId);
    }
    const simulated = observations.filter(({ source }) => source === "INTERNAL_SIMULATION").map(({ observationId }) => observationId).sort();
    const eligible = observations.filter(({ evidenceRefs, source, verificationStatus }) => source === "REAL" && verificationStatus === "VERIFIED" && evidenceRefs.length > 0);
    if (eligible.length === 0) return result(plan.experimentId, "AWAITING_REAL_OBSERVATION", "NO_VERIFIED_REAL_OBSERVATION", [], simulated);
    const success = BigInt(plan.successThreshold);
    const failure = BigInt(plan.failureThreshold);
    const positive = eligible.filter(({ value }) => BigInt(value) >= success);
    const negative = eligible.filter(({ value }) => BigInt(value) <= failure);
    const eligibleIds = eligible.map(({ observationId }) => observationId).sort();
    if (positive.length > 0 && negative.length > 0) return result(plan.experimentId, "FOUNDER_REVIEW_REQUIRED", "CONTRADICTORY_REAL_OBSERVATIONS", eligibleIds, simulated);
    if (positive.length > 0) return result(plan.experimentId, "SIGNAL_POSITIVE", "SUCCESS_THRESHOLD_REACHED", eligibleIds, simulated);
    if (negative.length > 0) return result(plan.experimentId, "SIGNAL_NEGATIVE", "FAILURE_THRESHOLD_REACHED", eligibleIds, simulated);
    return result(plan.experimentId, "AWAITING_REAL_OBSERVATION", "THRESHOLD_NOT_REACHED", eligibleIds, simulated);
  }
}

function result(experimentId: string, decision: VentureExperimentDecision["decision"], reasonCode: VentureExperimentDecision["reasonCode"], eligibleObservationIds: readonly string[], simulatedObservationIds: readonly string[]): VentureExperimentDecision {
  return Object.freeze({ decision, eligibleObservationIds: Object.freeze([...eligibleObservationIds]), experimentId, externalActionsExecuted: false, nextVentureStage: "PROPOSAL_ONLY", reasonCode, simulatedObservationIds: Object.freeze([...simulatedObservationIds]) });
}

function validatePlan(plan: VentureExperimentPlan): void {
  if (!id(plan.experimentId) || !VENTURE_EXPERIMENT_TYPES.includes(plan.method) || !text(plan.hypothesis, 1, 2_000) || !text(plan.target, 1, 2_000) || !text(plan.primaryMetric, 1, 1_000) || !text(plan.stopCondition, 1, 2_000) || !text(plan.nextDecision, 1, 2_000) || !id(plan.owner) || !integer(plan.durationDays, 1, 3_650) || !integer(plan.sampleMaximum, 1, 1_000_000) || !canonicalUnsigned(plan.budgetMaximumMinorUnits) || !canonicalUnsigned(plan.successThreshold) || !canonicalUnsigned(plan.failureThreshold) || BigInt(plan.successThreshold) <= BigInt(plan.failureThreshold) || !strings(plan.secondaryMetrics, 0, 100) || !strings(plan.evidenceRequired, 1, 100) || !strings(plan.externalActionsProposed, 0, 100)) throw new Error("Venture experiment plan is invalid");
}
function validateObservation(value: VentureExperimentObservation): void {
  if (!id(value.observationId) || !timestamp(value.observedAt) || !["INTERNAL_SIMULATION", "REAL"].includes(value.source) || !["UNVERIFIED", "VERIFIED"].includes(value.verificationStatus) || !canonicalUnsigned(value.value) || !strings(value.evidenceRefs, 0, 100)) throw new Error("Venture experiment observation is invalid");
  if (value.source === "REAL" && value.verificationStatus === "VERIFIED" && value.evidenceRefs.length === 0) throw new Error("Verified real Venture observation requires evidence");
  if (value.source === "INTERNAL_SIMULATION" && value.verificationStatus === "VERIFIED") throw new Error("Internal simulation cannot be a verified real observation");
}
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, 2_000)); }
function canonicalUnsigned(value: unknown): value is string { return typeof value === "string" && /^(0|[1-9]\d{0,39})$/u.test(value); }
function integer(value: unknown, min: number, max: number): boolean { return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max; }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
