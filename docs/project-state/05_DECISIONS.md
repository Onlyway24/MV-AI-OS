# MV AI OS Architecture Decision Record

This is a cumulative record. Existing decisions are not silently rewritten. If a
decision changes, add a superseding entry and identify the replaced decision.

## ADR-001 — Default-deny policy

**Context:** Agents can request memory, knowledge, models, tools, and workflows, but a
declaration alone cannot safely authorize access.

**Decision:** Effective permission is the deterministic intersection of agent
declarations and available actor, task, policy, and approval grants. Missing grants
deny access.

**Reason:** Least privilege must remain true in local mode and survive future
multi-user expansion.

**Tradeoffs:** More explicit grant composition and denial tests are required. Features
may be unavailable until every grant source is configured.

**Future impact:** All new capabilities must define permissions and prove denial before
adapter access.

## ADR-002 — Provider-neutral LLM Gateway

**Context:** Agents need model output, but direct provider SDK use would couple agent
logic, retry behavior, credentials, and errors to one vendor.

**Decision:** Agents use `LlmGateway`, named model profiles, and provider-neutral
request/response contracts. Provider translation remains behind `ModelProvider`.

**Reason:** Models and providers must be replaceable without changing Core Brain or
agent contracts.

**Tradeoffs:** Gateway translation and normalized usage/error contracts add a boundary
that must be maintained.

**Future impact:** Real providers are adapters; API keys and provider types never enter
agents or Core Brain.

## ADR-003 — Non-executing Tool Gateway foundation

**Context:** Tool contracts and policy enforcement were needed before any direct tool
could safely exist, but adding execution would introduce side effects prematurely.

**Decision:** The current Tool Gateway authorizes an invocation and validates supplied
results but has no execution method or tool provider.

**Reason:** Authorization, approval, idempotency, timeout, and result ownership can be
proven without risking external actions.

**Tradeoffs:** The gateway is not yet useful for performing work and requires a later
audited executor boundary.

**Future impact:** Tool execution can be added only after durable approvals and audit
are available; existing authorization cannot be bypassed.

## ADR-004 — Storage-neutral repositories

**Context:** Task lifecycle and audit require persistence, but selecting a database too
early would leak storage assumptions into orchestration.

**Decision:** Task, request, audit, knowledge, and future durable state use repository
interfaces and JSON-compatible records. Atomic task lifecycle uses a transaction-runner
interface.

**Reason:** Domain behavior and conformance can be tested independently from SQLite,
Postgres, or future storage.

**Tradeoffs:** Test repositories are required, and database-specific optimization is
deferred.

**Future impact:** Every durable adapter must pass the same conformance behavior and
must not change domain contracts.

## ADR-005 — Workflow specifications precede workflow execution

**Context:** Multi-agent workflows require graph identity, steps, transitions,
conditions, outputs, failure behavior, and cycle rules before a runtime can execute
them safely.

**Decision:** Implement and validate immutable Workflow Specifications before adding a
workflow engine.

**Reason:** Invalid graphs and undeclared agent versions must fail before runtime state
or side effects exist.

**Tradeoffs:** Workflow definitions currently provide no execution capability.

**Future impact:** A workflow runtime must consume exact validated specifications and
must not invent transitions or agents dynamically.

## ADR-006 — Agent specifications precede multi-agent runtime

**Context:** Future agents need formal missions, schemas, capabilities, limits, policy
requirements, and exact versions.

**Decision:** Implement immutable Agent Specifications and validation before adding
production multi-agent handoffs.

**Reason:** Agent runtime expansion without formal boundaries would create ambiguous
permissions and incompatible contracts.

**Tradeoffs:** Agent Manifest and Agent Specification concepts coexist until runtime
composition is completed.

**Future impact:** New production agents require complete validated specifications;
handoffs resolve exact IDs and versions through Core Brain.

## ADR-007 — Project-state documents are permanent memory

**Context:** Development spans multiple AI systems and sessions whose conversation
context is not durable or consistently available.

**Decision:** `docs/project-state/` is the repository-owned source for current state,
master roadmap, permanent principles, exactly one next task, and architecture
decisions. Every completed milestone updates it before final reporting.

