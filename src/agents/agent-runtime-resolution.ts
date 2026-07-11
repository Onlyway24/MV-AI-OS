import type { AgentExecutor } from "./agent-runtime.js";
import type { AgentSpecificationRegistry } from "./specification/agent-specification-registry.js";

export const DETERMINISTIC_LOCAL_EXECUTION_MODE = "DETERMINISTIC_LOCAL" as const;

export interface AgentExecutorSafetyProfile {
  readonly browserUse: false;
  readonly deterministic: true;
  readonly externalSideEffects: false;
  readonly filesystemSideEffects: false;
  readonly localOnly: true;
  readonly modelUse: false;
  readonly networkUse: false;
  readonly providerUse: false;
  readonly replaySafe: true;
  readonly toolUse: false;
}

export interface AgentExecutorDescriptor {
  readonly executorId: string;
  readonly executorVersion: string;
  readonly runtimeAgentId: string;
  readonly runtimeAgentVersion: string;
  readonly specificationId: string;
  readonly specificationVersion: string;
  readonly roleId: string;
  readonly supportedCapabilityIds: readonly string[];
  readonly executionMode: typeof DETERMINISTIC_LOCAL_EXECUTION_MODE;
  readonly safety: AgentExecutorSafetyProfile;
  readonly inputContractId: string;
  readonly outputContractId: string;
}

export interface AgentExecutionBinding extends AgentExecutorDescriptor {
  readonly active: boolean;
}

export interface AgentExecutorRegistration {
  readonly descriptor: AgentExecutorDescriptor;
  readonly executor: AgentExecutor;
}

export interface AgentRuntimeCatalog {
  list(): readonly AgentExecutorDescriptor[];
  get(executorId: string, executorVersion: string): AgentExecutorDescriptor | undefined;
  getBinding(specificationId: string, specificationVersion: string): AgentExecutionBinding | undefined;
}

export type AgentResolutionBlockerCode =
  | "invalid_request"
  | "specification_not_found"
  | "binding_not_found"
  | "executor_not_found"
  | "identity_mismatch"
  | "capability_mismatch"
  | "unsafe_executor";

export interface AgentResolutionBlocker {
  readonly code: AgentResolutionBlockerCode;
  readonly reason: string;
}

export interface AgentResolutionRequest {
  readonly specificationId: string;
  readonly specificationVersion: string;
  readonly requiredCapabilityIds: readonly string[];
}

export type AgentResolutionResult =
  | { readonly status: "blocked"; readonly blocker: AgentResolutionBlocker }
  | { readonly status: "resolved"; readonly executor: AgentExecutorDescriptor };

export interface AgentRuntimeResolver {
  resolve(request: AgentResolutionRequest): AgentResolutionResult;
}

export class ImmutableAgentRuntimeCatalog implements AgentRuntimeCatalog {
  readonly #descriptors: readonly AgentExecutorDescriptor[];
  readonly #descriptorByKey: ReadonlyMap<string, AgentExecutorDescriptor>;
  readonly #bindingBySpecification: ReadonlyMap<string, AgentExecutionBinding>;

  public constructor(
    registrations: readonly AgentExecutorRegistration[],
    bindings: readonly AgentExecutionBinding[],
    specifications: AgentSpecificationRegistry,
  ) {
    const descriptorByKey = new Map<string, AgentExecutorDescriptor>();
    for (const registration of registrations) {
      const descriptor = freezeClone(registration.descriptor);
      assertDescriptor(descriptor);
      if (
        registration.executor.agent.agentId !== descriptor.runtimeAgentId ||
        registration.executor.agent.version !== descriptor.runtimeAgentVersion
      ) {
        throw new Error("agent executor descriptor/implementation identity mismatch");
      }
      const key = executorKey(descriptor.executorId, descriptor.executorVersion);
      if (descriptorByKey.has(key)) {
        throw new Error(`duplicate agent executor registration: ${key}`);
      }
      descriptorByKey.set(key, descriptor);
    }

    const bindingBySpecification = new Map<string, AgentExecutionBinding>();
    const executorBindings = new Set<string>();
    for (const candidate of bindings) {
      const binding = freezeClone(candidate);
      const specification = specifications.get(binding.roleId, binding.specificationVersion);
      const descriptor = descriptorByKey.get(executorKey(binding.executorId, binding.executorVersion));
      if (
        specification === undefined ||
        `${specification.agentId}@${specification.version}` !== binding.specificationId ||
        specification.agentId !== binding.roleId ||
        specification.agentId !== binding.runtimeAgentId ||
        specification.version !== binding.runtimeAgentVersion
      ) throw new Error("unknown or mismatched agent specification binding");
      if (descriptor === undefined) throw new Error("unknown executor binding");
      if (!sameDescriptor(binding, descriptor)) throw new Error("binding does not exactly match executor descriptor");
      assertDescriptor(binding);
      if (!binding.active) continue;
      const specificationKey = specKey(binding.specificationId, binding.specificationVersion);
      const executorBindingKey = executorKey(binding.executorId, binding.executorVersion);
      if (bindingBySpecification.has(specificationKey) || executorBindings.has(executorBindingKey)) {
        throw new Error("ambiguous active agent execution binding");
      }
      bindingBySpecification.set(specificationKey, binding);
      executorBindings.add(executorBindingKey);
    }
    this.#descriptors = Object.freeze([...descriptorByKey.values()].sort(compareDescriptor));
    this.#descriptorByKey = descriptorByKey;
    this.#bindingBySpecification = bindingBySpecification;
  }

