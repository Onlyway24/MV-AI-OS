# Next Task

## Milestone name

Controlled Telegram Operator Console — Phase 1B Checkpoint D

## Goal

Deliver the complete user-facing Telegram Mission Planning Console over the completed
Checkpoint C coordination boundary: guided collection, review, separate draft and
planning confirmations, deterministic Mission validation/planning/Quality Gate, and
restart-safe Italian result presentation.

## Required scope

- Reuse the atomic session/draft coordinator and preserve exact callback, identity,
  version, context, expiry, privacy, and restart guarantees.
- Invoke only the existing FounderMissionBrief validation, deterministic Mission
  Planner, and Mission Quality Gate after explicit planning authorization.
- Render a bounded Italian Mission result without duplicating commands on restart.

## Forbidden scope

- No Workflow creation or execution.
- No Agent Runtime, model, provider, tool, browser, network, n8n, or external action.
- No Telegram personal-account observation or Developer Control Plane.

## Entry condition

Checkpoint C is committed, pushed, clean, synchronized, and fully verified at
`3feb0dbe0f4eb70838be54a250779a22207b3c8a`; Checkpoint D is authorized.
