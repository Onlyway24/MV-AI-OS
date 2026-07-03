# MV AI OS Master Roadmap

## Purpose

This roadmap starts from verified repository state and ends at a production-ready MV
AI OS. It complements the product roadmap in `docs/ROADMAP.md` without replacing its
authority. Status must be updated after every completed milestone.

## Phase 0 — Architecture and engineering baseline

**Objective:** Establish authoritative architecture, agent rules, strict TypeScript,
contract conventions, and deterministic quality gates.

**Deliverables:**

- Product architecture, agent specification, and delivery roadmap.
- Strict ESM TypeScript project.
- Lint, typecheck, test, and build commands.
- Permanent project-state memory documents.

**Dependencies:** None.

**Completion criteria:**

- Architecture boundaries and engineering rules are recorded.
- Quality gates run locally.
- Project state and next task can be recovered without chat history.

**Status:** Complete.

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

**Status:** In progress. SQLite-backed task, request, audit, and memory persistence,
schema migrations, conformance, rollback, restart replay, retention, and soft deletion
are complete. The next milestone is durable SQLite knowledge persistence, specified
in `04_NEXT_TASK.md`.

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

**Status:** Not started.

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

**Status:** Not started.

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
