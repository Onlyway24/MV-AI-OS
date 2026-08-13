import type { AgentSpecification } from "../../agents/specification/agent-specification.js";
import type { AgentSpecificationRegistry } from "../../agents/specification/agent-specification-registry.js";
import { AgentSpecificationValidator } from "../../agents/specification/agent-specification-validator.js";
import type { AuditEvent } from "../../contracts/audit-event.js";
import {
  RepositoryConflictError,
  RepositoryValidationError,
} from "../../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../../persistence/repository-transaction.js";
import type { Clock } from "../../ports/clock.js";
import type { Validator } from "../../validation/validation.js";
import {
  createSpecificationFingerprint,
} from "../specification/specification-fingerprint.js";
import type { WorkflowSpecification } from "../specification/workflow-specification.js";
import type { WorkflowSpecificationRegistry } from "../specification/workflow-specification-registry.js";
import { WorkflowSpecificationValidator } from "../specification/workflow-specification-validator.js";
import type { WorkflowStep } from "../specification/workflow-step.js";
import {
  WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION,
  freezeWorkflowSpecificationAdmissionValue,
  type WorkflowSpecificationAdmissionRequest,
  type WorkflowSpecificationAdmissionResult,
  type WorkflowSpecificationAdmissionService,
} from "./workflow-specification-admission.js";
import {
  WorkflowSpecificationAdmissionRequestValidator,
  WorkflowSpecificationAdmissionResultValidator,
} from "./workflow-specification-admission-validator.js";
import type {
  WorkflowAgentSpecificationAttribution,
  WorkflowDefinition,
  WorkflowInstance,
} from "./workflow-runtime.js";
import {
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
} from "./workflow-runtime-validator.js";

const ADMISSION_EVENT_TYPE = "workflow.specification_admitted";
const ADMISSION_ACTION = "workflow.specification.admit";
const MAX_ADMITTED_WORKFLOW_STEPS = 100;

export interface RepositoryBackedWorkflowSpecificationAdmissionDependencies {
  readonly actorId: string;
  readonly agentSpecifications: AgentSpecificationRegistry;
  readonly clock: Clock;
  readonly repositories: RepositoryTransactionRunner;
  readonly requestValidator: Validator<WorkflowSpecificationAdmissionRequest>;
  readonly resultValidator: Validator<WorkflowSpecificationAdmissionResult>;
  readonly workflowSpecifications: WorkflowSpecificationRegistry;
  readonly workspaceId: string;
}

