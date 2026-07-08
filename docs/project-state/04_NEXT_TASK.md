# Next Task

## Milestone name

Main Assistant / Orchestrator Specification Foundation

## Goal

Define a formal, validated Main Assistant / Orchestrator specification that describes
Fabio's single operator-facing assistant boundary before any multi-agent exposure,
autonomous execution, dashboards, n8n workflows, schedulers, alerts, or tool
execution are added.

## Why it matters

The Control Plane Safety foundations are now complete as deterministic report-only
components. The next safe step is to define the single operator-facing assistant that
will eventually coordinate existing Core Brain, policy, memory, knowledge, model,
guardian, agent specification, workflow specification, and tool-gateway boundaries
without exposing Fabio to chaotic visible sub-agents or hidden autonomy.

## Required scope

- Define the Main Assistant / Orchestrator specification contract.
- Define its mission, operator-facing responsibilities, forbidden behavior, required
  safety inputs, handoff boundaries, and escalation semantics.
- Integrate conceptually with existing Agent Specification, Policy, Guardian, Model
  Gateway, Knowledge, Memory, Tool Gateway, and Workflow Specification boundaries
  without executing them.
- Add runtime validators for all public Main Assistant / Orchestrator specification
  contracts.
- Add deterministic tests for valid specifications, invalid specifications,
  permission/policy requirements, forbidden capabilities, guardian-report awareness,
  and operator-facing boundaries.
- Keep implementation provider-neutral, deterministic, local, and fully testable.

## Forbidden scope

- Executing the Main Assistant.
- Changing Core Brain behavior.
- Changing Content Agent behavior.
- Adding autonomous planning loops.
- Calling models.
- Calling providers.
- Executing tools.
- Executing workflows.
- Adding n8n, HTTP, dashboards, MCP, browser automation, filesystem tools, schedulers,
  alerts, email, Telegram, Slack, external monitoring, embeddings, vector search,
  cloud deployment, or network behavior.
- Adding new persistence.
- Mutating memory, knowledge, tasks, audits, files, backups, or external systems.
- Replacing existing Agent Specification, Workflow Specification, Policy, Tool
  Gateway, Model Gateway, Guardian, Memory, Knowledge, Runtime, CLI, or repository
  boundaries.

## Likely files to create

- `src/assistants/main-assistant-specification.ts`
- `src/assistants/main-assistant-specification-validator.ts`
- `tests/assistants/main-assistant-specification.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid Main Assistant / Orchestrator specifications are accepted.
- Invalid specifications are rejected.
- Required operator-facing mission and responsibility fields are enforced.
- Forbidden autonomy, tool execution, workflow execution, dashboard, network, and
  provider-specific capabilities are rejected.
- Required policy, guardian, approval, and escalation references are validated.
- Specification output remains deterministic and redaction-safe.
- Existing guardian, model, runtime, CLI, persistence, backup/restore, and governed
  content tests continue passing.

## Acceptance criteria

- The Main Assistant / Orchestrator exists only as a validated specification
  foundation.
- No execution engine, model call, tool call, workflow call, dashboard, scheduler,
  alerting, persistence, network behavior, or autonomous behavior is added.
- Existing Core Brain, policy, runtime, guardian, model, memory, knowledge, tool,
  workflow, and repository boundaries remain unchanged.
- The specification makes Fabio the operator and keeps sub-agents internal behind
  controlled boundaries.

## Definition of done

- Main Assistant / Orchestrator specification contracts, validators, and tests are
  complete.
- Project-state documents accurately describe the new specification foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before any Main Assistant execution or integration work
  begins.
