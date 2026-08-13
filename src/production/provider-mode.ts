import type { LocalContentAgentMode } from "../runtime/local-runtime-config.js";
import type { ModelBudgetConfig } from "../models/model-budget.js";
import type { ModelOperationLimits } from "../models/model-operation-limits.js";

export const PRODUCTION_PROVIDER_MODES = Object.freeze([
  "OFFLINE_REHEARSAL",
  "LOCAL_PROVIDER_OPTIONAL",
  "LIVE_PAID",
] as const);

export const DEFAULT_PRODUCTION_PROVIDER_MODE = "OFFLINE_REHEARSAL" as const;
export const LIVE_PAID_ACTIVATION_CONTRACT_VERSION = "1" as const;
export const LIVE_PAID_ACTIVATION_SCOPE = "OPENAI_RESPONSES_PAID" as const;
export const MAX_LIVE_PAID_ACTIVATION_MILLISECONDS = 86_400_000;

export type ProductionProviderMode = typeof PRODUCTION_PROVIDER_MODES[number];

export interface LivePaidActivation {
  readonly activationId: string;
  readonly approvalReceiptId: string;
  readonly approvedAt: string;
  readonly approvedBy: string;
  readonly confirmedByFabio: true;
  readonly contractVersion: typeof LIVE_PAID_ACTIVATION_CONTRACT_VERSION;
  readonly expiresAt: string;
  readonly killSwitch: "RELEASED";
  readonly maxCostUsd: number;
  readonly scope: typeof LIVE_PAID_ACTIVATION_SCOPE;
  readonly workspaceId: string;
}

export type ProviderPolicyReasonCode =
  | "LIVE_ACTIVATION_BUDGET_INVALID"
  | "LIVE_ACTIVATION_EXPIRED"
  | "LIVE_ACTIVATION_INVALID"
  | "LIVE_ACTIVATION_REQUIRED"
  | "LIVE_COST_CONTROL_BOUNDARY_REQUIRED"
  | "LIVE_PROVIDER_REQUIRED"
  | "LOCAL_PROVIDER_ENDPOINT_REQUIRED"
  | "PAID_PROVIDER_DISABLED"
  | "UNEXPECTED_LIVE_ACTIVATION";

export interface ProviderModeEvaluation {
  readonly contractVersion: "1";
  readonly mode: ProductionProviderMode;
  readonly paidCallsAllowed: boolean;
  readonly ready: boolean;
  readonly reasonCodes: readonly ProviderPolicyReasonCode[];
}

export interface ProviderModePolicyInput {
  readonly contentAgentMode: LocalContentAgentMode;
  readonly livePaidActivation?: LivePaidActivation;
  readonly modelBudget?: ModelBudgetConfig;
  readonly modelOperationLimits?: ModelOperationLimits;
  readonly modelProvider?: Readonly<{
    readonly baseUrl: string;
    readonly modelId: string;
    readonly providerId: string;
  }>;
  readonly now: Date;
  readonly providerMode?: ProductionProviderMode;
  /**
   * Compatibility boundary for dependency-injected, deterministic transports
   * used by tests. Production CLI composition never installs this override.
   */
  readonly trustedOfflineTransportInstalled?: boolean;
  /**
   * Capability injected only by a future, command-bound production
   * composition that wraps every paid provider call in durable Cost Control.
   * The current production CLI deliberately never installs this capability.
   */
  readonly trustedLiveCostControlBoundaryInstalled?: boolean;
  readonly workspaceId: string;
}

export function isProductionProviderMode(
  value: unknown,
): value is ProductionProviderMode {
  return typeof value === "string" &&
    (PRODUCTION_PROVIDER_MODES as readonly string[]).includes(value);
}

export function resolveProductionProviderMode(
  mode: ProductionProviderMode | undefined,
): ProductionProviderMode {
  return mode ?? DEFAULT_PRODUCTION_PROVIDER_MODE;
}

