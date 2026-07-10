# Next Task

## Milestone name

Mission Plan Contracts

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`, `AI_ENGINEERING_RULES.md`, and all project-state documents.
- Inspect Founder Mission Brief contracts and validator.
- Inspect Agent Company readiness, roles, responsibilities, capabilities,
  permissions, and handoff contracts.
- Preserve the existing Core Brain `ExecutionPlan` and Main Assistant
  `OperatorMissionPlanCandidate`; the new full Mission Plan is a separate
  non-executing planning artifact.

## Goal

Define and validate the complete non-executing Mission Plan that a future deterministic
planner will produce for Fabio review.

## Required scope

- Mission summary, normalized objective, value, strategy direction, expected result,
  confidence, assumptions, and unresolved questions.
- Optional recommended, rapid, and bold strategy options only when materially useful.
- Ordered mission steps with exact agent/specification, responsibility, capability,
  permission, handoff, input, output, dependency, risk, guardian, approval, effort,
  cost, success, failure, stop, and non-execution fields.
- Mission-level effort/cost classes, risks, approval and guardian queues, external
  action boundary, evidence, success metrics, minimum quality, first concrete action,
  and rejection reasons.
- Validation against the supplied `READY` Agent Company declarations.
- Duplicate, dependency, cycle, ownership, capability, permission, handoff, approval,
  guardian, ordering, redaction, summary-coherence, and immutability checks.

## Forbidden scope

- Mission plan generation or strategy selection logic.
- Agent invocation, delegation, handoff execution, Core Brain changes, model/provider
  calls, tool/workflow runtime, persistence, network, external communication,
  publishing, spending, delivery, deployment, or autonomy.
- Replacing existing `ExecutionPlan` or `OperatorMissionPlanCandidate` contracts.

## Likely files to create

- `src/missions/mission-plan.ts`
- `src/missions/mission-plan-validator.ts`
- `tests/missions/mission-plan.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid complete plan and optional strategy variants.
- Invalid agent, responsibility, capability, permission, or handoff references.
- Duplicate steps, missing dependencies, dependency cycles, and unstable ordering.
- Missing expected output, success, failure, or stop criteria.
- Sensitive/external actions without approval or guardian control.
- Unsupported execution implications, redaction safety, rollup coherence, and deep immutability.
- Compatibility regression for existing plan/candidate contracts.

## Acceptance criteria

- A full Mission Plan can be represented and validated without execution.
- Every step maps to exact supplied Agent Company declarations.
- Critical safety, approval, guardian, dependency, or external-action gaps fail closed.
- No existing public plan contract is changed.

## Definition of done

- Mission Plan contracts, validator, default fixture, tests, exports, and project-state updates are complete.
- All quality gates and `git diff --check` pass.
- The milestone is committed separately before planner implementation.
