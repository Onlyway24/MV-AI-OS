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

## ADR-028 — Quality Guardian does not judge content with AI

**Context:** MV AI OS now has deterministic cost, security, backup, and incident
guardian foundations. Before publishing, dashboards, workflows, n8n, cloud/VPS,
24/7 operation, or external review systems are added, Fabio needs local visibility
into malformed outputs, missing evidence, missing review, low readiness, and repeated
validation failures without turning quality review into another model call or
autonomous publishing gate.

**Decision:** Implement Quality Guardian as a provider-neutral, deterministic,
non-autonomous analysis component. It evaluates only explicit sanitized
output/process-quality signals supplied by a caller, validates every input and
report, and emits redaction-safe findings. It does not judge content with AI, call
models, call providers, publish content, mutate outputs, scan files, read transcripts,
read knowledge or memory, execute tools, send alerts, schedule checks, run in the
background, persist ledgers, or expose raw prompts, completions, generated content,
provider payloads, diagnostics, secret references, paths, database records,
transcripts, knowledge, memory, or transport internals.

**Reason:** Quality visibility is needed before content can safely move toward
publication or workflow execution, but the quality component must not become a hidden
model spender, content moderator, publisher, or autonomous blocker.

**Tradeoffs:** The guardian can identify quality risk only from supplied sanitized
signals. It does not inspect raw generated text, verify factual correctness, collect
telemetry, perform editorial review, or enforce blocking action by itself.

**Future impact:** Operator Safety Report must aggregate Quality Guardian output as
redaction-safe summary data only. Any future AI-assisted quality review, editorial
workflow, publishing gate, dashboard, durable quality ledger, or autonomous blocking
behavior requires a separate milestone with explicit policy, approval, audit,
idempotency, cost controls, and redaction boundaries.

## ADR-029 — Operator Safety Report aggregates reports only

**Context:** MV AI OS now has deterministic report-only Cost, Security, Backup,
Incident, and Quality Guardian foundations. Fabio needs one control-plane summary
that answers whether the system is healthy, which domain needs attention first, and
whether it is safe to continue or move toward more autonomy, without manually
inspecting every guardian report one by one.

**Decision:** Implement Operator Safety Report as a provider-neutral, deterministic,
non-autonomous aggregation component. It consumes only explicit redaction-safe
guardian reports supplied by a caller, validates every input and output, normalizes
severity at the aggregation boundary, reports missing guardian coverage, produces
deterministic operator actions, and emits a safety-to-autonomy decision. It does not
collect signals, scan files, read secrets, call models, call providers, execute
tools, execute workflows, schedule checks, send alerts, render dashboards, persist
ledgers, mutate state, or expose raw prompts, completions, provider payloads,
diagnostics, secret references, paths, database records, transcripts, knowledge,
memory, generated content, or transport internals.

**Reason:** A unified operator report reduces Fabio's babysitting load while
preserving human control. Aggregating already-safe guardian outputs creates useful
control-plane visibility without adding the risks of monitoring, scheduling,
alerting, dashboards, or autonomous remediation.

**Tradeoffs:** The report is only as complete as the supplied guardian reports. It
does not discover missing controls by itself, collect telemetry, prove live safety,
page Fabio, enforce blocking decisions, or maintain historical incident/state
windows.

**Future impact:** Main Assistant / Orchestrator work should consume Operator Safety
Report as an operator-facing safety input, not as an autonomous permission to act.
Any future dashboard, alerting, durable safety ledger, scheduler, monitor, or
automatic pause/remediation behavior requires separate policy, approval, audit,
idempotency, persistence, and redaction milestones.

## ADR-030 — Only Way Assistant starts as a specification, not a runtime

**Context:** MV AI OS now has a report-only control-plane safety foundation. The
next product direction is a single operator-facing assistant so Fabio does not
babysit many visible agents. That assistant must eventually coordinate specialist
agents, memory, knowledge, models, tools, workflows, guardians, and approvals, but
adding execution too early would risk hidden autonomy, provider calls, tool use,
workflow side effects, and policy bypass.

**Decision:** Define Only Way Assistant first as a validated Main Assistant /
Orchestrator specification built on the existing `AgentSpecification` contract. The
specification records identity, mission, structured input/output schemas,
capabilities, policy requirements, forbidden capabilities, safety preflights, human
approval requirements, future delegation policy, non-responsibilities, and
operator-facing output rules. It does not add a runtime, call models, execute tools,
execute workflows, consult guardians automatically, mutate state, schedule work, or
perform any external action.

**Reason:** The main assistant should fit the existing architecture instead of
creating a parallel agent system. A declarative, validated foundation gives Fabio one
future interface while preserving provider neutrality, policy boundaries, guardian
discipline, and human approval before dangerous action.

**Tradeoffs:** The assistant is not executable yet. It cannot process operator
requests, delegate work, invoke models, enforce safety checks, or produce live
operator responses until later runtime milestones are implemented.

