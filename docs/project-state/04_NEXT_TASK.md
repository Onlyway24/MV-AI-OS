# Next Task

## Milestone name

Workflow Step Execution Boundary

## Goal

Define and implement one narrow, validated boundary that can select exactly one
readiness-qualified durable workflow step for a future executor without treating
readiness as authorization or performing work itself.

## Why it matters

The Workflow Runtime can now persist a trustworthy workflow snapshot and inspect
dependency/control readiness deterministically. The next safe increment is an
explicit handoff boundary that re-checks policy, exact Agent Specification identity,
approval, Guardian, version, idempotency, and audit requirements before any later
agent, model, tool, or external execution layer can be considered.

## Required scope

- Define validated, immutable non-executing step-execution-boundary request, result,
  candidate, blocker, and reason contracts.
- Resolve one exact durable workflow definition and instance through the existing
  workflow repository transaction boundary.
- Re-evaluate the current readiness snapshot in the same boundary; a prior `READY`
  finding is never sufficient by itself.
- Require an exact declared Agent Specification ID/version for the selected step and
  reject missing, unknown, or mismatched specifications.
- Require an explicit default-deny policy decision and explicit supplied approval and
  Guardian evidence where the definition requires them.
- Enforce an exact workflow version and use the existing command-receipt, event, and
  transaction invariants for any state transition that the existing domain permits.
- Return only a bounded, redaction-safe, deeply immutable, non-executing candidate or
  blocker result. A candidate must not invoke an executor.
- Add deterministic tests for policy denial, missing specification, missing approval,
  missing Guardian evidence, stale version, duplicate command handling where a
  transition is introduced, ordering, immutability, redaction, restart safety, and
  no execution.
- Update project-state documents.

## Forbidden scope

- Agent, model, provider, tool, browser, filesystem, network, n8n, HTTP, dashboard,
  CLI workflow command, external action, scheduling loop, background worker, retry,
  autonomous behavior, payment, publishing, sales outreach, or customer delivery.
- Actual Agent Runtime invocation, model/provider invocation, tool invocation, or
  external side effect.
- Durable approval storage, Guardian execution, durable Guardian checkpoint engine,
  callback processing, result completion, dependency graph redesign, a new persistence
  framework, a new database, or destructive migration.
- Treating a readiness result, a policy decision, an approval marker, or a Guardian
  marker alone as execution authorization.

## Likely files to create

- `src/workflows/runtime/workflow-step-execution-boundary.ts`
- `src/workflows/runtime/workflow-step-execution-boundary-validator.ts`
- `src/workflows/runtime/repository-backed-workflow-step-execution-boundary.ts`
- `tests/workflows/workflow-step-execution-boundary.test.ts`

## Likely files to modify

- `src/workflows/runtime/workflow-persistence-service.ts` only if a minimal existing
  transaction invariant must be shared.
- `src/index.ts`
- affected project-state documents.

## Tests required

- a selected step must be currently readiness-qualified in the same durable snapshot;
- policy denial and missing declared permissions fail closed;
- missing or mismatched Agent Specification fails closed;
- missing approval or Guardian evidence fails closed;
- stale snapshots and conflicting duplicate commands preserve persistence invariants;
- any allowed state transition is atomic, receipt-backed, event-audited, and restart
  safe;
- candidates and blockers are stable, bounded, immutable, and redaction-safe;
- no agent, model, provider, tool, network, CLI, or external execution occurs;
- existing tests remain green.

## Acceptance criteria

- Readiness is re-evaluated, not trusted as an authorization grant.
- A future executor receives at most one fully validated non-executing candidate.
- Every missing control fails closed.
- No work is executed and no external side effect is introduced.
- Any durable state mutation uses the existing exact-version, receipt, event, and
  transaction guarantees.
- Full lint, typecheck, test, build, and diff checks pass in a clean separate commit.

## Definition of done

The repository has one deterministic, policy-aware, approval-aware, Guardian-aware,
non-executing workflow step handoff boundary. A subsequent milestone must separately
authorize and implement an executor before any agent, model, tool, or external action
can occur.
