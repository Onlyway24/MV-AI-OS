import {
  canonicalSha256,
} from "../contracts/canonical-fingerprint.js";

export const SECURITY_READINESS_CONTROL_KEYS = Object.freeze([
  "dockerfileNonRoot",
  "linuxCapabilitiesDropped",
  "containerNotPrivileged",
  "dockerSocketAbsent",
  "hostNetworkAbsent",
  "noNewPrivileges",
  "readOnlyRootFilesystem",
  "secretsOutsideImage",
  "databaseOutsideImage",
  "backupStoragePrivate",
  "privateFilePermissions",
  "sshKeyOnly",
  "firewallActive",
  "bruteForceProtection",
  "reverseProxyPrivate",
  "publicAdminPortClosed",
  "webAuthnAuthentication",
  "localFounderBootstrap",
  "publicRegistrationDisabled",
  "opaqueServerSessions",
  "secureHttpOnlySameSiteCookie",
  "csrfProtection",
  "originValidation",
  "hostValidation",
  "defaultDenyAuthorization",
  "rbacCapabilities",
  "commandBoundStepUp",
  "sessionRevocation",
  "globalLogout",
  "securityEvents",
  "rateLimiting",
  "csp",
  "noStore",
  "sseAuthentication",
  "serviceAccountsSeparated",
  "killSwitchAuthorization",
  "adminRecovery",
  "logRedaction",
  "logRotation",
  "dependencyIntegrity",
  "skillIntegrity",
  "noSecretScan",
  "backupRestoreVerified",
  "rollbackVerified",
  "readinessVerified",
  "rebootRecoveryVerified",
] as const);

export const SECURITY_READINESS_PREREQUISITE_KEYS = Object.freeze([
  "codeComplete",
  "suiteGreen",
  "preScanVerified",
  "productionRehearsalPassed",
  "finalCommitPushed",
] as const);

export type SecurityReadinessControlKey =
  typeof SECURITY_READINESS_CONTROL_KEYS[number];

export type SecurityReadinessPrerequisiteKey =
  typeof SECURITY_READINESS_PREREQUISITE_KEYS[number];

export type SecurityEvidenceKind =
  | "CODE_VERIFICATION"
  | "CONTAINER_INSPECTION"
  | "HOST_CONFIGURATION"
  | "NETWORK_MEASUREMENT"
  | "RELEASE_ACCEPTANCE"
  | "RUNTIME_RECEIPT";

export interface SecurityEvidenceRecord {
  readonly commit: string;
  readonly contractVersion: "1";
  readonly fingerprint: string;
  readonly kind: SecurityEvidenceKind;
  readonly observedAt: string;
  readonly source: string;
  readonly verified: true;
}

export interface SecurityReadinessCheck {
  readonly evidenceFingerprint?: string;
  readonly name: string;
  readonly reasonCode: string;
  readonly status: "FAIL" | "PASS";
}