**Future impact:** Main Assistant runtime, guardian consultation, delegation policy,
and operator protocol milestones must consume this specification rather than
inventing new identities or bypassing Agent Specification, Policy, Operator Safety,
Model Gateway, Memory, Knowledge, Workflow Specification, or Tool Gateway boundaries.

## ADR-031 — Main Assistant runtime boundary is deterministic and side-effect free

**Context:** Only Way Assistant now has a validated declarative specification, but
Fabio needs a controlled first executable boundary before any future multi-agent,
workflow, tool, dashboard, or autonomous behavior is introduced. A full orchestrator
at this point would risk mixing operator interaction with provider calls, guardian
execution, delegation, workflows, tools, persistence, or hidden side effects.

**Decision:** Implement `MainAssistantRuntime` as a narrow deterministic local
boundary. It validates `MainAssistantInvocation`, consumes only supplied Operator
Safety context, uses the existing Only Way Assistant specification as its identity
and contract source, refuses unsafe or under-specified requests, surfaces approval
requirements for escalation categories, and returns a validated redaction-safe
`MainAssistantResult`. It does not call models, call providers, execute guardians,
execute tools, execute workflows, delegate to agents, mutate memory or knowledge,
write repositories, schedule work, use network behavior, persist ledgers, or operate
autonomously.

**Reason:** This gives Fabio the first safe operator-facing assistant invocation
surface while preserving every established MV AI OS boundary. It proves how the main
assistant can make bounded continuation/refusal decisions without becoming a parallel
Core Brain or a hidden automation loop.

**Tradeoffs:** The runtime cannot yet consult guardians through a formal policy,
delegate to specialists, invoke model reasoning, produce rich conversational output,
or execute multi-step plans. It depends on callers supplying current Operator Safety
context and remains a local deterministic component.

**Future impact:** Guardian Consultation Boundary must extract the safety decision
policy from this first runtime behavior into a dedicated validated consultation
layer. Later delegation, operator protocol, agent-company, workflow, tool, dashboard,
or cloud milestones must continue to consume this boundary without bypassing Policy,
Operator Safety, approval, Model Gateway, Tool Gateway, Workflow Specifications, or
Core Brain ownership.

## ADR-032 — Guardian Consultation is a supplied-signal decision gate

**Context:** Only Way Assistant has a validated specification and deterministic
runtime boundary. It can consume Operator Safety context, but safety consultation
logic needs to be reusable by later operator decisioning, delegation policy, mission
planning, and agent-company milestones without running guardians automatically or
creating hidden autonomy.

**Decision:** Implement Guardian Consultation as a deterministic, redaction-safe
boundary that consumes only an explicit `GuardianConsultationRequest`, a validated
`GuardianConsultationPolicy`, and an optional supplied `OperatorSafetyReport`. It
maps Operator Safety status, safety-to-autonomy posture, requested escalation
categories, required guardian coverage, and approval requirements into a validated
`GuardianConsultationDecision`: may continue, continue with warning, require operator
confirmation, require approval, or block. It does not execute guardians, collect
signals, call models, call providers, execute tools, execute workflows, delegate to
agents, persist ledgers, mutate state, schedule work, send alerts, use network
behavior, or act autonomously.

**Reason:** Fabio needs one clear decision gate before escalation so he remains the
operator instead of babysitting scattered guardian outputs. A supplied-signal boundary
keeps safety decisions deterministic and testable while preserving future room for
dashboards, alerts, workflow runtime, or autonomous checks only after separate
authorization, audit, persistence, and redaction milestones.

**Tradeoffs:** The consultation boundary cannot determine safety by itself. It is only
as current and complete as the supplied Operator Safety Report and policy. It does
not enforce approvals or block external systems by itself; it produces a decision for
later operator decisioning and execution layers to consume.

**Future impact:** Operator Decision Engine Foundation must consume
`GuardianConsultationDecision` rather than recalculating guardian policy from raw
guardian reports. Later delegation, mission planning, workflow execution, tool
execution, dashboard, cloud/VPS, scheduler, or alerting milestones must preserve this
boundary and add explicit policy, approval, audit, persistence, and redaction behavior
before taking action.

## ADR-033 — Operator Decision Engine decides but does not execute

**Context:** Only Way Assistant now has a validated specification, a deterministic
runtime boundary, and a Guardian Consultation Boundary. The next product step is a
single operator-facing command layer that turns Fabio's objective into an explicit
decision without requiring him to choose which future internal agent to prompt. That
layer must not become a hidden workflow runtime, sub-agent runtime, model caller, or
tool executor.

