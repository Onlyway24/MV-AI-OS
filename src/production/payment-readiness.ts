import {
  canonicalSha256,
} from "../contracts/canonical-fingerprint.js";
import type {
  LocalCliConfig,
} from "../cli/local-cli-config.js";
import {
  assertOfflineRehearsalReceipt,
  type OfflineProductionRehearsalReceipt,
} from "./offline-production-rehearsal.js";
import {
  evaluateProviderModePolicy,
} from "./provider-mode.js";

export const PAYMENT_READY_CAPABILITIES = Object.freeze([
  "Prompt Operating Layer",
  "Evidence Capsule",
  "Fake Text Provider",
  "Fake Research Provider",
  "Fake Image Provider",
  "Fake Social Transports",
  "Content Pipeline",
  "Carousel Renderer",
  "Reel Pipeline",
  "TikTok Pipeline",
  "Brand Assets",
  "Quality Gate",
  "Risk Gate",
  "Visual Gate",
  "Cost Control",
  "Budget Gate",
  "Kill Switch",
  "H24 Runtime",
  "Backup/Restore",
  "VPS Deployment",
] as const);

export const PAYMENT_EXTERNAL_STATES = Object.freeze([
  "OpenAI Provider",
  "OpenAI Secret",
  "Instagram Connector",
  "TikTok Connector",
  "Production Domain",
  "Publication",
] as const);

export type PaymentReadyCapability =
  typeof PAYMENT_READY_CAPABILITIES[number];

export interface PrivateDeploymentAttestation {
  readonly branch: "feature/telegram-operator-console";
  readonly commit: string;
  readonly contractVersion: "2";
  readonly deployed: true;
  readonly kind: "PRIVATE_DEPLOYMENT_ATTESTATION";
  readonly privateTunnelVerified: true;
  readonly privateTunnelReceiptFingerprint: string;
  readonly publicApplicationPorts: 0;
  readonly readinessVerified: true;
  readonly rehearsalReceiptFingerprint: string;
  readonly rebootRecoveryVerified: true;
  readonly receiptFingerprint: string;
  readonly rollbackVerified: true;
  readonly status: "DEPLOYED_PRIVATE";
}

export interface PaymentCapabilityCheck {
  readonly name: string;
  readonly proofFingerprint?: string;
  readonly reasonCode: string;
  readonly state:
    | "CONFIGURATION_REQUIRED"
    | "DISABLED"
    | "LOCKED"
    | "NOT_CONFIGURED"
    | "NOT_READY"
    | "READY";
}

export interface PaymentReadinessReport {
  readonly capabilities: readonly PaymentCapabilityCheck[];
  readonly contractVersion: "1";
  readonly kind: "PAYMENT_READINESS";
  readonly openAIProviderState: "DISABLED" | "ENABLED_OR_CONFIGURED";
  readonly openAISecretState: "CONFIGURED" | "NOT_CONFIGURED";
  readonly paidCallsAllowed: false;
  readonly paymentState: "PAYMENT_NOT_READY" | "PAYMENT_READY_OFFLINE";
  readonly providerMode: string;
  readonly publicationState: "LOCKED" | "LOCK_REQUIRED";
  readonly status: "NOT_READY" | "READY";
  readonly unauthorizedExternalEffectOccurred: false;
}

export function privateDeploymentAttestationFingerprint(
  value: Omit<PrivateDeploymentAttestation, "receiptFingerprint">,
): string {
  return canonicalSha256(value);
}

