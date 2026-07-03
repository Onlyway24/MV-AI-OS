import type { AgentSpecificationRegistry } from "../../agents/specification/agent-specification-registry.js";
import { readRequiredBoolean, readRequiredString } from "../../validation/field-readers.js";
import {
  asRecord,
  isSemanticVersion,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";
import { WorkflowFailurePolicyValidator } from "./workflow-failure-policy-validator.js";
import { WorkflowInputValidator } from "./workflow-input-validator.js";
import { WorkflowOutputValidator } from "./workflow-output-validator.js";
import {
  WORKFLOW_SPECIFICATION_SCHEMA_VERSION,
  type WorkflowSpecification,
  type WorkflowSpecificationStatus,
} from "./workflow-specification.js";
import {
  isWorkflowIdentifier,
  prefixWorkflowSpecificationIssues,
} from "./workflow-specification-validation.js";
import type { WorkflowStep } from "./workflow-step.js";
import { WorkflowStepValidator } from "./workflow-step-validator.js";
import type { WorkflowTransition } from "./workflow-transition.js";
import { WorkflowTransitionValidator } from "./workflow-transition-validator.js";

const MAX_WORKFLOW_STEPS = 1_000;
const MAX_WORKFLOW_TRANSITIONS = 5_000;
const WORKFLOW_STATUSES = new Set<WorkflowSpecificationStatus>([
  "active",
  "disabled",
  "experimental",
]);

export class WorkflowSpecificationValidator
  implements Validator<WorkflowSpecification>
{
  readonly #agentSpecifications: AgentSpecificationRegistry;
  readonly #failurePolicyValidator = new WorkflowFailurePolicyValidator();
  readonly #inputValidator = new WorkflowInputValidator();
  readonly #outputValidator = new WorkflowOutputValidator();
  readonly #stepValidator = new WorkflowStepValidator();
  readonly #transitionValidator = new WorkflowTransitionValidator();

  public constructor(agentSpecifications: AgentSpecificationRegistry) {
    this.#agentSpecifications = agentSpecifications;
  }

  public validate(value: unknown): ValidationResult<WorkflowSpecification> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "workflow specification must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const workflowId = readRequiredString(record, "workflowId", issues);
    const version = readRequiredString(record, "version", issues);
    const name = readRequiredString(record, "name", issues);
    const description = readRequiredString(record, "description", issues);
    const status = readRequiredString(record, "status", issues);
    const inputValidation = this.#inputValidator.validate(record.input);
    if (!inputValidation.ok) {
      issues.push(
        ...prefixWorkflowSpecificationIssues(
          inputValidation.issues,
          "input",
        ),
      );
    }
    const outputValidation = this.#outputValidator.validate(record.output);
    if (!outputValidation.ok) {
      issues.push(
        ...prefixWorkflowSpecificationIssues(
          outputValidation.issues,
          "output",
        ),
      );
    }
    const entryStepId = readRequiredString(
      record,
      "entryStepId",
      issues,
    );
    const steps = this.#readSteps(record.steps, issues);
    const transitions = this.#readTransitions(
      record.transitions,
      issues,
    );
    const failurePolicyValidation =
      this.#failurePolicyValidator.validate(record.failurePolicy);
    if (!failurePolicyValidation.ok) {
      issues.push(
        ...prefixWorkflowSpecificationIssues(
          failurePolicyValidation.issues,
          "failurePolicy",
        ),
      );
    }
    const allowCycles = readRequiredBoolean(
      record,
      "allowCycles",
      issues,
    );

    validateIdentity(
      schemaVersion,
      workflowId,
      version,
      entryStepId,
      status,
      issues,
    );
    if (
      steps !== undefined &&
      transitions !== undefined &&
      entryStepId !== undefined &&
      outputValidation.ok &&
      allowCycles !== undefined
    ) {
      validateGraph(
        steps,
        transitions,
        entryStepId,
        outputValidation.value.sourceStepIds,
        allowCycles,
        issues,
      );
      this.#validateAgentReferences(steps, issues);
    }

    if (
      issues.length > 0 ||
      schemaVersion !== WORKFLOW_SPECIFICATION_SCHEMA_VERSION ||
      workflowId === undefined ||
      version === undefined ||
      name === undefined ||
      description === undefined ||
      status === undefined ||
      !WORKFLOW_STATUSES.has(status as WorkflowSpecificationStatus) ||
      !inputValidation.ok ||
      !outputValidation.ok ||
      entryStepId === undefined ||
      steps === undefined ||
      transitions === undefined ||
      !failurePolicyValidation.ok ||
      allowCycles === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      allowCycles,
      description,
      entryStepId,
      failurePolicy: failurePolicyValidation.value,
      input: inputValidation.value,
      name,
      output: outputValidation.value,
      schemaVersion,
      status: status as WorkflowSpecificationStatus,
      steps,
      transitions,
      version,
      workflowId,
    });
  }

  #readSteps(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly WorkflowStep[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "steps must be an array",
        path: "steps",
      });
      return undefined;
    }
    if (value.length === 0 || value.length > MAX_WORKFLOW_STEPS) {
      issues.push({
        code: value.length === 0 ? "empty" : "too_large",
        message: `steps must contain between 1 and ${String(MAX_WORKFLOW_STEPS)} entries`,
        path: "steps",
      });
    }

    const steps: WorkflowStep[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation = this.#stepValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixWorkflowSpecificationIssues(
            validation.issues,
            `steps[${String(index)}]`,
          ),
        );
        continue;
      }
      steps.push(validation.value);
    }
    validateUnique(
      steps.map(({ stepId }) => stepId),
      "step IDs",
      "steps",
      issues,
    );
    return steps;
  }

  #readTransitions(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly WorkflowTransition[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "transitions must be an array",
        path: "transitions",
      });
      return undefined;
    }
    if (value.length > MAX_WORKFLOW_TRANSITIONS) {
      issues.push({
        code: "too_large",
        message: `transitions must not exceed ${String(MAX_WORKFLOW_TRANSITIONS)} entries`,
        path: "transitions",
      });
    }

    const transitions: WorkflowTransition[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation = this.#transitionValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixWorkflowSpecificationIssues(
            validation.issues,
            `transitions[${String(index)}]`,
          ),
        );
        continue;
      }
      transitions.push(validation.value);
    }
    validateUnique(
      transitions.map(({ transitionId }) => transitionId),
      "transition IDs",
      "transitions",
      issues,
    );
    validateUnique(
      transitions.flatMap(({ condition }) =>
        condition === undefined ? [] : [condition.conditionId],
      ),
      "condition IDs",
      "transitions",
      issues,
    );
    return transitions;
  }

  #validateAgentReferences(
    steps: readonly WorkflowStep[],
    issues: ValidationIssue[],
  ): void {
    for (const [index, step] of steps.entries()) {
      if (
        this.#agentSpecifications.get(
          step.agent.agentId,
          step.agent.version,
        ) === undefined
      ) {
        issues.push({
          code: "agent_specification_not_found",
          message:
            "workflow step references an undeclared agent specification",
          path: `steps[${String(index)}].agent`,
        });
      }
    }
  }
}

