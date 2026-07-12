# MV AI OS Master Roadmap

## Purpose

This roadmap starts from verified repository state and ends at a production-ready MV
AI OS. It complements the product roadmap in `docs/ROADMAP.md` without replacing its
authority. Status must be updated after every completed milestone.

## Controlled Telegram Operator Console — Phase 1

**Objective:** Provide a dedicated-bot, single-private-chat, local operator transport
without personal-account access or autonomous execution.

**Status:** In progress. The Telegram personal privacy boundary is authoritative;
Developer Control Plane is Phase 2 and has not started. Workflow Specification
Admission Boundary is paused, not deleted. Phase 1B Checkpoints A, B, and C are complete: exact
versioned Founder/Brand profiles and a narrow versioned policy profile are resolved
through immutable registries, profile substitution fails closed, every
`FounderMissionBrief` field has documented provenance, and a deterministic conversion
context is reviewable and confirmation-bound; draft operations are durable and
replay-safe; and one authorized session/draft pair now advances atomically with exact
one-use callback bindings. Checkpoint D delivers the complete guided `/mission`
Mission Planning Console: structured collection, review, separate data and planning
confirmations, deterministic Mission validation/planner/Quality Gate, and restart-safe
Italian result presentation. It creates no Workflow; Phase 1C Workflow controls remain
unstarted.

## Phase 0 — Architecture and engineering baseline

**Objective:** Establish authoritative architecture, agent rules, strict TypeScript,
contract conventions, and deterministic quality gates.

**Deliverables:**

- Product architecture, agent specification, and delivery roadmap.
- Strict ESM TypeScript project.
- Lint, typecheck, test, and build commands.
- Permanent project-state memory documents.
- Permanent MV AI OS Constitution as the highest-level strategic and engineering
  doctrine for future sessions.

**Dependencies:** None.

**Completion criteria:**

- Architecture boundaries and engineering rules are recorded.
- Quality gates run locally.
- Project state and next task can be recovered without chat history.
- Future implementation prompts have a durable constitution that explains vision,
  founder/operator model, one-assistant doctrine, control-plane ordering,
  safety/cost/backup/secret principles, forbidden shortcuts, and production-readiness
  criteria.

**Status:** Complete. The MV AI OS Constitution has been added as a documentation-only
authority above project-state continuity documents. It changes no runtime behavior and
does not alter the current roadmap direction.

## Phase 1 — Orchestration kernel

**Objective:** Execute validated requests through a deterministic, audited,
repository-backed Core Brain.

**Deliverables:**

- request, task, plan, routing, execution-context, agent invocation/result, response,
  error, and audit contracts;
- Core Brain state machine and registry router;
- in-process Agent Runtime and deterministic Content Agent;
- repository interfaces, atomic lifecycle, idempotency, replay, and conflict handling;
- default-deny policy and policy-derived permissions;
- memory context enrichment.

**Dependencies:** Phase 0.

**Completion criteria:**

- A deterministic content request reaches a validated response.
- Task transitions, idempotency, policy, audit, and failure paths are tested.
- Core Brain remains adapter-neutral and dependency-injected.

**Status:** Complete.

## Phase 2 — Governed capability foundations

**Objective:** Define replaceable, validated boundaries for knowledge, models,
agents, workflows, and tools before integrating real providers or side effects.

**Deliverables:**

- Knowledge Service and repository boundary.
- Provider-neutral Validated LLM Gateway.
- Agent Specification System.
- Workflow Specification System.
- Non-executing Tool Gateway.
- Deterministic test registries and providers.

**Dependencies:** Phase 1 contracts and policy.

**Completion criteria:**

- Every public boundary is runtime validated.
- Registries reject duplicates and return immutable deterministic data.
- Policy denial prevents knowledge and tool adapter access.
- No external provider or side effect is required.

**Status:** Complete as foundations; runtime composition remains in Phase 3.

## Phase 3 — First production-grade vertical execution slice

**Objective:** Compose existing boundaries so one governed content task uses
permitted memory and knowledge, an exact Agent Specification, and the provider-neutral
LLM Gateway before returning a validated, audited result.

**Deliverables:**

