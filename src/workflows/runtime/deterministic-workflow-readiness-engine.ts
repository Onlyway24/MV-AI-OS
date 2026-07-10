import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowStepDefinition,
  WorkflowStepInstance,
} from "./workflow-runtime.js";
import {
  WORKFLOW_READINESS_CONTRACT_VERSION,
  freezeWorkflowReadinessValue,
  type WorkflowReadinessEngine,
  type WorkflowReadinessFinding,
  type WorkflowReadinessReason,
  type WorkflowReadinessRequest,
  type WorkflowReadinessResult,
  type WorkflowReadinessStatus,
} from "./workflow-readiness.js";
import { WorkflowReadinessResultValidator } from "./workflow-readiness-validator.js";
import {
  MAX_WORKFLOW_READINESS_BLOCKERS_PER_STEP,
  MAX_WORKFLOW_READINESS_REASONS,
  MAX_WORKFLOW_READINESS_STEPS,
  MAX_WORKFLOW_READINESS_VERSION,
} from "./workflow-readiness-validator.js";

const TERMINAL_WORKFLOW_STATUSES = new Set([
  "CANCELLED",
  "COMPLETED",
  "FAILED",
]);
const TERMINAL_STEP_STATUSES = new Set(["CANCELLED", "FAILED", "SUCCEEDED"]);

export class DeterministicWorkflowReadinessEngine
  implements WorkflowReadinessEngine
{
  readonly #resultValidator: WorkflowReadinessResultValidator;

  public constructor(
    resultValidator: WorkflowReadinessResultValidator =
      new WorkflowReadinessResultValidator(),
  ) {
    this.#resultValidator = resultValidator;
  }

  public evaluate(
    definition: WorkflowDefinition,
    instance: WorkflowInstance,
    request: WorkflowReadinessRequest,
  ): WorkflowReadinessResult {
    if (!isWorkflowReadinessEvaluationWithinBounds(definition, instance)) {
      throw new Error("Workflow readiness evaluation exceeds supported bounds");
    }
    const definitionsByStepId = new Map(
      definition.steps.map((step) => [step.stepId, step]),
    );
    const instancesByStepId = new Map(
      instance.steps.map((step) => [step.stepId, step]),
    );
    const approvedStepIds = new Set(request.approvedStepIds);
    const guardianSatisfiedStepIds = new Set(
      request.guardianSatisfiedStepIds,
    );
    const cyclicStepIds = findCyclicStepIds(definition.steps);
    const findings = definition.steps.map((step) => {
      const stepInstance = instancesByStepId.get(step.stepId);
      if (stepInstance === undefined) {
        throw new Error("Workflow readiness cannot evaluate an incomplete instance");
      }
      return this.#evaluateStep(
        step,
        stepInstance,
        instancesByStepId,
        approvedStepIds,
        guardianSatisfiedStepIds,
        cyclicStepIds,
        instance.status,
      );
    });
    if (definitionsByStepId.size !== instancesByStepId.size) {
      throw new Error("Workflow readiness cannot evaluate mismatched workflow steps");
    }

    const blocked = findings.filter(({ status }) => status === "BLOCKED");
    const pending = findings.filter(({ status }) => status === "PENDING");
    const ready = findings.filter(({ status }) => status === "READY");
    const terminal = findings.filter(({ status }) => status === "TERMINAL");
    const result: WorkflowReadinessResult = {
      blockedFindings: blocked.slice(0, request.maxResults),
      contractVersion: WORKFLOW_READINESS_CONTRACT_VERSION,
      definitionId: definition.definitionId,
      evaluatedVersion: instance.version,
      instanceId: instance.instanceId,
      nonExecuting: true,
      pendingFindings: pending.slice(0, request.maxResults),
      readyFindings: ready.slice(0, request.maxResults),
      stateUpdatedAt: instance.updatedAt,
      summary: {
        blockedCount: blocked.length,
        blockedTruncated: blocked.length > request.maxResults,
        pendingCount: pending.length,
        pendingTruncated: pending.length > request.maxResults,
        readyCount: ready.length,
        readyTruncated: ready.length > request.maxResults,
        terminalCount: terminal.length,
        terminalTruncated: terminal.length > request.maxResults,
      },
      terminalFindings: terminal.slice(0, request.maxResults),
      workflowStatus: instance.status,
    };
    const validation = this.#resultValidator.validate(result);
    if (!validation.ok) {
      throw new Error("Workflow readiness evaluation produced an invalid result");
    }
    return validation.value;
  }

  #evaluateStep(
    definition: WorkflowStepDefinition,
    instance: WorkflowStepInstance,
    instancesByStepId: ReadonlyMap<string, WorkflowStepInstance>,
    approvedStepIds: ReadonlySet<string>,
    guardianSatisfiedStepIds: ReadonlySet<string>,
    cyclicStepIds: ReadonlySet<string>,
    workflowStatus: WorkflowInstance["status"],
  ): WorkflowReadinessFinding {
    if (TERMINAL_WORKFLOW_STATUSES.has(workflowStatus)) {
      return finding(definition.stepId, instance.status, "TERMINAL", []);
    }
    if (TERMINAL_STEP_STATUSES.has(instance.status)) {
      return finding(definition.stepId, instance.status, "TERMINAL", []);
    }
    if (workflowStatus !== "ACTIVE") {
      return finding(definition.stepId, instance.status, "BLOCKED", [
        { code: "WORKFLOW_NOT_ACTIVE" },
        ...createReasons(
          definition,
          instance,
          instancesByStepId,
          approvedStepIds,
          guardianSatisfiedStepIds,
          cyclicStepIds,
        ),
      ]);
    }
    if (instance.status === "AWAITING_RESULT") {
      return finding(definition.stepId, instance.status, "PENDING", [
        { code: "STEP_AWAITING_RESULT" },
      ]);
    }

    const reasons = createReasons(
      definition,
      instance,
      instancesByStepId,
      approvedStepIds,
      guardianSatisfiedStepIds,
      cyclicStepIds,
    );
    return finding(
      definition.stepId,
      instance.status,
      reasons.length === 0 ? "READY" : "BLOCKED",
      reasons,
    );
  }
}

