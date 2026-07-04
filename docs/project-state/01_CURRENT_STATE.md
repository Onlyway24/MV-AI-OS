# MV AI OS Current State

## Purpose

This document is the durable snapshot of what exists in the repository. It must be
updated at the end of every completed milestone. Claims here describe verified source
and tests, not intended future behavior.

## Repository baseline

- Current branch at the time of this snapshot: `main`.
- Latest known commit: `98d55d2 feat: add SQLite knowledge persistence`.
- Validated local runtime composition is currently an uncommitted working-tree
  change.
- Current package version: `0.1.0`.
- Runtime: Node.js `22.23.x`, strict TypeScript, ECMAScript modules.
- Package manager: npm `10.9.8`.
- No upstream branch, remote CI state, release artifact, or deployment state is
  assumed unless separately verified.
- `AI_ENGINEERING_RULES.md` is present as a user-owned untracked file and is not part
  of the latest known commit.

## Current architecture

MV AI OS currently follows inward-pointing, contract-first boundaries:

```text
RequestEnvelope
  -> LocalRuntime
  -> CoreBrain
  -> repository-backed task lifecycle
  -> registry-based routing
  -> default-deny policy evaluation
  -> memory and knowledge execution-context assembly
  -> AgentRuntime
  -> exact Agent Specification
  -> provider-neutral LLM Gateway
  -> validated AgentResult
  -> validated TaskResponse
```

Supporting modules are isolated behind interfaces:

- repositories for task, request, audit, memory, and knowledge state;
- registries for agents, agent specifications, workflow specifications, and tools;
- services for memory and knowledge;
- provider-neutral gateways for models and tools;
- validators at public and cross-module contract boundaries;
- injectable clocks, identifiers, routers, runtimes, policies, services, and
  repositories.

The Core Brain depends on interfaces and does not import database, transport, model
provider, n8n, or external SDK types.

## Completed milestones

1. Architecture and agent documentation foundation.
2. Strict TypeScript and test/build foundation.
3. Core Brain orchestration foundation.
4. Deterministic Content Agent execution slice.
5. Memory Engine abstraction and governed in-memory implementation.
6. Repository-backed, idempotent, audited task lifecycle.
7. Provider-neutral LLM Gateway foundation.
8. Default-deny Policy/Governance foundation.
9. Knowledge Base foundation.
10. Agent Specification System.
11. Workflow Specification System.
12. Non-executing, policy-governed Tool Gateway foundation.
13. Permanent project-state memory system.
14. Governed model-backed Content Agent vertical execution slice.
15. Durable SQLite task/request/audit lifecycle.
16. Durable SQLite Memory persistence.
17. Durable SQLite Knowledge persistence.
18. Validated Local Runtime composition.

## Implemented modules

### Executable orchestration

- Validated local composition root with explicit configuration, actor/workspace
  identity binding, runtime entrypoint, and graceful resource shutdown.
- `CoreBrain` request preparation and execution.
- Deterministic registry routing by task type.
- Task state transitions and one-step execution planning.
- In-process Agent Runtime with invocation/result validation.
- Deterministic Content Agent.
- Idempotent request replay and conflict detection.
- Atomic task/request/audit operations through repository transactions.
- Policy-derived invocation permissions.
- Memory-enriched execution-context decorator.
- Policy-gated knowledge-enriched execution-context decorator.
- Model-backed Content Agent using exact Agent Specifications and `LlmGateway`.
- Versioned Content Agent instructions and production Content Agent specification.
- Selectable deterministic Content Agent or model-backed Content Agent using the
  deterministic local LLM provider.

### Memory and knowledge

- Memory record, scope, query, retention, permission, and lifecycle contracts.
- Repository-backed Memory Service with policy-first permission checks and deterministic
  scope filtering.
- In-memory Memory Service and Memory Repository under the testing namespace.
- SQLite-backed Memory Repository with durable writes, optimistic updates, expiry,
  soft deletion, permission tags, and deterministic retrieval.
- Knowledge records, source provenance, scope, query, repository, service, and
  deterministic retrieval rules.
- Repository-backed Knowledge Service.
- Test-only in-memory Knowledge Repository.
- SQLite-backed Knowledge Repository with workspace and actor visibility, required
  scopes, permission tags, sources, tags, freshness, expiry, deletion, text matching,
  and deterministic retrieval.

