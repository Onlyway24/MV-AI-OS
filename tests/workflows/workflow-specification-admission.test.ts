import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import {
  AgentSpecificationValidator,
  CONTENT_DIRECTOR_SPECIFICATION,
  CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID,
  CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION,
  CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION,
  ImmutableAgentSpecificationRegistry,
  ImmutableWorkflowSpecificationRegistry,
  RepositoryConflictError,
  RepositoryValidationError,
  SqliteRepositoryTransactionRunner,
  WorkflowSpecificationValidator,
  WorkflowSpecificationAdmissionRequestValidator,
  WorkflowSpecificationAdmissionResultValidator,
  createLocalWorkflowCommandBoundary,
  createWorkflowSpecificationAdmissionService,
  type AgentSpecification,
  type AuditRepository,
  type RepositoryTransaction,
  type RepositoryTransactionRunner,
  type WorkflowSpecification,
  type WorkflowSpecificationAdmissionRequest,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";

describe("Workflow Specification admission", () => {
  it("resolves exact immutable specifications and persists attributed state plus redacted audit evidence", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const admission = createAdmissionService(repositories);

    const result = await admission.admit(request());

    expect(result).toMatchObject({
      admissionId: "admission-001",
      definitionId: `${CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID}@${CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION}`,
      externalEffectsAllowed: false,
      instanceId: "workflow-instance-001",
      nonExecuting: true,
      outcome: "ADMITTED",
      workflowId: CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID,
      workflowVersion: CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION,
    });
    expect(result.agentSpecifications).toEqual([
      expect.objectContaining({
        agentId: "content-director",
        version: "1.0.0",
      }),
    ]);
    expect(result.specificationFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(result)).toBe(true);

    const durable = await repositories.transaction(
      async ({ audits, workflowCommands, workflows }) => ({
        audits: await audits.listByCorrelationId("admission-001"),
        definition: await workflows.definitions.getById(result.definitionId),
        instance: await workflows.instances.getById(result.instanceId),
        ownership: await workflowCommands.getOwnership(result.instanceId),
      }),
    );
    expect(durable.definition).toMatchObject({
      admission: {
        agentSpecifications: result.agentSpecifications,
        workflowSpecificationFingerprint: result.specificationFingerprint,
      },
      nonExecuting: true,
      steps: [
        {
          agent: { agentId: "content-director", version: "1.0.0" },
          approvalRequired: true,
          guardianRequired: true,
          nonExecuting: true,
          stepId: "content-direction",
        },
      ],
    });
    expect(durable.instance).toMatchObject({
      nonExecuting: true,
      status: "ACTIVE",
      steps: [{ blockers: [], status: "PENDING", stepId: "content-direction" }],
      version: 0,
    });
    expect(durable.ownership).toEqual({
      actorId: "actor-local",
      instanceId: "workflow-instance-001",
      workspaceId: "workspace-local",
    });
    expect(durable.audits).toHaveLength(1);
    expect(durable.audits[0]).toMatchObject({
      action: "workflow.specification.admit",
      correlationId: "admission-001",
      eventType: "workflow.specification_admitted",
      metadata: {
        definitionId: result.definitionId,
        instanceId: result.instanceId,
        specificationFingerprint: result.specificationFingerprint,
      },
      outcome: "success",
    });
    const serializedAudit = JSON.stringify(durable.audits[0]);
    expect(serializedAudit).not.toContain(
      CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION.description,
    );
    expect(serializedAudit).not.toContain(
      CONTENT_DIRECTOR_SPECIFICATION.instructionsRef,
    );
  });

  it("replays the same admission and reuses an identical durable definition for a new instance", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const admission = createAdmissionService(repositories);

    const first = await admission.admit(request());
    const replayed = await admission.admit(request());
    const second = await admission.admit(
      request({ admissionId: "admission-002", instanceId: "workflow-instance-002" }),
    );

    expect(replayed).toEqual({ ...first, outcome: "REPLAYED" });
    expect(second).toMatchObject({
      definitionId: first.definitionId,
      instanceId: "workflow-instance-002",
      outcome: "ADMITTED",
    });
    const counts = await repositories.transaction(
      async ({ audits, workflows }) => ({
        firstAudits: await audits.listByCorrelationId("admission-001"),
        secondAudits: await audits.listByCorrelationId("admission-002"),
        first: await workflows.instances.getById("workflow-instance-001"),
        second: await workflows.instances.getById("workflow-instance-002"),
      }),
    );
    expect(counts).toMatchObject({
      first: { definitionId: first.definitionId },
      firstAudits: [{}],
      second: { definitionId: first.definitionId },
      secondAudits: [{}],
    });
  });

  it("finds its deterministic audit receipt inside a shared correlation stream", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    await repositories.transaction(({ audits }) =>
      audits.append({
        action: "operator.note",
        actorId: "actor-local",
        contractVersion: "1",
        correlationId: "admission-001",
        eventId: "unrelated-audit-001",
        eventType: "operator.note_recorded",
        metadata: { noteCode: "bounded_context" },
        occurredAt: "2026-07-02T10:00:00.000Z",
        outcome: "success",
        schemaVersion: "1",
        subject: { instanceId: "other-instance" },
        workspaceId: "workspace-local",
      }),
    );
    const admission = createAdmissionService(repositories);

    expect(await admission.admit(request())).toMatchObject({
      outcome: "ADMITTED",
    });
    expect(await admission.admit(request())).toMatchObject({
      outcome: "REPLAYED",
    });
    expect(
      await repositories.transaction(({ audits }) =>
        audits.listByCorrelationId("admission-001"),
      ),
    ).toHaveLength(2);
  });

  it("fails closed on duplicate IDs, missing sources, and changed exact specifications", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    await createAdmissionService(repositories).admit(request());

    await expect(
      createAdmissionService(repositories).admit(
        request({ instanceId: "workflow-instance-conflict" }),
      ),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      createAdmissionService(repositories).admit(
        request({ admissionId: "admission-conflict" }),
      ),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
    await expect(
      createAdmissionService(repositories, { workflows: [] }).admit(request()),
    ).rejects.toBeInstanceOf(RepositoryValidationError);

    const changedWorkflow = {
      ...CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION,
      description: "A changed immutable workflow definition.",
    } satisfies WorkflowSpecification;
    await expect(
      createAdmissionService(repositories, {
        workflows: [changedWorkflow],
      }).admit(request()),
    ).rejects.toBeInstanceOf(RepositoryConflictError);

    const changedAgent = {
      ...CONTENT_DIRECTOR_SPECIFICATION,
      mission: "A changed exact agent mission.",
    } satisfies AgentSpecification;
    await expect(
      createAdmissionService(repositories, {
        agents: [changedAgent],
      }).admit(request()),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("strictly validates admission requests and results", async () => {
    const requestValidator = new WorkflowSpecificationAdmissionRequestValidator();
    expect(requestValidator.validate(request()).ok).toBe(true);
    expect(requestValidator.validate({ ...request(), unexpected: true }).ok).toBe(false);
    expect(requestValidator.validate({ ...request(), nonExecuting: false }).ok).toBe(false);
    expect(requestValidator.validate({ ...request(), instanceId: "Uppercase" }).ok).toBe(false);
    expect(requestValidator.validate({ ...request(), admissionId: "api-key-value" }).ok).toBe(false);

    const validResult = await createAdmissionService(
      new InMemoryRepositoryTransactionRunner(),
    ).admit(request());
    const resultValidator = new WorkflowSpecificationAdmissionResultValidator();
    expect(resultValidator.validate(validResult).ok).toBe(true);
    expect(resultValidator.validate({ ...validResult, unexpected: true }).ok).toBe(false);
    expect(resultValidator.validate({ ...validResult, externalEffectsAllowed: true }).ok).toBe(false);
    expect(
      resultValidator.validate({
        ...validResult,
        definitionId: "different-workflow@1.0.0",
      }).ok,
    ).toBe(false);
    const attribution = validResult.agentSpecifications[0];
    if (attribution === undefined) throw new Error("missing attribution fixture");
    expect(
      resultValidator.validate({
        ...validResult,
        agentSpecifications: [attribution, attribution],
      }).ok,
    ).toBe(false);
  });

  it("rejects valid declaration semantics the current runtime cannot represent", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const partial = {
      ...CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION,
      failurePolicy: {
        preserveSuccessfulOutputs: true,
        strategy: "return_partial" as const,
      },
      workflowId: "core-v1-partial",
    } satisfies WorkflowSpecification;
    await expect(
      createAdmissionService(repositories, { workflows: [partial] }).admit(
        request({ workflowId: partial.workflowId }),
      ),
    ).rejects.toBeInstanceOf(RepositoryValidationError);

    const buildMetadataVersion = {
      ...CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION,
      version: "1.0.0+build",
      workflowId: "core-v1-build-version",
    } satisfies WorkflowSpecification;
    await expect(
      createAdmissionService(repositories, {
        workflows: [buildMetadataVersion],
      }).admit(
        request({
          workflowId: buildMetadataVersion.workflowId,
          workflowVersion: buildMetadataVersion.version,
        }),
      ),
    ).rejects.toBeInstanceOf(RepositoryValidationError);
  });

  it("derives a deterministic topological step order from the declared entry step", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const workflow = twoStepWorkflowInReverseSourceOrder();
    const admission = createAdmissionService(repositories, {
      workflows: [workflow],
    });

    const result = await admission.admit(
      request({
        workflowId: workflow.workflowId,
        workflowVersion: workflow.version,
      }),
    );
    const definition = await repositories.transaction(({ workflows }) =>
      workflows.definitions.getById(result.definitionId),
    );

    expect(definition?.steps.map(({ dependencies, stepId }) => ({
      dependencies,
      stepId,
    }))).toEqual([
      { dependencies: [], stepId: "draft" },
      { dependencies: ["draft"], stepId: "review" },
    ]);
  });

  it("rolls back definition, instance, and ownership when durable audit append fails", async () => {
    const delegate = new InMemoryRepositoryTransactionRunner();
    const admission = createAdmissionService(new AuditFailingTransactionRunner(delegate));

    await expect(admission.admit(request())).rejects.toThrow(
      "simulated audit failure",
    );
    const durable = await delegate.transaction(
      async ({ audits, workflowCommands, workflows }) => ({
        audits: await audits.listByCorrelationId("admission-001"),
        definition: await workflows.definitions.getById(
          `${CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID}@${CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION}`,
        ),
        instance: await workflows.instances.getById("workflow-instance-001"),
        ownership: await workflowCommands.getOwnership("workflow-instance-001"),
      }),
    );
    expect(durable).toEqual({
      audits: [],
      definition: undefined,
      instance: undefined,
      ownership: undefined,
    });
  });

  it("reconstructs and replays admitted state after a SQLite restart", async () => {
    await withDatabase(async (path) => {
      const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const admitted = await createAdmissionService(first).admit(request());
      await first.close();

      const reopened = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const replayed = await createAdmissionService(reopened).admit(request());
      expect(replayed).toEqual({ ...admitted, outcome: "REPLAYED" });
      const instance = await reopened.transaction(({ workflows }) =>
        workflows.instances.getById(admitted.instanceId),
      );
      expect(instance).toMatchObject({ status: "ACTIVE", version: 0 });
      await reopened.close();
    });
  });

  it("exposes admission through the local command boundary without allowing legacy provenance forgery", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const boundary = createLocalWorkflowCommandBoundary({
      actorId: "actor-local",
      clock: new FixedClock(),
      repositories,
      workspaceId: "workspace-local",
    });
    const admissionRequest = request();
    const command = {
      actorId: "actor-local",
      commandId: admissionRequest.admissionId,
      contractVersion: "1" as const,
      input: { request: admissionRequest },
      operation: "ADMIT_WORKFLOW_SPECIFICATION" as const,
      workspaceId: "workspace-local",
    };

    const admitted = await boundary.execute(command);
    expect(admitted).toMatchObject({
      nextAction:
        "Request the Operator Workflow Report for Workflow workflow-instance-001.",
      replayed: false,
      result: { outcome: "ADMITTED" },
      unauthorizedExternalEffectOccurred: false,
    });
    expect(await boundary.execute(command)).toEqual({
      ...admitted,
      replayed: true,
    });

    const definition = await repositories.transaction(({ workflows }) =>
      workflows.definitions.getById(
        `${CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID}@${CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION}`,
      ),
    );
    await expect(
      boundary.execute({
        actorId: "actor-local",
        commandId: "legacy-forgery-001",
        contractVersion: "1",
        input: {
          definition,
          instance: {
            contractVersion: "1",
            createdAt: "2026-07-02T10:00:01.000Z",
            definitionId: definition?.definitionId,
            instanceId: "forged-instance",
            nonExecuting: true,
            receipts: [],
            status: "ACTIVE",
            steps: [
              { blockers: [], status: "PENDING", stepId: "content-direction" },
            ],
            stopReason: "NONE",
            updatedAt: "2026-07-02T10:00:01.000Z",
            version: 0,
          },
        },
        operation: "CREATE_WORKFLOW",
        workspaceId: "workspace-local",
      }),
    ).rejects.toBeInstanceOf(RepositoryValidationError);
    await expect(
      boundary.execute({
        ...command,
        commandId: "different-command-id",
      }),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("recovers when admission commits before the outer command receipt", async () => {
    const durable = new InMemoryRepositoryTransactionRunner();
    const repositories = new FailOneTransactionRunner(durable, 3);
    const boundary = createLocalWorkflowCommandBoundary({
      actorId: "actor-local",
      clock: new FixedClock(),
      repositories,
      workspaceId: "workspace-local",
    });
    const admissionRequest = request();
    const command = {
      actorId: "actor-local",
      commandId: admissionRequest.admissionId,
      contractVersion: "1" as const,
      input: { request: admissionRequest },
      operation: "ADMIT_WORKFLOW_SPECIFICATION" as const,
      workspaceId: "workspace-local",
    };

    await expect(boundary.execute(command)).rejects.toThrow(
      "simulated transaction interruption",
    );
    const interrupted = await durable.transaction(
      async ({ audits, workflowCommands, workflows }) => ({
        audits: await audits.listByCorrelationId(admissionRequest.admissionId),
        command: await workflowCommands.getById(admissionRequest.admissionId),
        instance: await workflows.instances.getById(admissionRequest.instanceId),
      }),
    );
    expect(interrupted).toMatchObject({
      audits: [{}],
      command: undefined,
      instance: { instanceId: admissionRequest.instanceId },
    });

    const recovered = await boundary.execute(command);
    expect(recovered).toMatchObject({
      replayed: false,
      result: { outcome: "REPLAYED" },
    });
    expect(await boundary.execute(command)).toEqual({
      ...recovered,
      replayed: true,
    });
    const finalEvidence = await durable.transaction(
      async ({ audits, workflowCommands }) => ({
        audits: await audits.listByCorrelationId(admissionRequest.admissionId),
        command: await workflowCommands.getById(admissionRequest.admissionId),
      }),
    );
    expect(finalEvidence.audits).toHaveLength(1);
    expect(finalEvidence.command).toBeDefined();
  });
});

function createAdmissionService(
  repositories: RepositoryTransactionRunner,
  overrides: {
    readonly agents?: readonly AgentSpecification[];
    readonly workflows?: readonly WorkflowSpecification[];
  } = {},
) {
  const agents = new ImmutableAgentSpecificationRegistry(
    overrides.agents ?? [CONTENT_DIRECTOR_SPECIFICATION],
    new AgentSpecificationValidator(),
  );
  const workflowSpecifications = new ImmutableWorkflowSpecificationRegistry(
    overrides.workflows ?? [CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION],
    new WorkflowSpecificationValidator(agents),
  );
  return createWorkflowSpecificationAdmissionService({
    actorId: "actor-local",
    agentSpecifications: agents,
    clock: new FixedClock(),
    repositories,
    workflowSpecifications,
    workspaceId: "workspace-local",
  });
}

function request(
  overrides: Partial<WorkflowSpecificationAdmissionRequest> = {},
): WorkflowSpecificationAdmissionRequest {
  return {
    actorId: "actor-local",
    admissionId: "admission-001",
    contractVersion: "1",
    instanceId: "workflow-instance-001",
    nonExecuting: true,
    workflowId: CORE_V1_CONTENT_DIRECTION_WORKFLOW_ID,
    workflowVersion: CORE_V1_CONTENT_DIRECTION_WORKFLOW_VERSION,
    workspaceId: "workspace-local",
    ...overrides,
  };
}

function twoStepWorkflowInReverseSourceOrder(): WorkflowSpecification {
  const agent = { agentId: "content-director", version: "1.0.0" } as const;
  return {
    ...structuredClone(CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION),
    entryStepId: "draft",
    output: {
      ...structuredClone(CORE_V1_CONTENT_DIRECTION_WORKFLOW_SPECIFICATION.output),
      sourceStepIds: ["review"],
    },
    steps: [
      {
        agent,
        inputMapping: { objective: "steps.draft.output.summary" },
        name: "Review",
        objective: "Review the bounded draft.",
        stepId: "review",
        terminal: true,
      },
      {
        agent,
        inputMapping: { objective: "workflow.input.objective" },
        name: "Draft",
        objective: "Prepare the bounded draft.",
        stepId: "draft",
        terminal: false,
      },
    ],
    transitions: [
      {
        fromStepId: "draft",
        priority: 0,
        toStepId: "review",
        transitionId: "draft-to-review",
      },
    ],
    workflowId: "core-v1-two-step",
  };
}

class AuditFailingTransactionRunner implements RepositoryTransactionRunner {
  public constructor(private readonly delegate: RepositoryTransactionRunner) {}

  public transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.delegate.transaction((repositories) => {
      const audits: AuditRepository = {
        append: () => Promise.reject(new Error("simulated audit failure")),
        listByCorrelationId: (correlationId) =>
          repositories.audits.listByCorrelationId(correlationId),
        listByWorkspaceAndCorrelationId: (workspaceId, correlationId, limit) =>
          repositories.audits.listByWorkspaceAndCorrelationId(
            workspaceId,
            correlationId,
            limit,
          ),
      };
      return operation({ ...repositories, audits });
    });
  }
}

class FailOneTransactionRunner implements RepositoryTransactionRunner {
  #calls = 0;
  #failed = false;

  public constructor(
    private readonly delegate: RepositoryTransactionRunner,
    private readonly failAt: number,
  ) {}

  public transaction<T>(
    operation: (repositories: RepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    this.#calls += 1;
    if (!this.#failed && this.#calls === this.failAt) {
      this.#failed = true;
      return Promise.reject(new Error("simulated transaction interruption"));
    }
    return this.delegate.transaction(operation);
  }
}

async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-admission-"));
  try {
    await test(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
