# Next Task

## Milestone name

Controlled Workflow Step AgentRuntime Invocation

## Goal

Invoke exactly one durable, policy-qualified workflow step candidate through the
existing AgentRuntime boundary and persist the resulting workflow step transition
atomically, without tools, network side effects, autonomous scheduling, or external
delivery.

## Why it matters

MV AI OS can now persist workflow state and controls, prepare one exact candidate,
inspect immutable executor descriptors, and resolve an exact active deterministic-local
Agent Specification/executor binding without execution. It also has one meaningful,
model-free Content Director executor. It still cannot invoke that executor from a
workflow candidate. This milestone is
the first transition from orchestration preparation to controlled execution and must
prove that AgentRuntime invocation cannot bypass candidate validation, limits,
policy, durable approvals, Guardians, idempotency, or audit.

## Required scope

- Define a narrow workflow-step invocation command and validated result contract.
- Accept only a candidate produced from `DURABLE_ONLY` control evidence at the exact
  current workflow version.
- Resolve the exact AgentSpecification and deterministic-local executor through the
  read-only AgentRuntime resolver, then invoke only the existing injected AgentRuntime
  interface.
- Start with deterministic/local AgentRuntime implementations; no live provider is
  required or enabled by default.
- Validate bounded JSON-safe step input and AgentResult output against the exact
  specification schemas.
- Enforce existing model/tool/cost limits and default-deny effective permissions
  before invocation.
- Atomically persist the step transition, command receipt, redaction-safe workflow
  event, and resulting version through existing workflow persistence.
- Make duplicate command replay restart-safe and prevent duplicate AgentRuntime
  invocation.
- Fail closed on stale candidate, missing controls, invalid result, timeout, agent
  failure, or persistence failure.
- Add deterministic invocation, replay, rollback, restart, validation, redaction, and
  no-external-side-effect tests.
- Update project-state documents.

## Forbidden scope

- Browser, filesystem mutation, HTTP, n8n, dashboard, webhook, scheduler, background
  worker, autonomous loop, real tool execution, publishing, outreach, payment,
  customer delivery, or other external side effects.
- Direct provider SDK calls or bypass of LlmGateway, model limits, usage accounting,
  budget enforcement, policy, AgentSpecifications, checkpoints, or audit.
- Parallel scheduling, retries, callback processing, compensation, workflow result
  aggregation, or a new execution framework.
- A second database, destructive migration, secrets/prompts/completions/provider
  payloads in durable workflow records, or weakening existing public contracts.
- Role-name matching, bypassing the exact active binding, mutation through catalog
  inspection, or treating resolution itself as execution authority.

## Likely files to create

- `src/workflows/runtime/workflow-step-invocation.ts`
- `src/workflows/runtime/workflow-step-invocation-validator.ts`
- `src/workflows/runtime/repository-backed-workflow-step-invoker.ts`
- `tests/workflows/workflow-step-invocation.test.ts`

## Likely files to modify

- existing workflow persistence/state-machine services only where required for the
  atomic awaiting-result and completion/failure transitions
- `src/index.ts`
- affected project-state documents

## Tests required

- one exact durable candidate invokes one deterministic AgentRuntime once;
- missing/stale policy, specification, approval, Guardian, version, or permission
  blocks before AgentRuntime;
- duplicate command after restart replays without a second invocation;
- invalid input/output, agent failure, timeout, and persistence failure fail closed;
- state, receipt, event, and version updates are atomic;
- terminal or already-awaiting-result steps cannot be reinvoked;
- outputs and errors are bounded, immutable, JSON-safe, and redaction-safe;
- no tool, browser, filesystem, network, n8n, HTTP, provider SDK, or external action
  occurs;
- all existing tests remain green.

## Acceptance criteria

- Exactly one validated durable candidate can enter AgentRuntime through dependency
  injection.
- No candidate or command can invoke the agent twice.
- Every missing or stale control fails before invocation.
- Successful and failed invocation outcomes preserve workflow transaction and audit
  invariants.
- No external side effect is introduced.
- Full lint, typecheck, test, build, and diff checks pass in a separate clean commit.

## Definition of done

One deterministic/local workflow step can be invoked once through AgentRuntime with
durable controls, restart-safe idempotency, and atomic workflow evidence. Scheduling,
parallelism, external tools, providers, callbacks, and delivery remain later
milestones.