  public list(): readonly AgentExecutorDescriptor[] { return this.#descriptors; }
  public get(executorId: string, executorVersion: string): AgentExecutorDescriptor | undefined {
    return this.#descriptorByKey.get(executorKey(executorId, executorVersion));
  }
  public getBinding(specificationId: string, specificationVersion: string): AgentExecutionBinding | undefined {
    return this.#bindingBySpecification.get(specKey(specificationId, specificationVersion));
  }
}

export class DefaultDenyAgentRuntimeResolver implements AgentRuntimeResolver {
  public constructor(
    private readonly catalog: AgentRuntimeCatalog,
    private readonly specifications: AgentSpecificationRegistry,
  ) {}

  public resolve(request: AgentResolutionRequest): AgentResolutionResult {
    if (!validId(request.specificationId) || !validId(request.specificationVersion) ||
        !Array.isArray(request.requiredCapabilityIds) || request.requiredCapabilityIds.some((id) => !validId(id))) {
      return blocked("invalid_request", "Resolution request is invalid");
    }
    const agentId = request.specificationId.slice(0, request.specificationId.lastIndexOf("@"));
    const specification = this.specifications.get(agentId, request.specificationVersion);
    if (specification === undefined || `${specification.agentId}@${specification.version}` !== request.specificationId) {
      return blocked("specification_not_found", "Exact Agent Specification was not found");
    }
    const binding = this.catalog.getBinding(request.specificationId, request.specificationVersion);
    if (binding === undefined) return blocked("binding_not_found", "Exact active execution binding was not found");
    const descriptor = this.catalog.get(binding.executorId, binding.executorVersion);
    if (descriptor === undefined) return blocked("executor_not_found", "Exact executor was not found");
    if (!sameDescriptor(binding, descriptor)) return blocked("identity_mismatch", "Binding and executor identities differ");
    const requested: readonly string[] = [...new Set<string>(request.requiredCapabilityIds)].sort();
    if (requested.some((id) => !descriptor.supportedCapabilityIds.includes(id))) {
      return blocked("capability_mismatch", "A required capability is not supported");
    }
    try { assertDescriptor(descriptor); } catch { return blocked("unsafe_executor", "Executor safety requirements are not satisfied"); }
    return freezeClone({ executor: descriptor, status: "resolved" });
  }
}

function assertDescriptor(value: AgentExecutorDescriptor): void {
  const candidate = value as unknown as Record<string, unknown>;
  const safety = candidate.safety as Record<string, unknown> | undefined;
  const ids = [value.executorId, value.executorVersion, value.runtimeAgentId, value.runtimeAgentVersion,
    value.specificationId, value.specificationVersion, value.roleId, value.inputContractId, value.outputContractId];
  if (ids.some((id) => !validId(id)) || candidate.executionMode !== DETERMINISTIC_LOCAL_EXECUTION_MODE ||
      !Array.isArray(value.supportedCapabilityIds) || value.supportedCapabilityIds.some((id) => !validId(id)) ||
      new Set(value.supportedCapabilityIds).size !== value.supportedCapabilityIds.length ||
      safety?.deterministic !== true || safety.replaySafe !== true || safety.localOnly !== true ||
      safety.modelUse !== false || safety.providerUse !== false || safety.toolUse !== false || safety.networkUse !== false ||
      safety.browserUse !== false || safety.filesystemSideEffects !== false || safety.externalSideEffects !== false) {
    throw new Error("unsafe or invalid deterministic-local executor descriptor");
  }
}

function sameDescriptor(binding: AgentExecutionBinding, descriptor: AgentExecutorDescriptor): boolean {
  const bindingDescriptor: Record<string, unknown> = { ...binding };
  delete bindingDescriptor.active;
  return JSON.stringify(bindingDescriptor) === JSON.stringify(descriptor);
}
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9@._:-]+$/u.test(value); }
function executorKey(id: string, version: string): string { return `${id}@${version}`; }
function specKey(id: string, version: string): string { return `${id}#${version}`; }
function compareDescriptor(a: AgentExecutorDescriptor, b: AgentExecutorDescriptor): number { return executorKey(a.executorId, a.executorVersion).localeCompare(executorKey(b.executorId, b.executorVersion)); }
function blocked(code: AgentResolutionBlockerCode, reason: string): AgentResolutionResult { return Object.freeze({ blocker: Object.freeze({ code, reason }), status: "blocked" }); }
function freezeClone<T>(value: T): T { return deepFreeze(structuredClone(value)); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