export class RepositoryBackedWorkflowSpecificationAdmissionService
  implements WorkflowSpecificationAdmissionService
{
  readonly #agentValidator = new AgentSpecificationValidator();
  readonly #definitionValidator = new WorkflowDefinitionValidator();
  readonly #instanceValidator = new WorkflowInstanceValidator();
  readonly #trustedRequestValidator =
    new WorkflowSpecificationAdmissionRequestValidator();
  readonly #trustedResultValidator =
    new WorkflowSpecificationAdmissionResultValidator();
  readonly #workflowValidator: WorkflowSpecificationValidator;

  public constructor(
    private readonly dependencies: RepositoryBackedWorkflowSpecificationAdmissionDependencies,
  ) {
    this.#workflowValidator = new WorkflowSpecificationValidator(
      dependencies.agentSpecifications,
    );
  }

  public async admit(
    request: WorkflowSpecificationAdmissionRequest,
  ): Promise<WorkflowSpecificationAdmissionResult> {
    const valid = validate(
      validate(
        request,
        this.dependencies.requestValidator,
        "Workflow specification admission request",
      ),
      this.#trustedRequestValidator,
      "Workflow specification admission request",
    );
    if (
      valid.actorId !== this.dependencies.actorId ||
      valid.workspaceId !== this.dependencies.workspaceId
    ) {
      throw new RepositoryConflictError(
        "Workflow specification admission identity is unauthorized",
      );
    }

    const resolved = this.#resolve(valid);
    const requestFingerprint = createSpecificationFingerprint(valid);
    const auditEventId = createWorkflowSpecificationAdmissionAuditEventId(valid);

    return this.dependencies.repositories.transaction(
      async ({ audits, workflowCommands, workflows }) => {
        const existingAudits = await audits.listByCorrelationId(
          valid.admissionId,
        );
        const admissionAudits = existingAudits.filter(
          ({ eventId }) => eventId === auditEventId,
        );
        if (admissionAudits.length > 0) {
          if (admissionAudits.length !== 1) {
            throw new RepositoryValidationError(
              "Workflow admission has ambiguous durable audit evidence",
            );
          }
          const event = admissionAudits[0];
          if (event === undefined) {
            throw new RepositoryValidationError(
              "Workflow admission audit evidence is missing",
            );
          }
          assertReplayAudit(
            event,
            valid,
            resolved,
            requestFingerprint,
            auditEventId,
          );
          await assertDurableReplay(
            workflows,
            workflowCommands,
            valid,
            resolved.definition,
          );
          return this.#result(valid, resolved, auditEventId, "REPLAYED");
        }

        const existingDefinition = await workflows.definitions.getById(
          resolved.definition.definitionId,
        );
        if (
          existingDefinition !== undefined &&
          !sameValue(existingDefinition, resolved.definition)
        ) {
          throw new RepositoryConflictError(
            "Admitted Workflow Specification conflicts with its durable definition",
          );
        }
        if (
          await workflows.instances.getById(valid.instanceId) !== undefined ||
          await workflowCommands.getOwnership(valid.instanceId) !== undefined
        ) {
          throw new RepositoryConflictError(
            "Admitted Workflow instance conflicts with durable state",
          );
        }

        const now = readClockTimestamp(this.dependencies.clock);
        const instance = validate(
          createInstance(valid.instanceId, resolved.definition, now),
          this.#instanceValidator,
          "Admitted Workflow instance",
        );
        if (existingDefinition === undefined) {
          await workflows.definitions.insert(resolved.definition);
        }
        await workflows.instances.insert(instance);
        await workflowCommands.insertOwnership({
          actorId: valid.actorId,
          instanceId: valid.instanceId,
          workspaceId: valid.workspaceId,
        });
        await audits.append(
          createAuditEvent(
            valid,
            resolved,
            requestFingerprint,
            auditEventId,
            now,
          ),
        );
        return this.#result(valid, resolved, auditEventId, "ADMITTED");
      },
    );
  }

  #resolve(request: WorkflowSpecificationAdmissionRequest): ResolvedAdmission {
    const candidate = this.dependencies.workflowSpecifications.get(
      request.workflowId,
      request.workflowVersion,
    );
    if (candidate === undefined) {
      throw new RepositoryValidationError(
        "Workflow Specification admission source does not exist",
      );
    }
    const specification = validate(
      candidate,
      this.#workflowValidator,
      "Workflow Specification admission source",
    );
    if (
      specification.workflowId !== request.workflowId ||
      specification.version !== request.workflowVersion ||
      specification.status !== "active"
    ) {
      throw new RepositoryValidationError(
        "Workflow Specification admission source is unavailable",
      );
    }
    assertSupportedSpecification(specification);

    const agents = resolveAgentSpecifications(
      specification,
      this.dependencies.agentSpecifications,
      this.#agentValidator,
    );
    const attribution = agents
      .map(
        (agent): WorkflowAgentSpecificationAttribution => ({
          agentId: agent.agentId,
          fingerprint: createSpecificationFingerprint(agent),
          version: agent.version,
        }),
      )
      .sort(compareAgentAttribution);
    const specificationFingerprint =
      createSpecificationFingerprint(specification);
    const definition = validate(
      createDefinition(specification, specificationFingerprint, attribution),
      this.#definitionValidator,
      "Admitted Workflow definition",
    );
    return freezeWorkflowSpecificationAdmissionValue({
      agentSpecifications: attribution,
      definition,
      specificationFingerprint,
    });
  }

  #result(
    request: WorkflowSpecificationAdmissionRequest,
    resolved: ResolvedAdmission,
    auditEventId: string,
    outcome: "ADMITTED" | "REPLAYED",
  ): WorkflowSpecificationAdmissionResult {
    return validate(
      validate(
        {
          admissionId: request.admissionId,
          agentSpecifications: resolved.agentSpecifications,
          auditEventId,
          contractVersion: WORKFLOW_SPECIFICATION_ADMISSION_CONTRACT_VERSION,
          definitionId: resolved.definition.definitionId,
          externalEffectsAllowed: false,
          instanceId: request.instanceId,
          nonExecuting: true,
          outcome,
          specificationFingerprint: resolved.specificationFingerprint,
          workflowId: request.workflowId,
          workflowVersion: request.workflowVersion,
        },
        this.dependencies.resultValidator,
        "Workflow specification admission result",
      ),
      this.#trustedResultValidator,
      "Workflow specification admission result",
    );
  }
}

