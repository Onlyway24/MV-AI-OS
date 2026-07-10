import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Validator } from "../../validation/validation.js";
import {
  DeterministicWorkflowReadinessEngine,
  isWorkflowReadinessEvaluationWithinBounds,
} from "./deterministic-workflow-readiness-engine.js";
import {
  assertWorkflowDefinitionMatchesInstance,
  assertWorkflowReceiptConsistency,
} from "./workflow-persistence-service.js";
import type {
  WorkflowDefinition,
  WorkflowInstance,
} from "./workflow-runtime.js";
import type {
  WorkflowReadinessEngine,
  WorkflowReadinessFinding,
  WorkflowReadinessRequest,
  WorkflowReadinessResult,
  WorkflowReadinessService,
} from "./workflow-readiness.js";
import {
  WorkflowReadinessRequestValidator,
  WorkflowReadinessResultValidator,
} from "./workflow-readiness-validator.js";

export interface RepositoryBackedWorkflowReadinessDependencies {
  readonly engine: WorkflowReadinessEngine;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<WorkflowReadinessRequest>;
  readonly resultValidator: Validator<WorkflowReadinessResult>;
}

export class RepositoryBackedWorkflowReadinessService
  implements WorkflowReadinessService
{
  readonly #engine: WorkflowReadinessEngine;
  readonly #canonicalEngine: DeterministicWorkflowReadinessEngine;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #requestValidator: Validator<WorkflowReadinessRequest>;
  readonly #resultValidator: Validator<WorkflowReadinessResult>;
  readonly #trustedRequestValidator = new WorkflowReadinessRequestValidator();
  readonly #trustedResultValidator = new WorkflowReadinessResultValidator();

  public constructor(dependencies: RepositoryBackedWorkflowReadinessDependencies) {
    this.#engine = dependencies.engine;
    this.#canonicalEngine = new DeterministicWorkflowReadinessEngine(
      new WorkflowReadinessResultValidator(),
    );
    this.#repositories = dependencies.repositories;
    this.#requestValidator = dependencies.requestValidator;
    this.#resultValidator = dependencies.resultValidator;
  }

  public async evaluate(
    request: WorkflowReadinessRequest,
  ): Promise<WorkflowReadinessResult> {
    const validRequest = validate(
      validate(
        request,
        this.#requestValidator,
        "Workflow readiness request",
      ),
      this.#trustedRequestValidator,
      "Workflow readiness request",
    );
    return this.#repositories.transaction(async ({ workflows }) => {
      const instance = await workflows.instances.getById(validRequest.instanceId);
      if (instance === undefined) {
        throw new RepositoryConflictError("Workflow instance does not exist");
      }
      if (instance.version !== validRequest.expectedVersion) {
        throw new RepositoryConflictError("Workflow readiness snapshot is stale");
      }
      const definition = await workflows.definitions.getById(
        instance.definitionId,
      );
      if (definition === undefined) {
        throw new RepositoryValidationError(
          "Workflow instance references a missing definition",
        );
      }
      assertWorkflowDefinitionMatchesInstance(definition, instance);
      if (!isWorkflowReadinessEvaluationWithinBounds(definition, instance)) {
        throw new RepositoryValidationError(
          "Workflow readiness evaluation exceeds supported bounds",
        );
      }
      const receipts = await workflows.receipts.listByInstanceId(
        instance.instanceId,
      );
      assertWorkflowReceiptConsistency(instance, receipts);
      assertControlEvidenceMatchesDefinition(definition, validRequest);

      const result = validate(
        validate(
          this.#engine.evaluate(definition, instance, validRequest),
          this.#resultValidator,
          "Workflow readiness result",
        ),
        this.#trustedResultValidator,
        "Workflow readiness result",
      );
      const canonicalResult = this.#canonicalEngine.evaluate(
        definition,
        instance,
        validRequest,
      );
      if (!sameReadinessResult(result, canonicalResult)) {
        throw new RepositoryValidationError(
          "Workflow readiness result violates the deterministic policy",
        );
      }
      assertResultMatchesSnapshot(result, definition, instance, validRequest);
      return result;
    });
  }
}

export function createWorkflowReadinessService(
  dependencies: Omit<
    RepositoryBackedWorkflowReadinessDependencies,
    "engine" | "requestValidator" | "resultValidator"
  >,
): RepositoryBackedWorkflowReadinessService {
  const resultValidator = new WorkflowReadinessResultValidator();
  return new RepositoryBackedWorkflowReadinessService({
    ...dependencies,
    engine: new DeterministicWorkflowReadinessEngine(resultValidator),
    requestValidator: new WorkflowReadinessRequestValidator(),
    resultValidator,
  });
}

function assertControlEvidenceMatchesDefinition(
  definition: WorkflowDefinition,
  request: WorkflowReadinessRequest,
): void {
  const definitionsByStepId = new Map(
    definition.steps.map((step) => [step.stepId, step]),
  );
  for (const stepId of request.approvedStepIds) {
    if (definitionsByStepId.get(stepId)?.approvalRequired !== true) {
      throw new RepositoryValidationError(
        "Workflow approval evidence does not match declared controls",
      );
    }
  }
  for (const stepId of request.guardianSatisfiedStepIds) {
    if (definitionsByStepId.get(stepId)?.guardianRequired !== true) {
      throw new RepositoryValidationError(
        "Workflow Guardian evidence does not match declared controls",
      );
    }
  }
}

