# MV AI OS Architecture

## 1. Purpose and authority

This document turns the architecture described in `README.md` into implementation-ready
module boundaries and contracts. The README remains the source of truth for the product
vision and high-level system design. This document is authoritative for implementation
details that the README leaves open.

The keywords **must**, **must not**, **should**, and **may** are normative.

## 2. Architectural objectives

MV AI OS is a modular operating layer that coordinates users, OpenAI models, specialized
agents, memory, tools, and n8n workflows. Its architecture must preserve:

- clear separation between reasoning and deterministic execution;
- replaceable agents, model configurations, persistence adapters, and integrations;
- durable but scoped context;
- observable execution with human control over sensitive actions;
- structured, testable communication between modules;
- incremental delivery without coupling the system to its initial local deployment.

The initial system is single-user and local-first. It must nevertheless carry explicit
actor, workspace, ownership, and permission fields at boundaries so that later
multi-user support does not require replacing core contracts.

## 3. Approved foundation decisions

| Area | Phase 1 decision |
| --- | --- |
| Runtime | TypeScript on Node.js |
| Module style | Strict TypeScript with ECMAScript modules |
| Initial operating mode | Single-user and local-first |
| External side effects | Owned by n8n by default |
| Direct tool use | Allowed only by an explicit agent and policy grant |
| Local persistence | JSON-compatible records behind SQLite-friendly repositories |
| Future persistence | Replaceable adapters for Postgres and a vector database |
| Initial workflow | Business/content request routed to a Content Agent, enriched by memory and knowledge, returned as structured output, and optionally delivered or exported by n8n |
| Model access | Centralized model gateway using OpenAI models initially |

Node.js and dependency versions must be pinned in repository configuration when
implementation begins. Secrets must never be committed to configuration files.

## 4. System context and execution flow

The canonical flow is:

```text
User or external event
  -> Request Intake
  -> Core Brain
  -> Context Assembly
  -> Agent Selection and Invocation
  -> Structured Agent Result
  -> Optional n8n Workflow
  -> Validated Result
```

Memory, knowledge, model access, policy checks, tools, and observability support this
flow. They are not alternative paths around the Core Brain.

For the initial workflow:

1. Request Intake validates and normalizes a business/content request.
2. The Core Brain creates a task and retrieves permitted memory and knowledge.
3. The router selects the Content Agent from the agent registry.
4. The Content Agent produces a schema-valid content result and may propose a
   delivery or export operation.
5. The Core Brain validates the result and evaluates the proposed operation.
6. If permitted, the workflow adapter invokes n8n with an idempotent request.
7. The Core Brain returns the content result, workflow status, and trace reference.

An optional workflow must not prevent the generated content from being represented as
a valid result. If delivery fails, the task result must distinguish content generation
success from delivery failure.

## 5. Architectural boundaries

The names below describe logical modules. Physical directories may group related
modules, but implementations must preserve these dependency boundaries.

### 5.1 Request Intake

Request Intake is the boundary for user requests, webhooks, schedules, and future
dashboard submissions.

It must:

- authenticate or assign the local actor;
- validate size, required fields, and supported contract version;
- generate or preserve request and correlation identifiers;
- normalize transport-specific input into a `RequestEnvelope`;
- reject malformed input before orchestration begins.

It must not contain routing, prompt, agent, memory, or workflow business logic.

### 5.2 Core Brain

The Core Brain is the control plane. It owns:

- task creation and state transitions;
- intent classification and task decomposition;
- context retrieval requests and prompt assembly coordination;
- agent and model selection;
- policy, permission, and approval enforcement;
- invocation deadlines and cancellation;
- structured result validation and response synthesis;
- retry, failure, and escalation decisions;
- audit event emission.

The Core Brain must not absorb domain-specific agent behavior, directly access storage
internals, or perform external side effects outside an explicitly approved direct-tool
path.

### 5.3 Agent Registry and Agent Runtime

The registry stores validated agent manifests and resolves agent identifiers and
versions. The runtime invokes agents through the common contracts defined here and in
`AGENTS.md`.

