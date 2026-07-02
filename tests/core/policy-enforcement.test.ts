import { describe, expect, it } from "vitest";

import {
  AgentInvocationValidator,
  AgentManifestValidator,
  AgentResultValidator,
  ContentAgent,
  CONTENT_AGENT_MANIFEST,
  ContentOutputValidator,
  CoreBrain,
  DefaultDenyPolicyEvaluator,
  ImmutableAgentRegistry,
  InProcessAgentRuntime,
  MemoryExecutionContextBuilder,
  PolicyDecisionValidator,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
  type AgentExecutor,
  type AgentInvocation,
  type AgentManifest,
  type MemoryQuery,
  type MemoryReader,
  type MemoryRetrievalResult,
  type PolicyDecision,
  type PolicyEvaluationInput,
  type PolicyEvaluator,
} from "../../src/index.js";
import { InMemoryMemoryService } from "../../src/memory/testing/in-memory-memory-service.js";
import {
  createSemanticMemory,
  createUserMemory,
} from "../memory/fixtures.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createRepositories,
  createRequest,
} from "../support/fixtures.js";
import { StaticPermissionGrantResolver } from "../support/policy-fixtures.js";

describe("Core Brain policy enforcement", () => {
  it("passes explicitly allowed permissions and memory scopes to their boundaries", async () => {
    const allowed = [
      "knowledge:search",
      "memory:read:semantic",
      "model:invoke:content-quality",
      "tool:read:catalog",
    ] as const;
    const fixture = createFixture(
      new DefaultDenyPolicyEvaluator(
        new StaticPermissionGrantResolver({
          actorGrants: allowed,
          policyGrants: allowed,
          taskGrants: allowed,
        }),
      ),
    );

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response.status).toBe("completed");
    expect(response.result?.memoryRefs).toEqual(["semantic-brand"]);
    expect(fixture.executor.invocations[0]?.permissions).toEqual(allowed);
    expect(fixture.memory.queries).toHaveLength(1);
    expect(fixture.memory.queries[0]).toMatchObject({
      categories: ["semantic"],
      scope: {
        agentId: "content",
        permissions: ["memory:read:semantic"],
      },
    });
  });

  it("blocks permissions when any required grant is missing", async () => {
    const fixture = createFixture(
      new DefaultDenyPolicyEvaluator(
        new StaticPermissionGrantResolver({
          actorGrants: ["memory:read:semantic"],
          policyGrants: ["memory:read:semantic"],
          taskGrants: [],
        }),
      ),
    );

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response.status).toBe("completed");
    expect(response.result?.memoryRefs).toEqual([]);
    expect(fixture.executor.invocations[0]?.permissions).toEqual([]);
    expect(fixture.memory.queries).toEqual([]);
  });

  it("defaults to no permissions when no grants are configured", async () => {
    const fixture = createFixture(
      new DefaultDenyPolicyEvaluator(
        new StaticPermissionGrantResolver(),
      ),
    );

    await fixture.coreBrain.execute(createRequest());

    expect(fixture.executor.invocations[0]?.permissions).toEqual([]);
    expect(fixture.memory.queries).toEqual([]);
  });

  it("rejects an invalid policy decision before context or agent access", async () => {
    const fixture = createFixture(new InvalidPolicyEvaluator());

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "policy",
        code: "policy_decision_invalid",
        stage: "policy_evaluation",
      },
      status: "failed",
    });
    expect(fixture.memory.queries).toEqual([]);
    expect(fixture.executor.invocations).toEqual([]);
  });

  it("rejects a policy decision that expands beyond the agent manifest", async () => {
    const fixture = createFixture(new ExpandingPolicyEvaluator());

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "policy",
        code: "policy_decision_invalid",
      },
      status: "failed",
    });
    expect(fixture.memory.queries).toEqual([]);
    expect(fixture.executor.invocations).toEqual([]);
  });

  it("normalizes policy evaluator failures before any adapter access", async () => {
    const fixture = createFixture(new ThrowingPolicyEvaluator());

    const response = await fixture.coreBrain.execute(createRequest());

    expect(response).toMatchObject({
      error: {
        category: "policy",
        code: "policy_evaluation_failed",
        message: "Permission evaluation failed",
      },
      status: "failed",
    });
    expect(JSON.stringify(response)).not.toContain(
      "sensitive policy diagnostic",
    );
    expect(fixture.memory.queries).toEqual([]);
    expect(fixture.executor.invocations).toEqual([]);
  });
});