function validateIdentity(
  schemaVersion: string | undefined,
  workflowId: string | undefined,
  version: string | undefined,
  entryStepId: string | undefined,
  status: string | undefined,
  issues: ValidationIssue[],
): void {
  if (
    schemaVersion !== undefined &&
    schemaVersion !== WORKFLOW_SPECIFICATION_SCHEMA_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `schemaVersion must be ${WORKFLOW_SPECIFICATION_SCHEMA_VERSION}`,
      path: "schemaVersion",
    });
  }
  validateIdentifier(workflowId, "workflowId", issues);
  validateIdentifier(entryStepId, "entryStepId", issues);
  if (version !== undefined && !isSemanticVersion(version)) {
    issues.push({
      code: "invalid_format",
      message: "version must use semantic versioning",
      path: "version",
    });
  }
  if (
    status !== undefined &&
    !WORKFLOW_STATUSES.has(status as WorkflowSpecificationStatus)
  ) {
    issues.push({
      code: "invalid_value",
      message: "status is not supported",
      path: "status",
    });
  }
}

function validateGraph(
  steps: readonly WorkflowStep[],
  transitions: readonly WorkflowTransition[],
  entryStepId: string,
  outputSourceStepIds: readonly string[],
  allowCycles: boolean,
  issues: ValidationIssue[],
): void {
  const stepsById = new Map(steps.map((step) => [step.stepId, step]));
  if (!stepsById.has(entryStepId)) {
    issues.push({
      code: "entry_step_missing",
      message: "entryStepId must reference a declared step",
      path: "entryStepId",
    });
  }

  for (const [index, sourceStepId] of outputSourceStepIds.entries()) {
    const step = stepsById.get(sourceStepId);
    if (step === undefined) {
      issues.push({
        code: "output_step_missing",
        message: "output source step is not declared",
        path: `output.sourceStepIds[${String(index)}]`,
      });
    } else if (!step.terminal) {
      issues.push({
        code: "output_step_not_terminal",
        message: "output source steps must be terminal",
        path: `output.sourceStepIds[${String(index)}]`,
      });
    }
  }

  const validTransitions: WorkflowTransition[] = [];
  for (const [index, transition] of transitions.entries()) {
    const fromExists = stepsById.has(transition.fromStepId);
    const toExists = stepsById.has(transition.toStepId);
    if (!fromExists) {
      issues.push({
        code: "transition_step_missing",
        message: "fromStepId must reference a declared step",
        path: `transitions[${String(index)}].fromStepId`,
      });
    }
    if (!toExists) {
      issues.push({
        code: "transition_step_missing",
        message: "toStepId must reference a declared step",
        path: `transitions[${String(index)}].toStepId`,
      });
    }
    if (
      transition.condition?.source === "step_output" &&
      transition.condition.sourceStepId !== undefined &&
      !stepsById.has(transition.condition.sourceStepId)
    ) {
      issues.push({
        code: "condition_step_missing",
        message: "condition sourceStepId must reference a declared step",
        path: `transitions[${String(index)}].condition.sourceStepId`,
      });
    }
    if (
      transition.condition?.source === "step_output" &&
      transition.condition.sourceStepId !== transition.fromStepId
    ) {
      issues.push({
        code: "condition_source_invalid",
        message:
          "step-output conditions must read from their transition source step",
        path: `transitions[${String(index)}].condition.sourceStepId`,
      });
    }
    if (fromExists && toExists) {
      validTransitions.push(transition);
    }
  }

  const outgoing = groupTransitions(validTransitions);
  for (const [index, step] of steps.entries()) {
    const stepTransitions = outgoing.get(step.stepId) ?? [];
    if (step.terminal && stepTransitions.length > 0) {
      issues.push({
        code: "terminal_transition_invalid",
        message: "terminal steps must not have outgoing transitions",
        path: `steps[${String(index)}].terminal`,
      });
    }
    if (!step.terminal) {
      validateOutgoingTransitions(stepTransitions, index, issues);
    }
  }

  if (stepsById.has(entryStepId)) {
    const reachable = reachableSteps(entryStepId, outgoing);
    for (const [index, step] of steps.entries()) {
      if (!reachable.has(step.stepId)) {
        issues.push({
          code: "step_unreachable",
          message: "step is unreachable from the entry step",
          path: `steps[${String(index)}].stepId`,
        });
      }
    }
  }
  if (!allowCycles && containsCycle(steps, outgoing)) {
    issues.push({
      code: "workflow_cycle_forbidden",
      message: "workflow contains a cycle while allowCycles is false",
      path: "transitions",
    });
  }
}