The runtime must isolate each invocation's prompt, context, permissions, timeout, and
tool access. Agents must not call one another directly; all handoffs pass through the
Core Brain so that policy and context boundaries are reapplied.

### 5.4 Model Gateway

The Model Gateway is the only normal path from orchestration or agents to OpenAI
models. It owns:

- named model profiles rather than model names embedded in agents;
- request construction and structured-output settings;
- timeout, retry, rate, and cost controls;
- usage normalization;
- provider error normalization;
- model-call telemetry with sensitive-content redaction.

Agents request a capability profile such as `routing-fast` or `content-quality`; they
must not hard-code model identifiers, API keys, or provider-specific retry behavior.

### 5.5 Memory Service

The Memory Service owns lifecycle, retrieval, and governance for working,
conversation, semantic, operational, and user memory. It exposes repository-neutral
operations and returns only records permitted for the current actor, workspace, task,
and agent.

Agents receive selected memory, not unrestricted repository access. Persistent writes
are proposals until validated by the Core Brain and Memory Service.

### 5.6 Knowledge Service

The Knowledge Service provides searchable source material and provenance. In the
initial local implementation it may use JSON metadata, SQLite text search, and file
references. Its query and result contracts must remain suitable for later vector
retrieval.

Knowledge records are source material; memory records are retained system context.
The two may refer to each other but must not be silently merged.

### 5.7 Tool Gateway

The Tool Gateway exposes approved, typed tools. Tool definitions declare whether an
operation is read-only or side-effecting.

- Read-only tools may be granted directly to an agent.
- Side-effecting tools default to n8n execution.
- Direct side-effecting tool access requires an explicit manifest grant and a matching
  runtime policy grant.
- Every direct tool call must be validated and audited.

Possession of a tool implementation does not grant an agent permission to invoke it.

### 5.8 n8n Workflow Adapter

The adapter is the sole integration boundary between the Core Brain and n8n. It must:

- map a `WorkflowRequest` to an authenticated n8n invocation;
- validate workflow names against an allowlist;
- attach correlation and idempotency identifiers;
- distinguish accepted, running, succeeded, failed, and unknown outcomes;
- normalize n8n errors into the system error contract;
- verify callbacks before accepting status changes;
- preserve enough metadata for retry and audit.

n8n owns external delivery and export side effects by default. n8n workflow internals
must not become part of agent prompts or agent contracts.

### 5.9 Persistence Adapters

All durable storage access must pass through repository interfaces. Domain and
orchestration modules must not contain SQL, filesystem paths, or database-specific
types.

The initial adapter should use SQLite for transactional task, memory, audit, and
workflow state. JSON remains the interchange, fixture, configuration, import, and
export format. The system must not require dual writes to JSON and SQLite as separate
sources of truth.

Records must be serializable without loss into JSON-compatible values. Schema version
and migration history must be stored with durable records.

### 5.10 Configuration and Policy

Configuration provides validated runtime settings, named model profiles, storage
locations, registered workflows, limits, and feature flags. Policy evaluates actor,
agent, tool, memory, workflow, and approval permissions.

Configuration determines what exists; policy determines what is allowed for a
particular execution. Neither belongs inside prompts.

### 5.11 Observability and Audit

Observability records diagnostic logs, metrics, traces, and model usage. Audit records
security- and outcome-relevant events. Audit events must be append-only through the
application boundary.

Logs may be sampled or redacted. Audit events must retain event type, time, actor,
task, action, outcome, and correlation identifiers without storing secrets or full
prompt content by default.

## 6. Dependency rules

Dependencies point inward toward contracts and domain types:

```text
Transport adapters ─┐
Agent adapters ─────┼─> Application orchestration ─> Domain contracts
Model adapter ──────┤
Storage adapters ───┤
n8n adapter ────────┘
```

The following rules are mandatory:

1. Domain contracts do not import transport, model-provider, database, or n8n types.
2. The Core Brain depends on interfaces, not concrete adapters.
3. Agents depend on the invocation contract and granted capabilities only.
4. Adapters may translate external types but must not leak them across their boundary.
5. Cross-module communication uses versioned structured contracts.
6. Circular module dependencies are prohibited.