**Reason:** Repository state is reviewable, versionable, and portable across Codex,
ChatGPT, Perplexity, Claude, Gemini, and future implementation agents.

**Tradeoffs:** Documentation updates are a required completion cost and stale documents
become an explicit defect.

**Future impact:** New sessions read project-state documents before implementation;
chat history is never treated as the sole project memory.

## ADR-008 — Deterministic adapters for automated tests

**Context:** Network providers, clocks, identifiers, and storage introduce
non-determinism and external failure into unit and integration tests.

**Decision:** Automated tests use injected fixed clocks, sequence identifiers,
in-memory repositories/registries, and deterministic model or agent adapters.

**Reason:** Boundary behavior must be reproducible and testable offline.

**Tradeoffs:** Separate provider integration tests will still be required when real
adapters are added.

**Future impact:** Core acceptance tests remain offline; live integration suites are
explicit and never replace deterministic coverage.

## ADR-009 — Model-backed agents consume exact specifications

**Context:** The LLM Gateway and Agent Specification System existed independently, so
an executor could otherwise call a model without proving that its exact version,
profile, output schema, and limits were declared.

**Decision:** The model-backed Content Agent resolves its exact Agent Specification
before model access and uses that specification's structured output schema and limits
to construct the provider-neutral model request.

**Reason:** Runtime model behavior must remain attributable to a validated,
version-specific agent contract.

**Tradeoffs:** Model-backed execution requires an Agent Specification Registry in
addition to the manifest registry currently used for routing.

**Future impact:** The coexistence of manifests and specifications must eventually be
unified at runtime without weakening exact-version checks.

## ADR-010 — Knowledge enrichment is a context decorator

**Context:** Core Brain already accepted an injected `ExecutionContextBuilder`, and
memory enrichment used a decorator. Direct Knowledge Service calls in Core Brain or
agents would duplicate policy and context behavior.

**Decision:** Knowledge retrieval is composed as another
`ExecutionContextBuilder` decorator. It requires effective `knowledge:search`
permission, exact Agent Specification scopes, and the existing Knowledge Service.

**Reason:** This integrates real knowledge capability without coupling Core Brain to a
repository or changing its execution behavior.

**Tradeoffs:** Composition order determines deterministic supplemental-context order
and must be explicit at application construction.

**Future impact:** Additional context sources follow the same bounded decorator pattern
only when a concrete source is implemented.

## ADR-011 — Built-in SQLite is the first durable lifecycle adapter

**Context:** The repository-backed task lifecycle proved idempotency, conflict
detection, atomic transitions, and audit behavior using only an in-memory test
implementation. A usable local runtime requires those guarantees to survive process
restart without coupling Core Brain to a database.

**Decision:** Use the pinned Node runtime's built-in `node:sqlite` module behind the
existing `RepositoryTransactionRunner`, `TaskRepository`, `RequestRepository`, and
`AuditRepository` interfaces. Store complete validated domain records as JSON with
indexed identity/state columns, explicit application identity, and schema version 1.
Use serialized `BEGIN IMMEDIATE` transactions for atomic lifecycle writes.

**Reason:** This adds local durability with no external dependency and preserves the
existing storage-neutral contracts and conformance suite. Complete JSON records retain
domain fidelity while indexed columns support lifecycle identity, ordering, and
optimistic conflict checks.

**Tradeoffs:** The adapter currently targets the pinned Node 22 runtime, where
`node:sqlite` emits an experimental warning. SQLite access is serialized within one
runner, and schema migration currently contains only the initial version. JSON plus
indexed columns intentionally duplicates selected data, so every read verifies that
both representations agree.

**Future impact:** Later SQLite repositories must share the same database identity,
migration discipline, validation-on-read/write, and transaction semantics. Other
storage engines remain valid only behind the existing interfaces and must pass the
same conformance behavior.

## ADR-012 — Memory policy remains in the service boundary

**Context:** Durable memory must preserve the existing Memory Engine's default-deny
permissions, workspace and actor visibility, task and session scope, permission tags,
expiry, soft deletion, and deterministic ordering without making SQLite an
authorization authority.

