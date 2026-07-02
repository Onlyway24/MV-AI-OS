import { describe, expect, it } from "vitest";

import {
  AgentManifestValidator,
  AgentResultValidator,
  CoreBrain,
  ImmutableAgentRegistry,
  RegistryRouter,
  RequestEnvelopeValidator,
  RequestExecutionContextBuilder,
  TaskResponseValidator,
  type AgentInvocation,
  type AgentResult,
  type AgentRuntime,
} from "../../src/index.js";
import {
  FixedClock,
  RecordingLogger,
  SequenceIdentifierGenerator,
  createEmptyMemoryService,
  createAllowDeclaredPolicyDependencies,
  createManifest,
  createRepositories,
  createRequest,
} from "../support/fixtures.js";

describe("Core Brain agent runtime boundary", () => {
  it("executes through an injected runtime without a concrete agent", async () => {
    const clock = new FixedClock();
    const identifiers = new SequenceIdentifierGenerator();
    const manifest = createManifest({
      agentId: "contract-test-agent",
      outputContract: {
        contractId: "contract-test-output",
        contractVersion: "1",
      },
      taskTypes: ["contract.test"],
    });
    const registry = new ImmutableAgentRegistry(
      [manifest],
      new AgentManifestValidator(),
    );
    const runtime = new ContractTestRuntime(clock);
    const coreBrain = new CoreBrain({
      agentResultValidator: new AgentResultValidator(),
      agentRuntime: runtime,
      clock,
      contextBuilder: new RequestExecutionContextBuilder(),
      identifiers,
      logger: new RecordingLogger(),
      memoryService: createEmptyMemoryService(clock),
      ...createAllowDeclaredPolicyDependencies(),
      requestValidator: new RequestEnvelopeValidator(),
      repositories: createRepositories(),
      router: new RegistryRouter(registry, clock, identifiers),
      taskResponseValidator: new TaskResponseValidator(),
    });

    const response = await coreBrain.execute(
      createRequest({
        requestedOutput: { kind: "contract-test" },
        taskType: "contract.test",
      }),
    );

    expect(runtime.invocations).toHaveLength(1);
    expect(runtime.invocations[0]).toMatchObject({
      agent: { agentId: "contract-test-agent", version: "1.0.0" },
      attempt: 1,
      outputContract: {
        contractId: "contract-test-output",
        contractVersion: "1",
      },
      permissions: [
        "memory:read:conversation",
        "memory:read:semantic",
        "memory:read:user",
        "memory:write:proposal",
        "model:invoke:content-quality",
      ],
    });
    expect(response).toMatchObject({
      result: { executedBy: "contract-test-runtime" },
      status: "completed",
    });
  });
});

class ContractTestRuntime implements AgentRuntime {
  public readonly invocations: AgentInvocation[] = [];
  readonly #clock: FixedClock;

  public constructor(clock: FixedClock) {
    this.#clock = clock;
  }

  public execute(invocation: AgentInvocation): Promise<AgentResult> {
    this.invocations.push(invocation);
    return Promise.resolve({
      agent: invocation.agent,
      completedAt: this.#clock.now().toISOString(),
      contractVersion: "1",
      evidence: [],
      invocationId: invocation.invocationId,
      memoryProposals: [],
      output: { executedBy: "contract-test-runtime" },
      status: "succeeded",
      taskId: invocation.taskId,
    });
  }
}
