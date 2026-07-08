# MV AI OS Current State

## Purpose

This document is the durable snapshot of what exists in the repository. It must be
updated at the end of every completed milestone. Claims here describe verified source
and tests, not intended future behavior.

## Repository baseline

- Current branch at the time of this snapshot: `main`.
- Latest committed baseline before the Operator Safety Report milestone:
  `afee733 feat: add quality guardian foundation`.
- Validated local runtime composition was committed in
  `b6c0aea feat: add validated local runtime composition`.
- Current package version: `0.1.0`.
- Runtime: Node.js `22.23.x`, strict TypeScript, ECMAScript modules.
- Package manager: npm `10.9.8`.
- No upstream branch, remote CI state, release artifact, or deployment state is
  assumed unless separately verified.
- `AI_ENGINEERING_RULES.md` is tracked and was committed in `87b2f05`.
- The Controlled Local OpenAI Provider Wiring milestone is completed and committed in
  `649c3a7 feat: wire controlled local OpenAI provider`.
- The Controlled Model Operation Limits milestone is completed and committed in
  `394cb16 feat: add controlled model operation limits`.
- The Controlled Model Usage Accounting milestone is completed in this repository
  state and was committed in `3d3b279 feat: add controlled model usage accounting`.
- The Controlled Model Budget Enforcement milestone is completed in this repository
  state and was committed in `238fcbe feat: add controlled model budget enforcement`.
- The Cost Guardian Foundation milestone is completed in this repository state and
  was committed in `49ab18c feat: add cost guardian foundation`.
- The Security Guardian Foundation milestone is completed in this repository state
  and was committed in `530bf2c feat: add security guardian foundation`.
- The Backup Guardian Foundation milestone is completed in this repository state and
  was committed in `4c53e5c feat: add backup guardian foundation`.
- The Incident Guardian Foundation milestone is completed in this repository state
  and was committed in `293bde1 feat: add incident guardian foundation`.
- The Quality Guardian Foundation milestone is completed in this repository state
  and was committed in `afee733 feat: add quality guardian foundation`.
- The Operator Safety Report milestone is completed in this repository state and is
  the current commit candidate.
- The next milestone is Main Assistant / Orchestrator Specification Foundation.

## Current architecture

MV AI OS currently follows inward-pointing, contract-first boundaries:

```text
Bounded CLI JSON input
  -> RequestEnvelope
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

Local configuration and recovery are outside Core Brain:

```text
Validated local application configuration
  -> LocalRuntimeConfig and LocalCliConfig
  -> LocalRuntime or CLI adapter

Validated secret reference
  -> explicit LocalSecretResolver
  -> ephemeral SecretValue for future provider adapters only

Validated SQLite backup/restore request
  -> local SQLite recovery operation
  -> exact schema and application identity verification
  -> atomic backup or restore file installation
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
19. Controlled Local CLI Entrypoint.
20. Controlled Local SQLite Backup and Restore.
21. Controlled Local Configuration and Secret References.
22. Controlled Local Secret Resolution.
23. Controlled Production Model Provider Adapter.
24. Controlled Local OpenAI Provider Wiring.
25. Controlled Model Operation Limits.
26. Controlled Model Usage Accounting.
27. Controlled Model Budget Enforcement.
28. Cost Guardian Foundation.
29. Security Guardian Foundation.
30. Backup Guardian Foundation.
31. Incident Guardian Foundation.
32. Quality Guardian Foundation.
33. Operator Safety Report.

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
- Strict current-schema verification for local recovery operations.
- Forward migration from lifecycle schema version 1 to memory schema version 2.
- Forward migration from memory schema version 2 to knowledge schema version 3.
- Validated JSON serialization and deserialization for every persisted lifecycle
  memory, and knowledge record.
- Optimistic task transition conflicts, request replay, and append-only audit ordering
  preserved across process restarts.
- Controlled local SQLite backup and restore operations that validate configuration,
  source identity, schema version, destination safety, overwrite intent, and restored
  database usability without changing repository contracts.

### Models

- Provider-neutral model request, response, profile, usage, provider, registry,
  selection policy, and error contracts.
- Provider-neutral model operation-limit contract for maximum input characters,
  output tokens, provider calls, timeout, total tokens, and reported cost.
- Provider-neutral model pricing and usage-accounting contracts for explicit USD
  per-million-token pricing and deterministic estimated-cost calculation.