function validateOutgoingTransitions(
  transitions: readonly WorkflowTransition[],
  stepIndex: number,
  issues: ValidationIssue[],
): void {
  if (transitions.length === 0) {
    issues.push({
      code: "transition_missing",
      message: "non-terminal steps require an outgoing transition",
      path: `steps[${String(stepIndex)}].stepId`,
    });
    return;
  }
  const priorities = transitions.map(({ priority }) => String(priority));
  validateUnique(
    priorities,
    "priorities for one source step",
    "transitions",
    issues,
  );

  const unconditional = transitions.filter(
    ({ condition }) => condition === undefined,
  );
  if (unconditional.length !== 1) {
    issues.push({
      code: "transition_fallback_invalid",
      message:
        "non-terminal steps require exactly one unconditional fallback transition",
      path: `steps[${String(stepIndex)}].stepId`,
    });
    return;
  }
  const fallback = unconditional[0];
  if (
    fallback !== undefined &&
    transitions.some(
      (transition) =>
        transition.condition !== undefined &&
        transition.priority >= fallback.priority,
    )
  ) {
    issues.push({
      code: "transition_priority_invalid",
      message:
        "the unconditional fallback must have the greatest transition priority",
      path: `steps[${String(stepIndex)}].stepId`,
    });
  }
}

function groupTransitions(
  transitions: readonly WorkflowTransition[],
): ReadonlyMap<string, readonly WorkflowTransition[]> {
  const groups = new Map<string, WorkflowTransition[]>();
  for (const transition of transitions) {
    const entries = groups.get(transition.fromStepId) ?? [];
    entries.push(transition);
    groups.set(transition.fromStepId, entries);
  }
  return groups;
}

function reachableSteps(
  entryStepId: string,
  outgoing: ReadonlyMap<string, readonly WorkflowTransition[]>,
): ReadonlySet<string> {
  const reachable = new Set<string>();
  const pending = [entryStepId];
  while (pending.length > 0) {
    const stepId = pending.pop();
    if (stepId === undefined || reachable.has(stepId)) {
      continue;
    }
    reachable.add(stepId);
    for (const transition of outgoing.get(stepId) ?? []) {
      pending.push(transition.toStepId);
    }
  }
  return reachable;
}

function containsCycle(
  steps: readonly WorkflowStep[],
  outgoing: ReadonlyMap<string, readonly WorkflowTransition[]>,
): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(stepId: string): boolean {
    if (visiting.has(stepId)) {
      return true;
    }
    if (visited.has(stepId)) {
      return false;
    }
    visiting.add(stepId);
    for (const transition of outgoing.get(stepId) ?? []) {
      if (visit(transition.toStepId)) {
        return true;
      }
    }
    visiting.delete(stepId);
    visited.add(stepId);
    return false;
  }

  return steps.some(({ stepId }) => visit(stepId));
}

function validateIdentifier(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isWorkflowIdentifier(value)) {
    issues.push({
      code: "invalid_format",
      message: `${path} must be a lowercase identifier`,
      path,
    });
  }
}

function validateUnique(
  values: readonly string[],
  label: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicate ${label}`,
      path,
    });
  }
}
