# Next Task

## Milestone name

Controlled Telegram Operator Console — Phase 1B Checkpoint D

## Goal

Design the guided Telegram Mission interaction over the completed Checkpoint C
coordination boundary. This file records sequencing only; Checkpoint D has not begun.

## Required scope

- Reuse the atomic session/draft coordinator without duplicating its state machine or
  persistence logic.
- Define bounded operator-facing prompts and structured field parsing.
- Preserve exact callback, identity, version, context, expiry, privacy, and restart
  guarantees.
- Keep planning and Workflow admission behind separately reviewed confirmation gates.

## Forbidden scope

- No implementation is authorized by this state update.
- No Mission planning, Quality Gate, Workflow creation/execution, Agent Runtime,
  model, provider, tool, browser, network, n8n, or external action.
- No Telegram personal-account observation or Developer Control Plane.

## Entry condition

Checkpoint C must be committed, pushed, clean, synchronized, and fully verified
before Checkpoint D is separately authorized.