- Provider-neutral model budget contracts for explicit per-provider/model/profile
  requested-cost and estimated-cost gates.
- Validated LLM Gateway with provider/profile selection, limit checks, failure
  normalization, response ownership validation, bounded provider invocation attempts,
  timeout handling, operation-limit enforcement, optional usage accounting, budget
  enforcement, and injected dependencies.
- Deterministic model provider and provider registry only in tests.
- Production OpenAI Responses API model provider adapter behind `ModelProvider`,
  with validated configuration, resolved ephemeral credential input, provider-neutral
  request/response translation, injectable transport, and deterministic offline
  tests.
- Model-backed content execution is integrated through the gateway using deterministic
  providers and the OpenAI provider through local runtime composition.
- The local runtime can exercise the model-backed path through a deterministic,
  provider-neutral local model adapter with no network access.

### Guardians

- Deterministic Cost Guardian foundation that consumes only supplied sanitized model
  usage, operation-limit, provider-failure, and budget-enforcement signals.
- Cost Guardian report, finding, severity, evidence, usage-record, threshold, and
  evaluator contracts.
- Runtime-validated Cost Guardian input and report boundaries that reject prompts,
  completions, provider payloads, raw diagnostics, API keys, secret references,
  resolved secret values, and other unsupported raw fields.
- Report-only warning generation for missing budgets, missing usage accounting,
  budget-nearing-limit, budget-exceeded, unusual provider-call count,
  operation-limit blocks, repeated limit failures, and provider failure spikes.
- Deterministic Security Guardian foundation that consumes only supplied sanitized
  safety-posture state for live-provider mode, credential-boundary controls, model
  operation limits, usage accounting, budget enforcement, backup/restore readiness,
  Cost Guardian availability, tool-execution approval/audit posture, and cloud/VPS
  readiness posture.
- Security Guardian report, finding, severity, evidence, safety-state, and evaluator
  contracts.
- Runtime-validated Security Guardian input and report boundaries that reject prompts,
  completions, provider payloads, raw diagnostics, API keys, secret references,
  resolved secret values, raw transcripts, and other unsupported raw fields.
- Report-only warning generation for missing secret-reference controls, invalid
  secret-reference signals, unsafe secret-material signals, live-provider mode,
  missing operation limits, missing usage accounting, missing budget enforcement,
  missing backup/restore controls, missing Cost Guardian representation, unsafe tool
  execution posture, and unsafe cloud/VPS readiness posture.
- Deterministic Backup Guardian foundation that consumes only supplied sanitized
  backup-readiness state for source database availability, backup presence, backup
  freshness, backup path validity, backup metadata validity, restore verification,
  schema compatibility, and cloud/VPS backup readiness posture.
- Backup Guardian report, finding, severity, evidence, readiness-state, and evaluator
  contracts.
- Runtime-validated Backup Guardian input and report boundaries that reject sensitive
  paths, raw database records, prompts, completions, provider payloads, secret
  references, resolved secret values, raw transcripts, and other unsupported raw
  fields.
- Report-only warning generation for missing source databases, missing backups, stale
  backups, invalid backup-path signals, invalid backup-metadata signals, missing or
  failed restore verification, schema-version mismatch, and unsafe cloud/VPS backup
  readiness posture.
- Deterministic Incident Guardian foundation that consumes only supplied sanitized
  operational incident counters and cost/security/backup guardian finding summaries.
- Incident Guardian report, finding, severity, evidence, operational-signal,
  source-summary, threshold, and evaluator contracts.
- Runtime-validated Incident Guardian input and report boundaries that reject prompts,
  completions, provider payloads, raw diagnostics, API keys, secret references,
  resolved secret values, sensitive paths, raw database records, raw transcripts, raw
  knowledge, raw memory, and other unsupported raw fields.
- Report-only incident generation for repeated model failures, repeated budget
  blocks, repeated operation-limit blocks, repeated invalid configuration attempts,
  backup/restore verification failures, provider-unavailable patterns, and
  high-severity cost, security, or backup guardian summaries.
- Deterministic Quality Guardian foundation that consumes only supplied sanitized
  output/process-quality signals for final-response presence, result shape, task
  completion, evidence/source references, human-review state, readiness score,
  rejected outputs, validation failures, model-output rejection, and unsafe content
  pipeline state.
- Quality Guardian report, finding, severity, evidence, quality-state, and evaluator
  contracts.