**Decision:** Implement Operator Decision Engine as a deterministic, redaction-safe
decision boundary. It consumes a validated `OperatorDecisionContext` containing the
Only Way Assistant specification, operator objective, requested outcome, requested
operations, Guardian Consultation decision, optional sanitized cost posture, and
optional delegation signal. It returns a validated `OperatorDecision`: proceed,
clarification required, approval required, confirmation required, refused, blocked,
or non-executing mission-plan candidate. It does not call models, call providers,
execute tools, execute workflows, invoke agents, delegate work, persist state, collect
guardian signals, schedule work, use network behavior, send alerts, or act
autonomously.

**Reason:** Fabio needs one clean decision surface before mission planning and future
delegation. Keeping this layer deterministic and non-executing preserves cost,
security, policy, approval, and audit boundaries while making Only Way Assistant more
operator-useful.

**Tradeoffs:** The engine cannot complete work by itself. It does not perform
reasoning through a model, route to real agents, execute missions, or enforce
approvals externally. Its quality depends on validated inputs supplied by upstream
runtime, guardian consultation, cost/budget, and future delegation-policy layers.

**Future impact:** Main Assistant Delegation Policy Foundation must feed delegation
constraints into this decision layer without adding sub-agent runtime. Mission
Planning Dry-Run must consume `OperatorDecision` and remain non-executing until a
separate Workflow Runtime milestone adds durable approvals, audit, idempotency,
policy enforcement, and explicit execution boundaries.

## ADR-034 — Delegation Policy is declarative and non-executing

**Context:** Only Way Assistant now has a validated specification, deterministic
runtime boundary, Guardian Consultation Boundary, and Operator Decision Engine. The
system needs to know which future specialist categories may be proposed before an
agent-company map or mission planner can be safe, but adding real sub-agent runtime
now would create uncontrolled agent-to-agent behavior and make Fabio a babysitter.

**Decision:** Implement Main Assistant Delegation Policy as a deterministic,
redaction-safe, non-executing evaluation boundary. It consumes a validated policy
profile, explicit target category, requested operations, delegation path/depth,
approval markers, and optional supplied Guardian Consultation decision. It returns a
validated decision: allowed, blocked, requires approval, or requires operator
confirmation. It enforces allowed targets, forbidden categories, Guardian
Consultation presence, Operator Safety coverage, approval markers,
budget/security/backup/quality prerequisites, max delegation depth, and
no-circular-delegation rules. It does not invoke agents, execute workflows, execute
tools, call models, call providers, collect guardian signals, persist state, schedule
work, use network behavior, send alerts, or act autonomously.

**Reason:** Fabio needs one controlled main assistant that can safely propose future
internal specialists without spawning agent chaos. A declarative policy makes
delegation auditable, deterministic, and reviewable before any real multi-agent
runtime exists.

**Tradeoffs:** The policy cannot complete specialist work, discover live safety state,
or enforce external approvals by itself. It only evaluates supplied signals and
approval markers. Future execution layers must still add durable approval,
idempotency, audit, policy, and runtime enforcement before any handoff can perform
work.

**Future impact:** Main Assistant Operator Protocol should present delegation-policy
decisions in Fabio-facing language without exposing raw guardian payloads. Agent
Company Specification Foundation and Mission Planning Dry-Run must consume this
policy for candidate handoffs and must remain non-executing until separate workflow,
tool, and agent runtime milestones are approved.

## ADR-035 — Operator Protocol is a presentation contract, not a runtime

**Context:** Only Way Assistant now has a validated specification, deterministic
runtime boundary, Guardian Consultation Boundary, Operator Decision Engine, and
Delegation Policy. Fabio needs one operator-facing protocol that can present decisions
without exposing raw internal payloads or forcing him to manage separate specialist
agents manually.

**Decision:** Implement Main Assistant Operator Protocol as a deterministic,
redaction-safe presentation and normalization boundary. It consumes a validated
operator command, Guardian Consultation decision, Operator Decision, and optional
Delegation Policy decision. It returns a validated operator-facing response with an
understood objective, decision, safety-check summary, blockers, missing information,
approval prompts, refusals, cost posture, next actions, and non-executing delegation
or mission-plan summaries. It does not build a UI, run a chat loop, call models, call
providers, invoke agents, execute delegation, execute workflows, execute tools,
persist state, use network behavior, schedule work, send alerts, or act
autonomously.

**Reason:** Fabio should operate MV AI OS through one clear command layer, not by
debugging internal contracts or babysitting many agents. Keeping the protocol as a
presentation contract preserves architecture while making the system more usable for
future CLI, web, or API surfaces.

**Tradeoffs:** The protocol cannot decide safety, enforce approval externally, run
specialists, or complete work. It only presents supplied decisions. Future transport
layers must still validate input, construct runtime dependencies, and invoke existing
boundaries explicitly.

**Future impact:** Agent Company Specification Foundation should use this protocol's
operator-facing language to explain internal roles without making them external
personalities. Mission Planning Dry-Run should return protocol-compatible summaries
while remaining non-executing until workflow and agent runtimes are separately
approved.

## ADR-036 — MV AI OS Constitution is the highest-level strategic doctrine