## 7. Common contract conventions

All boundary contracts use these conventions:

- `contractVersion` is a required string and begins at `"1"`.
- Identifiers are opaque strings and must not encode mutable business meaning.
- Timestamps are UTC RFC 3339 strings.
- Optional fields are omitted rather than populated with ambiguous sentinel values.
- Extensible metadata is JSON-compatible and size-limited.
- Unknown contract versions are rejected explicitly.
- Stored records also carry a separate persistence `schemaVersion`.
- Public errors never include secrets, credentials, raw stack traces, or unredacted
  provider responses.

The local system uses stable identifiers for:

- `workspaceId`: initially the configured local workspace;
- `actorId`: initially the configured local user;
- `sessionId`: a conversation or interaction session;
- `requestId`: one accepted input;
- `taskId`: one orchestrated objective;
- `invocationId`: one agent attempt;
- `workflowRunId`: one n8n execution;
- `correlationId`: the trace joining all related activity.

## 8. Core contracts

The following tables define the minimum fields. Implementations may add optional
fields without changing the meaning of required fields.

### 8.1 RequestEnvelope

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contractVersion` | string | yes | Contract version |
| `requestId` | string | yes | Idempotent intake identifier |
| `correlationId` | string | yes | End-to-end trace identifier |
| `workspaceId` | string | yes | Ownership boundary |
| `actorId` | string | yes | Requesting actor |
| `sessionId` | string | no | Conversation scope |
| `receivedAt` | timestamp | yes | Intake time |
| `source` | enum | yes | `local`, `api`, `webhook`, `schedule`, or `dashboard` |
| `taskType` | string | yes | Initial value: `business.content` |
| `instruction` | string | yes | User objective |
| `input` | object | no | Structured source data |
| `constraints` | object | no | Audience, tone, length, format, deadline, or other limits |
| `requestedOutput` | object | yes | Requested result format |
| `requestedWorkflow` | object | no | Optional delivery/export intent, not authorization |

Reusing a `requestId` with the same normalized payload must return or resume the same
task outcome. Reusing it with a different payload must fail with an idempotency error.

### 8.2 TaskRecord

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `taskId` | string | yes | Task identifier |
| `requestId` | string | yes | Originating request |
| `correlationId` | string | yes | Trace identifier |
| `workspaceId` | string | yes | Ownership boundary |
| `actorId` | string | yes | Initiating actor |
| `state` | enum | yes | Current state from the task state machine |
| `intent` | object | no | Validated classification and confidence |
| `plan` | object | no | Ordered, bounded execution steps |
| `selectedAgent` | object | no | Agent identifier and version |
| `attemptCount` | integer | yes | Orchestration attempt count |
| `createdAt` | timestamp | yes | Creation time |
| `updatedAt` | timestamp | yes | Last state change |
| `resultRef` | string | no | Durable result reference |
| `error` | ErrorRecord | no | Terminal or current error |

### 8.3 TaskResponse

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contractVersion` | string | yes | Contract version |
| `requestId` | string | yes | Originating request |
| `taskId` | string | yes | Orchestrated task |
| `correlationId` | string | yes | Trace identifier |
| `status` | enum | yes | `completed`, `needs_input`, `awaiting_approval`, `failed`, or `cancelled` |
| `result` | object | conditional | Validated agent output when available |
| `workflow` | WorkflowResult | no | Optional delivery/export status |
| `approvals` | array | yes | Relevant approval references; empty when none |
| `warnings` | array | yes | Degraded-operation or non-fatal warnings |
| `error` | ErrorRecord | conditional | Required for a failed response |
| `createdAt` | timestamp | yes | Task creation time |
| `updatedAt` | timestamp | yes | Latest represented state |

The response must not expose internal prompts, hidden reasoning, secrets, raw provider
responses, or unrestricted memory content. A successful content result may coexist
with a failed optional `workflow`.

