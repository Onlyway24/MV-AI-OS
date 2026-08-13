import { isIP } from "node:net";

export const ADMIN_SECURITY_CONTRACT_VERSION = "1" as const;
export const ADMIN_SECURITY_STATE_VERSION = 1 as const;

export type AdminSecurityDeploymentMode =
  | "PRIVATE_TUNNEL"
  | "PRODUCTION_DOMAIN";

export type AdminSecurityReadiness = "CONFIGURATION_REQUIRED" | "READY";

export interface AdminSecurityProfileInput {
  readonly mode: AdminSecurityDeploymentMode;
  readonly origin?: string;
  readonly relyingPartyId?: string;
  readonly relyingPartyName?: string;
}

interface AdminSecurityProfileBase {
  readonly contractVersion: typeof ADMIN_SECURITY_CONTRACT_VERSION;
  readonly mode: AdminSecurityDeploymentMode;
  readonly readiness: AdminSecurityReadiness;
  readonly relyingPartyName: string;
}

export interface ReadyAdminSecurityProfile extends AdminSecurityProfileBase {
  readonly cookieName: string;
  readonly cookieSecure: boolean;
  readonly mode: AdminSecurityDeploymentMode;
  readonly origin: string;
  readonly readiness: "READY";
  readonly relyingPartyId: string;
}

export interface IncompleteAdminSecurityProfile
  extends AdminSecurityProfileBase {
  readonly missingConfiguration: readonly string[];
  readonly mode: "PRODUCTION_DOMAIN";
  readonly readiness: "CONFIGURATION_REQUIRED";
}

export type AdminSecurityProfile =
  | IncompleteAdminSecurityProfile
  | ReadyAdminSecurityProfile;

export const ADMIN_CAPABILITIES = Object.freeze([
  "ADMIN_READ",
  "ADMIN_COMMAND_EXECUTE",
  "ADMIN_CREDENTIAL_MANAGE",
  "ADMIN_SESSION_MANAGE",
  "ADMIN_SECURITY_EVENT_READ",
  "ADMIN_SERVICE_PRINCIPAL_MANAGE",
  "ADMIN_KILL_SWITCH_CONTROL",
  "ADMIN_PROVIDER_CONTROL",
  "ADMIN_COST_CONTROL",
  "RUNTIME_SCHEDULE",
  "RUNTIME_EXECUTE",
  "RUNTIME_MONITOR",
  "BACKUP_MANAGE",
] as const);

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

export const ADMIN_ROLES = Object.freeze([
  "FOUNDER",
  "OPERATOR",
  "AUDITOR",
  "SERVICE",
] as const);

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const SERVICE_PRINCIPAL_PROFILES = Object.freeze([
  "SCHEDULER",
  "WORKER",
  "MONITOR",
  "BACKUP",
] as const);

export type ServicePrincipalProfile =
  (typeof SERVICE_PRINCIPAL_PROFILES)[number];

export const ROLE_CAPABILITIES: Readonly<
  Record<Exclude<AdminRole, "SERVICE">, readonly AdminCapability[]>
> = Object.freeze({
  AUDITOR: Object.freeze([
    "ADMIN_READ",
    "ADMIN_SECURITY_EVENT_READ",
  ] as const),
  FOUNDER: Object.freeze([...ADMIN_CAPABILITIES]),
  OPERATOR: Object.freeze([
    "ADMIN_READ",
    "ADMIN_COMMAND_EXECUTE",
  ] as const),
});

export const SERVICE_PROFILE_CAPABILITIES: Readonly<
  Record<ServicePrincipalProfile, readonly AdminCapability[]>
> = Object.freeze({
  BACKUP: Object.freeze(["BACKUP_MANAGE"] as const),
  MONITOR: Object.freeze(["RUNTIME_MONITOR"] as const),
  SCHEDULER: Object.freeze(["RUNTIME_SCHEDULE"] as const),
  WORKER: Object.freeze(["RUNTIME_EXECUTE"] as const),
});

export interface HumanAdminPrincipal {
  readonly capabilities: readonly AdminCapability[];
  readonly createdAt: string;
  readonly displayName: string;
  readonly kind: "HUMAN";
  readonly principalId: string;
  readonly roles: readonly Exclude<AdminRole, "SERVICE">[];
  readonly status: "ACTIVE" | "DISABLED";
}