**Context:** MV AI OS now has a large set of implemented foundations: Core Brain,
durable SQLite persistence, memory, knowledge, model gateway, OpenAI adapter wiring,
operation limits, usage accounting, budget enforcement, guardians, Operator Safety
Report, Only Way Assistant specification/runtime/consultation/decision/delegation
boundaries, and Operator Protocol. The project is also being continued across AI
sessions and tools, which creates risk of context loss, architecture drift,
over-agentification, or premature autonomy.

**Decision:** Add `docs/MV_AI_OS_CONSTITUTION.md` as the permanent strategic,
architectural, product, safety, and execution doctrine for MV AI OS. Future sessions
must read it before implementation, then verify current repository state through
project-state documents, architecture documents, source, and tests. The constitution
defines Fabio's founder/operator role, the one-visible-assistant model, Control Plane
ordering, Agent Company direction, workflow/tool/dashboard/cloud principles, safety,
cost, secret, backup, approval, audit, memory, knowledge, provider-neutrality, coding,
testing, commit, project-state, forbidden-shortcut, and production-readiness rules.

**Reason:** A single high-level constitution lets future prompts be shorter while
making project doctrine more durable than chat history. It also protects the project
from exciting but unsafe shortcuts such as hidden model calls, hidden tools, cloud
deployment before controls, dashboard bypasses, direct tool execution without
approval, or many visible agents that turn Fabio into a babysitter.

**Tradeoffs:** The constitution adds documentation maintenance responsibility and is
not itself executable enforcement. It must stay consistent with source and
project-state documents, and it must not be used to justify implementing features
outside the current `04_NEXT_TASK.md` milestone.

**Future impact:** Agent Company Specification Foundation and every later milestone
must preserve the constitution's ordering: Fabio -> Only Way Assistant -> Control
Plane -> Agent Company -> Workflow Runtime -> Tool Runtime -> Product Layer. If a
future decision conflicts with the constitution, it must be recorded as an explicit
ADR rather than silently drifting.

## ADR-037 — Agent Company starts as a validated non-executing map

**Context:** Only Way Assistant can now present operator-facing decisions and
non-executing delegation summaries. The next risk is over-agentification: adding
specialists without a stable role map would make Fabio manage random agents and would
blur safety, approval, memory, knowledge, and future specification boundaries.

**Decision:** Implement Agent Company Specification Foundation as a deterministic,
validated, non-executing `AgentCompanyMap`. It declares Fabio's first internal
specialist roles, business value, departments, role categories, role boundaries,
control-plane dependencies, approval requirements, forbidden capabilities,
memory/knowledge requirements, and future AgentSpecification mappings. It does not
execute agents, run mission plans, call models, call providers, execute workflows,
execute tools, persist state, use network behavior, run guardians, send external
communication, publish, or act autonomously.

**Reason:** Fabio should keep one visible assistant while the internal company model
becomes explicit, deterministic, testable, and redaction-safe. A validated map lets
future milestones create exact AgentSpecifications and mission plans without
inventing roles dynamically.

**Tradeoffs:** The map does not complete work. It is intentionally declarative and
must be followed by exact AgentSpecification records before mission planning or
workflow dry-runs can reference these roles.

**Future impact:** Initial Core Agent Specifications must map back to this role map
and preserve its forbidden capabilities, approval requirements, and control-plane
dependencies. Future workflow or tool runtime milestones must not treat role presence
as permission to execute.

## ADR-038 — Initial core agents are specifications, not workers

**Context:** The Agent Company map defines Fabio's internal organization, but mission
planning and future workflow dry-runs need exact AgentSpecification identities rather
than loose role names. Adding executable agents now would skip mission planning,
workflow boundaries, approvals, and runtime safety.

**Decision:** Define the first experimental core AgentSpecification records for
Research Agent, Business Agent, Content Director, Developer Agent, and Knowledge
Curator. Each specification maps to the Agent Company role map and declares exact
task types, strict input/output schemas, capabilities, limits, policy requirements,
handoff targets, and instruction references. The specifications do not execute
agents, call models, call providers, run workflows, execute tools, persist state, use
network behavior, or act autonomously.

**Reason:** Exact specifications give the Only Way Assistant and future mission
planner stable internal company structure without introducing runtime autonomy.
Reusing the existing AgentSpecification contract and validator prevents a parallel
agent-description system.

**Tradeoffs:** These agents cannot yet perform work. They are operationally useful as
validated identities and planning targets only.

**Future impact:** Extended Business Agent Specifications should complete the
remaining business-facing roles using the same pattern. Mission Planning Dry-Run must
reference exact specification IDs and versions without invoking them.

## ADR-039 — Extended business agents remain declarative specifications

