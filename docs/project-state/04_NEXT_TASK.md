# Next Task

## Milestone name

Local Mission Planning Dry-Run Vertical Slice

## Goal

Expose one explicit local, non-executing Mission Planning entrypoint that composes the
existing Founder Mission Brief validator, Agent Company readiness evaluator,
Deterministic Mission Planner, and Only Way Mission Quality Gate into a validated
operator-facing dry-run result.

## Required scope

- A versioned local dry-run input and result contract with runtime validators.
- An explicit dependency-injected composition service that evaluates readiness,
  validates the brief, plans only when safe, and evaluates quality only when a valid
  Mission Plan exists.
- A redaction-safe, deeply immutable operator-facing result that distinguishes
  `PLAN_READY`, `CLARIFICATION_REQUIRED`, `REJECTED`, approval-ready, remediation,
  and blocked quality outcomes without ever executing a plan.
- Deterministic local tests for normal planning, clarification, rejection, quality
  remediation, approval-ready plan, and no-execution behavior.

## Forbidden scope

- LLM/model/provider calls, live research, agent invocation, workflow/tool execution,
  persistence, network, dashboard, external actions, autonomy, an HTTP surface, or
  a CLI change. Do not add a Mission Planning execution engine.

## Likely files to create

- `src/missions/local-mission-planning-dry-run.ts`
- `src/missions/local-mission-planning-dry-run-validator.ts`
- `tests/missions/local-mission-planning-dry-run.test.ts`

## Likely files to modify

- `src/index.ts`
- all affected project-state documents.

## Tests required

- Input/result validation, readiness failure, clarification, rejection, approval-ready,
  remediation, blocked quality, dependency injection, determinism, immutability,
  redaction, and no-execution assertions.
- Existing Mission Brief, Mission Plan, Mission Planner, Quality Gate, and Scenario
  Lab tests must continue passing.

## Acceptance criteria

- Fabio can invoke one local, validated dry-run boundary and inspect the complete
  planning decision without invoking a model, agent, workflow, tool, or external
  action.

## Definition of done

- The local dry-run contracts, validators, service, tests, exports, and project-state
  updates are complete and pass all quality gates and `git diff --check`.
- The milestone is committed separately before sprint closeout work.