export interface ServiceAdminPrincipal {
  readonly capabilities: readonly AdminCapability[];
  readonly createdAt: string;
  readonly displayName: string;
  readonly kind: "SERVICE";
  readonly principalId: string;
  readonly profile: ServicePrincipalProfile;
  readonly roles: readonly ["SERVICE"];
  readonly status: "ACTIVE" | "DISABLED";
}

export type AdminPrincipal = HumanAdminPrincipal | ServiceAdminPrincipal;

export interface AdminWebAuthnCredential {
  readonly backedUp: boolean;
  readonly counter: number;
  readonly createdAt: string;
  readonly credentialId: string;
  readonly deviceType: "multiDevice" | "singleDevice";
  readonly principalId: string;
  readonly publicKey: string;
  readonly transports: readonly string[];
}

export interface FounderBootstrapRecord {
  readonly consumedAt: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly tokenHash: string;
}

export type AdminChallengeKind =
  | "AUTHENTICATION"
  | "FOUNDER_REGISTRATION"
  | "STEP_UP";

export interface AdminChallengeRecord {
  readonly bootstrapTokenHash: string | null;
  readonly capability: AdminCapability | null;
  readonly challenge: string;
  readonly command: string | null;
  readonly commandFingerprint: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly flowId: string;
  readonly kind: AdminChallengeKind;
  readonly principalId: string | null;
  readonly sessionId: string | null;
  readonly sourceKeyHash: string;
  readonly usedAt: string | null;
}

export interface AdminSessionRecord {
  readonly absoluteExpiresAt: string;
  readonly createdAt: string;
  readonly idleExpiresAt: string;
  readonly lastSeenAt: string;
  readonly principalId: string;
  readonly revokedAt: string | null;
  readonly sessionId: string;
  readonly tokenHash: string;
}

export interface AdminStepUpReceiptRecord {
  readonly capability: AdminCapability;
  readonly command: string;
  readonly commandFingerprint: string;
  readonly consumedAt: string | null;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly principalId: string;
  readonly receiptId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
}

export interface AdminRateLimitRecord {
  readonly attempts: number;
  readonly failures: number;
  readonly keyHash: string;
  readonly lockedUntil: string | null;
  readonly scope: AdminRateLimitScope;
  readonly updatedAt: string;
  readonly windowStartedAt: string;
}

export type AdminRateLimitScope =
  | "AUTHENTICATION"
  | "BOOTSTRAP"
  | "REGISTRATION"
  | "STEP_UP";

export const ADMIN_SECURITY_EVENT_TYPES = Object.freeze([
  "BOOTSTRAP_CREATED",
  "BOOTSTRAP_REJECTED",
  "FOUNDER_REGISTERED",
  "AUTHENTICATION_CHALLENGE_CREATED",
  "AUTHENTICATION_SUCCEEDED",
  "AUTHENTICATION_FAILED",
  "SESSION_REVOKED",
  "ALL_SESSIONS_REVOKED",
  "AUTHORIZATION_DENIED",
  "STEP_UP_CHALLENGE_CREATED",
  "STEP_UP_SUCCEEDED",
  "STEP_UP_FAILED",
  "STEP_UP_RECEIPT_CONSUMED",
  "RATE_LIMITED",
  "SERVICE_PRINCIPAL_REGISTERED",
  "KILL_SWITCH_AUTHORIZED",
] as const);

export type AdminSecurityEventType =
  (typeof ADMIN_SECURITY_EVENT_TYPES)[number];

export type AdminSecurityEventOutcome = "DENIED" | "SUCCEEDED";

export interface AdminSecurityEvent {
  readonly contractVersion: typeof ADMIN_SECURITY_CONTRACT_VERSION;
  readonly eventId: string;
  readonly eventType: AdminSecurityEventType;
  readonly occurredAt: string;
  readonly outcome: AdminSecurityEventOutcome;
  readonly principalId: string | null;
  readonly reasonCode: string;
  readonly sourceKeyHash: string | null;
  readonly subjectId: string | null;
}

