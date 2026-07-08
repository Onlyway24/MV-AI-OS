# Next Task

## Milestone name

Main Assistant / Orchestrator Runtime Boundary

## Goal

Create a narrow, deterministic runtime boundary for invoking Only Way Assistant as
Fabio's operator-facing assistant without implementing full multi-agent orchestration,
workflow execution, tool execution, autonomous planning loops, dashboards, schedulers,
alerts, network behavior, or persistence.

## Why it matters

Only Way Assistant now exists as a validated specification foundation. The next safe
step is a runtime boundary that validates operator input, checks supplied safety
preflight context, produces structured operator-facing output or refusal, and remains
fully provider-neutral and side-effect free.

## Required scope

- Define `MainAssistantInvocation` contract.
- Define `MainAssistantResult` contract.
- Define `MainAssistantRuntime` interface.
- Add runtime validators for invocation and result contracts.
- Implement a deterministic local runtime that consumes explicit safe input and
  supplied safety/preflight context only.
- Use the existing Only Way Assistant specification as the runtime identity and
  contract source.
- Refuse under-specified or unsafe requests deterministically.
- Preserve provider neutrality, storage neutrality, policy-first language, and
  redaction-safe operator output.

## Forbidden scope

- Full multi-agent orchestration.
- Agent delegation execution.
- Core Brain behavior changes.
- Content Agent behavior changes.
- Model calls.
- Provider calls.
- Tool calls or tool execution.
- Workflow calls or workflow execution.
- Guardian execution, scheduling, polling, or background checks.
- HTTP, dashboards, n8n, MCP, browser automation, filesystem tools, Telegram, email,
  Slack, external monitoring, cloud/VPS runtime, embeddings, vector search, or
  network behavior.
- New persistence or durable runtime ledgers.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/main-assistant-runtime.ts`
- `src/assistants/main-assistant-runtime-validator.ts`
- `src/assistants/deterministic-main-assistant-runtime.ts`
- `tests/assistants/main-assistant-runtime.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid invocations are accepted.
- Invalid invocations are rejected.
- Valid results are accepted.
- Invalid results are rejected.
- Safe requests produce deterministic operator-facing output.
- Missing or unknown safety preflight produces refusal or attention-required output.
- Critical safety state blocks escalation.
- Runtime output is redaction-safe and excludes prompts, completions, provider
  payloads, secret references, secret values, transcripts, raw knowledge, raw memory,
  sensitive paths, and transport internals.
- Tests prove no provider, tool, network, workflow, or persistence behavior is added.
- Existing assistant specification, guardian, model, runtime, CLI, persistence,
  backup/restore, and governed content tests continue passing.

## Acceptance criteria

- Main Assistant / Orchestrator has a validated runtime boundary only.
- Runtime is deterministic, local, provider-neutral, storage-neutral, and
  side-effect free.
- No full orchestration, delegation execution, model calls, tool calls, workflow
  execution, dashboard, scheduler, alert, persistence, network, or autonomous
  behavior is added.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Main Assistant runtime contracts, validators, deterministic runtime implementation,
  and tests are complete.
- Project-state documents accurately describe the runtime boundary.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before Guardian Consultation Boundary begins.