**Decision:** `RepositoryBackedMemoryService` validates public memory requests and
enforces category permissions and write scope before repository access. A
storage-neutral `MemoryRepository` receives an already bounded search and independently
enforces scope filters, validates every record, and returns deterministic results.
SQLite stores complete validated JSON records with cross-checked indexed columns under
schema version 2.

**Reason:** Policy behavior remains consistent across in-memory, SQLite, and future
storage adapters while the repository still fails closed if called directly or if
stored data is corrupt.

**Tradeoffs:** Permission and scope invariants are deliberately checked at both service
and repository return boundaries. SQLite filtering currently combines indexed
workspace/category narrowing with deterministic in-process checks rather than adding
full-text or JSON extensions.

**Future impact:** Future memory storage engines must pass the same repository
conformance suite. New retrieval capabilities require explicit memory-contract changes
and cannot be inferred from database-specific search features.

## ADR-013 — Knowledge policy remains in the service boundary

**Context:** Durable knowledge must preserve default-deny `knowledge:search`,
workspace and actor visibility, declared agent scopes, permission tags, source and tag
filters, freshness, expiry, deletion, text matching, and deterministic ordering without
making SQLite a policy authority.

**Decision:** Keep effective-permission enforcement and returned-record invariants in
`RepositoryBackedKnowledgeService`. `SqliteKnowledgeRepository` implements only the
existing storage-neutral repository contract, validates every stored and retrieved
record, cross-checks indexed columns against JSON, and applies the existing
deterministic matcher under schema version 3.

**Reason:** The same authorization behavior remains valid for in-memory, SQLite, and
future storage adapters while corrupt or out-of-scope data fails closed at both
repository and service boundaries.

**Tradeoffs:** SQLite narrows candidates by indexed workspace data and applies complex
scope, tag, source, freshness, and text predicates deterministically in-process. This
avoids database-specific JSON, full-text, embedding, or vector behavior at the cost of
future query optimization work.

**Future impact:** Other Knowledge Repository adapters must pass the same conformance
suite. Search enhancements require explicit contract and policy review and cannot
bypass the Knowledge Service.

## ADR-014 — The local composition root owns infrastructure lifetime

**Context:** Durable adapters and orchestration modules existed independently, forcing
callers to manually construct policy, registries, context decorators, agent runtime,
and three SQLite-backed boundaries. Ad hoc construction could omit validation,
authorization, or deterministic shutdown.

**Decision:** `createLocalRuntime` is the single production composition boundary for
the local process. It validates a versioned configuration before opening storage,
binds grants to the configured actor and workspace, constructs existing modules
through explicit dependency injection, and returns a narrow execute/close handle. It
supports the deterministic Content Agent and the model-backed Content Agent through a
deterministic local provider only.

**Reason:** One reviewed composition path makes the implemented architecture usable
without moving infrastructure concerns into Core Brain or agents. Explicit ownership
also guarantees that in-flight requests finish before every SQLite connection closes.

**Tradeoffs:** The runtime currently owns three SQLite connections to the same
database and uses fixed built-in local model profile behavior. It does not load files
or environment variables, expose a transport, execute workflows, or provide a real
model provider.

**Future impact:** Process entrypoints must create the runtime through this factory,
must not reconstruct dependencies independently, and must close the returned handle.
Future providers or transports remain adapters supplied outside Core Brain.

## ADR-015 — The local CLI is a single-request transport adapter

**Context:** The validated Local Runtime was executable only through a TypeScript
caller. A local operator needed a process boundary that could not duplicate
composition, orchestration, policy, or persistence behavior.

**Decision:** The official local CLI accepts one explicit versioned configuration
file and one bounded `RequestEnvelope` on standard input, calls
`createLocalRuntime`, emits exactly one structured JSON response, and closes the
runtime exactly once. It uses stable exit codes and handles SIGINT/SIGTERM during
startup or execution without exposing internal diagnostics.

**Reason:** A single-request adapter is the smallest operational interface that keeps
the CLI outside the application core and preserves every existing validation,
authorization, registry, and repository boundary.

**Tradeoffs:** The CLI is intentionally non-interactive and starts a runtime for each
request. Operators must provide complete JSON contracts, and no long-running service
or environment-based configuration is available.

