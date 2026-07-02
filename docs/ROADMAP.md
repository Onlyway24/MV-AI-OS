# MV AI OS Development Roadmap

## 1. Purpose

This roadmap turns the phases in `README.md` into ordered deliverables, dependencies,
quality gates, and acceptance criteria. It preserves the documented sequence:

1. Foundation
2. Core Brain
3. Agents and Memory
4. n8n Integration
5. Dashboard
6. Production Readiness

The roadmap is outcome-based. A phase is complete only when its acceptance criteria
are demonstrated; creating files or scaffolding alone does not complete a phase.

## 2. Current status

**Current phase: Phase 1 — Foundation specification complete.**

The repository contains the product vision and implementation-ready architecture,
agent, permission, memory, error, testing, and roadmap specifications. Executable
implementation has not begun.

The next implementation milestone is Phase 2, built in small, reviewable increments
against the contracts in `ARCHITECTURE.md`.

## 3. Delivery principles

- Preserve module boundaries before optimizing implementation convenience.
- Deliver vertical behavior with tests, not disconnected placeholder modules.
- Keep adapters replaceable and domain contracts provider-neutral.
- Default to least privilege and require explicit authorization for side effects.
- Treat observability, errors, migrations, and audit as functional requirements.
- Make local operation simple without embedding single-user assumptions in contracts.
- Validate each phase before expanding scope.
- Keep production code free of unfinished placeholders; test doubles belong only in
  tests.

## 4. Phase 1 — Foundation

### Objective

Establish the decisions and contracts needed to implement modules independently
without changing the project vision.

### Deliverables

- Architecture terminology, responsibilities, dependency direction, and module
  boundaries.
- TypeScript/Node.js runtime and local-first operating decision.
- Versioned request, task, agent, result, workflow, approval, error, and audit
  contracts.
- Agent manifest, lifecycle, handoff, and Content Agent specification.
- Default-deny permission and approval model.
- Working, conversation, semantic, operational, and user memory rules.
- JSON/SQLite-friendly repository boundary with a Postgres/vector migration path.
- n8n side-effect boundary and direct-tool exception rules.
- Error, retry, idempotency, cancellation, and degraded-operation behavior.
- Configuration, secret, observability, security, testing, and evaluation
  requirements.
- Phase acceptance criteria and first end-to-end workflow definition.

### Acceptance criteria

- `README.md`, `ARCHITECTURE.md`, `AGENTS.md`, and `ROADMAP.md` are mutually
  consistent.
- Every planned Phase 2 module has a defined responsibility and dependency boundary.
- Cross-module contracts include version, identity, ownership, permission, and error
  behavior.
- The first Content Agent workflow has measurable end-to-end acceptance criteria.
- Deferred choices are explicitly outside initial scope rather than hidden
  implementation assumptions.
- No production source code is required for this phase.

### Status

Complete. Any later change to these contracts must be intentional, reviewed, and
versioned where compatibility is affected.

## 5. Phase 2 — Core Brain

### Objective

Implement a testable orchestration control plane that accepts structured requests,
selects a registered agent, manages task state, validates results, and exposes a
complete trace without performing external side effects.

### Workstreams

#### 5.1 Runtime and repository conventions

- Initialize a pinned Node.js/TypeScript project with strict checking and ECMAScript
  modules.
- Establish formatting, linting, type-checking, test, build, and local-run commands.
- Add validated configuration loading and secret redaction.
- Define source and test placement according to the documented logical boundaries.

#### 5.2 Shared contracts

- Implement runtime validation for all Phase 2 boundary contracts.
- Separate domain contracts from adapters and provider SDK types.
- Add serialization, contract-version rejection, and compatibility tests.
- Generate identifiers and UTC timestamps through injectable interfaces.

#### 5.3 Core Brain execution

- Implement request normalization and idempotent task creation.
- Implement the documented task state machine.
- Add deterministic task-type routing through the Agent Registry.
- Assemble bounded invocation context through interfaces.
- Invoke agents through the Agent Runtime contract.
- Validate structured results and synthesize the task response.
- Add deadlines, cancellation, bounded retry, and normalized failures.

#### 5.4 Model and agent boundaries

- Implement the centralized Model Gateway interface and named model profiles.
- Keep OpenAI-specific translation inside its adapter.
- Implement registry validation and immutable manifest lookup.
- Use deterministic test adapters in automated tests; do not ship a placeholder
  production agent.

#### 5.5 Observability and policy

- Propagate correlation identifiers across every execution boundary.
- Emit structured local logs, initial metrics, and required audit events.
- Implement the default-deny policy evaluator.
- Prove that denied capabilities cannot reach an adapter.

