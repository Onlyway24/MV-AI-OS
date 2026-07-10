import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type {
  RepositoryTransactionRunner,
} from "../../persistence/repository-transaction.js";
import {
  createWorkflowCommandFingerprint,
} from "./workflow-command-fingerprint.js";
import {
  DeterministicWorkflowStateMachine,
  WorkflowStateError,
} from "./deterministic-workflow-state-machine.js";
import {
  type WorkflowCommandReceipt,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowTransitionResult,
} from "./workflow-runtime.js";
import {
  type WorkflowCommandApplication,
  type WorkflowEventDraft,
  type WorkflowEventIdentifierGenerator,
  type WorkflowPersistenceService,
} from "./workflow-persistence.js";
import {
  WorkflowCommandApplicationValidator,
  WorkflowEventDraftValidator,
} from "./workflow-persistence-validator.js";
import {
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
} from "./workflow-runtime-validator.js";
import type { Validator } from "../../validation/validation.js";

export interface RepositoryBackedWorkflowPersistenceDependencies {
  readonly commandApplicationValidator: Validator<WorkflowCommandApplication>;
  readonly definitionValidator: Validator<WorkflowDefinition>;
  readonly eventDraftValidator: Validator<WorkflowEventDraft>;
  readonly eventIds: WorkflowEventIdentifierGenerator;
  readonly instanceValidator: Validator<WorkflowInstance>;
  readonly repositories: RepositoryTransactionRunner;
  readonly stateMachine: DeterministicWorkflowStateMachine;
}

export class RepositoryBackedWorkflowPersistenceService
  implements WorkflowPersistenceService
{
  readonly #commandApplicationValidator: Validator<WorkflowCommandApplication>;
  readonly #definitionValidator: Validator<WorkflowDefinition>;
  readonly #eventDraftValidator: Validator<WorkflowEventDraft>;
  readonly #eventIds: WorkflowEventIdentifierGenerator;
  readonly #instanceValidator: Validator<WorkflowInstance>;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #stateMachine: DeterministicWorkflowStateMachine;

  public constructor(dependencies: RepositoryBackedWorkflowPersistenceDependencies) {
    this.#commandApplicationValidator =
      dependencies.commandApplicationValidator;
    this.#definitionValidator = dependencies.definitionValidator;
    this.#eventDraftValidator = dependencies.eventDraftValidator;
    this.#eventIds = dependencies.eventIds;
    this.#instanceValidator = dependencies.instanceValidator;
    this.#repositories = dependencies.repositories;
    this.#stateMachine = dependencies.stateMachine;
  }

  public createDefinition(definition: WorkflowDefinition): Promise<void> {
    const validDefinition = validate(
      definition,
      this.#definitionValidator,
      "Workflow definition",
    );
    return this.#repositories.transaction(({ workflows }) =>
      workflows.definitions.insert(validDefinition),
    );
  }

  public async createInstance(instance: WorkflowInstance): Promise<void> {
    const validInstance = validate(
      instance,
      this.#instanceValidator,
      "Workflow instance",
    );
    if (validInstance.version !== 0 || validInstance.receipts.length !== 0) {
      throw new RepositoryValidationError(
        "A new workflow instance cannot contain processed commands",
        { instanceId: validInstance.instanceId },
      );
    }
    await this.#repositories.transaction(async ({ workflows }) => {
      const definition = await workflows.definitions.getById(
        validInstance.definitionId,
      );
      if (definition === undefined) {
        throw new RepositoryValidationError(
          "Workflow instance references a missing definition",
          {
            definitionId: validInstance.definitionId,
            instanceId: validInstance.instanceId,
          },
        );
      }
      assertDefinitionMatchesInstance(definition, validInstance);
      await workflows.instances.insert(validInstance);
    });
  }

  public async applyCommand(
    application: WorkflowCommandApplication,
  ): Promise<WorkflowTransitionResult> {
    const validApplication = validate(
      application,
      this.#commandApplicationValidator,
      "Workflow command application",
    );
    return this.#repositories.transaction(async ({ workflows }) => {
      const instance = await workflows.instances.getById(
        validApplication.instanceId,
      );
      if (instance === undefined) {
        throw new RepositoryConflictError("Workflow instance does not exist", {
          instanceId: validApplication.instanceId,
        });
      }
      const definition = await workflows.definitions.getById(
        instance.definitionId,
      );
      if (definition === undefined) {
        throw new RepositoryValidationError(
          "Workflow instance references a missing definition",
          {
            definitionId: instance.definitionId,
            instanceId: instance.instanceId,
          },
        );
      }
      assertDefinitionMatchesInstance(definition, instance);

      const persistedReceipts = await workflows.receipts.listByInstanceId(
        instance.instanceId,
      );
      assertReceiptConsistency(instance, persistedReceipts);
      const fingerprint = createWorkflowCommandFingerprint(
        validApplication.command,
      );
      const existingReceipt = persistedReceipts.find(
        ({ commandId }) => commandId === validApplication.command.commandId,
      );
      if (existingReceipt !== undefined) {
        if (existingReceipt.fingerprint !== fingerprint) {
          throw new RepositoryConflictError(
            "Workflow command ID conflicts with prior command",
            {
              commandId: validApplication.command.commandId,
              instanceId: instance.instanceId,
            },
          );
        }
        return freeze({
          instance,
          nonExecuting: true,
          outcome: "REPLAYED" as const,
        });
      }

      const transition = applyStateMachine(
        this.#stateMachine,
        instance,
        validApplication,
      );
      if (transition.outcome !== "APPLIED") {
        throw new RepositoryValidationError(
          "Workflow transition replay lacks a durable command receipt",
          { instanceId: instance.instanceId },
        );
      }
      const receipt = transition.instance.receipts.at(-1);
      if (receipt?.fingerprint !== fingerprint) {
        throw new RepositoryValidationError(
          "Workflow transition did not produce a valid command receipt",
          { instanceId: instance.instanceId },
        );
      }

      await workflows.instances.update(transition.instance, {
        version: instance.version,
      });
      await workflows.receipts.insert(instance.instanceId, receipt);
      await workflows.events.append(
        this.#eventDraft(
          definition,
          instance,
          transition.instance,
          validApplication,
        ),
      );
      return transition;
    });
  }

  #eventDraft(
    definition: WorkflowDefinition,
    previous: WorkflowInstance,
    next: WorkflowInstance,
    application: WorkflowCommandApplication,
  ): WorkflowEventDraft {
    const previousStep = stepFor(previous, application.command.stepId);
    const nextStep = stepFor(next, application.command.stepId);
    const stepTransition = createStepTransition(
      previous.instanceId,
      previousStep,
      nextStep,
    );
    const draft: WorkflowEventDraft = {
      actorCategory: application.actorCategory,
      commandId: application.command.commandId,
      commandKind: application.command.kind,
      contractVersion: "1",
      definitionId: definition.definitionId,
      eventId: this.#eventIds.nextWorkflowEventId(),
      instanceId: next.instanceId,
      instanceVersion: next.version,
      nextStatus: next.status,
      ...stepTransition,
      nonExecuting: true,
      occurredAt: next.updatedAt,
      previousStatus: previous.status,
      reasonCode: application.command.reasonCode,
      summaryCode: "workflow_transition_applied",
      workflowId: definition.workflowId,
      workflowVersion: definition.workflowVersion,
    };
    return validate(draft, this.#eventDraftValidator, "Workflow event draft");
  }
}