**Future impact:** Other transports must remain equally thin and call application
entrypoints rather than reconstructing internal modules. CLI expansion must not turn
the process adapter into an orchestration or filesystem-tool layer.

## ADR-016 — SQLite backup and restore are local operations, not orchestration

**Context:** The local runtime now stores task lifecycle, request replay, audit,
memory, and knowledge records in one SQLite source of truth. Durable storage without a
verified recovery path leaves local operators exposed to file loss or corruption.

**Decision:** Add controlled SQLite backup and restore as narrow local operations
outside Core Brain. Backup and restore use versioned contracts, strict path
validation, current schema/application identity verification, explicit overwrite
intent, and atomic temporary-file installation. Restored databases must be accepted by
the existing SQLite adapters and proven through Local Runtime replay.

**Reason:** Recovery is operational infrastructure, not agent behavior. Keeping it
outside Core Brain preserves repository boundaries while making local durability
meaningful.

**Tradeoffs:** The operation is intentionally local-only and does not provide cloud
sync, encryption, scheduling, retention automation, online restore into a running
runtime, or arbitrary filesystem tooling.

**Future impact:** Future storage adapters need their own recovery contracts and
conformance tests. Any cloud backup, encryption, or scheduled retention feature must
be added as a separate governed operation without changing Core Brain semantics.

## ADR-017 — Local application configuration uses inert secret references

**Context:** The local runtime and CLI were configurable only through their direct
contracts. Future provider adapters will require credentials, but raw secret values
must not enter project files, Core Brain, agents, logs, public errors, or durable
records.

**Decision:** Add a versioned Local Application Configuration boundary that validates
explicit local JSON input, assembles the existing `LocalRuntimeConfig` and
`LocalCliConfig`, and carries only inert `SecretReference` values. Secret references
identify environment-variable or local-file locations but are not resolved by this
boundary. Configuration validation and loader errors redact secret-reference
identifier paths.

**Reason:** Configuration determines what exists, while runtime, policy, and agents
determine what happens. Keeping secret references inert allows future provider
integration to be prepared without introducing credentials, network calls, or hidden
side effects.

**Tradeoffs:** The system can validate and carry secret references, but it still
cannot obtain secret values or call a production model provider. Operators must use
explicit JSON input; no environment-wide implicit discovery exists.

**Future impact:** A later secret-resolution boundary may resolve these references
into ephemeral values for provider adapters. Resolved values must remain outside
domain contracts and durable state.

## ADR-018 — Local secret resolution is explicit and ephemeral

**Context:** Local application configuration can carry inert secret references for
future provider adapters, but a real provider eventually needs credential values.
Resolving those values inside Core Brain, agents, runtime configuration, persistence,
or public error handling would leak infrastructure credentials into domain contracts.

**Decision:** Add a separate `SecretResolver` boundary with local environment-variable
and local-file resolution for already-validated `SecretReference` records. Resolved
values are represented as ephemeral `SecretValue` records and are intended only for
adapter construction. Resolution is explicit: environment values must be supplied to
the resolver, and local files are read only from explicit validated reference paths.
Public resolution errors redact secret values and secret locations.

**Reason:** Credentials are infrastructure concerns. Keeping resolution outside
configuration, Core Brain, agents, memory, knowledge, repositories, audit, and CLI
execution preserves provider neutrality and prevents secrets from becoming durable
state or public diagnostics.

**Tradeoffs:** The resolver can obtain local secret values, but nothing consumes them
until a provider adapter is added. There is no cloud secret manager, rotation,
encryption, implicit environment discovery, or production provider integration in
this milestone.

**Future impact:** Provider adapters may accept resolved `SecretValue` input at their
own infrastructure boundary. They must not persist, log, echo, or expose the value,
and they must preserve existing gateway normalization and redaction behavior.

## ADR-019 — Production model providers remain adapter-local infrastructure

**Context:** The LLM Gateway and model-backed Content Agent already use
provider-neutral contracts. Adding a real OpenAI provider could accidentally leak
provider request shapes, SDK behavior, credentials, transport diagnostics, or response
quirks into agents, Core Brain, runtime persistence, or public errors.