### Acceptance criteria

- A valid request can traverse intake, task creation, routing, a contract-test agent
  adapter, result validation, and completion.
- Duplicate request IDs behave idempotently and conflicting payloads fail.
- Every documented task state transition is tested; invalid transitions fail.
- Unknown agents, task types, contracts, and model profiles fail clearly.
- The Core Brain can run entirely with deterministic test adapters.
- Model, persistence, timeout, cancellation, malformed-result, and policy failures
  produce the documented error contract.
- Correlation and audit records cover successful and failed executions.
- Formatting, linting, type checking, unit tests, and contract tests pass in one
  documented local command sequence.
- No external side effect is possible in Phase 2.

### Exit artifact

A stable orchestration kernel ready for a real Content Agent and local memory
repositories.

## 6. Phase 3 — Agents and Memory

### Objective

Implement the initial Content Agent and governed local context so a business/content
task produces validated, evidence-aware structured output.

### Workstreams

#### 6.1 Local persistence

- Implement SQLite repositories for tasks, invocations, results, memory, and audit.
- Add schema versioning, forward migrations, backup-safe local paths, and repository
  behavior tests.
- Support JSON fixtures plus import/export without making JSON a second database.
- Test transaction boundaries between task state and audit events.

#### 6.2 Memory Service

- Implement working, conversation, semantic, operational, and user memory records.
- Enforce ownership, scope, sensitivity, retention, deletion, and result limits.
- Implement initial local text retrieval and preserve the future embedding interface.
- Govern, deduplicate, and audit agent memory proposals.
- Provide local inspection and deletion operations before background learning is
  enabled.

#### 6.3 Knowledge Service

- Implement local source registration, provenance, bounded search, and retrieval.
- Treat retrieved material as untrusted data.
- Return source identifiers suitable for Content Agent evidence.
- Define re-index and future embedding migration behavior.

#### 6.4 Content Agent

- Implement the manifest and versioned instruction source.
- Implement normalized content input and `ContentOutput` validation.
- Connect the agent only through the Model Gateway.
- Add clarification, assumptions, warnings, evidence, memory-proposal, and workflow-
  proposal behavior.
- Prohibit direct delivery/export capabilities.

#### 6.5 Multi-agent readiness

- Implement Core Brain-mediated handoff contracts.
- Test context isolation with more than one test manifest.
- Do not add production agents without a bounded role and complete evaluation suite.

### Acceptance criteria

- A `business.content` request deterministically selects the Content Agent.
- Only permitted memory and knowledge enter its invocation.
- The Content Agent produces schema-valid output for the supported initial content
  types.
- Underspecified requests return `needs_input` when assumptions would be material.
- Evidence refers only to supplied memory or knowledge identifiers.
- User preferences are persisted only after explicit approval.
- Memory proposals cannot bypass validation or write operational memory.
- Restarting the local process preserves durable task and approved memory state.
- Deletion and retention behavior are tested.
- Prompt-injection, permission leakage, malformed output, model failure, and
  persistence failure tests pass.
- Model-backed quality evaluations meet documented baselines before release.

### Exit artifact

The first useful local workflow: request to validated Content Agent result, without
external delivery.

## 7. Phase 4 — n8n Integration

### Objective

Complete the first end-to-end workflow by allowing approved Content Agent output to be
delivered or exported through n8n.

### Workstreams

- Implement authenticated n8n invocation and verified callbacks.
- Configure allowlisted logical delivery/export workflows.
- Implement `WorkflowRequest` and `WorkflowResult` persistence.
- Enforce idempotency, deadlines, reconciliation, and bounded retries.
- Add approval records and local human-in-the-loop decisions.
- Separate content-generation outcome from workflow-execution outcome.
- Add failure notifications through configured n8n paths where appropriate.
- Document local n8n setup and workflow contract testing.

### Acceptance criteria

- Content generation succeeds with no workflow requested.
- A requested delivery/export is never executed without matching policy permission.
- Actions requiring approval remain pending until explicitly approved or rejected.
- Approved requests reach only the configured n8n workflow and contain no secrets.
- Duplicate submissions cannot repeat an external side effect.
- Authenticated callbacks update the correct task; invalid callbacks are rejected and
  audited.
- Timeout or unknown status triggers reconciliation rather than blind re-execution.
- Delivery failure preserves the successful content result and returns a structured
  workflow failure.
- Integration tests cover success, rejection, timeout, callback forgery, retry, and
  n8n unavailability.

### Exit artifact

The complete initial vertical slice:

```text
business/content request
  -> Core Brain
  -> Content Agent with governed context
  -> validated structured content
  -> optional approved n8n delivery/export
  -> result and audit trace
```