export function createWorkflowPersistenceService(
  dependencies: Omit<
    RepositoryBackedWorkflowPersistenceDependencies,
    | "commandApplicationValidator"
    | "definitionValidator"
    | "eventDraftValidator"
    | "instanceValidator"
  >,
): RepositoryBackedWorkflowPersistenceService {
  return new RepositoryBackedWorkflowPersistenceService({
    ...dependencies,
    commandApplicationValidator: new WorkflowCommandApplicationValidator(),
    definitionValidator: new WorkflowDefinitionValidator(),
    eventDraftValidator: new WorkflowEventDraftValidator(),
    instanceValidator: new WorkflowInstanceValidator(),
  });
}

function applyStateMachine(
  stateMachine: DeterministicWorkflowStateMachine,
  instance: WorkflowInstance,
  application: WorkflowCommandApplication,
): WorkflowTransitionResult {
  try {
    return stateMachine.apply(instance, application.command);
  } catch (error) {
    if (error instanceof WorkflowStateError) {
      throw new RepositoryConflictError(
        "Workflow command cannot be applied to the persisted state",
        {
          code: error.code,
          instanceId: instance.instanceId,
        },
      );
    }
    throw error;
  }
}

function assertDefinitionMatchesInstance(
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
): void {
  const definitionStepIds = definition.steps.map(({ stepId }) => stepId);
  const instanceStepIds = instance.steps.map(({ stepId }) => stepId);
  if (
    definitionStepIds.length !== instanceStepIds.length ||
    definitionStepIds.some((stepId, index) => stepId !== instanceStepIds[index])
  ) {
    throw new RepositoryValidationError(
      "Workflow instance steps do not match its definition",
      {
        definitionId: definition.definitionId,
        instanceId: instance.instanceId,
      },
    );
  }
}

function assertReceiptConsistency(
  instance: WorkflowInstance,
  receipts: readonly WorkflowCommandReceipt[],
): void {
  if (
    instance.receipts.length !== receipts.length ||
    instance.receipts.some(
      (receipt, index) => !sameReceipt(receipt, receipts.at(index)),
    )
  ) {
    throw new RepositoryValidationError(
      "Workflow command receipts do not match the workflow instance",
      { instanceId: instance.instanceId },
    );
  }
}

function sameReceipt(
  expected: WorkflowCommandReceipt,
  actual: WorkflowCommandReceipt | undefined,
): boolean {
  return (
    expected.commandId === actual?.commandId &&
    expected.fingerprint === actual.fingerprint &&
    expected.resultingVersion === actual.resultingVersion
  );
}

function stepFor(
  instance: WorkflowInstance,
  stepId: string | undefined,
) {
  return stepId === undefined
    ? undefined
    : instance.steps.find((step) => step.stepId === stepId);
}

function createStepTransition(
  instanceId: string,
  previousStep: ReturnType<typeof stepFor>,
  nextStep: ReturnType<typeof stepFor>,
):
  | {
      readonly nextStepStatus: NonNullable<ReturnType<typeof stepFor>>["status"];
      readonly previousStepStatus: NonNullable<ReturnType<typeof stepFor>>["status"];
      readonly stepId: string;
    }
  | Record<never, never> {
  if (nextStep === undefined) {
    return {};
  }
  if (previousStep === undefined) {
    throw new RepositoryValidationError(
      "Workflow transition step is missing from the previous instance",
      { instanceId },
    );
  }
  return {
    nextStepStatus: nextStep.status,
    previousStepStatus: previousStep.status,
    stepId: nextStep.stepId,
  };
}

function validate<T>(
  value: unknown,
  validator: Validator<T>,
  label: string,
): T {
  const validation = validator.validate(value);
  if (!validation.ok) {
    throw new RepositoryValidationError(`${label} failed validation`);
  }
  return validation.value;
}

function freeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    freeze(entry);
  }
  return value;
}