- policy-gated Knowledge Service context enrichment;
- production Content Agent specification and versioned instructions;
- model-backed Content Agent using `LlmGateway`;
- deterministic end-to-end composition tests through Core Brain;
- explicit proof that tools and workflows remain unused when not requested.

**Dependencies:** Phases 1 and 2.

**Completion criteria:**

- A request traverses validation, persistence, routing, policy, memory, knowledge,
  exact agent specification resolution, model gateway, result validation, audit, and
  response synthesis.
- Missing model permission prevents model access.
- Missing knowledge permission prevents knowledge repository access.
- Model failures and malformed model output produce normalized failed results.
- No network or external side effect occurs.

**Status:** Complete. The deterministic integration suite proves the full governed
slice without external providers or side effects.

## Phase 4 — Durable local runtime

**Objective:** Replace test-only state with a recoverable local runtime while
preserving repository and provider boundaries.

**Deliverables:**

- validated configuration and secret-reference loading;
- SQLite adapters for task, request, audit, memory, knowledge metadata, and approval
  state;
- schema migrations, backup-safe paths, and repository conformance;
- application composition root and local CLI/process entry point;
- restart, recovery, retention, deletion, and backup/restore tests.

**Dependencies:** Phase 3 proves the composed runtime.

**Completion criteria:**

- Restart preserves tasks, audit history, approved memory, and knowledge metadata.
- All adapters pass existing conformance suites.
- No domain or Core module imports storage-specific types.
- Local configuration starts deterministically and rejects invalid settings.

**Status:** Complete for the current local foundation. SQLite-backed task, request,
audit, memory, and knowledge persistence, forward migrations, conformance, restart
recovery, the validated local runtime composition root, the controlled local CLI,
controlled local SQLite backup/restore, controlled local application configuration,
and controlled local secret resolution are complete. The local runtime now has
bounded request intake, structured output, deterministic replay, graceful process
shutdown, verified recovery, explicit configuration input, and an ephemeral local
credential-resolution boundary. The next milestone moves into Phase 5 production
model capability, specified in `04_NEXT_TASK.md`.

## Phase 5 — Production model capability

**Objective:** Add an initial real model adapter without leaking provider-specific
types into agents or Core Brain.

**Deliverables:**

- provider adapter behind `ModelProvider`;
- credential-reference and secret-redaction integration;
- timeouts, retry budgets, rate and cost controls;
- model telemetry and structured-output evaluation;
- deterministic offline tests plus explicitly separated provider integration tests.

**Dependencies:** Durable configuration from Phase 4.

**Completion criteria:**

- Content Agent uses only `LlmGateway`.
- Provider failures remain normalized and safe.
- Cost, timeout, output, and permission limits are enforced.
- No API key enters source, logs, prompts, or public errors.