### 8.4 AgentInvocation

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contractVersion` | string | yes | Contract version |
| `invocationId` | string | yes | Unique attempt |
| `taskId` | string | yes | Parent task |
| `correlationId` | string | yes | Trace identifier |
| `agent` | object | yes | Agent identifier and version |
| `objective` | string | yes | Bounded objective for this invocation |
| `input` | object | yes | Validated task input |
| `context` | object | yes | Selected conversation, memory, and knowledge excerpts |
| `permissions` | string array | yes | Effective capability grants |
| `outputContract` | object | yes | Required structured result shape |
| `limits` | object | yes | Deadline, model profile, token/cost, and tool limits |
| `attempt` | integer | yes | Attempt number |

### 8.5 AgentResult

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contractVersion` | string | yes | Contract version |
| `invocationId` | string | yes | Source invocation |
| `taskId` | string | yes | Parent task |
| `agent` | object | yes | Producing agent identifier and version |
| `status` | enum | yes | `succeeded`, `needs_input`, `needs_approval`, or `failed` |
| `output` | object | conditional | Required when succeeded |
| `evidence` | array | yes | Knowledge or memory references used |
| `memoryProposals` | array | yes | Proposed writes; empty when none |
| `workflowProposal` | object | no | Proposed n8n operation |
| `usage` | object | no | Normalized model/tool usage |
| `error` | ErrorRecord | conditional | Required when failed |
| `completedAt` | timestamp | yes | Completion time |

Successful output must validate against the invocation's `outputContract`. Text that
cannot be parsed or validated is not a successful structured result.

### 8.6 WorkflowRequest

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `contractVersion` | string | yes | Contract version |
| `workflowRequestId` | string | yes | Internal workflow request |
| `taskId` | string | yes | Parent task |
| `correlationId` | string | yes | Trace identifier |
| `workflowName` | string | yes | Allowlisted logical workflow |
| `operation` | enum | yes | Initially `deliver` or `export` |
| `payload` | object | yes | Validated content and destination data |
| `idempotencyKey` | string | yes | Stable key for the external effect |
| `requestedBy` | object | yes | Actor and proposing agent |
| `approval` | object | yes | Requirement and current decision |
| `timeoutMs` | integer | yes | Bounded wait time |

A workflow request is executable only after policy evaluation and any required
approval. The workflow adapter must not accept an agent-generated workflow name that
is absent from configured policy.

### 8.7 WorkflowResult

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `workflowRequestId` | string | yes | Originating request |
| `workflowRunId` | string | no | n8n execution identifier |
| `status` | enum | yes | `accepted`, `running`, `succeeded`, `failed`, or `unknown` |
| `output` | object | no | Sanitized workflow output |
| `externalRefs` | array | no | Delivery/export references safe to expose |
| `error` | ErrorRecord | no | Normalized failure |
| `updatedAt` | timestamp | yes | Status time |

### 8.8 ApprovalRecord

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `approvalId` | string | yes | Approval identifier |
| `taskId` | string | yes | Parent task |
| `action` | object | yes | Exact proposed action and material parameters |
| `riskLevel` | enum | yes | `low`, `medium`, or `high` |
| `state` | enum | yes | `pending`, `approved`, `rejected`, `expired`, or `cancelled` |
| `requestedAt` | timestamp | yes | Request time |
| `expiresAt` | timestamp | no | Expiry time |
| `decidedBy` | string | no | Actor making the decision |
| `decidedAt` | timestamp | no | Decision time |
| `reason` | string | no | Human or policy rationale |

Approval applies only to the exact action recorded. Material payload or destination
changes require a new approval.

### 8.9 ErrorRecord

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `code` | string | yes | Stable machine-readable code |
| `category` | enum | yes | Error category |
| `message` | string | yes | Safe human-readable summary |
| `retryable` | boolean | yes | Whether policy may retry |
| `stage` | string | yes | Failing boundary |
| `details` | object | no | Sanitized structured details |
| `causeRef` | string | no | Internal diagnostic reference |
| `occurredAt` | timestamp | yes | Failure time |