- Runtime-validated Quality Guardian input and report boundaries that reject prompts,
  completions, provider payloads, raw diagnostics, API keys, secret references,
  resolved secret values, sensitive paths, raw database records, raw transcripts, raw
  knowledge, raw memory, generated content, and other unsupported raw fields.
- Report-only quality warning generation for missing final responses, malformed
  results, incomplete task results, missing evidence/source references, missing human
  review, low readiness scores, repeated rejected outputs, validation-failure
  thresholds, model-output rejection, and unsafe content pipeline state.
- Deterministic Operator Safety Report foundation that consumes only supplied
  redaction-safe Cost, Security, Backup, Incident, and Quality Guardian reports.
- Operator Safety Report, domain summary, finding summary, recommended-action,
  coverage, status, severity, safety-to-autonomy decision, and evaluator contracts.
- Runtime-validated Operator Safety input and report boundaries that reject raw
  prompts, completions, provider payloads, diagnostics, API keys, secret references,
  resolved secret values, sensitive paths, raw database records, raw transcripts, raw
  knowledge, raw memory, generated content, and other unsupported raw fields.
- Report-only aggregation for overall system status, highest severity, guardian
  coverage, missing guardian reports, per-domain summaries, deterministic
  recommended actions, primary attention domain, and safety-to-autonomy decision.
- No autonomous execution, scheduling, alerts, model calls, network calls, background
  work, tool execution, durable guardian ledger, pricing invention, or
  provider-specific Guardian logic exists.

### Runtime composition

- Versioned local runtime configuration for SQLite, Content Agent mode, actor,
  workspace, explicit actor/task/policy grants, model operation limits, optional model
  usage accounting, optional model budget enforcement, and OpenAI provider selection
  without resolved secret values.
- Versioned local application configuration boundary that validates explicit local
  JSON input, assembles existing runtime and CLI configuration, and carries only
  inert secret references.
- Secret-reference contracts for environment and local-file locations.
- Explicit local secret-resolution boundary that resolves already-validated
  environment and local-file references into ephemeral secret values for provider
  adapters without exposing values to Core Brain, agents, runtime configuration,
  persistence, or public errors.
- Controlled local OpenAI provider wiring through the local composition root using an
  explicit provider mode, referenced secret, resolver, and injectable transport.
- Runtime validation occurs before any SQLite connection is opened.
- Production immutable Agent Specification registry.
- Explicit construction of lifecycle, Memory, Knowledge, policy, registry, routing,
  context, Agent Runtime, and model boundaries.
- Runtime shutdown waits for in-flight requests and closes every owned SQLite adapter
  deterministically.

### Local CLI

- Official `mv-ai-os` executable and npm CLI script targeting the built entrypoint.
- Versioned local CLI configuration with bounded request size and nested Local Runtime
  configuration.
- Explicit configuration-file loading and bounded JSON request intake from standard
  input.
- One structured JSON response on standard output with sanitized structured failures
  and stable exit codes.
- SIGINT/SIGTERM handling and exactly-once runtime cleanup, including signals received
  during runtime creation.

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
- SQLite backup and restore configuration/result contracts.
- local application configuration and secret-reference contracts.
- secret resolver, secret value, and secret resolution result contracts.
- local runtime configuration, runtime handle, model-provider selection, and
  test-override contracts.
- local CLI configuration, structured error response, exit-code, and process-host
  contracts.
- policy decision, effective permission, grant resolver, and evaluator interfaces.
- memory record/query/scope/service contracts.
- knowledge record/source/query/scope/search-result/repository/service contracts.
- model request/response/profile/usage/error/provider/gateway contracts.
- OpenAI provider configuration, transport, and adapter contracts.
- Model operation-limit contracts.
- Model pricing and usage-accounting contracts.
- Model budget enforcement contracts.
- Cost Guardian evaluation, usage-record, threshold, report, finding, severity, and
  evidence contracts.
- Security Guardian evaluation, safety-state, report, finding, severity, and evidence
  contracts.
- Backup Guardian evaluation, readiness-state, report, finding, severity, and
  evidence contracts.
- Incident Guardian evaluation, operational-signal, source-summary, threshold, report,
  finding, severity, and evidence contracts.
- Quality Guardian evaluation, quality-state, report, finding, severity, and evidence
  contracts.