export interface AdminSecurityState {
  readonly bootstrap: FounderBootstrapRecord | null;
  readonly challenges: readonly AdminChallengeRecord[];
  readonly contractVersion: typeof ADMIN_SECURITY_CONTRACT_VERSION;
  readonly credentials: readonly AdminWebAuthnCredential[];
  readonly principals: readonly AdminPrincipal[];
  readonly rateLimits: readonly AdminRateLimitRecord[];
  readonly revision: number;
  readonly securityEvents: readonly AdminSecurityEvent[];
  readonly sessions: readonly AdminSessionRecord[];
  readonly stateVersion: typeof ADMIN_SECURITY_STATE_VERSION;
  readonly stepUpReceipts: readonly AdminStepUpReceiptRecord[];
}

export const emptyAdminSecurityState = (): AdminSecurityState =>
  Object.freeze({
    bootstrap: null,
    challenges: Object.freeze([]),
    contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
    credentials: Object.freeze([]),
    principals: Object.freeze([]),
    rateLimits: Object.freeze([]),
    revision: 0,
    securityEvents: Object.freeze([]),
    sessions: Object.freeze([]),
    stateVersion: ADMIN_SECURITY_STATE_VERSION,
    stepUpReceipts: Object.freeze([]),
  });

export const createAdminSecurityProfile = (
  input: AdminSecurityProfileInput,
): AdminSecurityProfile => {
  const relyingPartyName = normalizeRelyingPartyName(input.relyingPartyName);
  if (input.mode === "PRODUCTION_DOMAIN") {
    const missingConfiguration: string[] = [];
    const parsedOrigin = parseOrigin(input.origin);
    if (parsedOrigin?.protocol !== "https:") {
      missingConfiguration.push("HTTPS_ORIGIN");
    }
    const relyingPartyId = normalizeRelyingPartyId(input.relyingPartyId);
    if (
      relyingPartyId === null
      || isIP(relyingPartyId) !== 0
      || relyingPartyId === "localhost"
    ) {
      missingConfiguration.push("PUBLIC_RELYING_PARTY_ID");
    }
    if (
      parsedOrigin !== null
      && relyingPartyId !== null
      && parsedOrigin.hostname !== relyingPartyId
      && !parsedOrigin.hostname.endsWith(`.${relyingPartyId}`)
    ) {
      missingConfiguration.push("ORIGIN_RELYING_PARTY_ALIGNMENT");
    }
    if (missingConfiguration.length > 0 || parsedOrigin === null || relyingPartyId === null) {
      return Object.freeze({
        contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
        missingConfiguration: Object.freeze([...new Set(missingConfiguration)]),
        mode: "PRODUCTION_DOMAIN",
        readiness: "CONFIGURATION_REQUIRED",
        relyingPartyName,
      });
    }
    return Object.freeze({
      contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
      cookieName: "__Host-onlyway_admin_session",
      cookieSecure: true,
      mode: "PRODUCTION_DOMAIN",
      origin: parsedOrigin.origin,
      readiness: "READY",
      relyingPartyId,
      relyingPartyName,
    });
  }

  const parsedOrigin = parseOrigin(input.origin);
  if (
    parsedOrigin === null
    || !isLoopbackHostname(parsedOrigin.hostname)
    || (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:")
  ) {
    throw new AdminSecurityError(
      "PROFILE_INVALID",
      "PRIVATE_TUNNEL requires an explicit loopback HTTP(S) origin.",
    );
  }
  const relyingPartyId =
    normalizeRelyingPartyId(input.relyingPartyId) ?? parsedOrigin.hostname;
  if (
    !isLoopbackHostname(relyingPartyId)
    || relyingPartyId !== parsedOrigin.hostname
  ) {
    throw new AdminSecurityError(
      "PROFILE_INVALID",
      "PRIVATE_TUNNEL relying party ID must equal the loopback origin host.",
    );
  }
  return Object.freeze({
    contractVersion: ADMIN_SECURITY_CONTRACT_VERSION,
    cookieName: "__Host-onlyway_admin_session",
    cookieSecure: true,
    mode: "PRIVATE_TUNNEL",
    origin: parsedOrigin.origin,
    readiness: "READY",
    relyingPartyId,
    relyingPartyName,
  });
};

export const isLoopbackAddress = (address: string): boolean => {
  const normalized = address.trim().toLowerCase();
  return normalized === "::1"
    || normalized === "localhost"
    || normalized.startsWith("127.")
    || normalized.startsWith("::ffff:127.");
};

export const effectiveCapabilities = (
  principal: AdminPrincipal,
): ReadonlySet<AdminCapability> => {
  const capabilities = new Set<AdminCapability>();
  if (principal.kind === "SERVICE") {
    for (const capability of SERVICE_PROFILE_CAPABILITIES[principal.profile]) {
      capabilities.add(capability);
    }
  } else {
    for (const role of principal.roles) {
      for (const capability of ROLE_CAPABILITIES[role]) {
        capabilities.add(capability);
      }
    }
  }
  for (const capability of principal.capabilities) {
    capabilities.add(capability);
  }
  return capabilities;
};

export const assertCapability = (
  principal: AdminPrincipal,
  capability: AdminCapability,
): void => {
  if (
    principal.status !== "ACTIVE"
    || !effectiveCapabilities(principal).has(capability)
  ) {
    throw new AdminSecurityError(
      "CAPABILITY_DENIED",
      "The authenticated principal is not authorized for this operation.",
    );
  }
};

export const createServicePrincipal = (input: {
  readonly createdAt: string;
  readonly displayName: string;
  readonly principalId: string;
  readonly profile: ServicePrincipalProfile;
}): ServiceAdminPrincipal => {
  assertSafeIdentifier(input.principalId, "principalId");
  const displayName = input.displayName.trim();
  if (displayName.length === 0 || displayName.length > 128) {
    throw new AdminSecurityError(
      "INPUT_INVALID",
      "Service principal display name is invalid.",
    );
  }
  return Object.freeze({
    capabilities: SERVICE_PROFILE_CAPABILITIES[input.profile],
    createdAt: input.createdAt,
    displayName,
    kind: "SERVICE",
    principalId: input.principalId,
    profile: input.profile,
    roles: Object.freeze(["SERVICE"] as const),
    status: "ACTIVE",
  });
};

export const assertSafeIdentifier = (
  value: string,
  fieldName: string,
): void => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    throw new AdminSecurityError(
      "INPUT_INVALID",
      `${fieldName} must be a bounded opaque identifier.`,
    );
  }
};