Error categories are `validation`, `policy`, `authentication`, `authorization`,
`not_found`, `conflict`, `rate_limit`, `timeout`, `dependency`, `model`,
`persistence`, `workflow`, `cancelled`, and `internal`.

### 8.10 AuditEvent

An audit event must contain `eventId`, `eventType`, `correlationId`, `workspaceId`,
`actorId`, optional `taskId`, optional `subject`, `action`, `outcome`, sanitized
`metadata`, and `occurredAt`.

At minimum the system audits request acceptance/rejection, routing decisions,
permission decisions, persistent memory writes, direct tool calls, approval changes,
workflow requests/results, task completion/failure, and configuration changes.

## 9. Task state machine

Allowed states are:

```text
received
  -> validated
  -> context_ready
  -> routed
  -> running
  -> awaiting_input | awaiting_approval | workflow_pending
  -> completed
```

`failed` and `cancelled` are terminal states reachable from any active state.
`awaiting_input` may return to `validated`; `awaiting_approval` advances to
`workflow_pending` when approved or to `completed` with no workflow execution when
rejected, expired, or cancelled. `workflow_pending` advances to `completed` when the
optional workflow reaches a terminal outcome, including a recorded delivery failure.

State changes must be persisted atomically with their audit event. Invalid transitions
must fail rather than be silently coerced.

## 10. Permission and approval model

The permission model is default-deny even in local single-user mode.

Effective permission is the intersection of:

1. permissions available to the local actor and workspace;
2. permissions declared by the agent manifest;
3. permissions allowed by runtime policy;
4. permissions granted for the current task;
5. any explicit human approval.

Initial capability names use namespaced strings:

- `memory:read:working`
- `memory:read:conversation`
- `memory:read:semantic`
- `memory:read:user`
- `memory:write:proposal`
- `knowledge:search`
- `model:invoke:<profile>`
- `tool:read:<tool-name>`
- `tool:execute:<tool-name>`
- `workflow:propose:<workflow-name>`
- `workflow:execute:<workflow-name>`

Agents may propose operations they cannot execute. A proposal never expands the
agent's permissions.

Human approval is required when configured policy marks an action sensitive,
irreversible, externally visible, high-cost, or outside a previously approved scope.
The initial Content Agent may propose delivery/export, but policy and n8n execute it.

## 11. Memory and knowledge rules

### 11.1 Memory categories

| Category | Scope | Default retention | Purpose |
| --- | --- | --- | --- |
| Working | Task and invocation | Until task completion plus diagnostic window | Active plan, intermediate state |
| Conversation | Session and actor | Configurable local retention | Relevant interaction history |
| Semantic | Workspace and actor | Persistent until deleted or expired | Searchable facts and learned context |
| Operational | Task and system | Configurable audit/operations retention | Outcomes, failures, performance |
| User | Actor | Persistent until changed or deleted | Explicitly approved preferences and settings |

Retention durations are configuration values and must have safe documented defaults
when implementation begins.

### 11.2 MemoryRecord

A durable memory record must contain:

- `memoryId`, `schemaVersion`, `category`, and `content`;
- `workspaceId`, `ownerId`, and access scope;
- optional `sessionId` and `taskId`;
- provenance describing user input, agent proposal, workflow result, or import;
- creation and update timestamps;
- optional expiry and deletion timestamps;
- sensitivity labels and permission tags;
- searchable text or embedding status;
- confidence and verification state where content represents a fact.

### 11.3 Read rules

Memory retrieval must:

1. filter by workspace, actor, permission, category, and retention before ranking;
2. apply task relevance and configurable result limits;
3. return provenance and memory identifiers with excerpts;
4. exclude deleted, expired, or disallowed records;
5. record the identifiers used by an invocation.

Prompt text must be treated as untrusted content regardless of whether it came from
memory or knowledge.

### 11.4 Write rules