export interface SecurityReadinessReport {
  readonly attestationFingerprint?: string;
  readonly checks: readonly SecurityReadinessCheck[];
  readonly contractVersion: "1";
  readonly kind: "SECURITY_READINESS";
  readonly publicExposureAuthorized: false;
  readonly scanExecuted: boolean;
  readonly securityState:
    | "SECURE_DEPLOYMENT_NOT_READY"
    | "SECURE_DEPLOYMENT_READY_PRIVATE";
  readonly status: "NOT_READY" | "READY";
  readonly targetBranch: "main";
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface SecurityReadinessTrust {
  readonly attestationSignatureVerified: true;
}

type AllowedEvidence = Readonly<{
  readonly kind: SecurityEvidenceKind;
  readonly source: string;
}>;

const RELEASE_BRANCH = "main";
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const CODE_VERIFICATION = Object.freeze({
  kind: "CODE_VERIFICATION",
  source: "verification-image/npm-check",
} satisfies AllowedEvidence);
const CONTAINER_INSPECTION = Object.freeze({
  kind: "CONTAINER_INSPECTION",
  source: "docker/inspect",
} satisfies AllowedEvidence);
const HOST_FILESYSTEM = Object.freeze({
  kind: "HOST_CONFIGURATION",
  source: "host/filesystem",
} satisfies AllowedEvidence);
const HOST_SSHD = Object.freeze({
  kind: "HOST_CONFIGURATION",
  source: "host/sshd",
} satisfies AllowedEvidence);
const HOST_UFW = Object.freeze({
  kind: "HOST_CONFIGURATION",
  source: "host/ufw",
} satisfies AllowedEvidence);
const HOST_FAIL2BAN = Object.freeze({
  kind: "HOST_CONFIGURATION",
  source: "host/fail2ban",
} satisfies AllowedEvidence);
const HOST_LISTENERS = Object.freeze({
  kind: "NETWORK_MEASUREMENT",
  source: "host/listeners",
} satisfies AllowedEvidence);
const RELEASE_ACCEPTANCE = Object.freeze({
  kind: "RELEASE_ACCEPTANCE",
  source: "release/signed-acceptance",
} satisfies AllowedEvidence);
const REHEARSAL_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/production-rehearsal",
} satisfies AllowedEvidence);
const BACKUP_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/backup-restore",
} satisfies AllowedEvidence);
const ROLLBACK_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/rollback",
} satisfies AllowedEvidence);
const READINESS_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/readiness",
} satisfies AllowedEvidence);
const REBOOT_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/reboot-recovery",
} satisfies AllowedEvidence);
const FOUNDER_BOOTSTRAP_RECEIPT = Object.freeze({
  kind: "RUNTIME_RECEIPT",
  source: "runtime/founder-bootstrap",
} satisfies AllowedEvidence);
const PRE_SCAN_VERIFICATION = Object.freeze({
  kind: "CODE_VERIFICATION",
  source: "pre-scan/signed-verification",
} satisfies AllowedEvidence);
const SECRET_SCAN = Object.freeze({
  kind: "CODE_VERIFICATION",
  source: "verification-image/secret-scan",
} satisfies AllowedEvidence);

const CONTROL_EVIDENCE_POLICY: Readonly<
  Record<SecurityReadinessControlKey, AllowedEvidence>
> = Object.freeze({
  adminRecovery: CODE_VERIFICATION,
  backupRestoreVerified: BACKUP_RECEIPT,
  backupStoragePrivate: HOST_FILESYSTEM,
  bruteForceProtection: HOST_FAIL2BAN,
  commandBoundStepUp: CODE_VERIFICATION,
  containerNotPrivileged: CONTAINER_INSPECTION,
  csp: CODE_VERIFICATION,
  csrfProtection: CODE_VERIFICATION,
  databaseOutsideImage: CONTAINER_INSPECTION,
  defaultDenyAuthorization: CODE_VERIFICATION,
  dependencyIntegrity: CODE_VERIFICATION,
  dockerfileNonRoot: CONTAINER_INSPECTION,
  dockerSocketAbsent: CONTAINER_INSPECTION,
  firewallActive: HOST_UFW,
  globalLogout: CODE_VERIFICATION,
  hostNetworkAbsent: CONTAINER_INSPECTION,
  hostValidation: CODE_VERIFICATION,
  killSwitchAuthorization: CODE_VERIFICATION,
  linuxCapabilitiesDropped: CONTAINER_INSPECTION,
  localFounderBootstrap: FOUNDER_BOOTSTRAP_RECEIPT,
  logRedaction: CODE_VERIFICATION,
  logRotation: CONTAINER_INSPECTION,
  noNewPrivileges: CONTAINER_INSPECTION,
  noSecretScan: SECRET_SCAN,
  noStore: CODE_VERIFICATION,
  opaqueServerSessions: CODE_VERIFICATION,
  originValidation: CODE_VERIFICATION,
  privateFilePermissions: HOST_FILESYSTEM,
  publicAdminPortClosed: HOST_LISTENERS,
  publicRegistrationDisabled: CODE_VERIFICATION,
  rateLimiting: CODE_VERIFICATION,
  rbacCapabilities: CODE_VERIFICATION,
  readOnlyRootFilesystem: CONTAINER_INSPECTION,
  readinessVerified: READINESS_RECEIPT,
  rebootRecoveryVerified: REBOOT_RECEIPT,
  reverseProxyPrivate: HOST_LISTENERS,
  rollbackVerified: ROLLBACK_RECEIPT,
  secureHttpOnlySameSiteCookie: CODE_VERIFICATION,
  secretsOutsideImage: CONTAINER_INSPECTION,
  securityEvents: CODE_VERIFICATION,
  serviceAccountsSeparated: HOST_FILESYSTEM,
  sessionRevocation: CODE_VERIFICATION,
  skillIntegrity: CODE_VERIFICATION,
  sseAuthentication: CODE_VERIFICATION,
  sshKeyOnly: HOST_SSHD,
  webAuthnAuthentication: CODE_VERIFICATION,
});

