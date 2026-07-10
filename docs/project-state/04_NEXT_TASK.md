# Next Task

## Milestone name

Workflow Runtime Foundation

## Goal

Create the first deterministic, non-executing Workflow Runtime boundary that consumes
existing validated Workflow Specifications and Mission Plans without executing agents,
tools, models, or external actions.

## Required scope

- Define validated workflow-run request and result contracts, explicit dependency
  injection, deterministic graph traversal, and non-execution state reporting.
- Reuse existing Workflow Specifications, policy, approval, agent specification, and
  mission-planning boundaries without redesigning them.
- Add deterministic tests and project-state updates.

## Forbidden scope

- Agent/model/tool execution, persistence, network, dashboard, external actions,
  autonomy, an HTTP surface, scheduling, retries, or a CLI change.

## Likely files to create

- `src/workflows/runtime/workflow-run.ts`
- `src/workflows/runtime/workflow-run-validator.ts`
- `src/workflows/runtime/deterministic-workflow-runtime.ts`
- `tests/workflows/workflow-runtime.test.ts`

## Likely files to modify

- `src/index.ts`
- all affected project-state documents.

## Tests required

- Validated workflow run contracts, deterministic traversal, graph-policy checks,
  non-execution, redaction, immutability, and existing-test compatibility.

## Acceptance criteria

- A caller can inspect deterministic workflow progression without executing a step.

## Definition of done

- Contracts, validator, runtime, tests, exports, project-state, and verification are
  complete in a separate commit before Workflow Step Execution Boundary work.