export function createWorkflowSpecificationAdmissionService(
  dependencies: Omit<
    RepositoryBackedWorkflowSpecificationAdmissionDependencies,
    "requestValidator" | "resultValidator"
  >,
): RepositoryBackedWorkflowSpecificationAdmissionService {
  return new RepositoryBackedWorkflowSpecificationAdmissionService({
    ...dependencies,
    requestValidator: new WorkflowSpecificationAdmissionRequestValidator(),
    resultValidator: new WorkflowSpecificationAdmissionResultValidator(),
  });
}

export function createWorkflowSpecificationAdmissionAuditEventId(
  request: Pick<
    WorkflowSpecificationAdmissionRequest,
    "actorId" | "admissionId" | "workspaceId"
  >,
): string {
  const fingerprint = createSpecificationFingerprint({
    actorId: request.actorId,
    admissionId: request.admissionId,
    workspaceId: request.workspaceId,
  });
  return `workflow-admission-${fingerprint.slice(0, 32)}`;
}

interface ResolvedAdmission {
  readonly agentSpecifications: readonly WorkflowAgentSpecificationAttribution[];
  readonly definition: WorkflowDefinition;
  readonly specificationFingerprint: string;
}

function assertSupportedSpecification(
  specification: WorkflowSpecification,
): void {
  if (
    specification.steps.length > MAX_ADMITTED_WORKFLOW_STEPS ||
    specification.allowCycles ||
    specification.transitions.some(({ condition }) => condition !== undefined) ||
    specification.failurePolicy.strategy !== "fail_workflow" ||
    specification.failurePolicy.preserveSuccessfulOutputs
  ) {
    throw new RepositoryValidationError(
      "Workflow Specification uses semantics unsupported by Core V1 admission",
    );
  }
}

function resolveAgentSpecifications(
  workflow: WorkflowSpecification,
  registry: AgentSpecificationRegistry,
  validator: Validator<AgentSpecification>,
): readonly AgentSpecification[] {
  const byKey = new Map<string, AgentSpecification>();
  for (const step of workflow.steps) {
    const key = `${step.agent.agentId}@${step.agent.version}`;
    if (byKey.has(key)) continue;
    const candidate = registry.get(step.agent.agentId, step.agent.version);
    if (candidate === undefined) {
      throw new RepositoryValidationError(
        "Workflow Specification references a missing Agent Specification",
      );
    }
    const agent = validate(
      candidate,
      validator,
      "Workflow Agent Specification",
    );
    if (
      agent.agentId !== step.agent.agentId ||
      agent.version !== step.agent.version ||
      agent.status === "disabled"
    ) {
      throw new RepositoryValidationError(
        "Workflow Agent Specification is unavailable or changed",
      );
    }
    byKey.set(key, agent);
  }
  return Object.freeze([...byKey.values()]);
}

