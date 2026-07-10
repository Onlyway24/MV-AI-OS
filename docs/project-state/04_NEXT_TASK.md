# Next Task

## Milestone name

Dependency Scheduler and Step Readiness Engine

## Goal

Add a deterministic, non-executing readiness evaluator that uses durable workflow
definitions and instances to determine which steps are blocked, pending, or ready
without invoking an agent, model, provider, tool, or external system.

## Why it matters

Workflow state is now durable and auditable, but it cannot yet reason about declared
dependencies or safely prepare the next eligible step. A fail-closed readiness layer
is required before any future step-execution boundary can exist.

## Required scope

- Define validated readiness request, result, finding, and reason contracts.
- Resolve exact durable Workflow Definitions and Workflow Instances through the
  existing workflow repository transaction boundary.
- Evaluate declared step dependencies deterministically from persisted step state.
- Preserve and report explicit approval-required and Guardian-required blockers;
  missing evidence must block rather than infer approval or consultation.
- Select ready steps in stable definition order with bounded results and deeply
  immutable, redaction-safe output.
- Persist only state transitions already permitted by the Workflow Runtime domain;
  use existing optimistic version, receipt, event, and transaction invariants for any
  state change.
- Add deterministic conformance, restart, conflict, blocked, ordering, immutability,
  and no-execution tests.
- Update project-state documents.

## Forbidden scope

- Agent, model, provider, tool, browser, filesystem, network, n8n, HTTP, dashboard,
  CLI workflow commands, external action, scheduling loop, background worker, retry,
  autonomous behavior, payment, publishing, sales outreach, or customer delivery.
- Approval decision storage, Guardian execution, durable approval engine, step result
  execution, dependency graph redesign, new persistence framework, new database, or
  destructive migration.

## Likely files to create

- `src/workflows/runtime/workflow-readiness.ts`
- `src/workflows/runtime/workflow-readiness-validator.ts`
- `src/workflows/runtime/deterministic-workflow-readiness-engine.ts`
- `tests/workflows/workflow-readiness.test.ts`

## Likely files to modify

- `src/workflows/runtime/workflow-persistence-service.ts` only if a minimal,
  transaction-bound readiness state transition is required.
- `src/index.ts`
- affected project-state documents.

## Tests required

- dependencies block until all declared prerequisite steps succeed;
- missing approval or Guardian evidence blocks by default;
- ready steps are stable, bounded, immutable, and redaction-safe;
- duplicate or stale readiness commands preserve workflow persistence invariants;
- restart uses durable definition/instance state;
- no agent/model/provider/tool/network/CLI execution occurs;
- existing test coverage remains green.

## Acceptance criteria

- A caller can deterministically inspect ready and blocked durable workflow steps.
- Missing controls never become implicit grants.
- Any permitted readiness transition remains atomic, versioned, receipt-backed, and
  event-audited.
- No work is executed.
- Full lint, typecheck, test, build, and diff checks pass in a clean separate commit.

## Definition of done

Durable workflow state can safely drive a deterministic, non-executing readiness
decision. The following milestone is **Workflow Step Execution Boundary** only after
its own policy, approval, and Guardian requirements are specified.