## 8. Phase 5 — Dashboard

### Objective

Provide a unified local operational control surface rather than only a chat
interface.

### Workstreams

- Task submission and structured result views.
- Active task, agent invocation, and workflow status views.
- Execution history, redacted logs, errors, and trace navigation.
- Agent, tool, model-profile, and permission inspection.
- Memory search, provenance, approval, and deletion controls.
- Pending approval queue with exact-action review.
- Usage, latency, reliability, and cost views.
- n8n integration and trigger configuration.
- Real-time status updates through a transport adapter.

### Acceptance criteria

- Every dashboard mutation uses the same application contracts and policy checks as
  other transports.
- Sensitive content and secrets are redacted according to policy.
- Approval decisions display the exact action, destination, and relevant payload.
- Users can inspect and delete persisted memory.
- Task, model, agent, and workflow metrics reconcile with stored execution records.
- Accessibility and critical task flows have automated coverage.

### Exit artifact

A local operational dashboard for running and governing the implemented system.

## 9. Phase 6 — Production Readiness

### Objective

Harden the system for reliable deployment and create the path from local single-user
operation to broader usage.

### Workstreams

- Expand unit, contract, integration, end-to-end, security, load, and evaluation
  coverage.
- Add production authentication, authorization, and secrets management.
- Define multi-user workspace and ownership migrations before enabling multi-user
  operation.
- Add Postgres and vector-store adapters only after repository conformance tests pass.
- Introduce deployment, health, backup, restore, and disaster-recovery procedures.
- Define service-level objectives and alerting.
- Harden webhook, file, tool, model, and n8n trust boundaries.
- Optimize latency, throughput, reliability, and model cost using measured data.
- Add contract deprecation and data-migration procedures.

### Acceptance criteria

- Threat modeling and security review cover all external boundaries.
- Restore tests demonstrate recovery of tasks, approved memory, configuration
  references, and audit state.
- New storage adapters pass the same behavior suites as local repositories.
- Multi-user isolation tests pass before multiple users are admitted.
- Load and failure testing meets documented service objectives.
- Model and agent evaluation regressions block release.
- Deployment and rollback are repeatable and documented.
- Audit, retention, deletion, and secret-rotation procedures are verified.

### Exit artifact

A deployable, recoverable, measurable system with an explicit path to multi-user
operation.

## 10. Cross-cutting testing strategy

### 10.1 Test layers

| Layer | Purpose |
| --- | --- |
| Unit | Pure routing, policy, state, validation, prompt assembly, and error behavior |
| Contract | Ensure adapters and agents conform to shared boundaries |
| Repository conformance | Run identical behavior tests against each storage adapter |
| Integration | Verify Model Gateway, SQLite, filesystem, and n8n boundaries |
| End-to-end | Prove user-visible workflows across real local modules |
| Evaluation | Measure agent quality, grounding, schema adherence, and regressions |
| Security | Exercise permissions, injection, callback forgery, path and secret handling |
| Resilience | Exercise timeout, retry, cancellation, restart, and dependency failure |
| Migration | Verify schema upgrades, rollback expectations, import, and export |

### 10.2 Determinism and live dependencies

Unit and contract tests must not require network access. Time, identifiers, model
responses, and adapter failures must be injectable. Live OpenAI and n8n tests are a
separate, explicitly configured suite and must never be required for ordinary local
unit testing.

Recorded fixtures must be sanitized, versioned with their contracts, and small enough
to review. Snapshot tests must not replace semantic assertions.

### 10.3 Agent evaluation

Agent evaluation sets must cover:

- representative supported content tasks;
- ambiguity and missing information;
- contradictory user, memory, and knowledge context;
- unsupported requests and safe refusal/clarification;
- structured-output adherence;
- source and memory provenance;
- prompt injection in retrieved content;
- sensitive-data leakage;
- tool and workflow permission boundaries;
- quality, latency, and normalized cost.

Evaluation thresholds must be recorded before release and compared by agent and model
profile version.

## 11. Performance Gates

These gates are initial engineering targets for the single-user, local-first
TypeScript/Node.js implementation. They are intended to catch regressions and guide
design validation on ordinary development hardware. They are not production service
level agreements and do not promise performance across every machine, network, model,
dataset, or external integration.

### 11.1 Initial targets

Unless a row states otherwise, latency targets are measured at the 95th percentile
(`p95`) on the warm path.