function assertResultMatchesSnapshot(
  result: WorkflowReadinessResult,
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
  request: WorkflowReadinessRequest,
): void {
  if (
    result.definitionId !== definition.definitionId ||
    result.instanceId !== instance.instanceId ||
    result.evaluatedVersion !== instance.version ||
    result.workflowStatus !== instance.status ||
    result.stateUpdatedAt !== instance.updatedAt ||
    result.blockedFindings.length > request.maxResults ||
    result.pendingFindings.length > request.maxResults ||
    result.readyFindings.length > request.maxResults ||
    result.terminalFindings.length > request.maxResults
  ) {
    throw new RepositoryValidationError(
      "Workflow readiness result does not match the persisted snapshot",
    );
  }
  if (
    result.summary.blockedCount +
      result.summary.pendingCount +
      result.summary.readyCount +
      result.summary.terminalCount !==
    definition.steps.length
  ) {
    throw new RepositoryValidationError(
      "Workflow readiness result does not classify every step",
    );
  }
  if (
    (instance.status === "CANCELLED" ||
      instance.status === "COMPLETED" ||
      instance.status === "FAILED") &&
    (result.summary.blockedCount !== 0 ||
      result.summary.pendingCount !== 0 ||
      result.summary.readyCount !== 0 ||
      result.summary.terminalCount !== definition.steps.length)
  ) {
    throw new RepositoryValidationError(
      "Workflow readiness result is invalid for a terminal workflow",
    );
  }
  if (
    instance.status === "PAUSED" &&
    (result.summary.pendingCount !== 0 || result.summary.readyCount !== 0)
  ) {
    throw new RepositoryValidationError(
      "Workflow readiness result is invalid for a paused workflow",
    );
  }

  const instancesByStepId = new Map(
    instance.steps.map((step) => [step.stepId, step]),
  );
  const definitionsByStepId = new Set(
    definition.steps.map((step) => step.stepId),
  );
  for (const finding of allFindings(result)) {
    const persisted = instancesByStepId.get(finding.stepId);
    if (
      !definitionsByStepId.has(finding.stepId) ||
      persisted?.status !== finding.persistedStatus
    ) {
      throw new RepositoryValidationError(
        "Workflow readiness result references an invalid step",
      );
    }
  }
  assertDefinitionOrder(result, definition);
}

function assertDefinitionOrder(
  result: WorkflowReadinessResult,
  definition: WorkflowDefinition,
): void {
  const orderByStepId = new Map(
    definition.steps.map(({ stepId }, index) => [stepId, index]),
  );
  for (const findings of [
    result.blockedFindings,
    result.pendingFindings,
    result.readyFindings,
    result.terminalFindings,
  ]) {
    let previousIndex = -1;
    for (const { stepId } of findings) {
      const index = orderByStepId.get(stepId);
      if (index === undefined || index <= previousIndex) {
        throw new RepositoryValidationError(
          "Workflow readiness results must use definition order",
        );
      }
      previousIndex = index;
    }
  }
}

function allFindings(
  result: WorkflowReadinessResult,
): readonly WorkflowReadinessFinding[] {
  return [
    ...result.blockedFindings,
    ...result.pendingFindings,
    ...result.readyFindings,
    ...result.terminalFindings,
  ];
}

function sameReadinessResult(
  actual: WorkflowReadinessResult,
  expected: WorkflowReadinessResult,
): boolean {
  return (
    actual.definitionId === expected.definitionId &&
    actual.evaluatedVersion === expected.evaluatedVersion &&
    actual.instanceId === expected.instanceId &&
    actual.stateUpdatedAt === expected.stateUpdatedAt &&
    actual.workflowStatus === expected.workflowStatus &&
    sameSummary(actual.summary, expected.summary) &&
    sameFindings(actual.blockedFindings, expected.blockedFindings) &&
    sameFindings(actual.pendingFindings, expected.pendingFindings) &&
    sameFindings(actual.readyFindings, expected.readyFindings) &&
    sameFindings(actual.terminalFindings, expected.terminalFindings)
  );
}

function sameSummary(
  actual: WorkflowReadinessResult["summary"],
  expected: WorkflowReadinessResult["summary"],
): boolean {
  return (
    actual.blockedCount === expected.blockedCount &&
    actual.blockedTruncated === expected.blockedTruncated &&
    actual.pendingCount === expected.pendingCount &&
    actual.pendingTruncated === expected.pendingTruncated &&
    actual.readyCount === expected.readyCount &&
    actual.readyTruncated === expected.readyTruncated &&
    actual.terminalCount === expected.terminalCount &&
    actual.terminalTruncated === expected.terminalTruncated
  );
}

function sameFindings(
  actual: readonly WorkflowReadinessFinding[],
  expected: readonly WorkflowReadinessFinding[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((finding, index) => {
      const expectedFinding = expected[index];
      if (expectedFinding === undefined) {
        return false;
      }
      return (
        finding.persistedStatus === expectedFinding.persistedStatus &&
        finding.status === expectedFinding.status &&
        finding.stepId === expectedFinding.stepId &&
        finding.reasons.length === expectedFinding.reasons.length &&
        finding.reasons.every((reason, reasonIndex) => {
          const expectedReason = expectedFinding.reasons[reasonIndex];
          if (expectedReason === undefined) {
            return false;
          }
          return (
            reason.code === expectedReason.code &&
            reason.relatedStepId === expectedReason.relatedStepId
          );
        })
      );
    })
  );
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
