import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { VentureOpportunitySource } from "./venture-domain.js";

export const VENTURE_OPPORTUNITY_CATEGORIES = Object.freeze([
  "AI_SERVICES", "CONSULTING", "CONTENT_AND_MEDIA", "CUSTOMER_DELIVERY", "DIGITAL_PRODUCTS", "EDUCATION", "INTERNAL_TOOLS", "RESEARCH_AND_INTELLIGENCE", "RESELLING", "SAAS", "WORKFLOW_AUTOMATION",
] as const);
export type VentureOpportunityCategory = typeof VENTURE_OPPORTUNITY_CATEGORIES[number];

export type OpportunitySourceKind = VentureOpportunitySource["kind"];
export type OpportunitySignalKind = "COMMERCIAL_COMMITMENT" | "FOUNDER_OBSERVATION" | "PAID_TRANSACTION" | "PRICE_ACCEPTANCE" | "QUALIFIED_COMMERCIAL_REQUEST" | "SOCIAL_ENGAGEMENT" | "SOCIAL_INTEREST" | "VERIFIED_INTERNAL_OUTCOME";

export interface OpportunityRadarEvidence {
  readonly evidenceRef: string;
  readonly expiresAt: string;
  readonly signalKind: OpportunitySignalKind;
  readonly sourceKind: OpportunitySourceKind;
  readonly verified: boolean;
}

export type RadarDatum<T> =
  | { readonly evidenceRefs: readonly string[]; readonly status: "AVAILABLE"; readonly value: T }
  | { readonly reasonCode: "DEMAND_NOT_VERIFIED" | "FOUNDER_INPUT_REQUIRED" | "NOT_AVAILABLE"; readonly status: "NOT_AVAILABLE" };

export interface OpportunityRadarCandidate {
  readonly accessToCustomer: RadarDatum<string>;
  readonly capitalRequiredMinorUnits: RadarDatum<string>;
  readonly category: VentureOpportunityCategory;
  readonly client: string;
  readonly competition: RadarDatum<string>;
  readonly deliveryComplexity: RadarDatum<"HIGH" | "LOW" | "MEDIUM">;
  readonly evidence: readonly OpportunityRadarEvidence[];
  readonly founderFit: RadarDatum<string>;
  readonly frequency: RadarDatum<string>;
  readonly marginPotentialBps: RadarDatum<number>;
  readonly onlywaySynergy: RadarDatum<string>;
  readonly opportunityId: string;
  readonly problem: string;
  readonly risk: RadarDatum<"HIGH" | "LOW" | "MEDIUM">;
  readonly timeToFirstSignalDays: RadarDatum<number>;
  readonly unknowns: readonly string[];
  readonly urgency: RadarDatum<string>;
}

export interface RadarOpportunity {
  readonly candidate: OpportunityRadarCandidate;
  readonly demand: RadarDatum<"VERIFIED">;
  readonly demandEvidenceRefs: readonly string[];
  readonly expiry: string | null;
  readonly externalActionsExecuted: false;
  readonly fingerprint: string;
  readonly willingnessToPay: RadarDatum<"VERIFIED">;
}

const DEMAND_SIGNALS = new Set<OpportunitySignalKind>(["COMMERCIAL_COMMITMENT", "PAID_TRANSACTION", "QUALIFIED_COMMERCIAL_REQUEST", "VERIFIED_INTERNAL_OUTCOME"]);
const WILLINGNESS_SIGNALS = new Set<OpportunitySignalKind>(["COMMERCIAL_COMMITMENT", "PAID_TRANSACTION", "PRICE_ACCEPTANCE"]);