| Area | Measurement boundary | Initial local target |
| --- | --- | --- |
| Request intake latency | From receipt of a complete local request to a validated `RequestEnvelope` or validation error | `p95 <= 25 ms` |
| Core Brain routing latency | From a validated request and available context summary to a persisted routing decision, using the local registry and policy evaluator | `p95 <= 50 ms`; model-assisted classification is measured separately |
| Memory retrieval latency | From a permitted memory query to ranked excerpts returned from the local store | `p95 <= 100 ms` for up to 50 results over the reference dataset |
| Agent invocation overhead | Agent Runtime work before provider dispatch plus work after provider response, excluding model, tool, memory, and output-validation time | `p95 <= 75 ms` total |
| Structured output validation latency | Parse and runtime-schema validation of an agent result up to 256 KiB | `p95 <= 20 ms` |
| n8n workflow dispatch latency | From an authorized, persisted `WorkflowRequest` to acknowledgement by a locally running n8n instance | `p95 <= 250 ms`, excluding workflow execution |
| Dashboard response time | From a common local read request to a complete response for task, agent, memory, workflow, or approval views | `p95 <= 200 ms`; initial dashboard load should become interactive within 1.5 seconds |
| End-to-end content workflow latency | From request acceptance to validated Content Agent output for the reference content task | `p95 <= 20 seconds` with a healthy configured model provider; `p95 <= 21 seconds` through optional local n8n acknowledgement |
| Maximum retry budget | Combined attempts at one boundary within one task step | No more than 2 retries after the initial attempt, no more than 5 seconds cumulative backoff, and never beyond the task deadline |
| Maximum local storage query time | One ordinary indexed SQLite query, excluding semantic ranking and migrations | `p95 <= 50 ms` and no query over 250 ms in the reference workload |

Human approval time, external delivery completion, cold model-provider startup, and
third-party service processing are excluded from the end-to-end content target. Their
durations must still be recorded separately.

### 11.2 Reference workload

Performance results must state the hardware, operating system, Node.js version, build
mode, and storage location used. The initial repeatable workload uses:

- a production-style local build rather than a development watcher;
- one local Node.js process and SQLite on a local solid-state drive;
- a locally reachable n8n instance for dispatch measurements;
- up to four concurrent active tasks;
- 10,000 stored tasks with related results and audit events;
- 100,000 memory and knowledge records with appropriate indexes;
- memory retrieval limited to 50 returned excerpts;
- structured agent results no larger than 256 KiB;
- a representative content request producing no more than 1,500 words and using no
  more than 10 retrieved context excerpts.

Datasets must be deterministic, sanitized, and versioned with the benchmark. A phase
may add a larger workload, but it must continue reporting the baseline so regressions
remain visible.

### 11.3 Measurement and enforcement

- Each local component benchmark must include at least 20 warm-up operations followed
  by at least 200 measured operations.
- Results must report sample count, median, `p95`, maximum, and failure count.
- Benchmarks must isolate the timing boundary described in the target table.
- Automated tests use deterministic model and workflow adapters to gate local
  orchestration overhead.
- Live OpenAI and n8n measurements run as explicitly configured integration
  benchmarks; provider latency must not be mistaken for local overhead.
- Retries must share one step-level budget. Nested modules must not multiply the
  allowed number of attempts.
- Storage migrations and cold startup are measured separately and must not be hidden
  inside steady-state query results.
- A target becomes a required phase-exit gate when its owning feature is implemented:
  Core Brain targets in Phase 2, memory and content targets in Phase 3, n8n targets in
  Phase 4, and dashboard targets in Phase 5.

If a gate cannot be met on the documented reference environment, the phase may not be
declared complete until the regression is fixed or the target is deliberately revised
with benchmark evidence and an architectural review.

## 12. Definition of done for implementation work

An implementation increment is done only when:

- behavior and boundaries match the approved documentation;
- public and stored contracts are runtime-validated;
- tests cover success, denial, and relevant failure paths;
- formatting, linting, type checking, and tests pass;
- logs and errors contain correlation identifiers and no secrets;
- configuration and migrations are documented;
- permissions and side effects have been reviewed;
- no unfinished placeholder or disabled failing test is shipped;
- user-facing behavior and operator steps are documented;
- the increment is small enough to review and revert safely.

## 13. Deferred scope

The following are deliberately deferred, not removed from the vision:

- multi-user authentication and workspace administration;
- distributed workers and cross-machine task queues;
- Postgres as the primary database;
- vector database infrastructure;
- autonomous agent-to-agent communication;
- broad production agent catalog;
- dashboard implementation before the operational APIs are stable;
- production deployment and disaster recovery before the local vertical slice is
  validated.

All current contracts retain actor, workspace, version, permission, and provenance
fields so these capabilities can be added without discarding the foundational model.