**Context:** The Agent Company map and first five core AgentSpecifications give Fabio
the beginning of an internal company model, but business-side roles add higher-risk
domains: publishing, sales outreach, finance, legal/risk review, and customer
delivery. Implementing these as executable workers too early would create external
communication, spending, legal, customer, and reputation risks before responsibility
mapping, mission planning, workflow runtime, durable approvals, and tool execution
boundaries exist.

**Decision:** Define Publisher Agent, Sales Agent, Finance / Cost Analyst, Legal /
Risk Reviewer, and Customer Delivery Agent as exact experimental
AgentSpecifications plus validated business profiles. The standard
AgentSpecification contract remains the execution-facing identity boundary. The
business profile records the role's business purpose, responsibilities,
non-responsibilities, required permissions, forbidden capabilities, guardian
consultation requirements, approval requirements, memory and knowledge requirements,
future non-executing tool declarations, failure modes, quality checks, business value
classification, escalation rules, and output quality bar. These records do not
execute agents, call models, call providers, run workflows, execute tools, persist
state, use network behavior, publish, send outreach, deliver customer work, spend
money, provide binding legal advice, or act autonomously.

**Reason:** The business roles are valuable as planning targets only if their safety
boundaries are explicit before mission planning begins. Publishing, sales, and
customer delivery require explicit Fabio approval before any future external path can
continue. Finance must remain advisory and cannot spend or change budgets. Legal /
Risk must remain non-binding and cannot provide final compliance approval.

**Tradeoffs:** The companion business profile adds validation outside the generic
AgentSpecification contract. This is intentional: it preserves the existing standard
agent contract while validating business-side doctrine needed by future planning and
responsibility-matrix work.

**Future impact:** Inter-Agent Responsibility Matrix should use these exact
specification IDs, versions, role boundaries, approvals, and forbidden capabilities.
Mission Planning Dry-Run must treat these roles as planning targets only until a
separate workflow/runtime milestone introduces governed execution.

## ADR-040 — Agent Company responsibility ownership is explicit before planning

**Context:** The Agent Company now has a validated map and exact specifications for
all ten current specialist roles. Without an explicit responsibility matrix, future
mission planning could still create unclear ownership, duplicate primary owners,
unsafe handoffs, or accidental responsibility expansion across publishing, sales,
finance, legal/risk, customer delivery, implementation, and knowledge work.

**Decision:** Define the Inter-Agent Responsibility Matrix as a deterministic,
validated, non-executing organizational contract. It maps each major responsibility
area to exactly one primary owner, supporting roles, consulted roles, approval-gate
roles, forbidden roles, and explicit conflict-resolution notes. Every role reference
must map to the Agent Company role map and an existing AgentSpecification ID/version.
The matrix does not execute agents, call models, call providers, run workflows,
execute tools, grant permissions, persist state, use network behavior, publish, send
outreach, deliver customer work, spend money, provide final legal approval, or act
autonomously.

**Reason:** Fabio should not babysit a swarm of agents, and Only Way Assistant needs
a coherent internal organization before it can safely plan work. Ownership clarity is
a prerequisite for mission planning, capability mapping, permission mapping, and
handoff contracts.

**Tradeoffs:** The matrix is not runtime enforcement. It adds another declarative
artifact that must stay aligned with Agent Company roles and AgentSpecifications.

**Future impact:** Agent Capability Registry and Agent Permission Matrix should use
the responsibility matrix as the organizational source for ownership and support
boundaries. Mission Planning Dry-Run must reference this matrix without invoking
agents or workflows.

## ADR-041 — Capabilities are ownership declarations, not permissions

**Context:** The Agent Company now has a validated map, exact AgentSpecifications for
all ten roles, and an Inter-Agent Responsibility Matrix. Future mission planning
needs a more granular answer than "which area does this role own": it needs to know
which concrete business, research, content, engineering, knowledge, publishing,
sales, finance, legal/risk, customer-delivery, quality, approval, and planning
capabilities can be considered during dry-run planning. If capabilities were treated
as permissions or execution rights, future planning could accidentally bypass
policy, approvals, guardians, workflows, tools, and Fabio.

**Decision:** Define the Agent Capability Registry as a deterministic, validated,
non-executing planning contract. Each capability has exactly one primary Agent
Company owner, optional supporting roles, a category, risk level, business value,
approval requirements where relevant, guardian requirements where relevant, future
workflow compatibility, future tool compatibility, and an explicit marker that it
must never be treated as direct execution permission. Every owner and supporter maps
to the Agent Company role map and an existing AgentSpecification ID/version. The
registry does not execute agents, grant permissions, call models, call providers,
run workflows, execute tools, persist state, use network behavior, publish, send
outreach, deliver customer work, spend money, provide final legal approval, or act
autonomously.

**Reason:** Only Way Assistant needs precise internal capability ownership before it
can produce safe mission-plan dry runs. Fabio should see coherent business planning,
not random agent delegation. Capability ownership improves future orchestration
quality while preserving the default-deny and approval-first architecture.