### Persistence

- Storage-neutral task, request, audit, and transaction interfaces.
- SQLite-backed task, request, and audit repository adapters.
- Serialized atomic SQLite transactions with deterministic close behavior.
- Versioned schema initialization and database identity verification.
- Forward migration from lifecycle schema version 1 to memory schema version 2.
- Forward migration from memory schema version 2 to knowledge schema version 3.
- Validated JSON serialization and deserialization for every persisted lifecycle
  memory, and knowledge record.
- Optimistic task transition conflicts, request replay, and append-only audit ordering
  preserved across process restarts.

### Models

- Provider-neutral model request, response, profile, usage, provider, registry,
  selection policy, and error contracts.
- Validated LLM Gateway with provider/profile selection, limit checks, failure
  normalization, response ownership validation, and injected dependencies.
- Deterministic model provider and provider registry only in tests.
- Model-backed content execution is integrated through the gateway using deterministic
  providers in tests.
- The local runtime can exercise the model-backed path through a deterministic,
  provider-neutral local model adapter with no network access.

### Runtime composition

- Versioned local runtime configuration for SQLite, Content Agent mode, actor,
  workspace, and explicit actor/task/policy grants.
- Runtime validation occurs before any SQLite connection is opened.
- Production immutable Agent Specification registry.
- Explicit construction of lifecycle, Memory, Knowledge, policy, registry, routing,
  context, Agent Runtime, and model boundaries.
- Runtime shutdown waits for in-flight requests and closes every owned SQLite adapter
  deterministically.

### Specifications and tools

- Versioned Agent Specification contracts, validators, and registry interface.
- Versioned Workflow Specification graph contracts, validators, and registry
  interface.
- Versioned Tool Definition, invocation, result, permission, risk, registry, and
  non-executing Tool Gateway contracts.
- Policy-governed tool authorization and tool-result validation.
- Deterministic immutable agent-specification, workflow-specification, and tool
  registries only in tests.

## Implemented contracts

- JSON-compatible value contracts.
- `RequestEnvelope`.
- task records, task states, execution plans, routing decisions, prepared execution,
  execution context, and `TaskResponse`.
- `AgentManifest`, `AgentInvocation`, `AgentResult`, evidence, limits, and runtime
  interfaces.
- `AuditEvent` and normalized `ErrorRecord`.
- repository transaction, task, request, and audit interfaces.
- memory repository search and optimistic-update interfaces.
- SQLite connection configuration and schema-version contracts.
- local runtime configuration, runtime handle, and test-override contracts.
- policy decision, effective permission, grant resolver, and evaluator interfaces.
- memory record/query/scope/service contracts.
- knowledge record/source/query/scope/search-result/repository/service contracts.
- model request/response/profile/usage/error/provider/gateway contracts.
- agent capability, schema, limit, policy requirement, specification, and registry
  contracts.
- workflow input/output/step/transition/condition/failure/specification and registry
  contracts.
- tool definition/invocation/result/permission/risk/registry/gateway contracts.

## Implemented validators

- Request envelope, task response, audit event, agent manifest, agent invocation, and
  agent result validators.
- Stored request, task record, and SQLite connection configuration validators.
- Local runtime configuration validation.
- Policy decision and effective-permission validation.
- Memory record, scope, and query validators.
- Knowledge source, scope, record, query, and result validators.
- Model request, response, and profile validators.
- Agent capability, input/output schema, limit, policy requirement, and full
  specification validators.
- Workflow input/output, step, transition, condition, failure policy, and complete
  graph validators.
- Tool definition, permission, risk, invocation, and result validators.

## Implemented tests

The latest verified suite contains 38 test files and 212 passing tests covering:

- Core Brain preparation, routing, execution, failures, and state transitions.
- agent registry/runtime and deterministic Content Agent behavior.
- repository conformance, idempotency, conflicts, atomic transitions, and audit.
- SQLite schema initialization, adapter conformance, whole-transaction rollback,
  corruption rejection, restart durability, replay, and post-restart request
  conflicts.
- memory validation, permission filtering, retrieval, write, delete, and expiry.
- memory repository conformance, SQLite restart durability, corruption rejection,
  deterministic ordering, lifecycle-preserving schema migration, and post-restart
  execution-context enrichment.
