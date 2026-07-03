import { describe, expect, it } from "vitest";

import {
  AgentInvocationValidator,
  AgentManifestValidator,
  AgentResultValidator,
  AgentSpecificationValidator,
  CONTENT_AGENT_MANIFEST,
  CONTENT_AGENT_SPECIFICATION,
  CONTENT_OUTPUT_MODEL_SCHEMA,
  ContentOutputValidator,
  CoreBrain,
  DefaultDenyPolicyEvaluator,
  ImmutableAgentRegistry,
  InProcessAgentRuntime,
  KnowledgeExecutionContextBuilder,
  KnowledgeQueryValidator,
  KnowledgeRecordValidator,
  KnowledgeSearchResultValidator,
  MemoryExecutionContextBuilder,
  ModelBackedContentAgent,
  ModelProfileValidator,
  ModelRequestValidator,
  ModelResponseValidator,
  PolicyDecisionValidator,
  RegistryRouter,
  RepositoryBackedKnowledgeService,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
  ValidatedLlmGateway,
  type EffectivePermission,
  type KnowledgeRecord,
  type KnowledgeRepository,
  type KnowledgeRepositorySearch,
  type ModelProfile,
  type ModelProvider,
  type ModelRequest,
} from "../../src/index.js";
import { InMemoryMemoryService } from "../../src/memory/testing/in-memory-memory-service.js";
import { createKnowledgeRecord } from "../knowledge/fixtures.js";
import {
  createSemanticMemory,
  createUserMemory,
} from "../memory/fixtures.js";
import { InMemoryAgentSpecificationRegistry } from "../support/in-memory-agent-specification-registry.js";
import { InMemoryKnowledgeRepository } from "../support/in-memory-knowledge-repository.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createRequest,
} from "../support/fixtures.js";
import {
  FixedModelSelectionPolicy,
  InMemoryProviderRegistry,
} from "../support/model-gateway-fixtures.js";
import { StaticPermissionGrantResolver } from "../support/policy-fixtures.js";

const ALL_PERMISSIONS = [
  "knowledge:search",
  "memory:read:conversation",
  "memory:read:semantic",
  "memory:read:user",
  "model:invoke:content-quality",
] as const satisfies readonly EffectivePermission[];

describe("governed model-backed content execution", () => {
  it("completes one audited request through memory, knowledge, specification, and model boundaries", async () => {
    const fixture = createFixture();
    const request = createRequest();

    const first = await fixture.coreBrain.execute(request);
    const replay = await fixture.coreBrain.execute(request);

    expect(first).toMatchObject({
      result: {
        memoryRefs: ["memory-brand", "memory-tone"],
        sourceRefs: ["knowledge-brand"],
      },
      status: "completed",
    });
    expect(replay).toEqual(first);
    expect(fixture.provider.requests).toHaveLength(1);
    expect(fixture.knowledge.searches).toHaveLength(1);

    const modelRequest = fixture.provider.requests[0]?.request;
    expect(modelRequest).toMatchObject({
      modelProfile: "content-quality",
      output: {
        format: "json",
        schema: CONTENT_OUTPUT_MODEL_SCHEMA,
      },
    });
    expect(modelRequest?.messages[0]?.role).toBe("system");
    expect(modelRequest?.messages[1]?.content).toContain(
      "knowledge-brand",
    );
    expect(modelRequest?.messages[1]?.content).toContain("memory-brand");
    expect(CONTENT_AGENT_MANIFEST.tools).toEqual([]);
    expect(CONTENT_AGENT_MANIFEST.workflowProposals).toEqual([]);

    const audits = await fixture.repositories.transaction(({ audits }) =>
      audits.listByCorrelationId(request.correlationId),
    );
    expect(audits.map(({ eventType }) => eventType)).toEqual([
      "request.accepted",
      "task.validated",
      "policy.evaluated",
      "task.context_ready",
      "task.routed",
      "agent.started",
      "task.completed",
      "request.replayed",
    ]);
  });

  it("does not access knowledge when policy withholds knowledge permission", async () => {
    const fixture = createFixture({
      allowedPermissions: ALL_PERMISSIONS.filter(
        (permission) => permission !== "knowledge:search",
      ),
    });

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response.status).toBe("completed");
    expect(response.result?.sourceRefs).toEqual([]);
    expect(response.result?.memoryRefs).toEqual([
      "memory-brand",
      "memory-tone",
    ]);
    expect(fixture.knowledge.searches).toEqual([]);
    expect(fixture.provider.requests).toHaveLength(1);
  });

  it("does not access the model when policy withholds model permission", async () => {
    const fixture = createFixture({
      allowedPermissions: ALL_PERMISSIONS.filter(
        (permission) => permission !== "model:invoke:content-quality",
      ),
    });

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "authorization",
        code: "model_permission_denied",
      },
      status: "failed",
    });
    expect(fixture.knowledge.searches).toHaveLength(1);
    expect(fixture.provider.requests).toEqual([]);
  });

  it("requires the exact Agent Specification before model access", async () => {
    const fixture = createFixture({
      allowedPermissions: ALL_PERMISSIONS.filter(
        (permission) => permission !== "knowledge:search",
      ),
      specifications: [],
    });

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        code: "agent_specification_not_found",
        stage: "agent_specification",
      },
      status: "failed",
    });
    expect(fixture.provider.requests).toEqual([]);
  });

  it("normalizes model provider failures without leaking their cause", async () => {
    const fixture = createFixture({
      providerFailure: new Error("secret provider diagnostic"),
    });

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "model",
        code: "model_provider_failed",
        message: "The model provider failed",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(
      "secret provider diagnostic",
    );
  });

  it("rejects malformed model content at the ContentOutput boundary", async () => {
    const fixture = createFixture({
      modelOutput: {
        summary: "Incomplete model output",
      },
    });

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "validation",
        code: "content_output_invalid",
        stage: "content_output_validation",
      },
      status: "failed",
    });
  });
});

