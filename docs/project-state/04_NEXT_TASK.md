# Next Task

## Milestone name

Main Assistant Operator Protocol

## Goal

Define the structured operator-facing protocol Fabio uses with Only Way Assistant.

This protocol is the contract future CLI, local web console, or API layers can use
to present operator decisions without exposing raw internal payloads or making Fabio
babysit individual agents.

This is not a UI, HTTP API, dashboard, chat runtime, model call, agent execution,
workflow execution, tool execution, or autonomous operator.

## Why it matters

Only Way Assistant now has a specification, runtime boundary, Guardian Consultation,
Operator Decision Engine, and Delegation Policy. The next step is a stable
operator-facing language for commands, decisions, approvals, clarifications,
refusals, and next actions so Fabio can give business goals and receive clear,
safe, decision-ready output.

## Required scope

- Define `OperatorCommand` contract.
- Define `OperatorIntent` contract.
- Define `OperatorDecisionRequest` contract.
- Define `OperatorDecisionResponse` contract.
- Define `OperatorApprovalPrompt` contract if useful.
- Define `OperatorClarificationRequest` contract if useful.
- Define `OperatorRefusal` contract if useful.
- Define `OperatorNextAction` contract if useful.
- Add runtime validators for all public operator protocol contracts.
- Add deterministic protocol formatting/normalization behavior if useful.
- Express operator-facing output rules for:
  - concise summary;
  - understood objective;
  - safety checks consulted;
  - decision made;
  - what is blocked;
  - what needs approval;
  - what information is missing;
  - what will happen next;
  - what was refused and why;
  - cost/budget status if safely available;
  - risk level if safely available;
  - candidate non-executing delegation if safely available;
  - candidate non-executing mission plan if safely available;
  - no raw internal payloads.
- Keep ordering deterministic and output redaction-safe.

## Forbidden scope

- Building a UI, HTTP API, dashboard, CLI rewrite, chat runtime, or transport adapter.
- Calling models, providers, tools, workflows, guardians, agents, browsers,
  filesystems, n8n, MCP, network services, external APIs, Telegram, email, Slack, or
  notification systems.
- Executing delegation, sub-agents, workflows, tools, publishing, outreach, or
  external communication.
- Scheduling, polling, monitoring, background work, durable ledgers, or autonomous
  action.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/main-assistant-operator-protocol.ts`
- `src/assistants/main-assistant-operator-protocol-validator.ts`
- `src/assistants/deterministic-main-assistant-operator-protocol.ts`
- `tests/assistants/main-assistant-operator-protocol.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid operator command is accepted.
- Invalid operator command is rejected.
- Approval-required state produces a safe approval prompt.
- Clarification-required state produces deterministic clarification output.
- Refusal or blocked state produces safe refusal/blocker output.
- Next-action output is deterministic.
- Safety checks consulted are represented without raw guardian payloads.
- Cost/budget posture is represented only as sanitized summary.
- Candidate delegation and mission-plan data are represented only as non-executing
  summaries.
- Redaction safety excludes prompts, completions, provider payloads, secret
  references, secret values, transcripts, raw knowledge, raw memory, sensitive paths,
  raw guardian payloads, and transport internals.
- Existing Main Assistant runtime, Guardian Consultation, Operator Decision Engine,
  Delegation Policy, guardian, model, runtime, CLI, persistence, backup/restore, and
  governed content tests continue passing.

## Acceptance criteria

- Only Way Assistant has a validated operator-facing protocol contract.
- The protocol can represent decisions, approvals, clarifications, refusals,
  blockers, and next actions without executing anything.
- Fabio receives business-operator output, not raw internal diagnostics.
- No UI, HTTP, dashboard, model calls, provider calls, tool calls, workflow calls,
  agent execution, persistence, network behavior, alerts, or autonomous behavior is
  added.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Operator protocol contracts, validators, deterministic formatting/normalization
  behavior, and tests are complete.
- Project-state documents accurately describe the operator protocol foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Agent Company Specification Foundation begins.
