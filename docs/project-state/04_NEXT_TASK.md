# Next Task

## Milestone name

Main Assistant Delegation Policy Foundation

## Goal

Define safe declarative delegation policies for future sub-agents without executing
delegation.

This policy answers which type of internal specialist Only Way Assistant may involve
later, under which conditions, and which delegation categories must remain forbidden
until approvals, guardians, budgets, security, backup readiness, quality review, and
future execution layers exist.

This is not sub-agent runtime, workflow execution, tool execution, or autonomous
delegation.

## Why it matters

Only Way Assistant now has a specification, runtime boundary, Guardian Consultation,
and Operator Decision Engine. Before any agent-company map or mission planning can
be useful, the system needs a deterministic delegation policy foundation that keeps
Fabio as the operator and prevents uncontrolled agent-to-agent chaos.

## Required scope

- Define `DelegationPolicy` contract.
- Define `DelegationTarget` contract.
- Define `DelegationConstraint` contract.
- Define `DelegationDecision` contract if useful.
- Define delegation category and risk-level contracts if useful.
- Add runtime validators for public delegation contracts.
- Express rules for:
  - allowed future agent categories;
  - forbidden delegation categories;
  - required Guardian Consultation;
  - required Operator Safety Report;
  - required human approval;
  - cost/budget requirements;
  - security requirements;
  - backup readiness requirements;
  - quality review requirements;
  - max delegation depth;
  - no circular delegation;
  - no autonomous escalation;
  - no publisher delegation without approval;
  - no sales outreach without approval;
  - no tool-agent delegation without explicit future approval;
  - no external communication without approval.
- Keep output deterministic and redaction-safe.

## Forbidden scope

- Executing delegation.
- Calling or invoking sub-agents.
- Multi-agent runtime.
- Workflow execution.
- Tool execution.
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

- `src/assistants/main-assistant-delegation-policy.ts`
- `src/assistants/main-assistant-delegation-policy-validator.ts`
- `src/assistants/deterministic-main-assistant-delegation-policy.ts`
- `tests/assistants/main-assistant-delegation-policy.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid delegation policy is accepted.
- Invalid delegation policy is rejected.
- Forbidden delegation categories are rejected.
- Missing approval requirements are rejected.
- Missing Guardian Consultation requirements are rejected.
- Budget/security/backup/quality requirements are enforced by validation.
- Unsafe or circular delegation constraints are rejected where represented.
- Delegation ordering is deterministic.
- Delegation output is redaction-safe and excludes prompts, completions, provider
  payloads, secret references, secret values, transcripts, raw knowledge, raw memory,
  sensitive paths, and transport internals.
- Existing Main Assistant runtime, Guardian Consultation, Operator Decision Engine,
  guardian, model, runtime, CLI, persistence, backup/restore, and governed content
  tests continue passing.

## Acceptance criteria

- Only Way Assistant has a validated declarative delegation policy foundation.
- The policy can state allowed future internal specialists and forbidden delegation
  modes without executing agents.
- The policy requires Guardian Consultation and approval for risky categories.
- No sub-agent execution, workflow execution, tool execution, model calls, provider
  calls, persistence, network behavior, dashboard, alerts, or autonomous behavior is
  added.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Delegation policy contracts, validators, deterministic policy/evaluator behavior,
  and tests are complete.
- Project-state documents accurately describe the delegation policy foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Main Assistant Operator Protocol begins.