class RecordingExecutor implements AgentExecutor {
  public readonly agent = Object.freeze({
    agentId: CONTENT_AGENT_MANIFEST.agentId,
    version: CONTENT_AGENT_MANIFEST.version,
  });
  public readonly invocations: AgentInvocation[] = [];
  readonly #delegate: ContentAgent;

  public constructor(delegate: ContentAgent) {
    this.#delegate = delegate;
  }

  public execute(invocation: AgentInvocation): Promise<unknown> {
    this.invocations.push(invocation);
    return this.#delegate.execute(invocation);
  }
}

class RecordingMemoryReader implements MemoryReader {
  public readonly queries: MemoryQuery[] = [];
  readonly #delegate: MemoryReader;

  public constructor(delegate: MemoryReader) {
    this.#delegate = delegate;
  }

  public retrieve(query: MemoryQuery): Promise<MemoryRetrievalResult> {
    this.queries.push(query);
    return this.#delegate.retrieve(query);
  }
}

class InvalidPolicyEvaluator implements PolicyEvaluator {
  public evaluate(
    input: PolicyEvaluationInput,
  ): Promise<PolicyDecision> {
    return Promise.resolve({
      actorId: input.actorId,
      agent: input.agent,
      contractVersion: "1",
      decisionId: input.decisionId,
      deniedPermissions: [],
      effectivePermissions: [
        "not:a:supported-permission",
      ] as unknown as PolicyDecision["effectivePermissions"],
      evaluatedAt: input.evaluatedAt,
      requestedPermissions: [],
      taskId: input.taskId,
      workspaceId: input.workspaceId,
    });
  }
}

class ExpandingPolicyEvaluator implements PolicyEvaluator {
  public evaluate(
    input: PolicyEvaluationInput,
  ): Promise<PolicyDecision> {
    return Promise.resolve({
      actorId: input.actorId,
      agent: input.agent,
      contractVersion: "1",
      decisionId: input.decisionId,
      deniedPermissions: [],
      effectivePermissions: ["tool:read:undeclared"],
      evaluatedAt: input.evaluatedAt,
      requestedPermissions: ["tool:read:undeclared"],
      taskId: input.taskId,
      workspaceId: input.workspaceId,
    });
  }
}

class ThrowingPolicyEvaluator implements PolicyEvaluator {
  public evaluate(): Promise<PolicyDecision> {
    return Promise.reject(new Error("sensitive policy diagnostic"));
  }
}

function createFixture(policyEvaluator: PolicyEvaluator): {
  readonly coreBrain: CoreBrain;
  readonly executor: RecordingExecutor;
  readonly memory: RecordingMemoryReader;
} {
  const clock = new FixedClock();
  const identifiers = new SequenceIdentifierGenerator();
  const manifest: AgentManifest = {
    ...CONTENT_AGENT_MANIFEST,
    knowledgeAccess: ["workspace-local"],
    memoryAccess: {
      proposeWrites: false,
      read: ["semantic", "user"],
    },
    tools: ["catalog"],
    workflowProposals: ["content.export"],
  };
  const memory = new RecordingMemoryReader(
    new InMemoryMemoryService(
      [
        createSemanticMemory("semantic-brand", {
          content: { brand: "MV AI OS" },
        }),
        createUserMemory("user-tone", {
          content: { preferredTone: "concise" },
        }),
      ],
      clock,
    ),
  );
  const executor = new RecordingExecutor(
    new ContentAgent(clock, new ContentOutputValidator()),
  );
  const resultValidator = new AgentResultValidator();
  const registry = new ImmutableAgentRegistry(
    [manifest],
    new AgentManifestValidator(),
  );
  const coreBrain = new CoreBrain({
    agentResultValidator: resultValidator,
    agentRuntime: new InProcessAgentRuntime(
      [executor],
      new AgentInvocationValidator(),
      resultValidator,
      clock,
    ),
    clock,
    contextBuilder: new MemoryExecutionContextBuilder(
      new RequestExecutionContextBuilder(),
    ),
    identifiers,
    logger: new RecordingLogger(),
    memoryService: memory,
    policyDecisionValidator: new PolicyDecisionValidator(),
    policyEvaluator,
    repositories: createRepositories(),
    requestValidator: new RequestEnvelopeValidator(),
    router: new RegistryRouter(registry, clock, identifiers),
    taskResponseValidator: new TaskResponseValidator(),
  });

  return { coreBrain, executor, memory };
}
