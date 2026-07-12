import { RepositoryConflictError, RepositoryValidationError } from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Validator } from "../../validation/validation.js";
import {
  WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION,
  freezeWorkflowControlCheckpointValue,
  type WorkflowApprovalCheckpoint,
  type WorkflowControlCheckpointEventDraft,
  type WorkflowControlCheckpointEventIdentifierGenerator,
  type WorkflowControlCheckpointService,
  type WorkflowControlCheckpointWriteResult,
  type WorkflowGuardianCheckpoint,
} from "./workflow-control-checkpoint.js";
import {
  WorkflowApprovalCheckpointValidator,
  WorkflowControlCheckpointEventDraftValidator,
  WorkflowGuardianCheckpointValidator,
} from "./workflow-control-checkpoint-validator.js";
import type { WorkflowPersistenceTransaction } from "./workflow-persistence.js";
import { assertWorkflowDefinitionMatchesInstance } from "./workflow-persistence-service.js";
import type { WorkflowDefinition, WorkflowInstance } from "./workflow-runtime.js";

export interface RepositoryBackedWorkflowControlCheckpointDependencies {
  readonly approvalValidator: Validator<WorkflowApprovalCheckpoint>;
  readonly eventDraftValidator: Validator<WorkflowControlCheckpointEventDraft>;
  readonly eventIds: WorkflowControlCheckpointEventIdentifierGenerator;
  readonly guardianValidator: Validator<WorkflowGuardianCheckpoint>;
  readonly guardianAuthorities?: Readonly<Partial<Record<WorkflowGuardianCheckpoint["domain"], string>>>;
  readonly operatorActorId: string;
  readonly repositories: RepositoryTransactionRunner;
}

export class RepositoryBackedWorkflowControlCheckpointService
  implements WorkflowControlCheckpointService
{
  readonly #dependencies: RepositoryBackedWorkflowControlCheckpointDependencies;
  readonly #trustedApprovalValidator = new WorkflowApprovalCheckpointValidator();
  readonly #trustedEventValidator = new WorkflowControlCheckpointEventDraftValidator();
  readonly #trustedGuardianValidator = new WorkflowGuardianCheckpointValidator();

  public constructor(
    dependencies: RepositoryBackedWorkflowControlCheckpointDependencies,
  ) {
    this.#dependencies = dependencies;
  }

  public async recordApproval(
    checkpoint: WorkflowApprovalCheckpoint,
  ): Promise<WorkflowControlCheckpointWriteResult<WorkflowApprovalCheckpoint>> {
    const valid = validate(
      validate(checkpoint, this.#dependencies.approvalValidator, "Workflow approval checkpoint"),
      this.#trustedApprovalValidator,
      "Workflow approval checkpoint",
    );
    if (valid.authorityActorId !== this.#dependencies.operatorActorId) {
      throw new RepositoryValidationError("Workflow approval authority is not permitted");
    }
    return this.#dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.approvals.getById(valid.evidenceId);
      if (existing !== undefined) {
        if (!sameApproval(existing, valid)) {
          throw new RepositoryConflictError("Workflow approval checkpoint ID conflicts with prior evidence", {
            evidenceId: valid.evidenceId,
          });
        }
        await assertReplayEvent(workflows, "APPROVAL", valid.evidenceId);
        return result(existing, "REPLAYED");
      }
      const snapshot = await loadSnapshot(workflows, valid);
      await assertApprovalSupersession(workflows, valid);
      await workflows.approvals.insert(valid);
      await workflows.controlEvents.append(
        this.#event(valid, "APPROVAL", snapshot),
      );
      return result(valid, "APPLIED");
    });
  }

  public async recordGuardian(
    checkpoint: WorkflowGuardianCheckpoint,
  ): Promise<WorkflowControlCheckpointWriteResult<WorkflowGuardianCheckpoint>> {
    const valid = validate(
      validate(checkpoint, this.#dependencies.guardianValidator, "Workflow Guardian checkpoint"),
      this.#trustedGuardianValidator,
      "Workflow Guardian checkpoint",
    );
    const expectedGuardianId = this.#dependencies.guardianAuthorities?.[valid.domain] ?? `guardian-${valid.domain.replace("_", "-")}`;
    if (valid.guardianId !== expectedGuardianId) throw new RepositoryValidationError("Workflow Guardian authority is not permitted");
    return this.#dependencies.repositories.transaction(async ({ workflows }) => {
      const existing = await workflows.guardians.getById(valid.evidenceId);
      if (existing !== undefined) {
        if (!sameGuardian(existing, valid)) {
          throw new RepositoryConflictError("Workflow Guardian checkpoint ID conflicts with prior evidence", {
            evidenceId: valid.evidenceId,
          });
        }
        await assertReplayEvent(workflows, "GUARDIAN", valid.evidenceId);
        return result(existing, "REPLAYED");
      }
      const snapshot = await loadSnapshot(workflows, valid);
      await assertGuardianSupersession(workflows, valid);
      await workflows.guardians.insert(valid);
      await workflows.controlEvents.append(
        this.#event(valid, "GUARDIAN", snapshot),
      );
      return result(valid, "APPLIED");
    });
  }

  #event(
    checkpoint: WorkflowApprovalCheckpoint | WorkflowGuardianCheckpoint,
    kind: "APPROVAL" | "GUARDIAN",
    snapshot: { readonly definition: WorkflowDefinition; readonly instance: WorkflowInstance },
  ): WorkflowControlCheckpointEventDraft {
    if (
      snapshot.definition.definitionId !== checkpoint.definitionId ||
      snapshot.instance.instanceId !== checkpoint.instanceId
    ) {
      throw new RepositoryValidationError("Workflow control checkpoint snapshot changed");
    }
    return validate(
      validate({
        checkpointId: checkpoint.evidenceId,
        checkpointKind: kind,
        contractVersion: WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION,
        eventId: this.#dependencies.eventIds.nextWorkflowControlCheckpointEventId(),
        instanceId: checkpoint.instanceId,
        instanceVersion: checkpoint.instanceVersion,
        nonExecuting: true,
        occurredAt: checkpoint.recordedAt,
        status: checkpoint.status,
        stepId: checkpoint.stepId,
        summaryCode: "workflow_control_checkpoint_recorded",
      }, this.#dependencies.eventDraftValidator, "Workflow control checkpoint event"),
      this.#trustedEventValidator,
      "Workflow control checkpoint event",
    );
  }
}