interface FixtureOptions {
  readonly allowedPermissions?: readonly EffectivePermission[];
  readonly modelOutput?: Readonly<Record<string, unknown>>;
  readonly providerFailure?: Error;
  readonly specifications?: readonly unknown[];
}

function createFixture(options: FixtureOptions = {}): {
  readonly coreBrain: CoreBrain;
  readonly knowledge: RecordingKnowledgeRepository;
  readonly provider: ContentModelProvider;
  readonly repositories: InMemoryRepositoryTransactionRunner;
} {
  const clock = new FixedClock();
  const identifiers = new SequenceIdentifierGenerator();
  const specifications = new InMemoryAgentSpecificationRegistry(
    options.specifications ?? [CONTENT_AGENT_SPECIFICATION],
    new AgentSpecificationValidator(),
  );
  const knowledge = new RecordingKnowledgeRepository(
    new InMemoryKnowledgeRepository([
      createKnowledgeRecord("knowledge-brand", {
        content: { approvedClaim: "MV AI OS coordinates governed agents." },
        searchableText: createRequest().instruction,
      }),
      createKnowledgeRecord("knowledge-finance", {
        requiredScopes: ["finance"],
        searchableText: createRequest().instruction,
      }),
      createKnowledgeRecord("knowledge-other-workspace", {
        searchableText: createRequest().instruction,
        workspaceId: "workspace-other",
      }),
    ]),
  );
  const knowledgeService = new RepositoryBackedKnowledgeService({
    clock,
    queryValidator: new KnowledgeQueryValidator(),
    recordValidator: new KnowledgeRecordValidator(),
    repository: knowledge,
    resultValidator: new KnowledgeSearchResultValidator(),
  });
  const memory = new InMemoryMemoryService(
    [
      createSemanticMemory("memory-brand", {
        content: { brand: "MV AI OS" },
      }),
      createUserMemory("memory-tone", {
        content: { preferredTone: "concise" },
      }),
      createUserMemory("memory-other-actor", {
        approval: {
          approvedAt: "2026-07-01T09:00:00.000Z",
          approvedBy: "actor-other",
        },
        ownerId: "actor-other",
      }),
    ],
    clock,
  );
  const provider = new ContentModelProvider(clock, {
    ...(options.modelOutput === undefined
      ? {}
      : { output: options.modelOutput }),
    ...(options.providerFailure === undefined
      ? {}
      : { failure: options.providerFailure }),
  });
  const profile = createContentModelProfile();
  const gateway = new ValidatedLlmGateway({
    clock,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new InMemoryProviderRegistry([provider]),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(profile),
  });
  const resultValidator = new AgentResultValidator();
  const runtime = new InProcessAgentRuntime(
    [
      new ModelBackedContentAgent({
        clock,
        gateway,
        outputValidator: new ContentOutputValidator(),
        specifications,
      }),
    ],
    new AgentInvocationValidator(),
    resultValidator,
    clock,
  );
  const registry = new ImmutableAgentRegistry(
    [CONTENT_AGENT_MANIFEST],
    new AgentManifestValidator(),
  );
  const permissions = options.allowedPermissions ?? ALL_PERMISSIONS;
  const policyEvaluator = new DefaultDenyPolicyEvaluator(
    new StaticPermissionGrantResolver({
      actorGrants: permissions,
      policyGrants: permissions,
      taskGrants: permissions,
    }),
  );
  const repositories = new InMemoryRepositoryTransactionRunner();
  const coreBrain = new CoreBrain({
    agentResultValidator: resultValidator,
    agentRuntime: runtime,
    clock,
    contextBuilder: new KnowledgeExecutionContextBuilder(
      new MemoryExecutionContextBuilder(
        new RequestExecutionContextBuilder(),
      ),
      knowledgeService,
      specifications,
    ),
    identifiers,
    logger: new RecordingLogger(),
    memoryService: memory,
    policyDecisionValidator: new PolicyDecisionValidator(),
    policyEvaluator,
    repositories,
    requestValidator: new RequestEnvelopeValidator(),
    router: new RegistryRouter(registry, clock, identifiers),
    taskResponseValidator: new TaskResponseValidator(),
  });

  return { coreBrain, knowledge, provider, repositories };
}