const PREREQUISITE_EVIDENCE_POLICY: Readonly<
  Record<SecurityReadinessPrerequisiteKey, AllowedEvidence>
> = Object.freeze({
  codeComplete: CODE_VERIFICATION,
  finalCommitPushed: RELEASE_ACCEPTANCE,
  preScanVerified: PRE_SCAN_VERIFICATION,
  productionRehearsalPassed: REHEARSAL_RECEIPT,
  suiteGreen: CODE_VERIFICATION,
});

export function securityAttestationFingerprint(
  value: Readonly<Record<string, unknown>>,
): string {
  const unsigned = { ...value };
  delete unsigned.attestationFingerprint;
  return canonicalSha256(unsigned);
}

export function securityScanResultFingerprint(
  value: Readonly<Record<string, unknown>>,
): string {
  const unsigned = { ...value };
  delete unsigned.fingerprint;
  return canonicalSha256(unsigned);
}

export function evaluateSecurityReadiness(
  candidate: unknown,
  trust?: SecurityReadinessTrust,
): SecurityReadinessReport {
  const value = record(candidate);
  const scanTarget = record(value?.scanTarget);
  const scanResult = record(value?.scanResult);
  const controls = record(value?.controls);
  const prerequisites = record(value?.prerequisites);
  const finalCommit =
    typeof value?.finalCommit === "string" ? value.finalCommit : "";
  const pushedCommit =
    typeof value?.pushedCommit === "string" ? value.pushedCommit : "";
  const attestationFingerprint = value === undefined
    ? undefined
    : validSha256(value.attestationFingerprint) &&
        value.attestationFingerprint === securityAttestationFingerprint(value)
      ? value.attestationFingerprint
      : undefined;
  const envelopeReady =
    value?.contractVersion === "2" &&
    value.kind === "SECURITY_EVIDENCE_ATTESTATION" &&
    attestationFingerprint !== undefined;
  const signatureReady = trust?.attestationSignatureVerified === true;
  const commitReady =
    COMMIT_PATTERN.test(finalCommit) &&
    pushedCommit === finalCommit;
  const targetRef = scanTarget?.ref;
  const targetKind = scanTarget?.kind;
  const targetReady =
    targetKind === "COMMIT" && targetRef === finalCommit;
  const preScanEvidence = validEvidence(
    prerequisites?.preScanVerified,
    finalCommit,
    PRE_SCAN_VERIFICATION,
  );
  const scanStartedAt = scanResult?.startedAt;
  const scanReady =
    validScanResult(scanResult, finalCommit) &&
    preScanEvidence !== undefined &&
    validTimestamp(scanStartedAt) &&
    Date.parse(preScanEvidence.observedAt) <= Date.parse(scanStartedAt);
  const baseChecks: SecurityReadinessCheck[] = [
    check(
      "release_acceptance_signature",
      signatureReady,
      "RELEASE_ACCEPTANCE_SIGNATURE_VERIFIED",
    ),
    check(
      "evidence_attestation",
      envelopeReady && signatureReady,
      "CANONICAL_EVIDENCE_ATTESTATION_VERIFIED",
      attestationFingerprint,
    ),
    ...SECURITY_READINESS_PREREQUISITE_KEYS.map((key) => {
      const evidence = validEvidence(
        prerequisites?.[key],
        finalCommit,
        PREREQUISITE_EVIDENCE_POLICY[key],
      );
      return check(
        controlName(key),
        evidence !== undefined,
        `${controlName(key).toUpperCase()}_VERIFIED`,
        evidence?.fingerprint,
      );
    }),
    check(
      "release_branch",
      value?.branch === RELEASE_BRANCH,
      "RELEASE_BRANCH_SELECTED",
    ),
    check("commit_pushed", commitReady, "FINAL_COMMIT_PUSHED"),
    check(
      "scan_target",
      targetReady &&
        targetRef !== "main@901c126" &&
        value?.branch === RELEASE_BRANCH,
      "UPDATED_RELEASE_TARGET_SELECTED",
    ),
    check(
      "deep_security_scan",
      scanReady,
      "DEEP_SECURITY_SCAN_COMPLETED",
      validSha256(scanResult?.fingerprint)
        ? scanResult.fingerprint
        : undefined,
    ),
    check(
      "private_exposure_ceiling",
      value?.maximumDeploymentState ===
          "SECURE_DEPLOYMENT_READY_PRIVATE" &&
        value.publicExposureAuthorized === false,
      "PRIVATE_EXPOSURE_CEILING_ENFORCED",
    ),
  ];
  const controlChecks = SECURITY_READINESS_CONTROL_KEYS.map((key) => {
    const evidence = validEvidence(
      controls?.[key],
      finalCommit,
      CONTROL_EVIDENCE_POLICY[key],
    );
    return check(
      controlName(key),
      evidence !== undefined,
      `${controlName(key).toUpperCase()}_VERIFIED`,
      evidence?.fingerprint,
    );
  });
  const checks = Object.freeze([...baseChecks, ...controlChecks]);
  const ready = checks.every(({ status }) => status === "PASS");
  return Object.freeze({
    ...(attestationFingerprint === undefined
      ? {}
      : { attestationFingerprint }),
    checks,
    contractVersion: "1",
    kind: "SECURITY_READINESS",
    publicExposureAuthorized: false,
    scanExecuted: scanResult?.executed === true,
    securityState: ready
      ? "SECURE_DEPLOYMENT_READY_PRIVATE"
      : "SECURE_DEPLOYMENT_NOT_READY",
    status: ready ? "READY" : "NOT_READY",
    targetBranch: RELEASE_BRANCH,
    unauthorizedExternalEffectOccurred: false,
  });
}

