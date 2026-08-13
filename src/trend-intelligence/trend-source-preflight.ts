import { TREND_INTELLIGENCE_CONTRACT_VERSION, deepFreezeTrend, type TrendPreflightReasonCode, type TrendSourceConnectionProfile, type TrendSourcePreflight } from "./trend-intelligence-contract.js";
import { trendSourceByKey } from "./trend-source-catalog.js";

export function preflightTrendSource(profile: TrendSourceConnectionProfile): TrendSourcePreflight {
  const source = trendSourceByKey(profile.sourceKey);
  const reasons: TrendPreflightReasonCode[] = [];
  const registry = profile.sourceRegistryEntry;
  const duplicateBindings = profile.credentialBindings.length !== new Set(profile.credentialBindings.map(({ bindingId }) => bindingId)).size;

  if (source.providerRuntime === "DISABLED") reasons.push("CATALOG_SOURCE_DISABLED");
  if (registry === undefined) reasons.push("SOURCE_NOT_REGISTERED");
  else {
    if (registry.sourceId !== source.sourceId) reasons.push("SOURCE_REGISTRATION_MISMATCH");
    if (registry.status !== "AUTHORIZED" || registry.category === "FORBIDDEN") reasons.push("SOURCE_FORBIDDEN");
    if (registry.actorId !== profile.actorId) reasons.push("ACTOR_MISMATCH");
    if (registry.workspaceId !== profile.workspaceId) reasons.push("WORKSPACE_MISMATCH");
    if (!sameCanonicalBoundary(registry.canonicalReference, source.canonicalReference)) reasons.push("SOURCE_CANONICAL_REFERENCE_MISMATCH");
  }
  if (duplicateBindings) reasons.push("DUPLICATE_CREDENTIAL_BINDING");
  const presentBindings = new Set(profile.credentialBindings.map(({ bindingId }) => bindingId));
  if (source.requiredCredentialBindings.some(({ bindingId }) => !presentBindings.has(bindingId))) reasons.push("CREDENTIAL_REFERENCE_MISSING");
  const grants = new Set(profile.accessGrants);
  if (source.requiredGrants.some((grant) => !grants.has(grant))) reasons.push("ACCESS_GRANT_MISSING");
  if (!profile.transportConfigured) reasons.push("TRANSPORT_NOT_CONFIGURED");

  const reasonCodes = [...new Set(reasons)];
  const ready = reasons.length === 0;
  // PREFLIGHT_READY means only that a zero-paid-call read execution is
  // eligible. It is not connection evidence; only a terminal receipt can
  // prove that a configured connector actually executed.
  return deepFreezeTrend({
    capabilityState: ready ? "PREFLIGHT_READY" : "BLOCKED",
    contractVersion: TREND_INTELLIGENCE_CONTRACT_VERSION,
    executionEligible: ready,
    externalWrites: "LOCKED",
    paidCalls: "DISABLED",
    publication: "LOCKED",
    reasonCodes,
    retryCount: 0,
    registryPolicyAuthorized: registry?.status === "AUTHORIZED" && registry.category !== "FORBIDDEN",
    sourceId: source.sourceId,
    sourceKey: source.sourceKey,
    sourceRegistered: registry !== undefined,
    transportConfigured: profile.transportConfigured,
  });
}

function sameCanonicalBoundary(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    const rightPath = rightUrl.pathname.endsWith("/") ? rightUrl.pathname : `${rightUrl.pathname}/`;
    const pathAllowed = leftUrl.pathname === rightUrl.pathname || leftUrl.pathname.startsWith(rightPath);
    return leftUrl.protocol === "https:" &&
      rightUrl.protocol === "https:" &&
      leftUrl.hostname === rightUrl.hostname &&
      leftUrl.port === rightUrl.port &&
      leftUrl.username === "" &&
      leftUrl.password === "" &&
      rightUrl.username === "" &&
      rightUrl.password === "" &&
      leftUrl.hash === "" &&
      rightUrl.hash === "" &&
      leftUrl.search === "" &&
      rightUrl.search === "" &&
      pathAllowed;
  } catch {
    return false;
  }
}