async function assertReplayEvent(
  workflows: WorkflowPersistenceTransaction,
  kind: "APPROVAL" | "GUARDIAN",
  checkpointId: string,
): Promise<void> {
  if (await workflows.controlEvents.getByCheckpoint(kind, checkpointId) === undefined) {
    throw new RepositoryValidationError(
      "Workflow control checkpoint is missing atomic audit evidence",
    );
  }
}

export function createWorkflowControlCheckpointService(
  dependencies: Omit<
    RepositoryBackedWorkflowControlCheckpointDependencies,
    "approvalValidator" | "eventDraftValidator" | "guardianValidator"
  >,
): RepositoryBackedWorkflowControlCheckpointService {
  return new RepositoryBackedWorkflowControlCheckpointService({
    ...dependencies,
    approvalValidator: new WorkflowApprovalCheckpointValidator(),
    eventDraftValidator: new WorkflowControlCheckpointEventDraftValidator(),
    guardianValidator: new WorkflowGuardianCheckpointValidator(),
  });
}

async function loadSnapshot(
  workflows: WorkflowPersistenceTransaction,
  checkpoint: WorkflowApprovalCheckpoint | WorkflowGuardianCheckpoint,
): Promise<{ readonly definition: WorkflowDefinition; readonly instance: WorkflowInstance }> {
  const instance = await workflows.instances.getById(checkpoint.instanceId);
  if (instance === undefined) {
    throw new RepositoryConflictError("Workflow instance does not exist");
  }
  if (instance.version !== checkpoint.instanceVersion) {
    throw new RepositoryConflictError("Workflow control checkpoint snapshot is stale");
  }
  const definition = await workflows.definitions.getById(instance.definitionId);
  if (definition === undefined) {
    throw new RepositoryValidationError("Workflow instance references a missing definition");
  }
  assertWorkflowDefinitionMatchesInstance(definition, instance);
  if (
    definition.definitionId !== checkpoint.definitionId ||
    definition.workflowVersion !== checkpoint.workflowVersion ||
    !definition.steps.some(({ stepId }) => stepId === checkpoint.stepId)
  ) {
    throw new RepositoryConflictError("Workflow control checkpoint does not match the current snapshot");
  }
  return { definition, instance };
}

