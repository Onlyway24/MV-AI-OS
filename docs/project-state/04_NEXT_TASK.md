# Next Task

## Milestone name

Agent Company Chapter Closeout

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read every file in `docs/project-state/`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Inspect the Agent Company readiness evaluator and its passing tests.
- Confirm the default declaration set evaluates as `READY`.

## Goal

Close the Agent Company chapter after the executable readiness evaluator confirms the
current declaration set is ready for non-executing mission planning. Record exactly
what the chapter contains and what remains intentionally absent, then make Founder
Intent / Mission Brief Foundation the active implementation milestone.

## Required scope

- Mark the Agent Company chapter complete in project-state.
- Record the Agent Company map, ten exact experimental AgentSpecifications,
  responsibility matrix, capability registry, permission matrix, handoff contracts,
  and readiness evaluator as the completed chapter.
- State explicitly that no agent execution, workflow execution, tool execution,
  external communication, publishing, payment, live customer delivery, autonomous
  legal approval, or production dashboard exists.
- Set the next task to Founder Intent / Mission Brief Foundation.

## Forbidden scope

- Source-code or test changes.
- New runtime behavior, contracts, validators, agents, or execution paths.
- Mission brief or mission plan implementation.
- Agent, handoff, workflow, tool, model, or provider execution.
- Runtime permission grants or durable persistence.
- HTTP, dashboard, n8n, MCP, network behavior, browser automation, filesystem tools,
  cloud/VPS runtime, embeddings, vector search, scheduler, alerts, or autonomous
  behavior.

## Likely files to create

- None.

## Likely files to modify

- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` only if factual decision wording requires it.

## Tests required

- No new tests are required for this documentation-only closeout.
- The complete existing suite must continue passing.

## Acceptance criteria

- Project-state truthfully marks the Agent Company chapter complete.
- Project-state preserves every intentionally absent execution capability.
- Founder Intent / Mission Brief Foundation is the single exact next task.

## Definition of done

- Only project-state documents are changed.
- Project-state documents accurately close the chapter and define the next task.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The closeout is committed separately before Mission Brief implementation begins.
