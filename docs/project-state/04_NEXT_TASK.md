# Next Task

## Milestone name

Explicit Workflow Pause, Resume, and Cancellation

## Goal

Add explicit, idempotent operator lifecycle controls for pausing, resuming, and
cancelling durable Workflows without invoking work or weakening failure and control
evidence.

## Why it matters

MV AI OS can now fail a step, authorize a bounded retry, and consume that exact
authorization to restore eligibility without hidden execution. Operators also need
durable stop controls that preserve evidence and prevent new invocation while stopped.

## Required scope

- Add explicit operator pause, resume, and cancellation requests with exact instance
  version identity.
- Persist state, command receipt, Workflow Event, lifecycle evidence, and one exact
  version increment atomically.
- Make duplicate commands restart-safe and idempotent.
- Prevent new invocation while paused or cancelled.
- Require resume to re-evaluate readiness, policy, approval, Guardian, specification,
  executor, and version before any later invocation.
- Preserve failures, completed work, approvals, Guardians, invocations, outcomes, and
  all prior audit evidence.
- Define explicit cancellation handling for pending, ready, and awaiting-result steps
  without claiming external compensation.

## Forbidden scope

- AgentRuntime invocation, automatic resume, loops, timers, schedulers, or workers.
- Erasing failure or approval-revocation evidence.
- Claiming cancellation compensated or reversed any external effect.
- Models, providers, tools, network, browser, external actions, or new dependencies.

## Acceptance criteria

- Pause prevents new invocation and preserves durable evidence.
- Resume grants eligibility only and requires fresh control evaluation.
- Cancellation is explicit, terminal, idempotent, and retains completed evidence.
- Stale versions, invalid actors, invalid source states, and conflicting command IDs
  fail closed.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

Operators can explicitly pause, resume, or cancel a durable Workflow with atomic,
restart-safe evidence and no hidden execution.
