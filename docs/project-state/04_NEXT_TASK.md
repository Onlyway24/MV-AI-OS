# Next Task

## Milestone name

Controlled Telegram Operator Console — Phase 1

Workflow Specification Admission Boundary is paused, not deleted. Telegram is never
an observation source for Fabio's personal account activity. Telegram Developer
Control Plane remains Phase 2 and has not started.

## Paused milestone

Workflow Specification Admission Boundary

## Goal

Allow Fabio to create a durable Core V1 Workflow only from one exact, already
validated `WorkflowSpecification` and its declared Agent Specification versions,
instead of hand-authoring a runtime Workflow definition.

## Why it matters

Core V1 now proves controlled execution for a local Workflow instance. The next safe
capability is to connect the repository's formal Workflow Specification system to that
runtime without granting autonomy, adding another execution engine, or weakening the
existing command, policy, approval, Guardian, repository, and audit boundaries.

## Required scope

- Define a versioned admission request/result contract and strict validators.
- Resolve one exact Workflow Specification from the existing immutable registry.
- Verify every referenced exact Agent Specification and declared version before
  admission.
- Deterministically derive the existing durable `WorkflowDefinition` and initial
  `WorkflowInstance` shape from the admitted specification.
- Persist the derived records through existing Workflow repositories and the existing
  transaction runner with stable IDs, conflict detection, replay, ownership binding,
  and durable audit evidence.
- Expose the boundary through the existing Local Runtime/CLI command mechanism only
  where the current command validation and response guarantees are preserved.
- Add deterministic tests for valid admission, missing/changed specifications,
  duplicate/replay/conflict behavior, restart durability, rollback, and redaction.

## Forbidden scope

- No new workflow execution engine, scheduler, automatic retry, callback, n8n,
  network, provider, tool, dashboard, HTTP, filesystem tool, or external effect.
- No dynamic Agent selection, version floating, or bypass of policy, approvals,
  Guardians, repositories, or CoreBrain boundaries.
- No migration of existing Core V1 instances and no incompatible public-contract
  change.

## Acceptance criteria

- An admitted Workflow is attributable to one exact validated specification and exact
  declared Agent Specification versions.
- The resulting durable definition/instance is deterministic, immutable, versioned,
  replay-safe, conflict-safe, ownership-bound, and transactionally audited.
- Invalid, missing, changed, or version-incompatible declarations fail closed before
  persistence.
- Existing Core V1 commands and vertical-slice behavior remain unchanged.
- Lint, typecheck, full tests, build, and `git diff --check` pass.

## Definition of done

The formal Workflow Specification registry is the controlled admission source for a
new durable local Core V1 Workflow, while all execution remains explicit,
deterministic, local-only, and operator-governed.