export function evaluatePaymentReadiness(input: Readonly<{
  readonly config: LocalCliConfig;
  readonly deploymentAttestation?: unknown;
  readonly deploymentAttestationSignatureVerified?: true;
  readonly now: Date;
  readonly providerSecretConfigured: boolean;
  readonly publicationKillSwitchEnabled?: boolean;
  readonly rehearsalReceipt?: unknown;
}>): PaymentReadinessReport {
  const receipt = verifiedRehearsalReceipt(input.rehearsalReceipt);
  const deploymentCandidate =
    input.deploymentAttestationSignatureVerified === true
      ? verifiedDeploymentAttestation(input.deploymentAttestation)
      : undefined;
  const deployment =
    receipt !== undefined &&
      deploymentCandidate?.rehearsalReceiptFingerprint ===
        receipt.receiptFingerprint
      ? deploymentCandidate
      : undefined;
  const evaluation = evaluateProviderModePolicy({
    contentAgentMode: input.config.runtime.contentAgentMode,
    ...(input.config.runtime.livePaidActivation === undefined
      ? {}
      : { livePaidActivation: input.config.runtime.livePaidActivation }),
    ...(input.config.runtime.modelBudget === undefined
      ? {}
      : { modelBudget: input.config.runtime.modelBudget }),
    ...(input.config.runtime.modelOperationLimits === undefined
      ? {}
      : { modelOperationLimits: input.config.runtime.modelOperationLimits }),
    ...(input.config.runtime.modelProvider === undefined
      ? {}
      : { modelProvider: input.config.runtime.modelProvider }),
    now: input.now,
    ...(input.config.runtime.providerMode === undefined
      ? {}
      : { providerMode: input.config.runtime.providerMode }),
    workspaceId: input.config.runtime.workspaceId,
  });
  const offlineMode = evaluation.ready &&
    evaluation.mode === "OFFLINE_REHEARSAL";
  const openAIProviderDisabled =
    input.config.runtime.contentAgentMode !== "model-backed-openai" &&
    input.config.runtime.modelProvider === undefined;
  const zeroBudget = configuredBudgetIsZero(input.config);
  const readyChecks = PAYMENT_READY_CAPABILITIES.map((name) =>
    readyCapability(name, receipt, deployment, zeroBudget));
  const publicationLocked =
    receipt?.authorization.publicationKillSwitch.finalLocked === true &&
    input.publicationKillSwitchEnabled === true;
  const externalChecks: readonly PaymentCapabilityCheck[] = Object.freeze([
    fixedState(
      "OpenAI Provider",
      openAIProviderDisabled ? "DISABLED" : "NOT_READY",
      openAIProviderDisabled
        ? "OPENAI_PROVIDER_DISABLED"
        : "OPENAI_PROVIDER_MUST_BE_DISABLED",
    ),
    fixedState(
      "OpenAI Secret",
      input.providerSecretConfigured ? "NOT_READY" : "NOT_CONFIGURED",
      input.providerSecretConfigured
        ? "OPENAI_SECRET_MUST_NOT_BE_CONFIGURED"
        : "OPENAI_SECRET_NOT_CONFIGURED",
    ),
    fixedState(
      "Instagram Connector",
      "CONFIGURATION_REQUIRED",
      "INSTAGRAM_CONNECTOR_NOT_ACTIVATED",
    ),
    fixedState(
      "TikTok Connector",
      "CONFIGURATION_REQUIRED",
      "TIKTOK_CONNECTOR_NOT_ACTIVATED",
    ),
    fixedState(
      "Production Domain",
      "CONFIGURATION_REQUIRED",
      "PRODUCTION_DOMAIN_NOT_ACTIVATED",
    ),
    fixedState(
      "Publication",
      publicationLocked ? "LOCKED" : "NOT_READY",
      publicationLocked
        ? "PUBLICATION_LOCKED"
        : "PUBLICATION_LOCK_REQUIRED",
    ),
  ]);
  const capabilities = Object.freeze([
    ...readyChecks,
    ...externalChecks,
  ]);
  const ready =
    offlineMode &&
    openAIProviderDisabled &&
    !input.providerSecretConfigured &&
    zeroBudget &&
    readyChecks.every(({ state }) => state === "READY") &&
    publicationLocked;
  return Object.freeze({
    capabilities,
    contractVersion: "1",
    kind: "PAYMENT_READINESS",
    openAIProviderState: openAIProviderDisabled
      ? "DISABLED"
      : "ENABLED_OR_CONFIGURED",
    openAISecretState: input.providerSecretConfigured
      ? "CONFIGURED"
      : "NOT_CONFIGURED",
    paidCallsAllowed: false,
    paymentState: ready
      ? "PAYMENT_READY_OFFLINE"
      : "PAYMENT_NOT_READY",
    providerMode: evaluation.mode,
    publicationState: publicationLocked ? "LOCKED" : "LOCK_REQUIRED",
    status: ready ? "READY" : "NOT_READY",
    unauthorizedExternalEffectOccurred: false,
  });
}

