import { randomUUID } from "node:crypto";

import type { AgentExecutor } from "../agents/agent-runtime.js";
import { ImmutableAgentRegistry } from "../agents/agent-registry.js";
import { ContentAgent } from "../agents/content/content-agent.js";
import { CONTENT_AGENT_MANIFEST } from "../agents/content/content-agent-manifest.js";
import { CONTENT_AGENT_SPECIFICATION } from "../agents/content/content-agent-specification.js";
import { ContentOutputValidator } from "../agents/content/content-output-validator.js";
import { ModelBackedContentAgent } from "../agents/content/model-backed-content-agent.js";
import { InProcessAgentRuntime } from "../agents/in-process-agent-runtime.js";
import { ImmutableAgentSpecificationRegistry } from "../agents/specification/immutable-agent-specification-registry.js";
import { CoreBrain } from "../core/core-brain.js";
import type {
  Clock,
  IdentifierGenerator,
  IdentifierScope,
} from "../core/dependencies.js";
import { RequestExecutionContextBuilder } from "../core/execution-context-builder.js";
import { MemoryExecutionContextBuilder } from "../memory/memory-execution-context-builder.js";
import { RegistryRouter } from "../core/routing/registry-router.js";
import { KnowledgeExecutionContextBuilder } from "../knowledge/knowledge-execution-context-builder.js";
import { KnowledgeQueryValidator } from "../knowledge/knowledge-query-validator.js";
import { KnowledgeRecordValidator } from "../knowledge/knowledge-record-validator.js";
import { KnowledgeSearchResultValidator } from "../knowledge/knowledge-search-result-validator.js";
import { RepositoryBackedKnowledgeService } from "../knowledge/repository-backed-knowledge-service.js";
import type { LogEntry, Logger } from "../logging/logger.js";
import { MemoryQueryValidator } from "../memory/memory-query-validator.js";
import { MemoryRecordValidator } from "../memory/memory-record-validator.js";
import { RepositoryBackedMemoryService } from "../memory/repository-backed-memory-service.js";
import { MemoryScopeValidator } from "../memory/memory-scope-validator.js";
import type { ModelProfile } from "../models/model-profile.js";
import type { ModelProvider } from "../models/model-provider.js";
import type { ModelRequest } from "../models/model-request.js";
import type { ModelSelectionPolicy } from "../models/model-selection-policy.js";
import type { ProviderRegistry } from "../models/provider-registry.js";
import { ValidatedLlmGateway } from "../models/validated-llm-gateway.js";
import { SqliteKnowledgeRepository } from "../persistence/sqlite/sqlite-knowledge-repository.js";
import { SqliteMemoryRepository } from "../persistence/sqlite/sqlite-memory-repository.js";
import { SqliteRepositoryTransactionRunner } from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import { DefaultDenyPolicyEvaluator } from "../policy/default-deny-policy-evaluator.js";
import type {
  PermissionGrantSet,
} from "../policy/effective-permissions.js";
import type { PermissionGrantResolver } from "../policy/policy-evaluator.js";
import { AgentInvocationValidator } from "../validation/agent-invocation-validator.js";
import { AgentManifestValidator } from "../validation/agent-manifest-validator.js";
import { AgentResultValidator } from "../validation/agent-result-validator.js";
import { AgentSpecificationValidator } from "../agents/specification/agent-specification-validator.js";
import { ModelProfileValidator } from "../validation/model-profile-validator.js";
import { ModelRequestValidator } from "../validation/model-request-validator.js";
import { ModelResponseValidator } from "../validation/model-response-validator.js";
import { PolicyDecisionValidator } from "../validation/policy-decision-validator.js";
import { RequestEnvelopeValidator } from "../validation/request-envelope-validator.js";
import { TaskResponseValidator } from "../validation/task-response-validator.js";
import {
  DeterministicLocalModelProvider,
  LOCAL_DETERMINISTIC_MODEL_PROFILE,
} from "./deterministic-local-model-provider.js";
import type { LocalRuntimeConfig } from "./local-runtime-config.js";
import { LocalRuntimeConfigValidator } from "./local-runtime-config-validator.js";
import { LocalRuntimeConfigurationError } from "./local-runtime-error.js";
import {
  ComposedLocalRuntime,
  type LocalRuntime,
  type LocalRuntimeResource,
} from "./local-runtime.js";

