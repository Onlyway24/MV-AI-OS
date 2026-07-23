import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { VentureArtifact } from "./venture-domain.js";

export type VentureLaunchDatum =
  | { readonly evidenceRefs: readonly string[]; readonly status: "AVAILABLE"; readonly value: string }
  | { readonly reasonCode: "FOUNDER_INPUT_REQUIRED" | "NOT_AVAILABLE"; readonly status: "NOT_AVAILABLE" };

export interface VentureLaunchPackInput {
  readonly acquisitionStrategy: VentureLaunchDatum;
  readonly contentAcquisitionPlan: VentureLaunchDatum;
  readonly crmSchema: VentureLaunchDatum;
  readonly customerOnboarding: VentureLaunchDatum;
  readonly deliverySystem: VentureLaunchDatum;
  readonly economics: VentureLaunchDatum;
  readonly evidenceMap: VentureLaunchDatum;
  readonly executiveDecision: VentureLaunchDatum;
  readonly emailDrafts: VentureLaunchDatum;
  readonly experimentPlan: VentureLaunchDatum;
  readonly founderDecisionsRequired: readonly string[];
  readonly idealCustomerProfile: VentureLaunchDatum;
  readonly killCriteria: VentureLaunchDatum;
  readonly offerArchitecture: VentureLaunchDatum;
  readonly opportunityReport: VentureLaunchDatum;
  readonly outreachDrafts: VentureLaunchDatum;
  readonly positioning: VentureLaunchDatum;
  readonly pricing: VentureLaunchDatum;
  readonly riskRegister: VentureLaunchDatum;
  readonly scaleCriteria: VentureLaunchDatum;
  readonly socialContentSeries: VentureLaunchDatum;
  readonly thesisId: string;
  readonly validationPlan: VentureLaunchDatum;
  readonly valueProposition: VentureLaunchDatum;
  readonly ventureId: string;
}

export interface VentureLaunchArtifact extends Pick<VentureArtifact, "allowedUse" | "artifactId" | "authoringAgent" | "content" | "evidenceRefs" | "externalActionsExecuted" | "fingerprint" | "kind" | "mediaType" | "reviewState" | "tombstoned" | "ventureId" | "version"> {
  readonly allowedUse: "INTERNAL_PACKAGE_ONLY";
  readonly artifactId: string;
  readonly authoringAgent: "artifact-producer@1.0.0";
  readonly content: string;
  readonly evidenceRefs: readonly string[];
  readonly fingerprint: string;
  readonly externalActionsExecuted: false;
  readonly kind: VentureArtifact["kind"];
  readonly mediaType: VentureArtifact["mediaType"];
  readonly publication: "LOCKED";
  readonly reviewState: Extract<VentureArtifact["reviewState"], "AWAITING_FABIO" | "BLOCKED">;
  readonly tombstoned: false;
  readonly ventureId: string;
  readonly version: 0;
}

export interface VentureLaunchPack {
  readonly artifacts: readonly VentureLaunchArtifact[];
  readonly blockerCodes: readonly string[];
  readonly externalActionsExecuted: false;
  readonly fingerprint: string;
  readonly publication: "LOCKED";
  readonly state: "BLOCKED" | "READY_FOR_FABIO_REVIEW";
  readonly thesisId: string;
  readonly ventureId: string;
}