**Tradeoffs:** The registry is another declarative artifact that must stay aligned
with the Agent Company map, AgentSpecifications, and responsibility matrix. It
provides no runtime capability by itself.

**Future impact:** Agent Permission Matrix should map these capability IDs to future
permission requirements without granting runtime access. Mission Planning Dry-Run
must use this registry only as planning metadata until separate workflow, approval,
and tool execution boundaries exist.

## ADR-042 — Agent permissions are declarative planning boundaries

**Context:** The Agent Company now has role specifications, responsibility ownership,
and capability ownership. Future mission planning also needs to know what each role
may prepare or analyze, what it must not do, and what requires Fabio approval or
guardian consultation. If this information were implemented as runtime permission
grants too early, it could bypass the existing default-deny policy, effective
permission evaluation, approvals, guardians, workflow runtime, tool runtime, and
audit model.

**Decision:** Define the Agent Permission Matrix as a deterministic, validated,
non-executing declaration. It maps every current Agent Company role and every Agent
Capability Registry capability to a permission rule with allowed planning actions,
forbidden action categories, approval requirements, guardian requirements, future
workflow/tool compatibility, default-deny posture, and explicit no-runtime-grant
markers. The matrix does not grant runtime permissions, invoke agents, call models,
call providers, run workflows, execute tools, persist state, use network behavior,
mutate files, publish, send outreach, deliver customer work, spend money, provide
final legal approval, or act autonomously.

**Reason:** Fabio needs a safe internal operating model before the system can plan or
execute work. The matrix makes future mission plans deterministic and reviewable
while preserving least privilege and human approval.

**Tradeoffs:** The matrix duplicates some safety intent already present in role,
capability, and responsibility records. This is intentional: it gives future Mission
Planning Dry-Run a permission-specific artifact without weakening runtime policy.

**Future impact:** Agent Communication / Handoff Contracts should reference these
permission rule IDs when describing future support, review, approval-preparation, and
escalation handoffs. Mission Planning Dry-Run must treat the matrix as planning
metadata only until separate runtime permission enforcement exists.

## ADR-043 — Agent handoffs are validated planning contracts, not execution

**Context:** The Agent Company now has role specifications, responsibility ownership,
capability ownership, and permission declarations. Future Mission Planning Dry-Run
needs a safe way to describe when one internal role should request support, review,
approval preparation, or escalation from another role. Without explicit handoff
contracts, mission planning could invent ad hoc delegation paths, skip guardian or
approval markers, leak raw prompts or provider payloads, or imply unsafe external
actions.

**Decision:** Define Agent Communication / Handoff Contracts as deterministic,
validated, non-executing planning contracts. Each handoff declares stable ID, source
role, target role, handoff type, reason, sanitized payload summary, expected output,
related responsibility areas, related capability IDs, related permission rule IDs,
risk, approval requirements, guardian requirements, blocked-content rules,
non-execution, uncertainty and evidence quality, future workflow relevance, and
future tool relevance. Handoff results are also validated and redaction-safe. These
contracts do not invoke agents, execute handoffs, generate mission plans, run
workflows, execute tools, call models, call providers, persist state, use network
behavior, publish, send outreach, deliver customer work, spend money, provide final
legal approval, or act autonomously.

**Reason:** Fabio should be able to inspect a coherent internal company operating
model before any mission planner exists. Handoff contracts let future planning reuse
the Agent Company map, exact AgentSpecifications, responsibility matrix, capability
registry, and permission matrix without weakening default-deny policy or human
approval boundaries.

**Tradeoffs:** The handoff set adds another declarative artifact that must stay
aligned with existing Agent Company artifacts. It improves determinism but does not
itself prove the company is ready for planning; a separate readiness review should
evaluate cross-artifact coherence.

**Future impact:** Agent Company Readiness Review should consume the handoff
contracts with the role map, AgentSpecifications, responsibility matrix, capability
registry, and permission matrix before Mission Planning Dry-Run is implemented.
Mission Planning Dry-Run must treat handoffs as planning metadata only until a
separate governed workflow/runtime milestone introduces execution.

## ADR-044 — Agent Company readiness is proven across supplied declarations

**Context:** The Agent Company map, ten exact AgentSpecifications, responsibility
matrix, capability registry, permission matrix, and handoff contracts were each
validated independently. Independent validation did not prove that exact role,
specification, ownership, permission, and handoff references remained coherent across
all six artifacts. The first cross-artifact review found three valid handoff contracts
whose targets were absent from their source AgentSpecification allowlists.

**Decision:** Add a deterministic, validated, non-executing Agent Company Readiness
Review. It evaluates supplied declarations rather than a hardcoded checklist, reuses
existing artifact validators, applies cross-layer consistency checks, returns
fixed-template identifier-only findings, preserves deterministic ordering, and makes
any critical finding produce `NOT_READY` regardless of score. The three existing
handoff targets are added to their source AgentSpecification allowlists so the current
declaration set truthfully evaluates as `READY`. Readiness means declaration readiness
for non-executing mission planning only; it does not grant runtime permissions or make
experimental AgentSpecifications executable.

