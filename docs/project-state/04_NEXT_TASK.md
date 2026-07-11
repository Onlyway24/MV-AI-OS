# Next Task

## Milestone name

Explicit Workflow Timeout Evaluation

## Goal

Add deterministic, explicit timeout evaluation for durable Workflow activity without
sleeping, timers, background workers, automatic retries, or hidden execution.

## Why it matters

MV AI OS now has explicit failure, bounded retry, recovery, pause, resume, and
cancellation controls. Chapter 1 still requires timeout decisions that survive restart
and are driven only by an explicit command and injected clock.

## Required scope

- Define bounded timeout metadata and an explicit timeout-evaluation request.
- Use only the injected clock and durable timestamps; do not call uncontrolled time
  sources in deterministic paths.
- Require exact Workflow, Step, invocation or activity identity, and expected version.
- Record both not-expired and expired decisions durably and idempotently.
- On expiry, atomically persist the exact failure transition, command receipt,
  Workflow Event, timeout evidence, and version increment.
- Classify timeout failure under the existing bounded retry policy without initiating
  retry or recovery.
- Preserve restart-safe replay and structured operator recovery instructions.

## Forbidden scope

- Sleeping, timers, schedulers, workers, polling, or background evaluation.
- AgentRuntime invocation, automatic retry/recovery, models, providers, tools, network,
  browser, or external actions.
- Caller-controlled unbounded timeout values.
- Models, providers, tools, network, browser, external actions, or new dependencies.

## Acceptance criteria

- Evaluation before the deadline records a non-expired decision without changing the
  Workflow version.
- Evaluation at or after the deadline records an exact timeout failure atomically.
- Duplicate evaluation replays after restart without a second transition.
- Stale versions, mismatched activity, invalid metadata, and conflicting IDs fail
  closed.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

One durable Workflow activity can be evaluated explicitly for timeout with bounded,
restart-safe evidence and no background behavior.