function validScanResult(
  candidate: Readonly<Record<string, unknown>> | undefined,
  finalCommit: string,
): boolean {
  if (candidate === undefined) return false;
  return (
    Object.keys(candidate).sort().join(",") ===
      "artifactFingerprint,branch,completedAt,contractVersion,executed,fingerprint,kind,openCriticalFindings,openHighFindings,openMaterialP2Findings,scanId,scannedCommit,source,startedAt,status,targetKind,targetRef" &&
    candidate.contractVersion === "1" &&
    candidate.kind === "DEEP_SECURITY_SCAN_RESULT" &&
    candidate.source === "codex-security/deep-scan" &&
    candidate.executed === true &&
    candidate.status === "COMPLETED" &&
    candidate.branch === RELEASE_BRANCH &&
    candidate.scannedCommit === finalCommit &&
    candidate.targetKind === "COMMIT" &&
    candidate.targetRef === finalCommit &&
    candidate.openCriticalFindings === 0 &&
    candidate.openHighFindings === 0 &&
    candidate.openMaterialP2Findings === 0 &&
    typeof candidate.scanId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u.test(candidate.scanId) &&
    validTimestamp(candidate.startedAt) &&
    validTimestamp(candidate.completedAt) &&
    Date.parse(candidate.startedAt) <= Date.parse(candidate.completedAt) &&
    validSha256(candidate.artifactFingerprint) &&
    validSha256(candidate.fingerprint) &&
    candidate.fingerprint === securityScanResultFingerprint(candidate)
  );
}

function validEvidence(
  candidate: unknown,
  finalCommit: string,
  allowed: AllowedEvidence,
): SecurityEvidenceRecord | undefined {
  const value = record(candidate);
  if (
    value?.contractVersion !== "1" ||
    value.verified !== true ||
    value.commit !== finalCommit ||
    value.kind !== allowed.kind ||
    value.source !== allowed.source ||
    !validSha256(value.fingerprint) ||
    !validTimestamp(value.observedAt) ||
    Object.keys(value).sort().join(",") !==
      "commit,contractVersion,fingerprint,kind,observedAt,source,verified"
  ) {
    return undefined;
  }
  return value as unknown as SecurityEvidenceRecord;
}

function check(
  name: string,
  passed: boolean,
  successCode: string,
  evidenceFingerprint?: string,
): SecurityReadinessCheck {
  return Object.freeze({
    ...(passed && evidenceFingerprint !== undefined
      ? { evidenceFingerprint }
      : {}),
    name,
    reasonCode: passed ? successCode : `${successCode}_REQUIRED`,
    status: passed ? "PASS" : "FAIL",
  });
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().startsWith(value.slice(0, 19));
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function controlName(value: string): string {
  return value.replaceAll(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
}

function record(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}