**Status:** In progress. The first production OpenAI Responses API provider adapter
is implemented behind `ModelProvider` with validated configuration, ephemeral
credential input, injectable transport, deterministic offline tests, and gateway
normalization coverage. Controlled local OpenAI provider wiring is complete, allowing
explicit `model-backed-openai` runtime composition with supplied secret references, a
resolver, and fake or production transport while preserving the deterministic offline
path. Controlled Model Operation Limits now bound provider invocation through
provider-neutral gateway controls for request size, output tokens, timeout, provider
call count, retry exhaustion, and reported usage/cost where available. Controlled
Model Usage Accounting now adds explicit provider-neutral pricing configuration and
deterministic estimated-cost calculation from validated model usage without storing
prompts, secrets, provider payloads, or raw diagnostics. Controlled Model Budget
Enforcement now adds explicit per-provider/model/profile requested-cost and
estimated-cost gates at the model gateway boundary without adding billing, telemetry,
dashboards, or durable ledgers. Cost Guardian Foundation now adds deterministic,
report-only, redaction-safe operator warnings from supplied sanitized cost signals
without autonomous action, alerts, scheduling, provider calls, or persistence.
Security Guardian Foundation now adds deterministic, report-only, redaction-safe
operator warnings from supplied sanitized safety-posture state without scanning the
disk, reading secrets, calling providers, or mutating runtime state. Backup Guardian
Foundation now adds deterministic, report-only, redaction-safe operator warnings from
supplied sanitized backup-readiness state without creating, restoring, uploading,
deleting, mutating, or scheduling backups. Incident Guardian Foundation now adds
deterministic, report-only, redaction-safe operator warnings from supplied sanitized
operational incident counters and guardian summaries without sending alerts, calling
external systems, scheduling work, or mutating state. Quality Guardian Foundation now
adds deterministic, report-only, redaction-safe operator warnings from supplied
sanitized output/process-quality signals without judging content with AI, calling
models, publishing, mutating outputs, sending alerts, scheduling work, or mutating
state. Operator Safety Report now adds deterministic, report-only, redaction-safe
aggregation of supplied guardian reports into one operator-facing safety summary
without dashboards, alerts, scheduling, autonomy, persistence, network, model calls,
or tool execution. Main Assistant / Orchestrator Specification Foundation now defines
Only Way Assistant declaratively on top of the existing Agent Specification boundary
with safety preflights, approval requirements, forbidden capabilities, and future
delegation policy, without adding full runtime orchestration. Main Assistant /
Orchestrator Runtime Boundary now adds a deterministic local invocation boundary
that validates operator input, consumes supplied Operator Safety context, refuses
unsafe or under-specified requests, surfaces approval requirements, and returns
redaction-safe operator-facing results without model calls, provider calls, tool
execution, workflow execution, storage, network behavior, autonomous loops, or
guardian execution. Guardian Consultation Boundary now adds a deterministic local
decision gate that consumes supplied Operator Safety state, requested escalation
categories, safety-to-autonomy posture, guardian coverage, and approval requirements
to produce redaction-safe may-continue, warning, confirmation, approval-required, or
blocked outcomes without running guardians, models, tools, workflows, persistence,
network behavior, scheduling, or autonomous action. Operator Decision Engine
Foundation now adds deterministic operator-facing decisioning from validated Only Way
Assistant specification identity, Guardian Consultation decisions, requested
operations, optional sanitized cost posture, and optional delegation signals into
proceed, clarification, approval, confirmation, refusal, blocked, or non-executing
mission-plan-candidate outcomes without executing agents, workflows, tools, models,
providers, persistence, network behavior, dashboards, or autonomous loops. Main
Assistant Delegation Policy Foundation now adds deterministic, redaction-safe,
non-executing delegation-policy evaluation for future specialist handoff proposals,
including allowed and forbidden categories, Guardian Consultation coverage, Operator
Safety requirements, approval markers, budget/security/backup/quality prerequisites,
max depth, and circular-delegation blocking without invoking agents or execution
layers. Main Assistant Operator Protocol now adds deterministic, redaction-safe,
operator-facing command responses for supplied decisions, approvals, clarifications,
refusals, blockers, safety checks, cost posture, next actions, and non-executing
mission/delegation summaries without adding UI, chat runtime, execution, network
behavior, or autonomy. The MV AI OS Constitution now records the permanent
strategic, product, safety, and engineering doctrine that future implementation
sessions must read before continuing. It is documentation-only and does not add
runtime behavior. Agent Company Specification Foundation now adds the deterministic,
validated, non-executing internal company map for Fabio's future specialist roles,
including business value, role boundaries, control-plane dependencies, approval
requirements, forbidden capabilities, memory/knowledge requirements, and future
AgentSpecification mappings. Initial Core Agent Specifications now add exact
experimental AgentSpecification
records for Research Agent, Business Agent, Content Director, Developer Agent, and
Knowledge Curator without adding runtime execution. Extended Business Agent
Specifications now add exact experimental AgentSpecification records and validated
business profiles for Publisher Agent, Sales Agent, Finance / Cost Analyst, Legal /
Risk Reviewer, and Customer Delivery Agent while preserving explicit approval
requirements and non-executing boundaries. Inter-Agent Responsibility Matrix now
defines deterministic ownership, support, consultation, approval-gate,
forbidden-role, and conflict-resolution boundaries across the Agent Company without
adding runtime execution. Agent Capability Registry now defines deterministic,
validated, non-executing capability ownership, support roles, approval requirements,
guardian requirements, future workflow compatibility, and future tool compatibility
for all ten Agent Company roles. Agent Permission Matrix now maps all current roles
and capabilities to deterministic, validated, non-executing permission declarations,
allowed planning scopes, forbidden action categories, approval requirements,
guardian requirements, future workflow/tool compatibility, default-deny posture, and
explicit no-runtime-grant boundaries. Agent Communication / Handoff Contracts now
define deterministic, validated, non-executing support, review, approval-preparation,
and escalation handoffs between Agent Company roles using exact role,
AgentSpecification, responsibility, capability, and permission references while
remaining redaction-safe and approval/guardian aware. Agent Company Readiness Review
now evaluates those supplied declarations together, fails closed on critical
cross-artifact gaps, and confirms that the current declaration set is `READY` for
non-executing mission planning without granting runtime access. The Agent Company
chapter is now closed: its declarative organization is complete, while agent,
workflow, tool, external-communication, publishing, payment, customer-delivery, and
autonomous legal/compliance execution remain intentionally absent. Founder Intent /
Mission Brief Foundation now provides a validated, deterministic, non-executing
objective boundary with explicit business value, deliverables, constraints, cost,
deadline, quality, originality, evidence, brand, approvals, assumptions, and
decision-blocking clarification policy. Mission Plan Contracts now define the full
review-only planning artifact with exact Agent Company mappings, dependencies,
handoffs, controls, outputs, effort/cost classes, success/failure/stop criteria, and
external-action denial while preserving existing runtime plan contracts. The
Deterministic Mission Planner now converts validated briefs into validated plans for
all ten mission types using the smallest sufficient declared team, explicit
assumptions, material clarification, and derived approval/guardian controls without
models or execution. Only Way Mission Quality Gate now evaluates those plans through
fixed 0–10 quality dimensions, an exact 82-point approval threshold, anti-slop and
safety-control checks, deterministic remediation, and redaction-safe immutable
reports without invoking models, agents, workflows, tools, persistence, or external
actions. The next Phase 5 milestone is the Mission Planning Scenario Lab, which will
exercise the validated brief-to-plan-to-quality path across representative safe and
failure cases without creating a runtime or execution capability. The Mission Planning
Scenario Lab now proves that path for every declared mission type, including expected
Agent Company selection, approval-ready and remediation outcomes, clarification,
rejection, conservative assumptions, proposal-only publication controls, and
redaction-safe blocked safety cases. The next milestone is a Local Mission Planning
Dry-Run Vertical Slice that will expose this existing validated chain through one
explicit local composition boundary without adding execution. The Local Mission
Planning Dry-Run Vertical Slice now provides that dependency-injected, validated,
redaction-safe boundary and distinguishes readiness, planning, and quality outcomes
without calling models, agents, workflows, tools, persistence, or external systems.
The next milestone is Mission Planning Sprint Review and Project-State Alignment.
The Mission Planning foundation is now closed: its contracts, planner, quality gate,
scenario evidence, and local non-executing dry-run are aligned with Git history and
project-state. Workflow Runtime Foundation now provides pure domain contracts,
deterministic transition rules, expected-version checks, and non-durable command
receipt replay. Workflow Persistence and Atomic Audit adds additive SQLite schema
version 4 repositories, validated records, durable instances and step state,
restart-safe receipt replay, optimistic versions, ordered redaction-safe events, and
whole-transaction rollback without adding work execution. Dependency Scheduler and
Step Readiness Engine now adds a transaction-bound, read-only evaluator that resolves
the exact durable definition and instance, checks exact snapshot version, evaluates
dependencies and explicit supplied approval/Guardian markers, and returns bounded,
immutable, redaction-safe findings in stable definition order. It creates no state
transition, receipt, event, authorization, or execution capability. Workflow Step
Execution Boundary now adds a second transaction-bound, read-only gate that
recomputes readiness, validates exact Agent Specification and Agent Company
declarations, enforces an exact default-deny policy decision, binds supplied Fabio
approval and Guardian evidence to the same workflow snapshot, and returns at most one
non-executing candidate. Durable Workflow Approval and Guardian Checkpoints now adds
SQLite schema version 5 exact-snapshot approval and Guardian records, linear
supersession, restart-safe replay, atomic checkpoint audit events, and a durable-only
candidate mode. It still performs no work and writes no workflow execution state. The
next milestone is Controlled Workflow Step AgentRuntime Invocation. Durable usage
ledgers,
aggregated budget windows, broader operational telemetry, live smoke-test gating,
autonomous guardians, dashboards, delegation execution, executable agent-company
runtime, runtime responsibility enforcement, executable permission enforcement,
mission planning, and full Main Assistant orchestration remain future work, with the
next milestone specified in `04_NEXT_TASK.md`.