**Decision:** Implement the OpenAI Responses API integration as a `ModelProvider`
adapter with validated provider configuration, explicit ephemeral `SecretValue`
credential input, provider-specific request/response translation, and an injectable
transport. The adapter returns provider-neutral `ModelResponse` records and relies on
`ValidatedLlmGateway` for request validation, profile compatibility, response
validation, ownership checks, and normalized provider-failure behavior.

**Reason:** Provider integration is infrastructure. Keeping OpenAI-specific details
behind `ModelProvider` preserves Core Brain and agent neutrality while allowing the
system to gain production model capability incrementally and safely.

**Tradeoffs:** The adapter can perform live network calls through its fetch transport,
but default automated tests use fake transport only. Local runtime composition is not
yet wired to select this provider, so production use still requires explicit
construction by a caller.

**Future impact:** Any additional provider must follow the same boundary: resolved
credentials remain ephemeral and adapter-local, provider diagnostics are redacted, and
default tests stay deterministic and offline. Runtime wiring must compose providers
without allowing agents or Core Brain to import provider-specific types.

## ADR-020 — Local OpenAI provider wiring is explicit composition

**Context:** The OpenAI provider adapter exists behind `ModelProvider`, and local
secret resolution can produce ephemeral credentials. Wiring that provider into the
local runtime could accidentally introduce implicit credential discovery, live network
behavior in tests, provider-specific agent contracts, or resolved secret values in
runtime configuration.

**Decision:** Add an explicit `model-backed-openai` local content mode with a narrow
OpenAI provider selection in `LocalRuntimeConfig`. The runtime config carries only
provider metadata and an opaque secret-reference ID. `createLocalRuntime` requires the
matching `SecretReference` and `SecretResolver` to be supplied explicitly before it
constructs the OpenAI adapter. Tests use an injected fake OpenAI transport; the
deterministic local model path remains the default offline path.

**Reason:** Provider selection is local infrastructure composition. Keeping the
selection explicit, the credential ephemeral, and the transport injectable lets the
runtime use production provider infrastructure without changing Core Brain, agents,
policy, memory, knowledge, repositories, workflow, tool, or CLI request semantics.

**Tradeoffs:** OpenAI mode requires more explicit setup from local callers: provider
config, matching secret references, a resolver, and optionally a fake transport for
offline tests. The runtime still does not provide live integration-test gating,
provider telemetry, or advanced retry/cost controls.

**Future impact:** Future provider wiring must follow the same pattern: explicit mode
selection, no implicit credential lookup, no resolved secrets in runtime config or
durable records, fake transport coverage by default, and provider-specific behavior
contained behind `ModelProvider`.

## ADR-021 — Model operation limits are enforced at the gateway boundary

**Context:** MV AI OS can now compose deterministic and OpenAI-backed model providers.
Without an explicit operational guard, provider use could accidentally exceed request
size, output size, timeout, retry, or usage budgets before future telemetry and cost
accounting are available.

**Decision:** Add provider-neutral `ModelOperationLimits` and validate them inside
`ValidatedLlmGateway` before provider invocation. The gateway enforces maximum input
characters, requested output tokens, requested timeout, provider-call count, and
reported total-token or cost limits when usage is available. Retryable provider
failures are retried only within the configured call budget; non-retryable failures
are not retried. Timeout and retry-exhaustion failures are normalized into
redaction-safe `ModelError` responses. Local runtime composition supplies validated
operation limits without exposing Core Brain or agents to provider details.

**Reason:** Model safety and spend control must be centralized at the existing model
boundary. Agents and Core Brain should request model capability through contracts, not
own provider retry loops, timeout behavior, or operational cost guards.

**Tradeoffs:** This milestone bounds usage but does not implement full provider
pricing, durable usage ledgers, dashboards, live integration gating, cancellation for
non-cooperative in-process providers, or external monitoring. Currency limits are
enforced only when a request or provider response carries cost data.

**Future impact:** Future cost accounting and telemetry must build on this boundary
instead of bypassing it. Any new provider must remain behind `ModelProvider`, use fake
transport tests by default, and rely on gateway-level operation limits for shared
provider-neutral behavior.

## ADR-022 — Model usage accounting uses explicit pricing only