function createReasons(
  definition: WorkflowStepDefinition,
  instance: WorkflowStepInstance,
  instancesByStepId: ReadonlyMap<string, WorkflowStepInstance>,
  approvedStepIds: ReadonlySet<string>,
  guardianSatisfiedStepIds: ReadonlySet<string>,
  cyclicStepIds: ReadonlySet<string>,
): readonly WorkflowReadinessReason[] {
  const reasons: WorkflowReadinessReason[] = [];
  if (cyclicStepIds.has(definition.stepId)) {
    reasons.push({ code: "DEPENDENCY_CYCLE" });
  } else {
    for (const dependencyId of definition.dependencies) {
      const dependency = instancesByStepId.get(dependencyId);
      if (dependency?.status !== "SUCCEEDED") {
        reasons.push({
          code: "DEPENDENCY_INCOMPLETE",
          relatedStepId: dependencyId,
        });
      }
    }
  }
  for (const blocker of instance.blockers) {
    reasons.push({ code: blocker.code, relatedStepId: blocker.stepId });
  }
  if (definition.approvalRequired && !approvedStepIds.has(definition.stepId)) {
    reasons.push({ code: "APPROVAL_REQUIRED" });
  }
  if (
    definition.guardianRequired &&
    !guardianSatisfiedStepIds.has(definition.stepId)
  ) {
    reasons.push({ code: "GUARDIAN_REQUIRED" });
  }
  return reasons;
}

function finding(
  stepId: string,
  persistedStatus: WorkflowStepInstance["status"],
  status: WorkflowReadinessStatus,
  reasons: readonly WorkflowReadinessReason[],
): WorkflowReadinessFinding {
  return freezeWorkflowReadinessValue({
    nonExecuting: true,
    persistedStatus,
    reasons: boundedReasons(reasons),
    status,
    stepId,
  });
}

function boundedReasons(
  reasons: readonly WorkflowReadinessReason[],
): readonly WorkflowReadinessReason[] {
  const seen = new Set<string>();
  const unique = reasons.filter((reason) => {
    const key = `${reason.code}:${reason.relatedStepId ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  if (unique.length <= MAX_WORKFLOW_READINESS_REASONS) {
    return unique;
  }
  return [
    ...unique.slice(0, MAX_WORKFLOW_READINESS_REASONS - 1),
    { code: "REASONS_TRUNCATED" },
  ];
}

function findCyclicStepIds(
  definitions: readonly WorkflowStepDefinition[],
): ReadonlySet<string> {
  const states = new Map<string, "ACTIVE" | "COMPLETE">();
  const cyclicStepIds = new Set<string>();
  const definitionsById = new Map(
    definitions.map((definition) => [definition.stepId, definition]),
  );

  for (const { stepId } of definitions) {
    if (states.has(stepId)) {
      continue;
    }
    const stack: { dependencyIndex: number; readonly stepId: string }[] = [
      { dependencyIndex: 0, stepId },
    ];
    states.set(stepId, "ACTIVE");
    while (stack.length > 0) {
      const current = stack.at(-1);
      if (current === undefined) {
        break;
      }
      const dependencies = definitionsById.get(current.stepId)?.dependencies ?? [];
      const dependencyId = dependencies[current.dependencyIndex];
      if (dependencyId === undefined) {
        states.set(current.stepId, "COMPLETE");
        stack.pop();
        continue;
      }
      current.dependencyIndex += 1;
      const state = states.get(dependencyId);
      if (state === "ACTIVE") {
        const cycleStart = stack.findIndex(
          (candidate) => candidate.stepId === dependencyId,
        );
        for (const member of stack.slice(cycleStart)) {
          cyclicStepIds.add(member.stepId);
        }
      } else if (state === undefined) {
        states.set(dependencyId, "ACTIVE");
        stack.push({ dependencyIndex: 0, stepId: dependencyId });
      }
    }
  }
  return cyclicStepIds;
}

export function isWorkflowReadinessEvaluationWithinBounds(
  definition: WorkflowDefinition,
  instance: WorkflowInstance,
): boolean {
  return (
    definition.steps.length <= MAX_WORKFLOW_READINESS_STEPS &&
    instance.steps.length <= MAX_WORKFLOW_READINESS_STEPS &&
    instance.version <= MAX_WORKFLOW_READINESS_VERSION &&
    instance.steps.every(
      (step) =>
        step.blockers.length <= MAX_WORKFLOW_READINESS_BLOCKERS_PER_STEP,
    )
  );
}
