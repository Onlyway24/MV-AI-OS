# MV AI OS Current State

## Purpose

This document is the durable snapshot of what exists in the repository. It must be
updated at the end of every completed milestone. Claims here describe verified source
and tests, not intended future behavior.

## Repository baseline

- Current branch at the time of this snapshot: `main`.
- Latest known commit: `8e8a463 feat: add tool gateway foundation`.
- The project-state system and governed model-backed vertical slice are currently
  uncommitted working-tree changes.
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

- repositories for task, request, and audit state;
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

## Implemented modules

### Executable orchestration

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

### Memory and knowledge

- Memory record, scope, query, retention, permission, and lifecycle contracts.
- In-memory Memory Service under the testing namespace.
- Knowledge records, source provenance, scope, query, repository, service, and
  deterministic retrieval rules.
- Repository-backed Knowledge Service.
- Test-only in-memory Knowledge Repository.

### Models

- Provider-neutral model request, response, profile, usage, provider, registry,
  selection policy, and error contracts.
- Validated LLM Gateway with provider/profile selection, limit checks, failure
  normalization, response ownership validation, and injected dependencies.
- Deterministic model provider and provider registry only in tests.
- Model-backed content execution is integrated through the gateway using deterministic
  providers in tests.

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

The latest verified suite contains 32 test files and 160 passing tests covering:

- Core Brain preparation, routing, execution, failures, and state transitions.
- agent registry/runtime and deterministic Content Agent behavior.
- repository conformance, idempotency, conflicts, atomic transitions, and audit.
- memory validation, permission filtering, retrieval, write, delete, and expiry.
- knowledge validation, repository conformance, scope, tag, source, freshness, and
  permission filtering.
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
strongly tested architectural foundations. It is not production-ready. The project
has meaningful executable behavior, but several completed foundations are not yet
composed into one application runtime.

## What exists only as a foundation

- Agent Specifications are required by the model-backed Content Agent and knowledge
  context path, but are not yet universally enforced by every Agent Runtime executor.
- Workflow Specifications are validated and registrable but are not executed.
- The Tool Gateway authorizes access and validates results but cannot execute tools.
- The LLM Gateway is used by the model-backed Content Agent, but no production provider
  exists.
- The Knowledge Service can enrich Core Brain execution context through the injected
  decorator, but no durable knowledge adapter exists.
- Repository interfaces and conformance suites exist, but no durable database adapter
  exists.
- Approval markers exist at boundaries, but there is no durable approval workflow.

## What is actually executable

- A caller can construct `CoreBrain` with injected test/local adapters and execute a
  `business.content` request end to end.
- The request is validated, persisted through repository interfaces, routed,
  authorized, optionally enriched with permitted memory, executed by the
  deterministic Content Agent, validated, audited, and returned as a `TaskResponse`.
- A caller can alternatively compose the model-backed Content Agent and governed
  knowledge decorator. That path resolves the exact Content Agent specification,
  retrieves permitted memory and knowledge, invokes an injected provider through
  `ValidatedLlmGateway`, validates `ContentOutput`, audits completion, and supports
  idempotent replay.
- Duplicate requests replay stored results, and conflicting reuse fails.
- The Knowledge Service can independently search an injected repository or participate
  in governed context assembly.
- The Validated LLM Gateway can independently call an injected model provider.
- The Tool Gateway can authorize a tool invocation and validate a supplied result
  without executing a tool.

There is no packaged application entry point, CLI, HTTP service, dashboard, or
production composition root.

## Not implemented yet

- A production application composition root for the integrated execution path.
- Universal runtime enforcement of Agent Specifications for all executors.
- Workflow execution, scheduling, retries, or n8n.
- Real tool implementations or direct tool execution.
- Durable SQLite or other database persistence.
- Production model providers or external API calls.
- Durable approvals and human-in-the-loop operations.
- Configuration loading and secrets management.
- HTTP, webhook, schedule, dashboard, or other transport adapters.
- Cancellation propagation, production retry budgets, operational health checks,
  metrics exporters, deployment, backup, restore, and multi-user authentication.