## Phase 6 — Governed workflow and approval execution

**Objective:** Execute validated workflow specifications through Core Brain control
with durable approvals and no hidden side effects.

**Deliverables:**

- workflow execution state and runtime;
- exact Agent Specification resolution per step;
- condition evaluation and failure-policy application;
- durable approval records and decisions;
- idempotent n8n adapter for allowlisted external workflows;
- callback verification, reconciliation, retry, and audit.

**Dependencies:** Phases 4 and 5; existing workflow specifications and policy.

**Completion criteria:**

- No workflow or side effect executes without effective permission and required
  approval.
- Duplicate workflow requests cannot repeat an external effect.
- Content generation remains separately successful when delivery fails.
- Every transition and external boundary is audited.

**Status:** In progress. Core V1 closes the local deterministic execution slice: it
has validated domain state, durable atomic persistence, exact-version readiness and
candidate selection, durable approval/Guardian checkpoints, one exact deterministic
Content Director invocation, explicit outcome completion, bounded retry execution,
pause/resume/cancellation, explicit timeout evaluation, operator reports, and a thin
allowlisted CLI command boundary. It has no automatic scheduling or retry, workflow
specification admission path, approval UI/transport, autonomous Guardian evaluation,
callbacks, n8n, or external effects. The next milestone is Workflow Specification
Admission Boundary, which will connect an exact validated Workflow Specification to
the existing durable Core V1 Workflow path without adding execution autonomy.

