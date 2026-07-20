import type {
  ReferenceAllowedUse,
  ReferenceAsset,
  ReferenceEligibilityReasonCode,
  ReferencePlatform,
} from "./reference-vault.js";

export interface ReferenceEligibilityContext {
  readonly now: number;
  readonly purpose: ReferenceAllowedUse;
  readonly platform?: ReferencePlatform;
}

export interface ReferenceEligibilityDecision {
  readonly eligible: boolean;
  readonly reasonCodes: readonly ReferenceEligibilityReasonCode[];
}

/**
 * The single output-eligibility policy used by approval, readers, and
 * collection projections. It is deliberately pure and fail-closed.
 */
export function evaluateReferenceEligibility(
  asset: ReferenceAsset,
  context: ReferenceEligibilityContext,
): ReferenceEligibilityDecision {
  const reasons: ReferenceEligibilityReasonCode[] = [];
  if (asset.status !== "APPROVED") reasons.push("REFERENCE_STATUS_NOT_APPROVED");
  if (isCompetitorMaterial(asset)) reasons.push("REFERENCE_COMPETITOR_OUTPUT_BLOCKED");

  if (asset.rights.status === "FABIO_SUPPLIED") {
    reasons.push("REFERENCE_RIGHTS_PROVENANCE_ONLY");
  } else if (asset.rights.status !== "OWNED" && asset.rights.status !== "AUTHORIZED") {
    reasons.push("REFERENCE_RIGHTS_UNAVAILABLE");
  }
  if (
    (asset.rights.status === "OWNED" || asset.rights.status === "AUTHORIZED")
    && (
      asset.rights.evidenceReference === undefined
      || asset.rights.evidenceFingerprint === undefined
      || asset.rights.verifiedBy === undefined
      || asset.rights.verifiedAt === undefined
      || Date.parse(asset.rights.verifiedAt) > context.now
    )
  ) reasons.push("REFERENCE_RIGHTS_EVIDENCE_MISSING");
  if (!asset.rights.allowedUse.includes(context.purpose)) reasons.push("REFERENCE_PURPOSE_NOT_AUTHORIZED");
  if (asset.rights.expiresAt !== undefined && Date.parse(asset.rights.expiresAt) <= context.now) reasons.push("REFERENCE_RIGHTS_EXPIRED");

  if (context.platform !== undefined && !asset.platforms.includes("GENERAL") && !asset.platforms.includes(context.platform)) reasons.push("REFERENCE_PLATFORM_NOT_AUTHORIZED");
  if (Date.parse(asset.freshness.freshUntil) <= context.now) reasons.push("REFERENCE_STALE");
  if (asset.freshness.expiresAt !== undefined && Date.parse(asset.freshness.expiresAt) <= context.now) reasons.push("REFERENCE_EXPIRED");

  if (asset.privacy.status !== "CLEARED") reasons.push("REFERENCE_PRIVACY_NOT_CLEARED");
  if (asset.privacy.purpose !== context.purpose) reasons.push("REFERENCE_PRIVACY_PURPOSE_MISMATCH");
  if (!hasVerifiedPrivacyProof(asset, context.now)) reasons.push("REFERENCE_PRIVACY_PROOF_MISSING");
  if (Date.parse(asset.privacy.retentionExpiresAt) <= context.now) reasons.push("REFERENCE_RETENTION_EXPIRED");

  const reasonCodes = Object.freeze([...new Set(reasons)]);
  return Object.freeze({ eligible: reasonCodes.length === 0, reasonCodes });
}

export function isCompetitorMaterial(asset: ReferenceAsset): boolean {
  return asset.roles.includes("COMPETITOR_REFERENCE")
    || asset.source.type === "COMPETITOR_PUBLIC_URL"
    || asset.rights.status === "PUBLIC_ANALYSIS_ONLY";
}

function hasVerifiedPrivacyProof(asset: ReferenceAsset, now: number): boolean {
  if (Date.parse(asset.privacy.verifiedAt) > now) return false;
  const noPersonalData = asset.privacy.dataClasses.length === 1 && asset.privacy.dataClasses[0] === "NONE";
  if (noPersonalData) {
    return asset.privacy.consentEvidence.status === "NOT_APPLICABLE"
      && asset.privacy.releaseEvidence.status === "NOT_APPLICABLE"
      && Date.parse(asset.privacy.consentEvidence.verifiedAt) <= now
      && Date.parse(asset.privacy.releaseEvidence.verifiedAt) <= now;
  }
  return !asset.privacy.dataClasses.includes("NONE")
    && asset.privacy.consentEvidence.status === "PROVIDED"
    && asset.privacy.releaseEvidence.status === "PROVIDED"
    && Date.parse(asset.privacy.consentEvidence.verifiedAt) <= now
    && Date.parse(asset.privacy.releaseEvidence.verifiedAt) <= now;
}