export class DeterministicVentureLaunchPackFactory {
  public produce(input: VentureLaunchPackInput): VentureLaunchPack {
    validateInput(input);
    const named = fields(input);
    const blockers = named.filter(([, datum]) => datum.status === "NOT_AVAILABLE").map(([name, datum]) => `${name}_${datum.status === "NOT_AVAILABLE" ? datum.reasonCode : "NOT_AVAILABLE"}`);
    if (input.founderDecisionsRequired.length > 0) blockers.push("FOUNDER_DECISIONS_REQUIRED");
    const evidenceRefs = Object.freeze([...new Set(named.flatMap(([, datum]) => datum.status === "AVAILABLE" ? datum.evidenceRefs : []))].sort());
    const reviewState = blockers.length === 0 ? "AWAITING_FABIO" as const : "BLOCKED" as const;
    const artifacts = Object.freeze([
      artifact(input.ventureId, "LAUNCH_PACK_INDEX", "text/markdown", dossier(input), evidenceRefs, reviewState),
      artifact(input.ventureId, "WEB_SOURCE", "text/html", landing(input), evidenceRefs, reviewState),
      artifact(input.ventureId, "OFFER_SOURCE", "text/markdown", offer(input), evidenceRefs, reviewState),
      artifact(input.ventureId, "PRESENTATION_SOURCE", "text/markdown", presentation(input), evidenceRefs, reviewState),
      artifact(input.ventureId, "EMAIL_DRAFTS", "text/markdown", section("Email Drafts", input.emailDrafts), evidenceRefs, input.emailDrafts.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "OUTREACH_DRAFTS", "text/markdown", section("Outreach Drafts", input.outreachDrafts), evidenceRefs, input.outreachDrafts.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "CRM_SCHEMA", "text/csv", input.crmSchema.status === "AVAILABLE" ? input.crmSchema.value : "field,status,evidence_ref\ncustomer_id,NOT_AVAILABLE,FOUNDER_INPUT_REQUIRED\nstage,NOT_AVAILABLE,FOUNDER_INPUT_REQUIRED", evidenceRefs, input.crmSchema.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "SOCIAL_CONTENT_SOURCE", "application/json", JSON.stringify({ allowedUse: "INTERNAL_PACKAGE_ONLY", content: value(input.socialContentSeries), publication: "LOCKED", status: input.socialContentSeries.status }, null, 2), evidenceRefs, input.socialContentSeries.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "DELIVERY_CHECKLIST", "text/markdown", section("Delivery Checklist", input.deliverySystem), evidenceRefs, input.deliverySystem.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "EXECUTIVE_DECISION", "text/markdown", section("Executive Decision", input.executiveDecision), evidenceRefs, input.executiveDecision.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "OPPORTUNITY_REPORT", "text/markdown", section("Opportunity Report", input.opportunityReport), evidenceRefs, input.opportunityReport.status === "AVAILABLE" ? reviewState : "BLOCKED"),
      artifact(input.ventureId, "VALIDATION_PLAN", "application/json", JSON.stringify({ experimentPlan: value(input.experimentPlan), validationPlan: value(input.validationPlan), publication: "LOCKED" }, null, 2), evidenceRefs, input.validationPlan.status === "AVAILABLE" ? reviewState : "BLOCKED"),
    ]);
    const base = { artifacts, blockerCodes: Object.freeze([...new Set(blockers)].sort()), externalActionsExecuted: false as const, publication: "LOCKED" as const, state: blockers.length === 0 ? "READY_FOR_FABIO_REVIEW" as const : "BLOCKED" as const, thesisId: input.thesisId, ventureId: input.ventureId };
    return deepFreeze({ ...base, fingerprint: canonicalSha256(base) });
  }
}

function artifact(ventureId: string, kind: VentureLaunchArtifact["kind"], mediaType: VentureLaunchArtifact["mediaType"], content: string, evidenceRefs: readonly string[], reviewState: VentureLaunchArtifact["reviewState"]): VentureLaunchArtifact {
  const artifactId = `${ventureId}-${kind.toLowerCase().replaceAll("_", "-")}`;
  const base = { allowedUse: "INTERNAL_PACKAGE_ONLY" as const, artifactId, authoringAgent: "artifact-producer@1.0.0" as const, content, evidenceRefs, externalActionsExecuted: false as const, kind, mediaType, publication: "LOCKED" as const, reviewState, tombstoned: false as const, ventureId, version: 0 as const };
  return Object.freeze({ ...base, fingerprint: canonicalSha256(base) });
}

