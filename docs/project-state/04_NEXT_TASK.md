# Next Task

## Milestone name

Operator Decision Engine Foundation

## Goal

Create the first deterministic decision engine for Only Way Assistant.

The engine decides what the assistant should do with an operator request:

- proceed;
- ask for clarification;
- require approval;
- require operator confirmation;
- refuse;
- create a non-executing mission-plan candidate;
- stop because safety state is too risky.

This milestone is deterministic decisioning only. It must not execute workflows,
tools, agents, models, providers, background jobs, dashboards, n8n, network calls, or
external side effects.

## Why it matters

Only Way Assistant now has a runtime boundary and a Guardian Consultation Boundary.
The next safe step is to combine validated operator intent, the assistant
specification, guardian consultation output, approval requirements, and available
cost/budget posture into one operator-facing decision contract. This is the first
real command layer that turns Fabio's goals into safe next actions without making him
babysit internal agents.

## Required scope

- Define `OperatorDecisionContext` contract.
- Define `OperatorDecision` contract.
- Define `OperatorDecisionKind` union or enum.
- Define `OperatorDecisionReason` contract.
- Define `OperatorDecisionEngine` interface or service boundary.
- Accept deterministic inputs:
  - operator objective;
  - requested outcome;
  - assistant specification identity;
  - guardian consultation decision;
  - approval requirements;
  - optional sanitized cost/budget posture if already available;
  - optional delegation-policy signal if already available.
- Produce deterministic outputs:
  - decision kind;
  - safe explanation;
  - required approvals;
  - blocked reasons;
  - clarification questions;
  - recommended next actions;
  - optional non-executing mission-plan candidate when safe.
- Validate all public decision contracts.
- Keep decision output redaction-safe.

## Forbidden scope

- Workflow execution.
- Tool execution.
- Agent execution or multi-agent runtime.
- Model calls, provider calls, live provider tests, or prompt generation.
- Running guardians or collecting guardian signals automatically.
- Scheduling, polling, background checks, monitoring, alerts, Telegram, email, Slack,
  dashboard, HTTP, n8n, MCP, browser automation, filesystem tools, cloud/VPS runtime,
  external APIs, network behavior, embeddings, vector search, durable persistence, or
  runtime ledgers.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/operator-decision-engine.ts`
- `src/assistants/operator-decision-engine-validator.ts`
- `src/assistants/deterministic-operator-decision-engine.ts`
- `tests/assistants/operator-decision-engine.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Proceed decision for safe, sufficiently specified request.
- Clarification-required decision for under-specified request.
- Approval-required decision when guardian consultation requires approvals.
- Confirmation-required decision when guardian consultation requires operator
  confirmation.
- Refusal or blocked decision when guardian consultation blocks escalation.
- Optional non-executing mission-plan candidate is produced only when safe and
  sufficiently specified.
- Decision ordering is deterministic.
- Invalid decision contexts are rejected.
- Invalid decisions are rejected.
- Decision output is redaction-safe and excludes prompts, completions, provider
  payloads, secret references, secret values, transcripts, raw knowledge, raw memory,
  sensitive paths, and transport internals.
- Existing Main Assistant runtime, Guardian Consultation, guardian, model, runtime,
  CLI, persistence, backup/restore, and governed content tests continue passing.

## Acceptance criteria

- Only Way Assistant has a validated deterministic Operator Decision Engine
  foundation.
- The engine consumes existing specification and Guardian Consultation boundaries
  without bypassing them.
- The engine produces operator-facing proceed, clarification, approval,
  confirmation, refusal, blocked, or mission-plan-candidate decisions.
- No workflow execution, tool execution, model calls, provider calls, agent
  execution, persistence, network behavior, dashboard, alerts, or autonomous behavior
  is added.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Operator decision contracts, validators, deterministic engine, and tests are
  complete.
- Project-state documents accurately describe the decision engine foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Main Assistant Delegation Policy Foundation
  begins.