class RecordingKnowledgeRepository implements KnowledgeRepository {
  public readonly searches: KnowledgeRepositorySearch[] = [];
  readonly #delegate: KnowledgeRepository;

  public constructor(delegate: KnowledgeRepository) {
    this.#delegate = delegate;
  }

  public getById(
    knowledgeId: string,
  ): Promise<KnowledgeRecord | undefined> {
    return this.#delegate.getById(knowledgeId);
  }

  public insert(record: KnowledgeRecord): Promise<void> {
    return this.#delegate.insert(record);
  }

  public search(
    query: KnowledgeRepositorySearch,
  ): Promise<readonly KnowledgeRecord[]> {
    this.searches.push(query);
    return this.#delegate.search(query);
  }
}

class ContentModelProvider implements ModelProvider {
  public readonly providerId = "deterministic-content";
  public readonly requests: {
    readonly profile: ModelProfile;
    readonly request: ModelRequest;
  }[] = [];

  readonly #clock: FixedClock;
  readonly #failure: Error | undefined;
  readonly #output: Readonly<Record<string, unknown>>;

  public constructor(
    clock: FixedClock,
    options: {
      readonly failure?: Error;
      readonly output?: Readonly<Record<string, unknown>>;
    } = {},
  ) {
    this.#clock = clock;
    this.#failure = options.failure;
    this.#output = options.output ?? validModelOutput();
  }

  public generate(
    request: ModelRequest,
    profile: ModelProfile,
  ): Promise<unknown> {
    this.requests.push({ profile, request });
    if (this.#failure !== undefined) {
      return Promise.reject(this.#failure);
    }
    return Promise.resolve({
      completedAt: this.#clock.now().toISOString(),
      contractVersion: "1",
      modelRequestId: request.modelRequestId,
      output: {
        format: "json",
        value: this.#output,
      },
      provider: {
        modelId: profile.modelId,
        providerId: profile.providerId,
      },
      status: "succeeded",
      usage: {
        costUsd: 0,
        inputTokens: 100,
        outputTokens: 120,
        totalTokens: 220,
      },
    });
  }
}

function createContentModelProfile(): ModelProfile {
  return {
    contractVersion: "1",
    limits: {
      maxCostUsd: 0.1,
      maxInputCharacters: 300_000,
      maxOutputTokens: 2_048,
      timeoutMs: 30_000,
    },
    modelId: "deterministic-content-v1",
    profileId: "content-quality",
    providerId: "deterministic-content",
    supportedOutputFormats: ["json"],
  };
}

function validModelOutput(): Readonly<Record<string, unknown>> {
  return {
    assumptions: [],
    audience: "product teams",
    body: {
      heading: "MV AI OS",
      message: "A governed content result.",
    },
    contentType: "announcement",
    language: "en",
    memoryRefs: ["hallucinated-memory"],
    metadata: {
      generator: "deterministic-content-provider",
    },
    sourceRefs: ["hallucinated-source"],
    summary: "A governed MV AI OS announcement.",
    title: "MV AI OS Announcement",
    tone: "informative",
    warnings: [],
  };
}