**Reason:** Mission planning must not build on individually valid but mutually
inconsistent company declarations. A pure readiness boundary gives Fabio an explicit
checkpoint while preserving default-deny policy, exact identities, human authority,
and the separation between planning metadata and execution rights.

**Tradeoffs:** The readiness score is a deterministic summary, not a substitute for
findings; critical findings always override it. The evaluator intentionally judges
the supplied Agent Company artifact set only. It does not prove Main Assistant
delegation runtime eligibility, durable approval satisfaction, live guardian state,
or executable workflow/tool readiness.

**Future impact:** Founder Mission Brief and Mission Plan milestones may consume the
readiness artifact as planning input, but must continue to treat Agent Company
permissions and handoffs as non-executing declarations. Any future execution path
must independently reapply Core Brain routing, default-deny policy, effective
permissions, budgets, approvals, guardians, validation, and audit.

## ADR-045 — Founder intent is explicit before mission planning

**Context:** The Agent Company is declaration-ready, but Fabio's objectives still
arrive through contracts optimized for task execution or shallow operator decisions.
A deterministic mission planner needs a richer, non-executing statement of business
value, desired output, constraints, cost, deadline, quality, evidence, brand,
approval, and uncertainty without forcing Fabio to answer low-impact questions.

**Decision:** Add a versioned Founder Mission Brief contract and strict runtime
validator. Unknowns are classified as `DECISION_BLOCKING`,
`MATERIAL_BUT_ASSUMABLE`, or `LOW_IMPACT`. Only decision-blocking unknowns create
clarification questions; lower-impact unknowns require one explicit conservative
assumption. External actions remain proposal-only and require Fabio approval markers.
Founder preferences and brand profiles are versioned, configurable, and non-sensitive;
MV AI OS and Metodo Veloce are separate defaults rather than global hardcoding.

**Reason:** Fabio should be able to express intent once and receive useful planning
without becoming a form-filling bottleneck. Explicit uncertainty and evidence rules
let future planning continue conservatively while protecting strategy, cost, legal,
audience, deadline, deliverable, and external-action decisions.

**Tradeoffs:** The brief is more structured than a free-text command and cannot infer
missing facts intelligently without a future provider-neutral planner. It represents
requested external actions but cannot authorize or execute them.

**Future impact:** Mission Plan Contracts and the deterministic planner must consume a
validated brief, preserve explicit facts/assumptions/unknowns, ask only material
questions, apply brand preferences only to relevant deliverables, and remain fully
non-executing.

## ADR-046 — Full Mission Plans are review artifacts, not execution plans

**Context:** Core Brain already owns a bounded executable `ExecutionPlan`, and the
Operator Decision Engine exposes a shallow `OperatorMissionPlanCandidate`. Mission
Planning needs a richer artifact with strategies, exact Agent Company ownership,
dependencies, handoffs, controls, effort/cost classes, outputs, success criteria, and
approval/guardian queues. Reusing either existing contract would change its meaning
and risk coupling future planning to execution.

**Decision:** Add a separate versioned `MissionPlan` contract and validator in the
missions boundary. It validates against supplied `READY` Agent Company declarations,
requires exact role/specification, responsibility, capability, permission, and
handoff references, rejects dependency cycles and unsafe external behavior, preserves
non-execution at every level, and returns a deeply immutable validated copy.

**Reason:** A review-ready plan must be specific enough for Fabio to approve while
remaining incapable of executing. Keeping it separate protects Core Brain behavior
and the existing operator presentation contract.

**Tradeoffs:** The contract is intentionally detailed and requires a deterministic
planner to populate it coherently. Relative cost classes are not monetary estimates,
and plan validation cannot prove real-world evidence or commercial success.

**Future impact:** The deterministic planner must generate this exact contract and
pass the validator. A later local dry-run may summarize it into the existing operator
protocol, but no workflow or agent runtime may treat plan presence as authorization.

## ADR-047 — Deterministic planning is the safe baseline and fallback

**Context:** Founder Mission Brief and Mission Plan contracts are validated, but Fabio
needs useful plans before intelligent provider-backed planning exists. Calling an LLM
now would make plan selection, cost, and safety nondeterministic before the baseline
behavior is proven.

**Decision:** Implement a deterministic, provider-neutral Mission Planner over
validated briefs and supplied `READY` Agent Company declarations. Stable mission
profiles map mission types to existing responsibility, capability, permission, and
handoff IDs. The planner selects the smallest sufficient team, derives controls from
declarations, asks only decision-blocking questions, preserves conservative
assumptions, returns relative effort/cost classes, validates its final plan, and fails
closed on invalid briefs or company state.