- Working-memory updates may be written as part of task-state transactions.
- Conversation-memory writes must be relevant to the session.
- Semantic-memory writes require provenance and validation.
- Operational memory is written by trusted system modules, not model-generated text.
- User memory stores only preferences or settings explicitly approved by the user.
- Agents submit `memoryProposals`; they do not persist durable memory directly.
- Secrets, credentials, raw authentication data, and unnecessary sensitive content
  must not be written to memory.
- Users must be able to inspect and delete persisted local memory.

### 11.5 Migration path

Repository interfaces must support filtering and pagination without relying on a
specific database. Semantic records may initially use local text search. Adding vector
embeddings must preserve record identifiers, provenance, and authorization filtering.
Migration to Postgres or a vector database must be adapter and data-migration work, not
a change to agent contracts.

## 12. Error handling and resilience

Every boundary must catch implementation-specific failures and return an
`ErrorRecord`. The original diagnostic cause may be logged behind a protected
`causeRef`, but must not cross public or agent boundaries.

Retries are allowed only when:

- the error is marked retryable;
- the operation is idempotent or has not begun its external side effect;
- the retry budget and deadline have not been exhausted;
- policy permits the retry.

Validation, permission, and approval rejection errors are not automatically retried.
Model-format failures may receive a bounded repair attempt. Workflow retry uses the
same idempotency key. Unknown workflow status must be reconciled before another
external execution is started.

Failures in memory enrichment should be reported and may allow a degraded result only
when policy marks the missing context optional. Permission evaluation, result
validation, and required audit persistence must fail closed.

## 13. Configuration and secrets

Configuration precedence is:

1. versioned non-secret defaults;
2. local configuration files;
3. environment overrides;
4. explicit runtime overrides permitted by policy.

Configuration must be validated once during startup and represented as typed,
immutable runtime settings. Unknown critical keys and invalid combinations must stop
startup with a clear error.

Secrets are loaded from environment variables or a future secret-provider adapter.
They must be redacted from logs, errors, model prompts, stored task records, and
exports.

## 14. Observability requirements

Each request must be traceable by `correlationId` across intake, task state, memory
retrieval, agent invocation, model calls, approvals, tools, and n8n.

Initial metrics must include:

- request and task counts by outcome;
- routing and agent invocation latency;
- model usage, latency, and normalized cost where available;
- structured-output validation failures;
- memory retrieval count and latency;
- workflow outcome and retry count;
- approval wait time;
- errors by category and stage.

Diagnostic output must support local operation without requiring an external
telemetry service. Export adapters may be added later.

## 15. Security and trust boundaries

The user, local process, model provider, local storage, tool implementations, n8n, and
external destinations are separate trust boundaries.

The initial implementation must:

- bind network listeners to local interfaces by default;
- authenticate n8n requests and verify callbacks;
- validate all model, tool, file, webhook, and workflow data;
- prevent path traversal outside configured local roots;
- enforce payload and execution limits;
- redact secrets and sensitive values;
- treat retrieved content as data, not executable instructions;
- preserve audit history for permissioned and externally visible actions.

Single-user mode removes account administration from the first release; it does not
remove authorization, input validation, or audit requirements.

## 16. Architectural testing obligations

Every adapter must have contract tests against its interface. The Core Brain must be
testable with deterministic fake adapters. Persistence adapters must run the same
repository behavior suite. Workflow tests must prove idempotency and callback
verification. Agent tests must prove schema validity and permission isolation.

The complete strategy and phase gates are defined in `ROADMAP.md`.

## 17. Initial vertical-slice completion criteria

The architecture is validated when an automated end-to-end test can:

1. accept a valid `business.content` request;
2. create a durable task and correlation trace;
3. retrieve only permitted memory and knowledge;
4. route to the registered Content Agent;
5. produce and validate the Content Agent output contract;
6. record evidence and govern any memory proposals;
7. return the result without requiring a workflow;
8. optionally submit an approved, idempotent delivery/export request to n8n;
9. represent content success independently from delivery status;
10. expose a complete, redacted audit trail;
11. handle invalid input, denied permission, model failure, storage failure, and n8n
    failure according to the contracts above.

No dashboard, multi-user identity system, distributed execution, Postgres adapter, or
vector database is required to validate this first slice.