export function isLoopbackProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "::1" ||
        url.hostname === "localhost") &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.hash.length === 0 &&
      url.search.length === 0
    );
  } catch {
    return false;
  }
}

export function evaluateProviderModePolicy(
  input: ProviderModePolicyInput,
): ProviderModeEvaluation {
  const mode = resolveProductionProviderMode(input.providerMode);
  const reasons = new Set<ProviderPolicyReasonCode>();

  if (mode === "OFFLINE_REHEARSAL") {
    if (input.livePaidActivation !== undefined) {
      reasons.add("UNEXPECTED_LIVE_ACTIVATION");
    }
    if (
      input.contentAgentMode === "model-backed-openai" &&
      input.trustedOfflineTransportInstalled !== true
    ) {
      reasons.add("PAID_PROVIDER_DISABLED");
    }
  } else if (mode === "LOCAL_PROVIDER_OPTIONAL") {
    if (input.livePaidActivation !== undefined) {
      reasons.add("UNEXPECTED_LIVE_ACTIVATION");
    }
    if (
      input.contentAgentMode === "model-backed-openai" &&
      (input.modelProvider === undefined ||
        !isLoopbackProviderBaseUrl(input.modelProvider.baseUrl))
    ) {
      reasons.add("LOCAL_PROVIDER_ENDPOINT_REQUIRED");
    }
  } else {
    evaluateLivePaidPolicy(input, reasons);
  }

  const reasonCodes = Object.freeze([...reasons].sort());
  return Object.freeze({
    contractVersion: "1",
    mode,
    paidCallsAllowed: mode === "LIVE_PAID" && reasonCodes.length === 0,
    ready: reasonCodes.length === 0,
    reasonCodes,
  });
}

function evaluateLivePaidPolicy(
  input: ProviderModePolicyInput,
  reasons: Set<ProviderPolicyReasonCode>,
): void {
  if (input.trustedLiveCostControlBoundaryInstalled !== true) {
    reasons.add("LIVE_COST_CONTROL_BOUNDARY_REQUIRED");
  }
  if (
    input.contentAgentMode !== "model-backed-openai" ||
    input.modelProvider?.providerId !== "openai"
  ) {
    reasons.add("LIVE_PROVIDER_REQUIRED");
  }

  const activation = input.livePaidActivation;
  if (activation === undefined) {
    reasons.add("LIVE_ACTIVATION_REQUIRED");
    return;
  }

  const approvedAt = Date.parse(activation.approvedAt);
  const expiresAt = Date.parse(activation.expiresAt);
  const now = input.now.getTime();
  if (
    activation.workspaceId !== input.workspaceId ||
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    approvedAt > now ||
    expiresAt <= approvedAt ||
    expiresAt - approvedAt > MAX_LIVE_PAID_ACTIVATION_MILLISECONDS
  ) {
    reasons.add("LIVE_ACTIVATION_INVALID");
  }
  if (expiresAt <= now) {
    reasons.add("LIVE_ACTIVATION_EXPIRED");
  }

  const operationCost = input.modelOperationLimits?.maxCostUsd;
  const matchingBudget = input.modelBudget?.rules.find(
    ({ modelId, profileId, providerId }) =>
      modelId === input.modelProvider?.modelId &&
      profileId === "content-quality" &&
      providerId === "openai",
  );
  const budgetLimit = matchingBudget?.maxRequestedCostUsd ??
    matchingBudget?.maxEstimatedCostUsd;
  if (
    input.modelBudget?.required !== true ||
    matchingBudget === undefined ||
    operationCost === undefined ||
    operationCost <= 0 ||
    operationCost > activation.maxCostUsd ||
    budgetLimit === undefined ||
    budgetLimit <= 0 ||
    budgetLimit > activation.maxCostUsd
  ) {
    reasons.add("LIVE_ACTIVATION_BUDGET_INVALID");
  }
}