- Operator Safety Report evaluation, guardian-report input, coverage, domain summary,
  finding summary, recommended-action, status, severity, autonomy-decision, and report
  contracts.
- agent capability, schema, limit, policy requirement, specification, and registry
  contracts.
- workflow input/output/step/transition/condition/failure/specification and registry
  contracts.
- tool definition/invocation/result/permission/risk/registry/gateway contracts.

## Implemented validators

- Request envelope, task response, audit event, agent manifest, agent invocation, and
  agent result validators.
- Stored request, task record, and SQLite connection configuration validators.
- SQLite backup and restore configuration validators.
- Local application configuration and secret-reference validators.
- Secret value and secret resolution result validators.
- Local runtime configuration validation.
- Local CLI configuration validation and bounded local RequestEnvelope parsing.
- Policy decision and effective-permission validation.
- Memory record, scope, and query validators.
- Knowledge source, scope, record, query, and result validators.
- Model request, response, and profile validators.
- Model operation-limit validator.
- Model usage-accounting configuration validator.
- Model budget configuration validator.
- Cost Guardian evaluation-input and report validators.
- Security Guardian evaluation-input and report validators.
- Backup Guardian evaluation-input and report validators.
- Incident Guardian evaluation-input and report validators.
- Quality Guardian evaluation-input and report validators.
- Operator Safety evaluation-input and report validators.
- OpenAI provider configuration validator.
- Agent capability, input/output schema, limit, policy requirement, and full
  specification validators.
- Workflow input/output, step, transition, condition, failure policy, and complete
  graph validators.
- Tool definition, permission, risk, invocation, and result validators.

## Implemented tests

The latest verified suite contains 53 test files and 344 tests covering:

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
- local CLI configuration and request validation, deterministic process execution,
  missing and oversized input, runtime creation failure normalization,
  actor/workspace denial, durable replay, structured output, and graceful termination.
- local application configuration loading, CLI/runtime config assembly,
  secret-reference validation, redacted validation errors, and runtime creation from
  loaded configuration.
- explicit local secret resolution from supplied environment values and local files,
  fail-closed missing-secret behavior, invalid-reference rejection, output contract
  validation, and redaction-safe public errors.
- SQLite backup and restore validation, successful backup, successful restore,
  schema mismatch rejection, invalid source and restore-file rejection, overwrite
  refusal, no partial restore, and preservation of lifecycle, request, audit, memory,
  and knowledge records across runtime recreation.
- model validation, deterministic provider behavior, provider neutrality, and
  normalized failures.
- OpenAI provider configuration validation, credential handling, Responses API request
  translation, text and JSON response translation, HTTP failure redaction, transport
  failure normalization through `ValidatedLlmGateway`, and retained gateway usage
  limit enforcement.
- local OpenAI provider runtime wiring, deterministic-mode preservation, explicit
  secret-reference and resolver requirements, fail-closed unused secret references,
  fake-transport end-to-end execution through `ValidatedLlmGateway`, and redaction of
  secret values and provider diagnostics from public task failures.
- model operation-limit validation, oversized input and output-token blocking before
  provider transport access, bounded retry behavior, timeout normalization,
  non-retryable failure handling, response usage enforcement, and OpenAI fake-transport
  denial when operation limits fail.
- model usage-accounting configuration validation, deterministic estimated-cost
  calculation from validated usage and explicit pricing, missing-usage behavior,
  fail-closed required-pricing behavior, runtime configuration validation, and
  redaction-safe accounting failures.
- model budget configuration validation, pre-provider request-cost denial,
  post-accounting estimated-cost denial, fail-closed missing required budget data,
  missing-cost behavior without invented spend, runtime configuration validation, and
  redaction-safe budget failures.
- Cost Guardian validation, deterministic report generation, normal usage,
  warning-state analysis, critical over-budget reporting, missing-budget reporting,
  duplicate signal rejection, invalid report rejection, and redaction-safe report
  boundaries.
- Security Guardian validation, deterministic report generation, healthy safety
  posture, live-provider warnings, missing control analysis, unsafe tool-execution
  posture, invalid report rejection, affected-control validation, and redaction-safe
  report boundaries.
- Backup Guardian validation, deterministic report generation, healthy backup
  posture, missing source database and backup analysis, stale backup reporting,
  restore verification analysis, schema mismatch reporting, unsafe cloud backup
  readiness, invalid report rejection, affected-control validation, and
  redaction-safe report boundaries.