## Phase 7 — Governed direct tools

**Objective:** Add only approved direct tools whose use cannot bypass policy,
approval, validation, idempotency, or audit.

**Deliverables:**

- tool provider/executor boundary;
- initial read-only tools;
- optional direct side-effecting tools only where architecture explicitly permits;
- input/output schema enforcement, deadlines, cancellation, and result size limits;
- tool-call audit and protected diagnostics.

**Dependencies:** Durable approvals and audit from Phase 6.

**Completion criteria:**

- Possessing a tool implementation never grants access.
- Read-only calls require matching effective permissions.
- Side-effecting calls require execute permission, approval, and idempotency.
- No tool can escape its declared input, output, timeout, or risk contract.

**Status:** Not started.

## Phase 8 — Operational interfaces

**Objective:** Expose the same application contracts through controlled local
transports and an operational dashboard.

**Deliverables:**

- authenticated local API/transport adapter;
- task submission and result views;
- task, agent, workflow, model, audit, memory, knowledge, and approval inspection;
- real-time status updates;
- accessible dashboard with redaction.

**Dependencies:** Phases 4 through 7.

**Completion criteria:**

- Every mutation passes through application policy and validation.
- Sensitive data is redacted.
- Users can inspect approvals, audit, memory provenance, and execution state.
- Dashboard state reconciles with durable repositories.

**Status:** Not started.

## Phase 9 — Production readiness

**Objective:** Make MV AI OS deployable, recoverable, measurable, secure, and ready
for controlled multi-user evolution.

**Deliverables:**

- authentication, authorization, workspace isolation, and secret rotation;
- observability, SLOs, alerting, load tests, and cost controls;
- threat model, security review, penetration and prompt-injection tests;
- deployment, health, rollback, backup, restore, and disaster recovery;
- Postgres/vector adapters only after conformance;
- contract compatibility, deprecation, and migration procedures;
- release-blocking agent/model evaluations.

**Dependencies:** All prior phases.

**Completion criteria:**

- Security and isolation tests pass.
- Restore and rollback are demonstrated.
- Performance and reliability meet documented objectives.
- Evaluations block regressions.
- Operational procedures are repeatable and reviewed.

**Status:** Not started.