export interface LocalRuntimeOverrides {
  readonly clock?: Clock;
  readonly contentAgentExecutor?: AgentExecutor;
  readonly identifiers?: IdentifierGenerator;
  readonly logger?: Logger;
}

export async function createLocalRuntime(
  candidate: unknown,
  overrides: LocalRuntimeOverrides = {},
): Promise<LocalRuntime> {
  const validation = new LocalRuntimeConfigValidator().validate(candidate);
  if (!validation.ok) {
    throw new LocalRuntimeConfigurationError(validation.issues);
  }
  const config = freezeConfig(validation.value);
  const clock = overrides.clock ?? new SystemClock();
  const identifiers =
    overrides.identifiers ?? new RandomIdentifierGenerator();
  const logger = overrides.logger ?? new NoopLogger();

  const specifications = new ImmutableAgentSpecificationRegistry(
    [CONTENT_AGENT_SPECIFICATION],
    new AgentSpecificationValidator(),
  );
  const agentRegistry = new ImmutableAgentRegistry(
    [CONTENT_AGENT_MANIFEST],
    new AgentManifestValidator(),
  );
  const executor =
    overrides.contentAgentExecutor ??
    createContentAgent(config, clock, specifications);
  assertContentExecutor(executor);
  const resultValidator = new AgentResultValidator();
  const agentRuntime = new InProcessAgentRuntime(
    [executor],
    new AgentInvocationValidator(),
    resultValidator,
    clock,
  );
  const policyEvaluator = new DefaultDenyPolicyEvaluator(
    new ConfiguredPermissionGrantResolver(config),
  );

  const openedResources: LocalRuntimeResource[] = [];
  try {
    const repositories = new SqliteRepositoryTransactionRunner(config.sqlite);
    openedResources.push(repositories);
    const memoryRepository = new SqliteMemoryRepository(config.sqlite);
    openedResources.push(memoryRepository);
    const knowledgeRepository = new SqliteKnowledgeRepository(config.sqlite);
    openedResources.push(knowledgeRepository);

    const memoryService = new RepositoryBackedMemoryService({
      clock,
      queryValidator: new MemoryQueryValidator(),
      recordValidator: new MemoryRecordValidator(),
      repository: memoryRepository,
      scopeValidator: new MemoryScopeValidator(),
    });
    const knowledgeService = new RepositoryBackedKnowledgeService({
      clock,
      queryValidator: new KnowledgeQueryValidator(),
      recordValidator: new KnowledgeRecordValidator(),
      repository: knowledgeRepository,
      resultValidator: new KnowledgeSearchResultValidator(),
    });
    const contextBuilder = new KnowledgeExecutionContextBuilder(
      new MemoryExecutionContextBuilder(
        new RequestExecutionContextBuilder(),
      ),
      knowledgeService,
      specifications,
    );
    const requestValidator = new RequestEnvelopeValidator();
    const coreBrain = new CoreBrain({
      agentResultValidator: resultValidator,
      agentRuntime,
      clock,
      contextBuilder,
      identifiers,
      logger,
      memoryService,
      policyDecisionValidator: new PolicyDecisionValidator(),
      policyEvaluator,
      repositories,
      requestValidator,
      router: new RegistryRouter(agentRegistry, clock, identifiers),
      taskResponseValidator: new TaskResponseValidator(),
    });

    return new ComposedLocalRuntime(
      coreBrain,
      openedResources,
      requestValidator,
      {
        actorId: config.actorId,
        workspaceId: config.workspaceId,
      },
    );
  } catch (error) {
    await closeResources(openedResources);
    throw error;
  }
}

