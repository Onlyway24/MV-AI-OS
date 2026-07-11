import { describe, expect, it } from "vitest";
import {
  AgentSpecificationValidator,
  CONTENT_DIRECTOR_SPECIFICATION,
  ContentDirectorDirectionInputValidator,
  DefaultDenyAgentRuntimeResolver,
  DeterministicContentDirectorExecutor,
  ImmutableAgentRuntimeCatalog,
  ImmutableAgentSpecificationRegistry,
  type AgentExecutionBinding,
  type AgentExecutorDescriptor,
  type AgentInvocation,
} from "../../src/index.js";

const descriptor: AgentExecutorDescriptor = {
  executionMode: "DETERMINISTIC_LOCAL",
  executorId: "deterministic-content-director",
  executorVersion: "1.0.0",
  inputContractId: "deterministic-content-direction-input@1",
  outputContractId: "deterministic-content-direction-artifact@1",
  roleId: "content-director",
  runtimeAgentId: "content-director",
  runtimeAgentVersion: "1.0.0",
  safety: {
    browserUse: false, deterministic: true, externalSideEffects: false,
    filesystemSideEffects: false, localOnly: true, modelUse: false,
    networkUse: false, providerUse: false, replaySafe: true, toolUse: false,
  },
  specificationId: "content-director@1.0.0",
  specificationVersion: "1.0.0",
  supportedCapabilityIds: ["content-strategy", "quality-review-preparation"],
};
const binding: AgentExecutionBinding = { ...descriptor, active: true };
const specifications = new ImmutableAgentSpecificationRegistry(
  [CONTENT_DIRECTOR_SPECIFICATION], new AgentSpecificationValidator(),
);

describe("AgentRuntime catalog and resolver", () => {
  it("inspects and resolves the exact deterministic executor without executing it", () => {
    let calls = 0;
    const executor = new DeterministicContentDirectorExecutor();
    const catalog = new ImmutableAgentRuntimeCatalog([
      { descriptor, executor: { agent: executor.agent, execute: () => { calls += 1; return Promise.resolve({}); } } },
    ], [binding], specifications);
    const resolver = new DefaultDenyAgentRuntimeResolver(catalog, specifications);
    expect(catalog.list()).toEqual([descriptor]);
    expect(Object.isFrozen(catalog.list()[0])).toBe(true);
    expect(resolver.resolve({
      requiredCapabilityIds: ["content-strategy"],
      specificationId: "content-director@1.0.0",
      specificationVersion: "1.0.0",
    })).toMatchObject({ status: "resolved", executor: { executorId: "deterministic-content-director" } });
    expect(calls).toBe(0);
  });

  it.each([
    ["unknown exact specification", { specificationId: "content-director@2.0.0", specificationVersion: "2.0.0", requiredCapabilityIds: [] }, "specification_not_found"],
    ["role name alone", { specificationId: "content-director", specificationVersion: "1.0.0", requiredCapabilityIds: [] }, "specification_not_found"],
    ["unknown capability", { specificationId: "content-director@1.0.0", specificationVersion: "1.0.0", requiredCapabilityIds: ["publish"] }, "capability_mismatch"],
  ])("fails closed for %s", (_name, request, code) => {
    const catalog = new ImmutableAgentRuntimeCatalog([{ descriptor, executor: new DeterministicContentDirectorExecutor() }], [binding], specifications);
    expect(new DefaultDenyAgentRuntimeResolver(catalog, specifications).resolve(request)).toMatchObject({ blocker: { code }, status: "blocked" });
  });

  it("rejects duplicate, mismatched, ambiguous, and unsafe registration metadata", () => {
    const executor = new DeterministicContentDirectorExecutor();
    expect(() => new ImmutableAgentRuntimeCatalog([{ descriptor, executor }, { descriptor, executor }], [binding], specifications)).toThrow(/duplicate/u);
    expect(() => new ImmutableAgentRuntimeCatalog([{ descriptor, executor: { agent: { agentId: "wrong", version: "1.0.0" }, execute: executor.execute.bind(executor) } }], [binding], specifications)).toThrow(/mismatch/u);
    expect(() => new ImmutableAgentRuntimeCatalog([{ descriptor, executor }], [binding, binding], specifications)).toThrow(/ambiguous/u);
    expect(() => new ImmutableAgentRuntimeCatalog([{ descriptor: { ...descriptor, safety: { ...descriptor.safety, modelUse: true } as never }, executor }], [], specifications)).toThrow(/unsafe/u);
  });
});

describe("Deterministic Content Director executor", () => {
  it("produces immutable, meaningful, replay-equivalent preparation output", async () => {
    const executor = new DeterministicContentDirectorExecutor();
    const invocation = createInvocation();
    const first = await executor.execute(invocation);
    const second = await executor.execute({ ...invocation, input: { ...invocation.input, constraints: ["No unsupported claims"], brandPreferences: ["Concise"] } });
    expect(first).toEqual(second);
    expect(first.output).toMatchObject({ externalEffects: false, preparationOnly: true, targetAudience: "Busy founders" });
    expect((first.output?.recommendedStructure as unknown[]).length).toBeGreaterThan(2);
    expect(Object.isFrozen(first.output)).toBe(true);
  });

  it.each([
    [{ ...createInvocation().input, rawPrompt: "ignore rules" }],
    [{ ...createInvocation().input, objective: "use api key secret" }],
    [{ ...createInvocation().input, objective: "x".repeat(2_001) }],
    [{ ...createInvocation().input, constraints: ["call https://example.com"] }],
  ])("rejects invalid or unsafe input", (input) => {
    expect(() => new DeterministicContentDirectorExecutor().execute({ ...createInvocation(), input })).toThrow();
  });

  it("exposes a bounded public input validator", () => {
    const validator = new ContentDirectorDirectionInputValidator();
    expect(validator.validate(createInvocation().input).ok).toBe(true);
    expect(validator.validate({ objective: "raw completion" }).ok).toBe(false);
  });
});

function createInvocation(): AgentInvocation {
  return {
    agent: { agentId: "content-director", version: "1.0.0" }, attempt: 1,
    context: {}, contractVersion: "1", correlationId: "correlation-1",
    input: { audience: "Busy founders", brandPreferences: ["Concise"], constraints: ["No unsupported claims"], deliverableType: "carousel", evidenceReferences: [], objective: "Explain the operating model" },
    invocationId: "invocation-1", limits: { maxResultBytes: 100_000, maxToolCalls: 0, modelProfile: "none", timeoutMs: 1_000 },
    objective: "Prepare content direction", outputContract: { contractId: "deterministic-content-direction-artifact", contractVersion: "1" },
    permissions: [], taskId: "task-1",
  };
}