**Context:** Operation limits can bound reported usage, but Fabio also needs operator
visibility into estimated model cost without leaking prompts, secrets, provider
payloads, raw diagnostics, or provider-specific pricing logic into agents or Core
Brain.

**Decision:** Add provider-neutral pricing and usage-accounting contracts. The local
runtime may supply explicit USD per-million-token pricing rules keyed by provider,
model, and profile. `ValidatedLlmGateway` validates accounting configuration, computes
estimated cost only from validated `ModelUsage`, and normalizes `usage.costUsd` before
operation-limit cost checks. If accounting is required and no exact pricing rule
exists, the gateway fails closed with a redaction-safe model error.

**Reason:** Cost visibility belongs at the model boundary where model responses are
already validated and provider-neutral. Agents and Core Brain should consume
normalized usage, not own pricing tables or provider billing rules.

**Tradeoffs:** Accounting is per-response only. It does not yet persist usage ledgers,
aggregate spend, enforce budgets over time windows, export telemetry, or prove live
provider billing reconciliation. Pricing must be configured explicitly and maintained
by the operator.

**Future impact:** Budget enforcement and Cost Guardian reporting must use this
accounting boundary instead of recalculating model cost inside agents, Core Brain, or
provider adapters.

## ADR-023 — Model budgets are enforced at the gateway boundary

**Context:** Usage accounting makes per-response estimated cost visible, but it does
not by itself prevent an over-budget request or response. Fabio needs deterministic
budget gates before broader live provider use, deeper autonomy, scheduled work, or
guardian agents are allowed to grow.

**Decision:** Add provider-neutral `ModelBudgetConfig` rules keyed by provider, model,
and profile. `ValidatedLlmGateway` validates budget configuration before provider
access, enforces requested-cost budgets before invocation, and enforces estimated-cost
budgets after validated usage accounting. Missing required rules or required cost
data fail closed with redaction-safe `ModelError` responses.

**Reason:** Budget enforcement belongs at the same model boundary as operation limits
and usage accounting. Agents and Core Brain remain unaware of provider pricing,
budget tables, provider SDK behavior, or billing concepts.

**Tradeoffs:** This milestone enforces per-call requested and estimated cost only. It
does not persist a usage ledger, aggregate spend over time windows, integrate with
provider billing, export telemetry, display dashboards, or create a Cost Guardian.

**Future impact:** Cost Guardian and future durable usage ledgers must consume this
provider-neutral budget/accounting boundary rather than duplicating pricing or spend
logic in agents, Core Brain, or provider adapters.

## ADR-024 — Cost Guardian is deterministic report-only infrastructure

**Context:** Operation limits, usage accounting, and budget enforcement now protect
the model gateway boundary, but Fabio also needs operator-facing cost-risk visibility
before expanding live model usage, autonomy, alerts, dashboards, or scheduled work.

**Decision:** Implement Cost Guardian as a provider-neutral, deterministic,
non-autonomous analysis component. It consumes only supplied sanitized usage,
operation-limit, provider-failure, and budget-enforcement signals, validates every
input and report, and emits redaction-safe findings and recommendations. It does not
call models, execute tools, run in the background, schedule itself, send alerts,
persist ledgers, invent pricing, or mutate external systems.

**Reason:** Money-safety visibility should exist before broader autonomy, but the
guardian itself must not become a new spender or operator. Keeping it report-only
preserves the existing gateway as the only automatic model-budget blocking path.

**Tradeoffs:** The guardian can identify risk from supplied records, but it cannot
collect telemetry, reconcile provider billing, aggregate durable budget windows,
notify Fabio, or automatically stop systems. Callers must provide sanitized signals.

**Future impact:** Future guardian agents, dashboards, alerts, durable usage ledgers,
or budget-window enforcement must build on this redaction-safe report boundary and
must add separate authorization, persistence, scheduling, and operator-approval
contracts before taking action.

## ADR-025 — Security Guardian is supplied-state analysis only

**Context:** MV AI OS is moving from model capability toward safe operating control.
Before tools, workflows, cloud/VPS, 24/7 operation, dashboards, or n8n are added,
Fabio needs visibility into unsafe safety posture without creating a scanner,
background agent, or new source of secret exposure.