async function assertApprovalSupersession(
  workflows: WorkflowPersistenceTransaction,
  checkpoint: WorkflowApprovalCheckpoint,
): Promise<void> {
  const records = await workflows.approvals.listBySnapshot(
    checkpoint.instanceId,
    checkpoint.instanceVersion,
    checkpoint.stepId,
  );
  await assertSupersession(
    records,
    checkpoint,
    (left, right) => left.authorityActorId === right.authorityActorId,
  );
}

async function assertGuardianSupersession(
  workflows: WorkflowPersistenceTransaction,
  checkpoint: WorkflowGuardianCheckpoint,
): Promise<void> {
  const records = await workflows.guardians.listBySnapshot(
    checkpoint.instanceId,
    checkpoint.instanceVersion,
    checkpoint.stepId,
  );
  await assertSupersession(
    records.filter(({ domain }) => domain === checkpoint.domain),
    checkpoint,
    (left, right) =>
      left.domain === right.domain && left.guardianId === right.guardianId,
  );
}

function assertSupersession<T extends {
  readonly evidenceId: string;
  readonly recordedAt: string;
  readonly supersedesEvidenceId?: string;
}>(
  records: readonly T[],
  checkpoint: T,
  sameAuthority: (left: T, right: T) => boolean,
): Promise<void> {
  const previous = records.at(-1);
  if (previous === undefined) {
    if (checkpoint.supersedesEvidenceId !== undefined) {
      throw new RepositoryConflictError("Initial workflow control evidence cannot supersede a missing checkpoint");
    }
    return Promise.resolve();
  }
  if (
    checkpoint.supersedesEvidenceId !== previous.evidenceId ||
    !sameAuthority(previous, checkpoint) ||
    Date.parse(previous.recordedAt) >= Date.parse(checkpoint.recordedAt)
  ) {
    throw new RepositoryConflictError(
      "Workflow control checkpoint must supersede the latest matching evidence",
    );
  }
  return Promise.resolve();
}

function sameApproval(
  left: WorkflowApprovalCheckpoint,
  right: WorkflowApprovalCheckpoint,
): boolean {
  return sameBase(left, right) &&
    left.authorityActorId === right.authorityActorId &&
    left.status === right.status;
}

function sameGuardian(
  left: WorkflowGuardianCheckpoint,
  right: WorkflowGuardianCheckpoint,
): boolean {
  return sameBase(left, right) &&
    left.domain === right.domain &&
    left.guardianId === right.guardianId &&
    left.status === right.status;
}

function sameBase(
  left: WorkflowApprovalCheckpoint | WorkflowGuardianCheckpoint,
  right: WorkflowApprovalCheckpoint | WorkflowGuardianCheckpoint,
): boolean {
  return left.definitionId === right.definitionId &&
    left.evidenceId === right.evidenceId &&
    left.instanceId === right.instanceId &&
    left.instanceVersion === right.instanceVersion &&
    left.recordedAt === right.recordedAt &&
    left.stepId === right.stepId &&
    left.supersedesEvidenceId === right.supersedesEvidenceId &&
    left.workflowVersion === right.workflowVersion;
}

function result<T>(
  checkpoint: T,
  outcome: "APPLIED" | "REPLAYED",
): WorkflowControlCheckpointWriteResult<T> {
  return freezeWorkflowControlCheckpointValue({
    checkpoint,
    contractVersion: WORKFLOW_CONTROL_CHECKPOINT_CONTRACT_VERSION,
    nonExecuting: true,
    outcome,
  });
}

function validate<T>(value: unknown, validator: Validator<T>, label: string): T {
  const validation = validator.validate(value);
  if (!validation.ok) {
    throw new RepositoryValidationError(`${label} failed validation`);
  }
  return validation.value;
}