export class OpportunityRadarService {
  public evaluate(candidate: OpportunityRadarCandidate): RadarOpportunity {
    validateCandidate(candidate);
    const eligible = candidate.evidence.filter((evidence) => evidence.verified && evidence.sourceKind !== "SOCIAL_INTELLIGENCE");
    const demandRefs = eligible.filter(({ signalKind }) => DEMAND_SIGNALS.has(signalKind)).map(({ evidenceRef }) => evidenceRef).sort();
    const willingnessRefs = eligible.filter(({ signalKind }) => WILLINGNESS_SIGNALS.has(signalKind)).map(({ evidenceRef }) => evidenceRef).sort();
    const demand: RadarOpportunity["demand"] = demandRefs.length === 0
      ? Object.freeze({ reasonCode: "DEMAND_NOT_VERIFIED", status: "NOT_AVAILABLE" })
      : Object.freeze({ evidenceRefs: Object.freeze(demandRefs), status: "AVAILABLE", value: "VERIFIED" });
    const willingnessToPay: RadarOpportunity["willingnessToPay"] = willingnessRefs.length === 0
      ? Object.freeze({ reasonCode: "DEMAND_NOT_VERIFIED", status: "NOT_AVAILABLE" })
      : Object.freeze({ evidenceRefs: Object.freeze(willingnessRefs), status: "AVAILABLE", value: "VERIFIED" });
    const expiry = candidate.evidence.length === 0 ? null : candidate.evidence.map(({ expiresAt }) => expiresAt).sort()[0] ?? null;
    const base = { candidate, demand, demandEvidenceRefs: Object.freeze(demandRefs), expiry, externalActionsExecuted: false as const, willingnessToPay };
    return deepFreeze({ ...base, fingerprint: canonicalSha256(base) });
  }
}

function validateCandidate(candidate: OpportunityRadarCandidate): void {
  if (!id(candidate.opportunityId) || !VENTURE_OPPORTUNITY_CATEGORIES.includes(candidate.category) || !text(candidate.problem, 1, 4_000) || !text(candidate.client, 1, 2_000) || !strings(candidate.unknowns, 0, 100)) throw new Error("Opportunity Radar candidate is invalid");
  const ids = new Set<string>();
  for (const evidence of candidate.evidence) {
    if (!id(evidence.evidenceRef) || ids.has(evidence.evidenceRef) || !timestamp(evidence.expiresAt) || !["AUTHORIZED_RESEARCH", "BUSINESS_CONTEXT", "CREATIVE_VAULT", "EVIDENCE_PACK", "FOUNDER_INPUT", "INTERNAL_ANALYTICS", "SOCIAL_INTELLIGENCE"].includes(evidence.sourceKind) || !["COMMERCIAL_COMMITMENT", "FOUNDER_OBSERVATION", "PAID_TRANSACTION", "PRICE_ACCEPTANCE", "QUALIFIED_COMMERCIAL_REQUEST", "SOCIAL_ENGAGEMENT", "SOCIAL_INTEREST", "VERIFIED_INTERNAL_OUTCOME"].includes(evidence.signalKind)) throw new Error("Opportunity Radar evidence is invalid");
    ids.add(evidence.evidenceRef);
  }
  validateDatum(candidate.accessToCustomer, stringValue);
  validateDatum(candidate.capitalRequiredMinorUnits, canonicalUnsignedInteger);
  validateDatum(candidate.competition, stringValue);
  validateDatum(candidate.deliveryComplexity, (value) => ["HIGH", "LOW", "MEDIUM"].includes(String(value)));
  validateDatum(candidate.founderFit, stringValue);
  validateDatum(candidate.frequency, stringValue);
  validateDatum(candidate.marginPotentialBps, bps);
  validateDatum(candidate.onlywaySynergy, stringValue);
  validateDatum(candidate.risk, (value) => ["HIGH", "LOW", "MEDIUM"].includes(String(value)));
  validateDatum(candidate.timeToFirstSignalDays, (value) => Number.isSafeInteger(value) && Number(value) >= 0);
  validateDatum(candidate.urgency, stringValue);
}

function validateDatum<T>(value: RadarDatum<T>, predicate: (candidate: unknown) => boolean): void {
  if (value.status === "NOT_AVAILABLE") {
    if (!["DEMAND_NOT_VERIFIED", "FOUNDER_INPUT_REQUIRED", "NOT_AVAILABLE"].includes(value.reasonCode)) throw new Error("Opportunity Radar unavailable datum is invalid");
    return;
  }
  if (!predicate(value.value) || !strings(value.evidenceRefs, 1, 100)) throw new Error("Opportunity Radar available datum is invalid");
}

function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, 1_000)); }
function timestamp(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function canonicalUnsignedInteger(value: unknown): boolean { return typeof value === "string" && /^(0|[1-9]\d{0,29})$/u.test(value); }
function bps(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 10_000; }
function stringValue(value: unknown): boolean { return text(value, 1, 4_000); }