**Decision:** Implement Security Guardian as a provider-neutral, deterministic,
non-autonomous analysis component. It evaluates only explicit sanitized safety-state
input supplied by a caller, validates every input and report, and emits redaction-safe
findings for missing controls or unsafe posture. It does not scan the filesystem, read
secret values, call models, call providers, use network, execute tools, run in the
background, schedule itself, mutate runtime state, or expose raw prompts,
completions, provider payloads, secret references, transcripts, knowledge, memory, or
transport internals.

**Reason:** Security visibility should exist before broader operational expansion,
but the guardian itself must not become an uncontrolled security product, filesystem
tool, monitoring service, or autonomous actor.

**Tradeoffs:** The guardian can identify risk only from supplied sanitized state. It
does not discover secrets, inspect repositories, monitor live systems, verify cloud
readiness, prove provider configuration safety, or enforce blocking action by itself.

**Future impact:** Backup, incident, quality, and operator-safety reporting must
follow the same pattern: explicit safe input, deterministic report output,
redaction-safe findings, no hidden side effects, and no autonomous action without a
separate approved architecture milestone.

## ADR-026 — Backup Guardian does not operate backups

**Context:** MV AI OS has controlled local SQLite backup and restore operations, but
moving toward VPS/cloud, 24/7 execution, workflows, or external integrations requires
operator-facing recovery posture visibility. Adding an automatic backup actor too
early would introduce file mutation, scheduling, retention, deletion, upload, and
restore risks before the control plane is ready.

**Decision:** Implement Backup Guardian as a provider-neutral, deterministic,
non-autonomous analysis component. It evaluates only explicit sanitized
backup-readiness input supplied by a caller, validates every input and report, and
emits redaction-safe findings for missing or unsafe recovery controls. It does not
read backup files, scan the filesystem, create backups, restore backups, schedule
backups, upload backups, delete backups, mutate files, call models, use network,
execute tools, run in the background, or expose raw paths, database records, secret
references, prompts, provider payloads, transcripts, or transport internals.

**Reason:** Recovery posture visibility should exist before 24/7 or cloud operation,
but the guardian itself must not become a backup scheduler, restore tool, filesystem
crawler, or external storage integration.

**Tradeoffs:** The guardian can identify risk only from supplied sanitized state. It
does not prove that a real backup file exists, perform restore verification, maintain
a durable backup ledger, or enforce retention policy by itself.

**Future impact:** Incident, quality, and aggregate operator-safety reporting must
consume guardian reports or sanitized signals without turning report-only guardians
into autonomous actors. Any future scheduled backup or cloud backup feature requires a
separate architecture milestone with explicit authorization, audit, idempotency, and
operator controls.

## ADR-027 — Incident Guardian does not alert or remediate

**Context:** MV AI OS now has deterministic cost, security, and backup guardian
foundations. Before adding workflows, dashboards, n8n, cloud/VPS, 24/7 operation, or
external alerts, Fabio needs local visibility into repeated failures and
high-severity safety signals without introducing a background monitor or autonomous
remediation path.

**Decision:** Implement Incident Guardian as a provider-neutral, deterministic,
non-autonomous analysis component. It evaluates only explicit sanitized operational
incident counters and guardian finding summaries supplied by a caller, validates
every input and report, and emits redaction-safe incident findings. It does not send
alerts, call external systems, use network, call models, schedule checks, run in the
background, mutate state, execute tools, persist incident ledgers, or expose raw
prompts, completions, provider payloads, diagnostics, secret references, paths,
database records, transcripts, knowledge, memory, or transport internals.

**Reason:** Incident visibility is needed before external integrations and 24/7
operation, but alerting and remediation are action layers that require separate
authorization, audit, escalation, and operator-control design.

**Tradeoffs:** The guardian can identify incidents only from supplied sanitized
counts and summaries. It does not collect live telemetry, monitor processes, page
Fabio, deduplicate over durable time windows, or enforce remediation.

**Future impact:** Quality Guardian and Operator Safety Report must preserve the same
report-only discipline. Any future alerting, durable incident ledger, dashboard, or
automatic remediation feature requires a separate milestone with explicit policy,
approval, audit, and idempotency boundaries.