- Incident Guardian validation, deterministic report generation, normal incident
  state, repeated operational failures, high-severity guardian summary escalation,
  custom threshold handling, duplicate guardian summary rejection, invalid report
  rejection, evidence validation, and redaction-safe report boundaries.
- Quality Guardian validation, deterministic report generation, healthy quality
  state, missing and malformed output analysis, missing evidence/source/reference
  reporting, human-review requirement reporting, readiness and validation-failure
  analysis, unsafe content pipeline reporting, invalid report rejection, evidence
  validation, and redaction-safe report boundaries.
- Operator Safety Report validation, deterministic aggregation, healthy guardian
  coverage, mixed warning aggregation, critical severity dominance, missing guardian
  handling, per-guardian summary inclusion, deterministic action ordering, highest
  severity calculation, safety-to-autonomy decision calculation, invalid nested
  guardian report rejection, and redaction-safe aggregate report boundaries.
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
knowledge adapters, an executable local composition root, a controlled command-line
process boundary, a controlled local backup/restore recovery path, explicit local
configuration loading with controlled local secret resolution, production OpenAI
provider wiring, and provider-neutral model operation limits. It is not
production-ready, but the implemented modules now compose into one validated local
runtime with recoverable SQLite state, controlled configuration input, and an
ephemeral credential boundary plus a production OpenAI provider adapter wired through
controlled local runtime composition, bounded model-provider invocation behavior,
provider-neutral estimated model cost calculation when explicit pricing is configured,
provider-neutral model budget enforcement, deterministic local Cost Guardian
reporting from sanitized cost signals, deterministic local Security Guardian
reporting from sanitized safety-posture state, deterministic local Backup Guardian
reporting from sanitized backup-readiness state, deterministic local Incident
Guardian reporting from sanitized operational incident signals, and deterministic
local Quality Guardian reporting from sanitized output/process-quality signals. The
report-only Control Plane Safety chapter now has a deterministic local Operator
Safety Report foundation that aggregates supplied guardian reports into one
operator-facing safety summary without adding autonomy, scheduling, alerts, network,
model calls, tool execution, dashboards, or persistence.

## What exists only as a foundation

- Agent Specifications are required by the model-backed Content Agent and knowledge
  context path, but are not yet universally enforced by every Agent Runtime executor.
- Workflow Specifications are validated and registrable but are not executed.
- The Tool Gateway authorizes access and validates results but cannot execute tools.
- The LLM Gateway is used by the model-backed Content Agent with deterministic local
  provider and OpenAI provider composition paths, but provider telemetry and live
  integration gating remain basic.
- Model operation limits bound request size, output size, provider-call count,
  timeout, and reported usage/cost where available.
- Model usage accounting can deterministically estimate per-response cost from
  explicit pricing and validated usage, but it is not yet a durable usage ledger and
  does not persist spend.
- Model budget enforcement can deny requests before provider access or responses after
  accounting when explicit per-profile budget rules are exceeded, but it does not yet
  aggregate spend across durable time windows.
- Cost Guardian can evaluate supplied sanitized cost signals and produce validated
  operator-facing reports, but it is not an autonomous agent, scheduler, alerting
  system, dashboard, durable usage ledger, billing integration, or provider telemetry
  collector.
- Security Guardian can evaluate supplied sanitized safety-posture state and produce
  validated operator-facing reports, but it is not an autonomous agent, scanner,
  scheduler, alerting system, dashboard, filesystem crawler, external monitor, or
  provider-specific security tool.
- Backup Guardian can evaluate supplied sanitized backup-readiness state and produce
  validated operator-facing reports, but it does not create backups, restore backups,
  schedule backups, upload backups, delete backups, scan the filesystem, mutate files,
  run autonomously, or act as a durable backup ledger.
- Incident Guardian can evaluate supplied sanitized operational signal counters and
  guardian summaries, but it does not send alerts, call external systems, schedule
  checks, run in the background, mutate state, execute tools, call models, or act as
  a durable incident ledger.
- Quality Guardian can evaluate supplied sanitized output/process-quality signals and
  produce validated operator-facing reports, but it does not judge content with AI,
  call models, publish content, mutate outputs, send alerts, schedule checks, run in
  the background, execute tools, or act as a durable quality ledger.
