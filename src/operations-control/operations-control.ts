export const OPERATIONS_CONTROL_CONTRACT_VERSION = "1" as const;

export const OPERATIONS_CONTROL_ACTIONS = Object.freeze([
  "REQUEST_PRODUCTION_REVISION",
  "PAUSE_PRODUCTION",
  "RESUME_PRODUCTION",
  "CANCEL_PRODUCTION",
  "RETRY_FAILED_JOB",
  "REQUEUE_DEAD_LETTER_JOB",
  "ACKNOWLEDGE_INCIDENT",
] as const);

export type OperationsControlAction = typeof OPERATIONS_CONTROL_ACTIONS[number];
export type ProductionExecutionState = "ACTIVE" | "CANCELLED" | "PAUSED" | "REVISION_REQUIRED";
export type RevisionCategory = "ASSET" | "CAPTION" | "CLAIM" | "EVIDENCE" | "SLIDE";
export type RevisionPriority = "HIGH" | "LOW" | "MEDIUM";

export interface StructuredControlReason {
  readonly code: string;
  readonly detail: string;
}

export interface ProductionRevisionTarget {
  readonly kind: RevisionCategory;
  readonly reference: string;
}

export interface ProductionRevisionRequest {
  readonly category: RevisionCategory;
  readonly createdAt: string;
  readonly priority: RevisionPriority;
  readonly reason: StructuredControlReason;
  readonly requestedBy: string;
  readonly revisionId: string;
  readonly sourcePackageFingerprint: string;
  readonly sourceProductionVersion: number;
  readonly status: "REQUESTED";
  readonly targets: readonly ProductionRevisionTarget[];
}

export interface ProductionControlHistoryEntry {
  readonly action: "CANCEL" | "PAUSE" | "REQUEST_REVISION" | "RESUME";
  readonly actorId: string;
  readonly occurredAt: string;
  readonly reasonCode: string;
  readonly state: ProductionExecutionState;
  readonly version: number;
}

/**
 * Separate execution aggregate: the original content package remains immutable.
 * A revision request invalidates the effective approval without silently creating
 * a replacement package. A new package can only be materialised by the existing
 * production boundary and its gates.
 */
export interface ProductionControlRecord {
  readonly actorId: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly history: readonly ProductionControlHistoryEntry[];
  readonly productionId: string;
  readonly revisions: readonly ProductionRevisionRequest[];
  readonly sourcePackageFingerprint: string;
  readonly sourceProductionVersion: number;
  readonly state: ProductionExecutionState;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface OperationsIncidentRecord {
  readonly acknowledgedAt?: string;
  readonly acknowledgedBy?: string;
  readonly actorId: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly fingerprint: string;
  readonly incidentId: string;
  readonly severity: "CRITICAL" | "HIGH" | "LOW" | "MEDIUM";
  readonly status: "ACKNOWLEDGED" | "OPEN";
  readonly summaryCode: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface ControlActionTarget {
  readonly entityFingerprint: string;
  readonly entityId: string;
  readonly entityVersion: number;
  readonly kind: "INCIDENT" | "JOB" | "PRODUCTION";
}

export interface ControlActionProposal {
  readonly action: OperationsControlAction;
  readonly actorId: string;
  readonly confirmationTokenHash: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly idempotencyKey: string;
  readonly proposalId: string;
  readonly reason: StructuredControlReason;
  readonly revision?: {
    readonly category: RevisionCategory;
    readonly priority: RevisionPriority;
    readonly targets: readonly ProductionRevisionTarget[];
  };
  readonly state: "CONSUMED" | "EXPIRED" | "PENDING";
  readonly target: ControlActionTarget;
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export interface ControlActionReceipt {
  readonly action: OperationsControlAction;
  readonly actorId: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly idempotencyKey: string;
  readonly outcomeFingerprint: string;
  readonly proposalId: string;
  readonly receiptId: string;
  readonly recordedAt: string;
  readonly resultEntityId: string;
  readonly resultEntityVersion: number;
  readonly target: ControlActionTarget;
  readonly workspaceId: string;
}

export interface ProposeControlActionInput {
  readonly action: OperationsControlAction;
  readonly actorId: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly entityId: string;
  readonly entityVersion: number;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly reason: StructuredControlReason;
  readonly revision?: {
    readonly category: RevisionCategory;
    readonly priority: RevisionPriority;
    readonly targets: readonly ProductionRevisionTarget[];
  };
  readonly workspaceId: string;
}

export interface ConfirmControlActionInput {
  readonly actorId: string;
  readonly confirmationToken: string;
  readonly contractVersion: typeof OPERATIONS_CONTROL_CONTRACT_VERSION;
  readonly entityFingerprint: string;
  readonly proposalId: string;
  readonly workspaceId: string;
}

export type OperatorProposeControlActionBody = Omit<ProposeControlActionInput, "actorId" | "workspaceId">;
export type OperatorConfirmControlActionBody = Omit<ConfirmControlActionInput, "actorId" | "workspaceId">;

export interface ProposedControlAction {
  readonly confirmationToken?: string;
  readonly proposal: ControlActionProposal;
  readonly receipt?: ControlActionReceipt;
  readonly replayed: boolean;
}