**Reason:** A deterministic baseline gives Fabio immediate local planning value,
creates an auditable fallback for future intelligent planning, and prevents models
from inventing agents, permissions, evidence, or execution rights.

**Tradeoffs:** Static profiles cannot produce genuinely novel strategy or reason from
live evidence. Their value is reliable structure and control, not human-level market
judgment. Profiles must remain general across mission families rather than encode one
restaurant use case.

**Future impact:** The Only Way Quality Gate and Scenario Lab must evaluate these
plans. Any future provider-neutral intelligent planner must preserve this deterministic
planner as a safe fallback and pass the same Mission Plan validator and quality gate.

## ADR-048 — Mission Plan quality is a deterministic release gate

**Context:** A structurally valid, non-executing Mission Plan can still be vague,
valueless, impractical, unsupported by evidence, or insufficiently controlled for a
Fabio review. A model-based judge would introduce cost, provider coupling, and
nondeterministic safety judgments before the planning baseline is proven.

**Decision:** Add a provider-neutral, deterministic Mission Quality Gate with fixed
0–10 scores for clarity, specificity, actionability, value, differentiation, founder
alignment, feasibility, manual-work efficiency, evidence/uncertainty, and
safety/control. `APPROVAL_READY` is only possible at 82/100 or higher, with every
dimension at least 7, useful outputs, complete controls, no generic filler, and no
blocking safety defect. Findings use fixed redaction-safe templates and every low
dimension carries a concrete remediation.

**Reason:** Fabio needs a consistent, inspectable standard for deciding whether a
proposed mission is worth reviewing. Quality must never override the default-deny
approval boundary or let originality compensate for infeasibility, unsupported
certainty, unclear value, excessive work, or unsafe action.

**Tradeoffs:** Fixed rules cannot assess the nuanced originality or commercial appeal
of a human strategist. The gate intentionally evaluates the plan artifact only and
does not validate real-world facts, run guardians, grant permission, or authorize
execution.

**Future impact:** The Scenario Lab and local dry-run must expose the report beside a
Mission Plan. Any future intelligent quality aid must preserve the deterministic gate
as a mandatory baseline and must not relax its blocking safety conditions.

## ADR-049 — Scenario coverage is the integration proof before a local dry-run

**Context:** The Founder Mission Brief, Agent Company readiness review, Mission
Planner, and Mission Quality Gate are individually validated. They need end-to-end
evidence across every declared mission family before a local operator entrypoint can
compose them.

**Decision:** Add a deterministic test-only Mission Planning Scenario Lab. It covers
all declared mission types plus clarification, conservative assumption, contradiction,
proposal-only external-action, safety-blocking, determinism, immutability, and
redaction cases. It adds no production runtime behavior or execution capability.

**Reason:** Representative integration evidence identifies contract mismatches—such
as invalid safety classification—while they are still local, deterministic, and safe
to correct. It prevents a future local dry-run from becoming the first integration
test.

**Tradeoffs:** The lab deliberately asserts deterministic scenario outcomes and does
not claim real-world commercial success, evidence quality, or operator approval. Its
coverage must be extended when a new mission type or planning control is introduced.

**Future impact:** The local dry-run may compose only the validated contracts and
services demonstrated by the lab. It must remain non-executing, provider-neutral, and
subject to the same redaction and approval boundaries.

## ADR-050 — The local Mission Planning dry-run composes, but never executes

**Context:** The Mission Planning foundation is useful only if Fabio can invoke its
validated pieces together without recreating composition logic or bypassing readiness,
quality, and redaction controls.

**Decision:** Add one dependency-injected local dry-run boundary that evaluates Agent
Company readiness first, then invokes the deterministic planner only when ready, and
then invokes the Quality Gate only for a plan-ready result. It returns immutable,
validated status evidence and never invokes a model, agent, workflow, tool, database,
or external system.

**Reason:** This provides a usable local vertical slice while preserving CoreBrain
independence and making execution impossible by contract.

**Tradeoffs:** It is a programmatic local boundary, not an HTTP API, dashboard, CLI
extension, or workflow runtime. It reports a plan for Fabio review; it cannot approve
or perform the plan.

**Future impact:** Future presentation layers may call this boundary, but must not
bypass its validators, readiness-first ordering, quality evidence, or non-execution
guarantee.

## ADR-051 — Mission Planning foundation is closed before workflow execution

**Context:** Mission Planning now has validated founder intent, Agent Company
readiness, deterministic plans, quality evidence, scenario coverage, and one local
non-executing composition boundary.

**Decision:** Close the Mission Planning foundation as a distinct chapter. The next
work begins at Workflow Runtime Foundation and must consume these artifacts without
changing their meaning or treating a plan as execution authorization.

**Reason:** A clean chapter boundary prevents workflow work from silently expanding
planning into agent, tool, model, or external execution.

**Future impact:** Workflow Runtime must remain deterministic and non-executing until
its own step-execution and approval milestones are separately completed.