- Operator Safety Report can aggregate supplied Cost, Security, Backup, Incident, and
  Quality Guardian reports into one validated operator-facing summary, but it does
  not collect signals, scan files, read secrets, call models, send alerts, schedule
  checks, mutate state, execute tools, render dashboards, persist ledgers, or act
  autonomously.
- Durable persistence currently covers task, request, audit, memory, and knowledge
  state; approvals and workflows remain non-durable.
- Secret references can be resolved locally into ephemeral values and consumed by the
  OpenAI provider adapter through controlled runtime wiring.
- Approval markers exist at boundaries, but there is no durable approval workflow.

## What is actually executable

- A local operator can execute one bounded `RequestEnvelope` through the official CLI
  using an explicit validated JSON configuration file and standard input.
- A caller can parse explicit local application configuration JSON into validated
  runtime and CLI configuration while carrying only secret references, never raw
  secret values.
- A caller can explicitly resolve a validated environment-variable or local-file
  secret reference into an ephemeral `SecretValue`; missing references and invalid
  values fail closed without exposing secret values or locations in public errors.
- A caller can construct the OpenAI provider adapter with an ephemeral resolved API
  key and injected transport; provider-neutral model requests are translated to
  OpenAI Responses API requests, and text or structured JSON responses are translated
  back to validated `ModelResponse` records.
- A caller can configure `createLocalRuntime` for `model-backed-openai` mode with an
  explicit OpenAI provider config, supplied secret reference, secret resolver, and
  optional fake or production transport; deterministic local mode remains the default
  offline path.
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
- A caller can create a validated local SQLite backup of the runtime source of truth
  and restore it into an explicit inactive destination; restored databases are proven
  usable through adapter reads and Local Runtime request replay.
- The Knowledge Service can independently search an injected repository or participate
  in governed context assembly.
- The Validated LLM Gateway can independently call an injected model provider.
- The Validated LLM Gateway rejects invalid operation limits, oversized requests,
  excessive output-token or timeout requests, and usage-budget violations with
  redaction-safe provider-neutral failures before exposing provider details.
- The Validated LLM Gateway can optionally apply explicit model usage-accounting
  pricing, normalize `usage.costUsd` from validated usage, reject invalid accounting
  configuration before provider access, and fail closed when pricing is required but
  missing for the selected provider/model/profile.
- The Validated LLM Gateway can optionally enforce explicit model budgets, reject
  invalid budget configuration before provider access, deny over-budget requested cost
  before provider access, and deny over-budget estimated usage cost after accounting.
- A caller can instantiate the deterministic Cost Guardian, supply sanitized model
  cost and failure signals, and receive a validated redaction-safe report with
  warnings and recommendations.
- A caller can instantiate the deterministic Security Guardian, supply sanitized
  safety-posture state, and receive a validated redaction-safe report with warnings
  and recommendations.
- A caller can instantiate the deterministic Backup Guardian, supply sanitized
  backup-readiness state, and receive a validated redaction-safe report with warnings
  and recommendations.
- A caller can instantiate the deterministic Incident Guardian, supply sanitized
  incident counters and guardian summaries, and receive a validated redaction-safe
  report with warnings and recommendations.
- A caller can instantiate the deterministic Quality Guardian, supply sanitized
  quality signals, and receive a validated redaction-safe report with warnings and
  recommendations.
- A caller can instantiate the deterministic Operator Safety reporter, supply
  redaction-safe guardian reports, and receive a validated aggregate report with
  overall status, coverage, per-domain summaries, deterministic recommended actions,
  and a safety-to-autonomy decision.
- The Tool Gateway can authorize a tool invocation and validate a supplied result
  without executing a tool.

There is no HTTP service, dashboard, background server, or default live-provider test
path.

## Not implemented yet

- Universal runtime enforcement of Agent Specifications for all executors.
- Workflow execution, scheduling, retries, or n8n.
- Real tool implementations or direct tool execution.
- Durable approval and workflow persistence.
- Live-provider integration test gating, provider telemetry, durable model usage
  ledgers, aggregated budget windows, autonomous guardians, scheduled alerts,
  dashboards, and external notification channels.
- Main Assistant / Orchestrator Specification Foundation.
- Durable approvals and human-in-the-loop operations.
- Production secret management.
- HTTP, webhook, schedule, dashboard, or other transport adapters.
- Cancellation propagation, production retry budgets, operational health checks,
  metrics exporters, deployment packaging, and multi-user authentication.