function createContentAgent(
  config: LocalRuntimeConfig,
  clock: Clock,
  specifications: ImmutableAgentSpecificationRegistry,
): AgentExecutor {
  if (config.contentAgentMode === "deterministic") {
    return new ContentAgent(clock, new ContentOutputValidator());
  }

  const provider = new DeterministicLocalModelProvider(clock);
  const gateway = new ValidatedLlmGateway({
    clock,
    profileValidator: new ModelProfileValidator(),
    providerRegistry: new SingleProviderRegistry(provider),
    requestValidator: new ModelRequestValidator(),
    responseValidator: new ModelResponseValidator(),
    selectionPolicy: new FixedModelSelectionPolicy(
      LOCAL_DETERMINISTIC_MODEL_PROFILE,
    ),
  });
  return new ModelBackedContentAgent({
    clock,
    gateway,
    outputValidator: new ContentOutputValidator(),
    specifications,
  });
}

function assertContentExecutor(executor: AgentExecutor): void {
  if (
    executor.agent.agentId !== CONTENT_AGENT_MANIFEST.agentId ||
    executor.agent.version !== CONTENT_AGENT_MANIFEST.version
  ) {
    throw new LocalRuntimeConfigurationError([
      {
        code: "identity_mismatch",
        message: "contentAgentExecutor must implement the configured Content Agent",
        path: "overrides.contentAgentExecutor",
      },
    ]);
  }
}

class ConfiguredPermissionGrantResolver
  implements PermissionGrantResolver
{
  readonly #grants: PermissionGrantSet;
  readonly #actorId: string;
  readonly #workspaceId: string;

  public constructor(config: LocalRuntimeConfig) {
    this.#actorId = config.actorId;
    this.#workspaceId = config.workspaceId;
    this.#grants = Object.freeze({
      actorGrants: Object.freeze([...config.permissions.actorGrants]),
      policyGrants: Object.freeze([...config.permissions.policyGrants]),
      taskGrants: Object.freeze([...config.permissions.taskGrants]),
    });
  }

  public resolve(input: {
    readonly actorId: string;
    readonly workspaceId: string;
  }): Promise<PermissionGrantSet> {
    return Promise.resolve(
      input.actorId === this.#actorId &&
        input.workspaceId === this.#workspaceId
        ? this.#grants
        : Object.freeze({}),
    );
  }
}

class SingleProviderRegistry implements ProviderRegistry {
  readonly #provider: ModelProvider;

  public constructor(provider: ModelProvider) {
    this.#provider = provider;
  }

  public get(providerId: string): ModelProvider | undefined {
    return providerId === this.#provider.providerId
      ? this.#provider
      : undefined;
  }
}

class FixedModelSelectionPolicy implements ModelSelectionPolicy {
  readonly #profile: ModelProfile;

  public constructor(profile: ModelProfile) {
    this.#profile = profile;
  }

  public select(request: ModelRequest): Promise<ModelProfile> {
    return request.modelProfile === this.#profile.profileId
      ? Promise.resolve(this.#profile)
      : Promise.reject(new TypeError("Model profile is not configured"));
  }
}

class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

class RandomIdentifierGenerator implements IdentifierGenerator {
  public next(scope: IdentifierScope): string {
    return `${scope}-${randomUUID()}`;
  }
}

class NoopLogger implements Logger {
  public log(entry: LogEntry): void {
    void entry;
  }
}

async function closeResources(
  resources: readonly LocalRuntimeResource[],
): Promise<void> {
  for (const resource of [...resources].reverse()) {
    try {
      await resource.close();
    } catch {
      continue;
    }
  }
}

function freezeConfig(config: LocalRuntimeConfig): LocalRuntimeConfig {
  return Object.freeze({
    ...config,
    permissions: Object.freeze({
      actorGrants: Object.freeze([...config.permissions.actorGrants]),
      policyGrants: Object.freeze([...config.permissions.policyGrants]),
      taskGrants: Object.freeze([...config.permissions.taskGrants]),
    }),
    sqlite: Object.freeze({ ...config.sqlite }),
  });
}
