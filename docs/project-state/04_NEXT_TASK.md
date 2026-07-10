# Next Task

## Milestone name

Deterministic Mission Planner

## Goal

Build the first provider-neutral, non-executing planning engine that converts a
validated Founder Mission Brief plus `READY` Agent Company declarations into a valid
Mission Plan without calling an LLM.

## Required scope

- Validate the brief and Agent Company readiness.
- Classify the mission and select required responsibility areas and capabilities.
- Choose the smallest sufficient exact agent team.
- Create useful ordered steps, dependencies, safe handoffs, structured outputs,
  success/failure/stop criteria, effort/cost classes, approvals, and guardian reviews.
- Return clarification-required results for decision-blocking unknowns.
- Preserve conservative assumptions for assumable unknowns.
- Support stable business opportunity, content campaign, technical implementation,
  market research, and customer-delivery preparation profiles.
- Fail closed for unsupported, contradictory, or unsafe requests.
- Validate and deeply freeze every generated Mission Plan.

## Forbidden scope

- LLM/model/provider calls, agent invocation, handoff execution, workflow/tool
  runtime, Core Brain changes, persistence, HTTP, dashboard, n8n, network, external
  communication, publishing, spending, delivery, deployment, or autonomy.
- Invented capabilities, permissions, evidence, pricing, responsibility owners, or
  generic filler steps.

## Likely files to create

- `src/missions/deterministic-mission-planner.ts`
- `src/missions/mission-planner.ts`
- `tests/missions/deterministic-mission-planner.test.ts`

## Likely files to modify

- `src/index.ts`
- all project-state documents affected by milestone completion.

## Tests required

- Identical brief produces identical plan.
- Minimal sufficient agents and exact capabilities, responsibilities, permissions,
  and handoffs.
- Approval and guardian propagation.
- Unsupported, unsafe, contradictory, and decision-blocking requests fail closed.
- Conservative assumptions continue planning.
- Dependency order and no cycles.
- No empty-value steps, unnecessary agents, execution behavior, or sensitive output.
- Existing tests continue passing.

## Acceptance criteria

- A validated brief can produce one useful, safe, deterministic Mission Plan.
- Generated plans always pass `MissionPlanValidator`.
- No execution or external side effect is introduced.

## Definition of done

- Planner contracts, implementation, tests, exports, and project-state updates are complete.
- All quality gates and `git diff --check` pass.
- The milestone is committed separately before the quality gate milestone.