- knowledge validation, repository conformance, scope, tag, source, freshness, and
  permission filtering.
- SQLite knowledge restart durability, corruption rejection, deterministic retrieval,
  governed context enrichment, and migration preserving lifecycle, audit, and memory
  records.
- local runtime startup validation, deterministic and model-backed execution, default
  denial, actor/workspace isolation, graceful shutdown, restart replay without
  re-execution, and durable Memory/Knowledge reuse.
- model validation, deterministic provider behavior, provider neutrality, and
  normalized failures.
- default-deny policy intersections and Core Brain enforcement.
- agent specification validation, duplicates, versions, limits, capabilities, and
  policy requirements.
- workflow specification validation, graph reachability, transitions, conditions,
  cycles, exact agent references, versions, and registry immutability.
- tool definition, registry, policy authorization, approvals, idempotency, timeout,
  result ownership, and immutability.
- the complete governed model-backed content slice, including policy-denied knowledge
  and model access, exact specification lookup, malformed model output, provider
  failure normalization, audit, and replay.

## Current maturity

The repository is an early implementation with a stable orchestration kernel and
strongly tested architectural foundations, durable local lifecycle, memory, and
knowledge adapters, and an executable local composition root. It is not
production-ready, but the implemented modules now compose into one validated local
runtime.

## What exists only as a foundation

- Agent Specifications are required by the model-backed Content Agent and knowledge
  context path, but are not yet universally enforced by every Agent Runtime executor.
- Workflow Specifications are validated and registrable but are not executed.
- The Tool Gateway authorizes access and validates results but cannot execute tools.
- The LLM Gateway is used by the model-backed Content Agent, but no production provider
  exists.
- Durable persistence currently covers task, request, audit, memory, and knowledge
  state; approvals, workflows, and configuration remain non-durable.
- Approval markers exist at boundaries, but there is no durable approval workflow.

## What is actually executable

- A caller can construct `CoreBrain` with injected test/local adapters and execute a
  `business.content` request end to end.
- A caller can use `createLocalRuntime` to validate configuration and construct the
  complete local execution path without manually wiring internal dependencies.
- The request is validated, persisted through repository interfaces, routed,
  authorized, optionally enriched with permitted memory, executed by the
  deterministic Content Agent, validated, audited, and returned as a `TaskResponse`.
- A caller can alternatively compose the model-backed Content Agent and governed
  knowledge decorator. That path resolves the exact Content Agent specification,
  retrieves permitted memory and knowledge, invokes an injected provider through
  `ValidatedLlmGateway`, validates `ContentOutput`, audits completion, and supports
  idempotent replay.
- Duplicate requests replay stored results, and conflicting reuse fails.
- The same lifecycle can use `SqliteRepositoryTransactionRunner`; completed requests,
  task state, and audit history survive closing and reopening the database.
- `RepositoryBackedMemoryService` can use `SqliteMemoryRepository`; permitted memory,
  deletion, and expiry state survive restart and can enrich later execution contexts.
- `RepositoryBackedKnowledgeService` can use `SqliteKnowledgeRepository`; permitted
  knowledge survives restart and can enrich later governed execution contexts.
- Runtime recreation preserves task replay and retrieves durable permitted memory and
  knowledge for new requests.
- The Knowledge Service can independently search an injected repository or participate
  in governed context assembly.
- The Validated LLM Gateway can independently call an injected model provider.
- The Tool Gateway can authorize a tool invocation and validate a supplied result
  without executing a tool.

There is no packaged application entry point, CLI, HTTP service, dashboard, or
production composition root.

## Not implemented yet

- A CLI/process entrypoint and configuration-file/environment loader.
- Universal runtime enforcement of Agent Specifications for all executors.
- Workflow execution, scheduling, retries, or n8n.
- Real tool implementations or direct tool execution.
- Durable approval and workflow persistence.
- Production model providers or external API calls.
- Durable approvals and human-in-the-loop operations.
- Configuration loading and secrets management.
- HTTP, webhook, schedule, dashboard, or other transport adapters.
- Cancellation propagation, production retry budgets, operational health checks,
  metrics exporters, deployment, backup, restore, and multi-user authentication.
