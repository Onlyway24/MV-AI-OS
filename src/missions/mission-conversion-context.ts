import { createHash } from "node:crypto";

import {
  DEFAULT_FOUNDER_MISSION_BRIEF,
  FOUNDER_MISSION_BRIEF_CONTRACT_VERSION,
  METODO_VELOCE_BRAND_PROFILE,
  MV_AI_OS_BRAND_PROFILE,
  ONLY_WAY_FOUNDER_PREFERENCE_PROFILE,
  type FounderMissionBrief,
  type FounderMissionType,
  type MissionApprovalPolicy,
  type MissionBrandProfile,
  type MissionEvidenceExpectation,
  type MissionForbiddenAction,
  type MissionOriginalityStandard,
  type MissionPriority,
  type MissionQualityStandard,
  type MissionRiskTolerance,
} from "./founder-mission-brief.js";
import { FounderMissionBriefValidator } from "./founder-mission-brief-validator.js";
import {
  TelegramMissionDraftValidator,
  type TelegramMissionDraft,
  type TelegramMissionProfileSelection,
} from "../telegram/telegram-mission-draft.js";
import {
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";
import { isRfc3339Timestamp } from "../validation/primitives.js";

export const MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION = "1" as const;
export const ONLY_WAY_MISSION_CONVERSION_POLICY_ID =
  "only-way-mission-conversion-policy@1.0.0" as const;
export const ONLY_WAY_MISSION_CONVERSION_POLICY_VERSION = "1.0.0" as const;

export type FounderMissionBriefFieldSource =
  | "FOUNDER_PROFILE"
  | "BRAND_PROFILE"
  | "MISSION_TYPE_PROFILE"
  | "TELEGRAM_MISSION_DRAFT";

/**
 * The complete, explicit provenance map for the FounderMissionBrief boundary.
 * A field may be composed from more than one declared source, but never from a
 * fallback outside this map.
 */
export const FOUNDER_MISSION_BRIEF_FIELD_SOURCES: Readonly<
  Record<keyof FounderMissionBrief, readonly FounderMissionBriefFieldSource[]>
> = deepFreeze({
  approvalPolicy: ["FOUNDER_PROFILE", "TELEGRAM_MISSION_DRAFT"],
  assumptions: ["TELEGRAM_MISSION_DRAFT"],
  audience: ["TELEGRAM_MISSION_DRAFT"],
  brandProfile: ["BRAND_PROFILE"],
  briefId: ["TELEGRAM_MISSION_DRAFT"],
  budget: ["TELEGRAM_MISSION_DRAFT"],
  clarificationQuestions: ["TELEGRAM_MISSION_DRAFT"],
  constraints: ["TELEGRAM_MISSION_DRAFT"],
  contractVersion: ["FOUNDER_PROFILE"],
  deadline: ["TELEGRAM_MISSION_DRAFT"],
  deliverables: ["TELEGRAM_MISSION_DRAFT"],
  evidenceExpectation: ["FOUNDER_PROFILE"],
  externalActionRequests: ["TELEGRAM_MISSION_DRAFT"],
  forbiddenActions: ["FOUNDER_PROFILE"],
  founderPreferences: ["FOUNDER_PROFILE"],
  knownFacts: ["TELEGRAM_MISSION_DRAFT"],
  missionType: ["TELEGRAM_MISSION_DRAFT", "MISSION_TYPE_PROFILE"],
  nonExecuting: ["FOUNDER_PROFILE"],
  objective: ["TELEGRAM_MISSION_DRAFT"],
  originalityStandard: ["FOUNDER_PROFILE"],
  priority: ["FOUNDER_PROFILE"],
  qualityStandard: ["FOUNDER_PROFILE"],
  riskTolerance: ["FOUNDER_PROFILE"],
  styleProfile: ["BRAND_PROFILE", "TELEGRAM_MISSION_DRAFT"],
  successMetrics: ["TELEGRAM_MISSION_DRAFT", "MISSION_TYPE_PROFILE"],
  unknowns: ["TELEGRAM_MISSION_DRAFT"],
});

export interface FounderMissionConversionPolicyProfile {
  readonly approvalPolicy: MissionApprovalPolicy;
  readonly contractVersion: typeof MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION;
  readonly evidenceExpectation: MissionEvidenceExpectation;
  readonly forbiddenActions: readonly MissionForbiddenAction[];
  readonly originalityStandard: MissionOriginalityStandard;
  readonly policyId: typeof ONLY_WAY_MISSION_CONVERSION_POLICY_ID;
  readonly priority: MissionPriority;
  readonly qualityStandard: MissionQualityStandard;
  readonly riskTolerance: MissionRiskTolerance;
  readonly version: typeof ONLY_WAY_MISSION_CONVERSION_POLICY_VERSION;
}

/** A minimal, versioned wrapper around stable doctrine already declared by the default brief. */
export const ONLY_WAY_MISSION_CONVERSION_POLICY: FounderMissionConversionPolicyProfile =
  deepFreeze({
    approvalPolicy: DEFAULT_FOUNDER_MISSION_BRIEF.approvalPolicy,
    contractVersion: MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION,
    evidenceExpectation: DEFAULT_FOUNDER_MISSION_BRIEF.evidenceExpectation,
    forbiddenActions: DEFAULT_FOUNDER_MISSION_BRIEF.forbiddenActions,
    originalityStandard: DEFAULT_FOUNDER_MISSION_BRIEF.originalityStandard,
    policyId: ONLY_WAY_MISSION_CONVERSION_POLICY_ID,
    priority: DEFAULT_FOUNDER_MISSION_BRIEF.priority,
    qualityStandard: DEFAULT_FOUNDER_MISSION_BRIEF.qualityStandard,
    riskTolerance: DEFAULT_FOUNDER_MISSION_BRIEF.riskTolerance,
    version: ONLY_WAY_MISSION_CONVERSION_POLICY_VERSION,
  });

export interface ResolvedMissionConversionProfile {
  readonly id: string;
  readonly fingerprint: string;
  readonly version: string;
}

export interface MissionConversionContext {
  readonly actorId: string;
  readonly approvalPolicyReference: ResolvedMissionConversionProfile;
  readonly contractVersion: typeof MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly evidencePolicyReference: ResolvedMissionConversionProfile;
  readonly forbiddenActionPolicyReference: ResolvedMissionConversionProfile;
  readonly founderProfile: ResolvedMissionConversionProfile;
  readonly missionDraftId: string;
  readonly missionDraftVersion: number;
  readonly missionId: string;
  readonly missionTypeProfile?: ResolvedMissionConversionProfile;
  readonly originalityPolicyReference: ResolvedMissionConversionProfile;
  readonly profileFingerprint: string;
  readonly qualityPolicyReference: ResolvedMissionConversionProfile;
  readonly brandProfile: ResolvedMissionConversionProfile;
  readonly workspaceId: string;
}

export interface MissionConversionReadinessFinding {
  readonly code: "MISSING_MATERIAL_FIELD" | "PROFILE_CONTEXT_MISMATCH" | "PROFILE_RESOLUTION_FAILED";
  readonly field: string;
  readonly telegramField: string;
}

export interface MissionConversionExpandedReview {
  readonly appliedRules: Readonly<Record<string, unknown>>;
  readonly contextFingerprint: string;
  readonly missionData: Readonly<Record<string, unknown>>;
  readonly noHiddenDefaultsNotice: "No hidden defaults were applied. Values come either from the structured Mission draft or from the exact versioned profiles shown above.";
}

export interface MissionConversionReadiness {
  readonly context?: MissionConversionContext;
  readonly expandedReview?: MissionConversionExpandedReview;
  readonly findings: readonly MissionConversionReadinessFinding[];
  readonly status: "INCOMPLETE" | "READY";
}

export interface FounderMissionConversionResult {
  readonly brief: FounderMissionBrief;
  readonly context: MissionConversionContext;
  readonly expandedReview: MissionConversionExpandedReview;
}

export class ImmutableMissionConversionProfileRegistry {
  readonly #brands: ReadonlyMap<string, MissionBrandProfile>;
  readonly #founders: ReadonlyMap<string, typeof ONLY_WAY_FOUNDER_PREFERENCE_PROFILE>;
  readonly #missionTypes: ReadonlyMap<string, Readonly<Record<string, never>>>;
  readonly #policy: FounderMissionConversionPolicyProfile;

  public constructor(options: {
    readonly brands?: readonly MissionBrandProfile[];
    readonly founders?: readonly typeof ONLY_WAY_FOUNDER_PREFERENCE_PROFILE[];
    readonly missionTypes?: Readonly<Record<string, Readonly<Record<string, never>>>>;
    readonly policy?: FounderMissionConversionPolicyProfile;
  } = {}) {
    const brands = options.brands ?? [MV_AI_OS_BRAND_PROFILE, METODO_VELOCE_BRAND_PROFILE];
    const founders = options.founders ?? [ONLY_WAY_FOUNDER_PREFERENCE_PROFILE];
    this.#brands = indexed(brands, (profile) => `${profile.brandId}:${profile.version}`);
    this.#founders = indexed(founders, (profile) => `${profile.profileId}:${profile.version}`);
    this.#missionTypes = new Map(Object.entries(options.missionTypes ?? {}));
    this.#policy = options.policy ?? ONLY_WAY_MISSION_CONVERSION_POLICY;
  }

  public resolveContext(draft: TelegramMissionDraft, createdAt: string): ValidationResult<MissionConversionContext> {
    const validation = new TelegramMissionDraftValidator().validate(draft);
    if (!validation.ok || !isRfc3339Timestamp(createdAt)) return invalidContext("draft or creation timestamp is invalid");
    const selection = validation.value.profileSelection;
    if (selection === undefined) return invalidContext("profile selection is required");
    const founder = this.resolveFounder(selection);
    const brand = this.resolveBrand(selection);
    const missionType = this.resolveMissionType(selection, validation.value.missionType);
    if (founder === undefined || brand === undefined || missionType === null) return invalidContext("an exact selected profile does not resolve");
    const policy = resolved(this.#policy.policyId, this.#policy.version, this.#policy);
    const base = {
      actorId: validation.value.actorId,
      approvalPolicyReference: policy,
      brandProfile: brand,
      contractVersion: MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION,
      createdAt,
      evidencePolicyReference: policy,
      forbiddenActionPolicyReference: policy,
      founderProfile: founder,
      missionDraftId: validation.value.draftId,
      missionDraftVersion: validation.value.version,
      missionId: validation.value.draftId,
      ...(missionType === undefined ? {} : { missionTypeProfile: missionType }),
      originalityPolicyReference: policy,
      qualityPolicyReference: policy,
      workspaceId: validation.value.workspaceId,
    };
    const profileFingerprint = fingerprint(base);
    return validationSuccess(deepFreeze({ ...base, profileFingerprint }));
  }

  public verify(context: MissionConversionContext): boolean {
    const validation = new MissionConversionContextValidator().validate(context);
    if (!validation.ok) return false;
    const value = validation.value;
    const founder = this.#founders.get(`${value.founderProfile.id}:${value.founderProfile.version}`);
    const brand = this.#brands.get(`${value.brandProfile.id}:${value.brandProfile.version}`);
    if (founder === undefined || brand === undefined) return false;
    if (resolved(founder.profileId, founder.version, founder).fingerprint !== value.founderProfile.fingerprint) return false;
    if (resolved(brand.brandId, brand.version, brand).fingerprint !== value.brandProfile.fingerprint) return false;
    const policy = resolved(this.#policy.policyId, this.#policy.version, this.#policy);
    for (const reference of [value.approvalPolicyReference, value.evidencePolicyReference, value.forbiddenActionPolicyReference, value.originalityPolicyReference, value.qualityPolicyReference]) {
      if (!sameReference(reference, policy)) return false;
    }
    if (value.missionTypeProfile !== undefined && !this.#missionTypes.has(`${value.missionTypeProfile.id}:${value.missionTypeProfile.version}`)) return false;
    const { profileFingerprint, ...base } = value;
    return profileFingerprint === fingerprint(base);
  }

  private resolveFounder(selection: TelegramMissionProfileSelection): ResolvedMissionConversionProfile | undefined {
    const profile = this.#founders.get(`${selection.founderProfileId}:${selection.founderProfileVersion}`);
    return profile === undefined ? undefined : resolved(profile.profileId, profile.version, profile);
  }

  private resolveBrand(selection: TelegramMissionProfileSelection): ResolvedMissionConversionProfile | undefined {
    const profile = this.#brands.get(`${selection.brandProfileId}:${selection.brandProfileVersion}`);
    return profile === undefined ? undefined : resolved(profile.brandId, profile.version, profile);
  }

  private resolveMissionType(selection: TelegramMissionProfileSelection, missionType: FounderMissionType | undefined): ResolvedMissionConversionProfile | undefined | null {
    if (selection.missionTypeProfileId === undefined) return undefined;
    if (missionType === undefined || selection.missionTypeProfileVersion === undefined) return null;
    const version = selection.missionTypeProfileVersion;
    const profile = this.#missionTypes.get(`${selection.missionTypeProfileId}:${version}`);
    return profile === undefined ? null : resolved(selection.missionTypeProfileId, version, profile);
  }
}

export class MissionConversionContextValidator implements Validator<MissionConversionContext> {
  public validate(value: unknown): ValidationResult<MissionConversionContext> {
    if (!record(value) || value.contractVersion !== MISSION_CONVERSION_CONTEXT_CONTRACT_VERSION) return invalidContext("conversion context is invalid");
    const required = ["actorId", "missionDraftId", "missionId", "workspaceId"];
    if (required.some((key) => !id(value[key])) || !Number.isSafeInteger(value.missionDraftVersion) || (value.missionDraftVersion as number) < 0 || typeof value.createdAt !== "string" || !isRfc3339Timestamp(value.createdAt) || !hash(value.profileFingerprint)) return invalidContext("conversion context has an invalid scalar field");
    const refs = [value.founderProfile, value.brandProfile, value.approvalPolicyReference, value.qualityPolicyReference, value.originalityPolicyReference, value.evidencePolicyReference, value.forbiddenActionPolicyReference];
    if (refs.some((entry) => !reference(entry)) || (value.missionTypeProfile !== undefined && !reference(value.missionTypeProfile))) return invalidContext("conversion context has an invalid profile reference");
    return validationSuccess(deepFreeze(structuredClone(value as unknown as MissionConversionContext)));
  }
}

/** Pure deterministic readiness and conversion boundary. It does not call Telegram, models, tools, workflows, or storage. */
export class DeterministicFounderMissionConverter {
  public constructor(private readonly registry = new ImmutableMissionConversionProfileRegistry()) {}

  public evaluateReadiness(draft: TelegramMissionDraft, createdAt: string): MissionConversionReadiness {
    const draftResult = new TelegramMissionDraftValidator().validate(draft);
    const contextResult = this.registry.resolveContext(draft, createdAt);
    const findings: MissionConversionReadinessFinding[] = [];
    if (!draftResult.ok) return { findings: [{ code: "MISSING_MATERIAL_FIELD", field: "missionDraft", telegramField: "MISSION" }], status: "INCOMPLETE" };
    const value = draftResult.value;
    if (!contextResult.ok) findings.push({ code: "PROFILE_RESOLUTION_FAILED", field: "profileSelection", telegramField: "PROFILE_SELECTION" });
    required(value.objective, "objective", "OBJECTIVE", findings);
    required(value.objectiveDetails, "objective", "OBJECTIVE_DETAILS", findings);
    required(value.missionType, "missionType", "MISSION_TYPE", findings);
    required(value.audience, "audience", "AUDIENCE", findings);
    required(value.deliverables?.length, "deliverables", "DELIVERABLES", findings);
    required(value.deadline, "deadline", "DEADLINE", findings);
    required(value.budget, "budget", "BUDGET", findings);
    required(value.successMetrics?.length, "successMetrics", "SUCCESS_METRICS", findings);
    required(value.knownFacts, "knownFacts", "KNOWN_FACTS", findings);
    if (value.proposedExternalActions.length > 0 && !hasExternalActionApproval(value.missionApprovalPolicy)) findings.push({ code: "MISSING_MATERIAL_FIELD", field: "approvalPolicy", telegramField: "APPROVAL_POLICY" });
    if (findings.length > 0 || !contextResult.ok) return { findings: deepFreeze(findings), status: "INCOMPLETE" };
    const review = this.expandedReview(value, contextResult.value);
    return { context: contextResult.value, expandedReview: review, findings: [], status: "READY" };
  }

  public convert(draft: TelegramMissionDraft, context: MissionConversionContext): ValidationResult<FounderMissionConversionResult> {
    if (!this.registry.verify(context)) return invalidConversion("conversion context no longer resolves exactly");
    const readiness = this.evaluateReadiness(draft, context.createdAt);
    if (readiness.status !== "READY" || readiness.context?.profileFingerprint !== context.profileFingerprint || readiness.context.missionDraftVersion !== context.missionDraftVersion || readiness.context.missionDraftId !== context.missionDraftId) return invalidConversion("mission draft is incomplete or context is stale");
    const value = new TelegramMissionDraftValidator().validate(draft);
    if (!value.ok || value.value.objectiveDetails === undefined || value.value.audience === undefined || value.value.deliverables === undefined || value.value.missionType === undefined || value.value.deadline === undefined || value.value.budget === undefined || value.value.successMetrics === undefined || value.value.knownFacts === undefined) return invalidConversion("required mission values are absent");
    const brand = this.brand(context.brandProfile);
    if (brand === undefined) return invalidConversion("brand profile no longer resolves");
    const approvalPolicy = value.value.proposedExternalActions.length === 0 ? this.registryPolicy().approvalPolicy : value.value.missionApprovalPolicy;
    if (approvalPolicy === undefined) return invalidConversion("approval policy is absent");
    const brief: FounderMissionBrief = {
      approvalPolicy,
      assumptions: value.value.assumptions,
      audience: value.value.audience,
      brandProfile: brand,
      briefId: `mission-brief-${value.value.draftId}`,
      budget: value.value.budget,
      clarificationQuestions: clarificationQuestions(value.value.unknowns),
      constraints: value.value.constraints,
      contractVersion: FOUNDER_MISSION_BRIEF_CONTRACT_VERSION,
      deadline: value.value.deadline,
      deliverables: value.value.deliverables,
      evidenceExpectation: this.registryPolicy().evidenceExpectation,
      externalActionRequests: value.value.proposedExternalActions,
      forbiddenActions: this.registryPolicy().forbiddenActions,
      founderPreferences: ONLY_WAY_FOUNDER_PREFERENCE_PROFILE,
      knownFacts: value.value.knownFacts,
      missionType: value.value.missionType,
      nonExecuting: true,
      objective: value.value.objectiveDetails,
      originalityStandard: this.registryPolicy().originalityStandard,
      priority: this.registryPolicy().priority,
      qualityStandard: this.registryPolicy().qualityStandard,
      riskTolerance: this.registryPolicy().riskTolerance,
      styleProfile: { applicableDeliverableIds: value.value.deliverables.map((entry) => entry.deliverableId), communicationTraits: brand.communicationTraits, ...(brand.visualDirection === undefined ? {} : { visualDirection: brand.visualDirection }) },
      successMetrics: value.value.successMetrics,
      unknowns: value.value.unknowns,
    };
    const validated = new FounderMissionBriefValidator().validate(brief);
    if (!validated.ok) return invalidConversion("deterministic conversion did not produce a valid FounderMissionBrief");
    const expandedReview = readiness.expandedReview;
    if (expandedReview === undefined) return invalidConversion("ready conversion has no expanded review");
    return validationSuccess(deepFreeze({ brief: validated.value, context, expandedReview }));
  }

  private expandedReview(draft: TelegramMissionDraft, context: MissionConversionContext): MissionConversionExpandedReview {
    const policy = this.registryPolicy();
    const brand = this.brand(context.brandProfile);
    return deepFreeze({
      appliedRules: {
        approvalPolicy: draft.proposedExternalActions.length === 0 ? policy.approvalPolicy : draft.missionApprovalPolicy,
        brandProfile: brand,
        evidencePolicy: policy.evidenceExpectation,
        forbiddenActions: policy.forbiddenActions,
        founderProfile: context.founderProfile,
        originalityStandard: policy.originalityStandard,
        priority: policy.priority,
        qualityStandard: policy.qualityStandard,
        riskTolerance: policy.riskTolerance,
      },
      contextFingerprint: context.profileFingerprint,
      missionData: {
        assumptions: draft.assumptions,
        audience: draft.audience,
        budget: draft.budget,
        constraints: draft.constraints,
        deadline: draft.deadline,
        deliverables: draft.deliverables,
        externalActions: draft.proposedExternalActions,
        knownFacts: draft.knownFacts,
        missionType: draft.missionType,
        objective: draft.objectiveDetails,
        successMetrics: draft.successMetrics,
        unknowns: draft.unknowns,
      },
      noHiddenDefaultsNotice: "No hidden defaults were applied. Values come either from the structured Mission draft or from the exact versioned profiles shown above.",
    });
  }

  private brand(reference: ResolvedMissionConversionProfile): MissionBrandProfile | undefined {
    if (reference.id === MV_AI_OS_BRAND_PROFILE.brandId && reference.version === MV_AI_OS_BRAND_PROFILE.version) return MV_AI_OS_BRAND_PROFILE;
    if (reference.id === METODO_VELOCE_BRAND_PROFILE.brandId && reference.version === METODO_VELOCE_BRAND_PROFILE.version) return METODO_VELOCE_BRAND_PROFILE;
    return undefined;
  }

  private registryPolicy(): FounderMissionConversionPolicyProfile { return ONLY_WAY_MISSION_CONVERSION_POLICY; }
}

function clarificationQuestions(unknowns: TelegramMissionDraft["unknowns"]): FounderMissionBrief["clarificationQuestions"] {
  return unknowns.filter((entry) => entry.classification === "DECISION_BLOCKING").map((entry) => ({ question: `Clarify ${entry.topic}.`, questionId: `clarify-${entry.unknownId}`, sourceUnknownId: entry.unknownId, whyDecisionBlocking: entry.impact }));
}

function hasExternalActionApproval(value: MissionApprovalPolicy | undefined): boolean {
  return value?.fabioIsFinalAuthority === true && value.approvalRequiredFor.includes("external_side_effect");
}

function required(value: unknown, field: string, telegramField: string, findings: MissionConversionReadinessFinding[]): void {
  if (value === undefined || value === 0 || value === "") findings.push({ code: "MISSING_MATERIAL_FIELD", field, telegramField });
}

function resolved(id: string, version: string, profile: unknown): ResolvedMissionConversionProfile {
  return deepFreeze({ fingerprint: fingerprint(profile), id, version });
}

function sameReference(left: ResolvedMissionConversionProfile, right: ResolvedMissionConversionProfile): boolean {
  return left.id === right.id && left.version === right.version && left.fingerprint === right.fingerprint;
}

function indexed<T>(profiles: readonly T[], key: (profile: T) => string): ReadonlyMap<string, T> {
  const entries = profiles.map((profile) => [key(profile), deepFreeze(structuredClone(profile))] as const);
  if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error("conversion profile registry contains duplicate exact identities");
  return new Map(entries);
}

function fingerprint(value: unknown): string { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function reference(value: unknown): value is ResolvedMissionConversionProfile { return record(value) && id(value.id) && typeof value.version === "string" && hash(value.fingerprint); }
function id(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9@._-]{0,127}$/u.test(value); }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function invalidContext(message: string): ValidationResult<MissionConversionContext> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function invalidConversion(message: string): ValidationResult<FounderMissionConversionResult> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const entry of Object.values(value)) deepFreeze(entry); return value; }
