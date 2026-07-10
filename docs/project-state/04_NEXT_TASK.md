# Next Task

## Milestone name

Mission Planning Scenario Lab

## Goal

Prove the complete non-executing Mission Planning path across realistic,
deterministic Founder Mission Brief scenarios: validation, Agent Company readiness,
Mission Plan generation, and Only Way quality evaluation.

## Required scope

- A deterministic test-only scenario matrix spanning all ten mission types.
- Representative approval-ready, clarification-required, rejected, remediation, and
  blocked safety scenarios.
- Exact assertions for selected roles, capabilities, permissions, handoffs,
  guardians, approvals, non-execution, and quality release recommendations.
- Scenario coverage for unknown budgets/deadlines, external-action proposals,
  conservative assumptions, evidence limits, and cost/effort constraints.
- Deterministic, deeply immutable, redaction-safe results for every scenario.
- No production planning rules unless a concrete defect is discovered and
  independently validated.

## Forbidden scope

- LLM/model/provider calls, live research, agent invocation, workflow/tool execution,
  persistence, network, dashboard, external actions, or autonomy. Do not add a
  Mission Planning runtime, CLI surface, or execution engine in this milestone.

## Likely files to create

- `tests/missions/mission-planning-scenario-lab.test.ts`

## Likely files to modify

- all affected project-state documents only if scenario evidence exposes a factual
  state correction.

## Tests required

- Mission types, scenarios, selection/control assertions, quality outcomes,
  determinism, immutability, redaction, and no-execution assertions.
- Existing Mission Brief, Mission Plan, Mission Planner, and Quality Gate tests must
  continue passing.

## Acceptance criteria

- The full planning chain is proven against representative founder/operator cases.
- The scenario lab adds no production execution capability or external behavior.

## Definition of done

- The test-only scenario matrix is complete, deterministic, and passes all quality
  gates and `git diff --check`.
- The milestone is committed separately before Local Mission Planning Dry-Run work.