function createDefinition(
  specification: WorkflowSpecification,
  workflowSpecificationFingerprint: string,
  agentSpecifications: readonly WorkflowAgentSpecificationAttribution[],
): WorkflowDefinition {
  const orderedSteps = topologicallyOrderedSteps(specification);
  const stepOrder = new Map(
    orderedSteps.map(({ stepId }, index) => [stepId, index]),
  );
  return freezeWorkflowSpecificationAdmissionValue({
    admission: {
      agentSpecifications,
      workflowSpecificationFingerprint,
    },
    contractVersion: "1" as const,
    definitionId: `${specification.workflowId}@${specification.version}`,
    nonExecuting: true as const,
    steps: orderedSteps.map((step) => ({
      agent: step.agent,
      approvalRequired: true,
      dependencies: Object.freeze(
        [
          ...new Set(
            specification.transitions
              .filter(({ toStepId }) => toStepId === step.stepId)
              .map(({ fromStepId }) => fromStepId),
          ),
        ].sort(
          (left, right) =>
            (stepOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (stepOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
        ),
      ),
      guardianRequired: true,
      nonExecuting: true as const,
      stepId: step.stepId,
    })),
    workflowId: specification.workflowId,
    workflowVersion: specification.version,
  });
}

function topologicallyOrderedSteps(
  specification: WorkflowSpecification,
): readonly WorkflowStep[] {
  const stepsById = new Map(
    specification.steps.map((step) => [step.stepId, step]),
  );
  const incoming = new Map(
    specification.steps.map(({ stepId }) => [stepId, 0]),
  );
  const outgoing = new Map(
    specification.steps.map(({ stepId }) => [stepId, [] as string[]]),
  );
  for (const transition of specification.transitions) {
    incoming.set(
      transition.toStepId,
      (incoming.get(transition.toStepId) ?? 0) + 1,
    );
    outgoing.get(transition.fromStepId)?.push(transition.toStepId);
  }

  const ready = [...incoming.entries()]
    .filter(([, count]) => count === 0)
    .map(([stepId]) => stepId)
    .sort((left, right) =>
      compareReadyStepIds(left, right, specification.entryStepId),
    );
  const result: WorkflowStep[] = [];
  while (ready.length > 0) {
    const stepId = ready.shift();
    if (stepId === undefined) break;
    const step = stepsById.get(stepId);
    if (step === undefined) {
      throw new RepositoryValidationError(
        "Workflow Specification transition references an unknown step",
      );
    }
    result.push(step);
    for (const targetId of [...(outgoing.get(stepId) ?? [])].sort(compareText)) {
      const remaining = (incoming.get(targetId) ?? 0) - 1;
      incoming.set(targetId, remaining);
      if (remaining === 0) {
        ready.push(targetId);
        ready.sort((left, right) =>
          compareReadyStepIds(left, right, specification.entryStepId),
        );
      }
    }
  }
  if (
    result.length !== specification.steps.length ||
    result[0]?.stepId !== specification.entryStepId
  ) {
    throw new RepositoryValidationError(
      "Workflow Specification cannot be deterministically ordered from its entry step",
    );
  }
  return Object.freeze(result);
}

function compareReadyStepIds(
  left: string,
  right: string,
  entryStepId: string,
): number {
  if (left === entryStepId) return right === entryStepId ? 0 : -1;
  if (right === entryStepId) return 1;
  return compareText(left, right);
}

function createInstance(
  instanceId: string,
  definition: WorkflowDefinition,
  now: string,
): WorkflowInstance {
  return freezeWorkflowSpecificationAdmissionValue({
    contractVersion: "1" as const,
    createdAt: now,
    definitionId: definition.definitionId,
    instanceId,
    nonExecuting: true as const,
    receipts: [],
    status: "ACTIVE" as const,
    steps: definition.steps.map(({ stepId }) => ({
      blockers: [],
      status: "PENDING" as const,
      stepId,
    })),
    stopReason: "NONE" as const,
    updatedAt: now,
    version: 0,
  });
}

function createAuditEvent(
  request: WorkflowSpecificationAdmissionRequest,
  resolved: ResolvedAdmission,
  requestFingerprint: string,
  eventId: string,
  occurredAt: string,
): AuditEvent {
  return {
    action: ADMISSION_ACTION,
    actorId: request.actorId,
    contractVersion: "1",
    correlationId: request.admissionId,
    eventId,
    eventType: ADMISSION_EVENT_TYPE,
    metadata: {
      agentSpecificationsFingerprint: createSpecificationFingerprint(
        resolved.agentSpecifications,
      ),
      definitionId: resolved.definition.definitionId,
      instanceId: request.instanceId,
      requestFingerprint,
      specificationFingerprint: resolved.specificationFingerprint,
      workflowId: request.workflowId,
      workflowVersion: request.workflowVersion,
    },
    occurredAt,
    outcome: "success",
    schemaVersion: "1",
    subject: {
      definitionId: resolved.definition.definitionId,
      instanceId: request.instanceId,
    },
    workspaceId: request.workspaceId,
  };
}

function assertReplayAudit(
  event: AuditEvent,
  request: WorkflowSpecificationAdmissionRequest,
  resolved: ResolvedAdmission,
  requestFingerprint: string,
  auditEventId: string,
): void {
  if (
    event.eventId !== auditEventId ||
    event.eventType !== ADMISSION_EVENT_TYPE ||
    event.action !== ADMISSION_ACTION ||
    event.actorId !== request.actorId ||
    event.workspaceId !== request.workspaceId ||
    event.outcome !== "success" ||
    event.metadata.requestFingerprint !== requestFingerprint ||
    event.metadata.agentSpecificationsFingerprint !==
      createSpecificationFingerprint(resolved.agentSpecifications) ||
    event.metadata.specificationFingerprint !==
      resolved.specificationFingerprint ||
    event.metadata.definitionId !== resolved.definition.definitionId ||
    event.metadata.instanceId !== request.instanceId ||
    event.metadata.workflowId !== request.workflowId ||
    event.metadata.workflowVersion !== request.workflowVersion
  ) {
    throw new RepositoryConflictError(
      "Workflow admission ID conflicts with durable audit evidence",
    );
  }
}

async function assertDurableReplay(
  workflows: import("./workflow-persistence.js").WorkflowPersistenceTransaction,
  workflowCommands: import("../../runtime/local-workflow-command-repository.js").LocalWorkflowCommandRepository,
  request: WorkflowSpecificationAdmissionRequest,
  expectedDefinition: WorkflowDefinition,
): Promise<void> {
  const definition = await workflows.definitions.getById(
    expectedDefinition.definitionId,
  );
  const instance = await workflows.instances.getById(request.instanceId);
  const ownership = await workflowCommands.getOwnership(request.instanceId);
  if (
    definition === undefined ||
    !sameValue(definition, expectedDefinition) ||
    instance?.definitionId !== expectedDefinition.definitionId ||
    ownership?.actorId !== request.actorId ||
    ownership.workspaceId !== request.workspaceId
  ) {
    throw new RepositoryValidationError(
      "Workflow admission durable state does not match its audit evidence",
    );
  }
}

function compareAgentAttribution(
  left: WorkflowAgentSpecificationAttribution,
  right: WorkflowAgentSpecificationAttribution,
): number {
  const leftKey = `${left.agentId}@${left.version}`;
  const rightKey = `${right.agentId}@${right.version}`;
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function sameValue(left: unknown, right: unknown): boolean {
  return (
    createSpecificationFingerprint(left) ===
    createSpecificationFingerprint(right)
  );
}

function readClockTimestamp(clock: Clock): string {
  const now = clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RepositoryValidationError(
      "Workflow admission clock returned an invalid timestamp",
    );
  }
  return now.toISOString();
}

function validate<T>(
  value: unknown,
  validator: Validator<T>,
  label: string,
): T {
  const validation = validator.validate(value);
  if (!validation.ok) {
    throw new RepositoryValidationError(`${label} failed validation`, {
      issueCount: validation.issues.length,
    });
  }
  return validation.value;
}