function fields(input: VentureLaunchPackInput): readonly (readonly [string, VentureLaunchDatum])[] { return [
  ["ACQUISITION_STRATEGY", input.acquisitionStrategy], ["CONTENT_ACQUISITION_PLAN", input.contentAcquisitionPlan], ["CRM_SCHEMA", input.crmSchema], ["CUSTOMER_ONBOARDING", input.customerOnboarding], ["DELIVERY_SYSTEM", input.deliverySystem], ["ECONOMICS", input.economics], ["EVIDENCE_MAP", input.evidenceMap], ["EMAIL_DRAFTS", input.emailDrafts], ["EXECUTIVE_DECISION", input.executiveDecision], ["EXPERIMENT_PLAN", input.experimentPlan], ["IDEAL_CUSTOMER_PROFILE", input.idealCustomerProfile], ["KILL_CRITERIA", input.killCriteria], ["OFFER_ARCHITECTURE", input.offerArchitecture], ["OPPORTUNITY_REPORT", input.opportunityReport], ["OUTREACH_DRAFTS", input.outreachDrafts], ["POSITIONING", input.positioning], ["PRICING", input.pricing], ["RISK_REGISTER", input.riskRegister], ["SCALE_CRITERIA", input.scaleCriteria], ["SOCIAL_CONTENT_SERIES", input.socialContentSeries], ["VALIDATION_PLAN", input.validationPlan], ["VALUE_PROPOSITION", input.valueProposition],
] as const; }

function dossier(input: VentureLaunchPackInput): string { return `# Venture Launch Pack — ${input.ventureId}\n\n${fields(input).map(([name, datum]) => section(name.replaceAll("_", " "), datum)).join("\n\n")}\n\n## Founder Decisions Required\n${input.founderDecisionsRequired.length === 0 ? "Nessuna decisione dichiarata." : input.founderDecisionsRequired.map((decision) => `- ${decision}`).join("\n")}\n\nPublication: LOCKED\nAllowed use: INTERNAL_PACKAGE_ONLY\n`; }
function landing(input: VentureLaunchPackInput): string { return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Internal Venture Source</title></head><body><main><h1>${html(value(input.positioning))}</h1><p>${html(value(input.valueProposition))}</p><section><h2>Cliente ideale</h2><p>${html(value(input.idealCustomerProfile))}</p></section><p>INTERNAL_PACKAGE_ONLY · PUBLICATION_LOCKED</p></main></body></html>`; }
function offer(input: VentureLaunchPackInput): string { return `${section("Offer Architecture", input.offerArchitecture)}\n\n${section("Pricing", input.pricing)}\n\n${section("Economics", input.economics)}\n\nINTERNAL_PACKAGE_ONLY · PUBLICATION_LOCKED\n`; }
function presentation(input: VentureLaunchPackInput): string { return `# Presentation Source\n\n${section("Executive Decision", input.executiveDecision)}\n\n${section("Opportunity", input.opportunityReport)}\n\n${section("Evidence", input.evidenceMap)}\n\n${section("Validation", input.validationPlan)}\n\nINTERNAL_PACKAGE_ONLY · PUBLICATION_LOCKED\n`; }
function section(title: string, datum: VentureLaunchDatum): string { return `## ${title}\n${value(datum)}${datum.status === "AVAILABLE" ? `\n\nEvidence: ${datum.evidenceRefs.join(", ")}` : ""}`; }
function value(datum: VentureLaunchDatum): string { return datum.status === "AVAILABLE" ? datum.value : `NOT_AVAILABLE — ${datum.reasonCode}`; }
function html(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function validateInput(input: VentureLaunchPackInput): void {
  if (!id(input.ventureId) || !id(input.thesisId) || !strings(input.founderDecisionsRequired, 0, 100)) throw new Error("Venture Launch Pack identity is invalid");
  for (const [, datum] of fields(input)) validateDatum(datum);
}
function validateDatum(datum: VentureLaunchDatum): void { if (datum.status === "AVAILABLE") { if (!text(datum.value, 1, 100_000) || !strings(datum.evidenceRefs, 1, 100)) throw new Error("Available Venture launch datum is invalid"); } else if (!["FOUNDER_INPUT_REQUIRED", "NOT_AVAILABLE"].includes(datum.reasonCode)) throw new Error("Unavailable Venture launch datum is invalid"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, 2_000)); }