function verifiedRehearsalReceipt(
  candidate: unknown,
): OfflineProductionRehearsalReceipt | undefined {
  try {
    assertOfflineRehearsalReceipt(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function verifiedDeploymentAttestation(
  candidate: unknown,
): PrivateDeploymentAttestation | undefined {
  const value = record(candidate);
  if (value === undefined) return undefined;
  const { receiptFingerprint, ...unsigned } = value;
  if (
    value.contractVersion !== "2" ||
    value.kind !== "PRIVATE_DEPLOYMENT_ATTESTATION" ||
    value.branch !== "feature/telegram-operator-console" ||
    typeof value.commit !== "string" ||
    !/^[a-f0-9]{40}$/u.test(value.commit) ||
    value.deployed !== true ||
    value.status !== "DEPLOYED_PRIVATE" ||
    value.privateTunnelVerified !== true ||
    !sha256Fingerprint(value.privateTunnelReceiptFingerprint) ||
    value.publicApplicationPorts !== 0 ||
    value.readinessVerified !== true ||
    !sha256Fingerprint(value.rehearsalReceiptFingerprint) ||
    value.rebootRecoveryVerified !== true ||
    value.rollbackVerified !== true ||
    typeof receiptFingerprint !== "string" ||
    receiptFingerprint !== canonicalSha256(unsigned)
  ) {
    return undefined;
  }
  return value as unknown as PrivateDeploymentAttestation;
}

function configuredBudgetIsZero(config: LocalCliConfig): boolean {
  const operationLimit =
    config.runtime.modelOperationLimits?.maxCostUsd ?? 0;
  const positiveRule = config.runtime.modelBudget?.rules.some(
    ({ maxEstimatedCostUsd, maxRequestedCostUsd }) =>
      (maxEstimatedCostUsd ?? 0) > 0 ||
      (maxRequestedCostUsd ?? 0) > 0,
  ) ?? false;
  return operationLimit === 0 && !positiveRule;
}

function readyCapability(
  name: PaymentReadyCapability,
  receipt: OfflineProductionRehearsalReceipt | undefined,
  deployment: PrivateDeploymentAttestation | undefined,
  zeroBudget: boolean,
): PaymentCapabilityCheck {
  const proof = receiptProof(name, receipt, deployment, zeroBudget);
  return Object.freeze({
    name,
    ...(proof.fingerprint === undefined
      ? {}
      : { proofFingerprint: proof.fingerprint }),
    reasonCode: proof.ready
      ? capabilityCode(name, "VERIFIED")
      : capabilityCode(name, "PROOF_REQUIRED"),
    state: proof.ready ? "READY" : "NOT_READY",
  });
}

function receiptProof(
  name: PaymentReadyCapability,
  receipt: OfflineProductionRehearsalReceipt | undefined,
  deployment: PrivateDeploymentAttestation | undefined,
  zeroBudget: boolean,
): Readonly<{ readonly fingerprint?: string; readonly ready: boolean }> {
  if (name === "VPS Deployment") {
    return deployment === undefined
      ? { ready: false }
      : { fingerprint: deployment.receiptFingerprint, ready: true };
  }
  if (receipt === undefined) return { ready: false };
  const operation = (value: string) =>
    receipt.providerReceipts.some((item) => item.operation === value);
  const fingerprint = receipt.receiptFingerprint;
  switch (name) {
    case "Prompt Operating Layer":
      return {
        fingerprint: receipt.content.promptOperatingFingerprint,
        ready: sha256Fingerprint(
          receipt.content.promptOperatingFingerprint,
        ),
      };
    case "Evidence Capsule":
      return {
        fingerprint: receipt.evidence.packFingerprint,
        ready: exact(receipt.evidence.status, "READY"),
      };
    case "Fake Text Provider":
      return { fingerprint, ready: operation("TEXT") };
    case "Fake Research Provider":
      return { fingerprint, ready: operation("RESEARCH") };
    case "Fake Image Provider":
      return { fingerprint, ready: operation("IMAGE") };
    case "Fake Social Transports":
      return {
        fingerprint,
        ready: operation("INSTAGRAM") && operation("TIKTOK"),
      };
    case "Content Pipeline":
      return {
        fingerprint: receipt.content.packageFingerprint,
        ready: exact(receipt.content.status, "SCHEDULED"),
      };
    case "Carousel Renderer":
      return {
        fingerprint: receipt.content.packageFingerprint,
        ready: exact(receipt.content.carouselSlides, 6) && operation("IMAGE"),
      };
    case "Reel Pipeline":
      return {
        fingerprint: receipt.content.reelBlueprintFingerprint,
        ready: operation("VIDEO"),
      };
    case "TikTok Pipeline":
      return {
        fingerprint: receipt.content.tiktokBlueprintFingerprint,
        ready: operation("TIKTOK"),
      };
    case "Brand Assets":
      return {
        fingerprint: receipt.content.brandLockFingerprint,
        ready: true,
      };
    case "Quality Gate":
      return {
        fingerprint: receipt.content.packageFingerprint,
        ready: exact(receipt.content.qualityGate, "PASSED"),
      };
    case "Risk Gate":
      return {
        fingerprint: receipt.content.packageFingerprint,
        ready: exact(receipt.content.riskGate, "PASSED"),
      };
    case "Visual Gate":
      return {
        fingerprint: receipt.decision.visualBindingFingerprint,
        ready: exact(receipt.decision.approvalDecision, "APPROVED"),
      };
    case "Cost Control":
      return {
        fingerprint,
        ready:
          exact(receipt.authorization.costGate.actualCostCents, 0) &&
          exact(receipt.authorization.costGate.actualProviderCalls, 0),
      };
    case "Budget Gate":
      return {
        fingerprint,
        ready:
          zeroBudget &&
          exact(
            receipt.authorization.costGate.spendingAuthorized,
            false,
          ) &&
          exact(
            receipt.authorization.costGate.paidProviderCallsAllowed,
            false,
          ),
      };
    case "Kill Switch":
      return {
        fingerprint: receipt.authorization.fabioApproval.approvalFingerprint,
        ready:
          exact(
            receipt.authorization.publicationKillSwitch
              .lockedAuthorizationDenied,
            true,
          ) &&
          exact(
            receipt.authorization.publicationKillSwitch.finalLocked,
            true,
          ),
      };
    case "H24 Runtime":
      return {
        fingerprint,
        ready:
          exact(receipt.h24Runtime.schedulerStatus, "SCHEDULED") &&
          exact(receipt.h24Runtime.workerStatus, "COMPLETED") &&
          exact(receipt.recovery.h24JobReopenVerified, true),
      };
    case "Backup/Restore":
      return {
        fingerprint: receipt.backup.contentFingerprint,
        ready:
          exact(receipt.backup.restoreVerified, true) &&
          exact(receipt.recovery.fullDatabaseReopenVerified, true) &&
          exact(receipt.recovery.referenceVaultReopenVerified, true),
      };
  }
}

function exact(value: unknown, expected: unknown): boolean {
  return value === expected;
}

function sha256Fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function fixedState(
  name: typeof PAYMENT_EXTERNAL_STATES[number],
  state: PaymentCapabilityCheck["state"],
  reasonCode: string,
): PaymentCapabilityCheck {
  return Object.freeze({ name, reasonCode, state });
}

function capabilityCode(
  name: string,
  suffix: "PROOF_REQUIRED" | "VERIFIED",
): string {
  return `${name.toUpperCase().replaceAll(/[^A-Z0-9]+/gu, "_")}_${suffix}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
