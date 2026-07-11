# Next Task

## Milestone name

Local Workflow Command Boundary

## Goal

Expose the implemented Core V1 Mission, Workflow, control, deterministic Agent,
lifecycle, report, and audit capabilities through one coherent local application
boundary and the existing CLI transport.

## Why it matters

The operator report now makes persisted Workflow state understandable. Fabio still
needs an allowlisted local command surface so the complete flow is usable without
editing TypeScript, calling internal methods, or modifying SQLite.

## Required scope

- Reuse the existing local runtime, CLI transport, bounded JSON parsing, SQLite
  initialization, configuration, validators, repositories, and structured errors.
- Accept only explicit allowlisted Core V1 operation names.
- Support Mission planning, Workflow creation and inspection, operator report,
  readiness, candidate selection, approval and Guardian recording, deterministic
  Agent invocation and result inspection, outcome acceptance/rejection, failure,
  retry, pause/resume/cancel, timeout, and bounded audit inspection.
- Require bounded structured input, stable IDs, exact versions, idempotency, and
  default-deny authorization at every relevant command.
- Return structured safe results with one exact next action and external-effect status.

## Forbidden scope

- Arbitrary user-controlled service or method names.
- A second CLI, parallel runtime, Web Console, public API, server, or background worker.
- Models, providers, tools, browser/network integrations, external actions, or new
  production dependencies.

## Acceptance criteria

- Fabio can execute the allowlisted Core V1 flow through bounded local JSON commands.
- Unknown operations, malformed input, stale versions, and unsafe text fail safely.
- Commands preserve existing approval, Guardian, lifecycle, persistence, and
  deterministic execution boundaries.
- Output is bounded, redaction-safe, and confirms no unauthorized external effect.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

Fabio can operate Core V1 locally without editing source code or interpreting raw
database state.
