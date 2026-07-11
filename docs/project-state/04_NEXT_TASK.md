# Next Task

## Milestone name

Vertical-Slice Adversarial Review and Project-State Closeout

## Goal

Perform one focused hostile review of deterministic executor resolution, controlled
workflow invocation, durable invocation persistence, outcome acceptance, and atomic
step completion; fix material findings and align project-state truth.

## Required scope

- Review exact specification/executor binding and default-deny resolution.
- Review reservation, execution-outside-transaction, terminal outcome persistence,
  replay, and interrupted-reservation behavior.
- Review authoritative result loading, structured artifact validation, explicit
  outcome decisions, and atomic completion.
- Verify fingerprints cover material identities and versions.
- Verify duplicate invocation and duplicate completion behavior after restart.
- Verify the next dependent step remains dormant until later explicit readiness
  evaluation.
- Fix all P0/P1 and material P2 findings.
- Run the complete quality gate and update project-state documentation.

## Forbidden scope

- Models, providers, tools, network, browser, arbitrary filesystem effects, external
  actions, publishing, outreach, payments, delivery, schedulers, workers, or loops.
- Automatic retry, automatic next-step execution, parallel execution, callbacks, or
  compensation.
- New production dependencies, destructive migrations, or weakening existing tests.
- Starting the post-sprint lifecycle milestone.

## Acceptance criteria

- One complete durable Workflow-to-Agent-to-accepted-Completion path is proven.
- Resolution never executes; execution never occurs inside a database transaction.
- Successful invocation is never equated with successful step completion.
- Completion is exact-versioned, atomic, idempotent, and restart-safe.
- No external side effect or automatic next-step execution exists.
- Lint, typecheck, all tests, build, and diff checks pass from a clean commit.

## Definition of done

Project-state records the completed local deterministic vertical slice and names
exactly one later lifecycle milestone without beginning it.