export const assertCommandFingerprint = (value: string): void => {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new AdminSecurityError(
      "INPUT_INVALID",
      "Command fingerprint must be a lowercase SHA-256 value.",
    );
  }
};

export type AdminSecurityErrorCode =
  | "BOOTSTRAP_ALREADY_COMPLETED"
  | "BOOTSTRAP_INVALID"
  | "CAPABILITY_DENIED"
  | "CHALLENGE_EXPIRED"
  | "CHALLENGE_INVALID"
  | "CONFIGURATION_REQUIRED"
  | "CREDENTIAL_INVALID"
  | "INPUT_INVALID"
  | "PROFILE_INVALID"
  | "RATE_LIMITED"
  | "REPOSITORY_CONFLICT"
  | "REPOSITORY_INVALID"
  | "SESSION_INVALID"
  | "STEP_UP_INVALID";

export class AdminSecurityError extends Error {
  public readonly code: AdminSecurityErrorCode;

  public constructor(code: AdminSecurityErrorCode, message: string) {
    super(message);
    this.name = "AdminSecurityError";
    this.code = code;
  }
}

const normalizeRelyingPartyName = (value: string | undefined): string => {
  const normalized = value?.trim() ?? "OnlyWay MV-AI-OS";
  if (normalized.length === 0 || normalized.length > 128) {
    throw new AdminSecurityError(
      "PROFILE_INVALID",
      "Relying party name is invalid.",
    );
  }
  return normalized;
};

const normalizeRelyingPartyId = (
  value: string | undefined,
): string | null => {
  if (value === undefined) return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length === 0
    || normalized.length > 253
    || normalized.includes("/")
    || normalized.includes(":")
  ) {
    return null;
  }
  return normalized;
};

const parseOrigin = (value: string | undefined): URL | null => {
  if (value === undefined) return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.username !== ""
      || parsed.password !== ""
      || parsed.pathname !== "/"
      || parsed.search !== ""
      || parsed.hash !== ""
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname.startsWith("127.");
