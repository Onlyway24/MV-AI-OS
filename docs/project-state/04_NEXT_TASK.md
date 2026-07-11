# Next Task

## Milestone name

Explicit Workflow Retry Execution and Recovery

## Goal

Consume one exact durable `AUTHORIZED` retry decision and restore its failed
Workflow Step to controlled execution eligibility without invoking an agent,
automatically retrying, or bypassing current policy and control evidence.

## Why it matters

MV AI OS can now classify a durable failure and authorize or deny retry under a
configured bounded attempt policy. Authorization deliberately does not alter failed
state or execute work. The next boundary must turn one exact authorization into a
safe restartable recovery transition.

## Required scope

- Resolve the exact latest failure and retry authorization records.
- Require exact instance, step, failure, authorization, and expected version identity.
- Reject exhausted, non-retryable, stale, mismatched, or already-consumed decisions.
- Atomically restore the failed Workflow and Step to an explicit retry-ready state.
- Persist one lifecycle execution record, command receipt, Workflow Event, lifecycle
  event, and exact version increment.
- Preserve prior failure, invocation, outcome, approval, Guardian, and audit evidence.
- Require a later explicit readiness/control evaluation before AgentRuntime invocation.
- Provide restart-safe idempotency and bounded operator recovery instructions.

## Forbidden scope

- AgentRuntime invocation, automatic retry, loops, timers, schedulers, or workers.
- Reusing stale approval, Guardian, policy, candidate, or executor evidence as current
  authorization.
- Models, providers, tools, network, browser, external actions, or new dependencies.

## Acceptance criteria

- One authorized retry can be consumed once through exact-version atomic persistence.
- Failed state cannot reopen without the configured operator's durable authorization.
- Retry execution grants eligibility only; it does not invoke work.
- Duplicate retry execution replays without a second version increment.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

One bounded failed deterministic Workflow Step can return to explicit retry-ready
state without hidden execution or loss of durable failure evidence.
