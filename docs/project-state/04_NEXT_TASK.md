# Next Task

## Milestone name

Controlled Telegram Operator Console — Phase 1B Checkpoint B

Workflow Specification Admission Boundary is paused, not deleted. Telegram is never
an observation source for Fabio's personal account activity. Telegram Developer
Control Plane remains Phase 2 and has not started.

## Goal

Persist the strict Telegram Mission draft and its exact draft operations locally in
SQLite with durable, replay-safe receipts. Preserve the complete Phase 1B privacy,
identity, context-fingerprint, and no-execution boundaries.

## Required scope

- Add storage-neutral repository contracts and strict validators for Mission drafts
  and operation receipts.
- Add additive SQLite schema and repositories with exact identity/version bindings,
  optimistic conflicts, deterministic replay, and transactional draft-plus-receipt
  updates.
- Persist only the strict structured draft and bounded operation metadata; never raw
  Telegram messages, personal profile data, usernames, phone details, or transport
  diagnostics.
- Persist and replay exact context-fingerprint-bound review/confirmation operations.
- Add restart, rollback, duplicate, conflict, and redaction tests.

## Forbidden scope

- No `/mission` UX, Mission Planner, Quality Gate, Workflow admission, Workflow
  execution, model, provider, tool, network, browser, dashboard, n8n, or external
  action.

## Acceptance criteria

- A draft and receipt are attributable to one exact actor, workspace, session,
  identity binding, draft version, operation ID, and, where applicable, context
  fingerprint.
- Replays are exact and conflicting reuse fails closed.
- A new local runtime can reload drafts and receipts without exposing Telegram
  personal data or stale confirmation authority.
- Lint, typecheck, full tests, build, and `git diff --check` pass.

## Definition of done

The strict Mission draft state engine has a durable, atomic, replay-safe SQLite
boundary while remaining local-only, privacy-preserving, and non-executing.
