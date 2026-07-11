# Next Task

## Milestone name

Workflow Lifecycle Failure, Retry, Pause, Resume, and Cancellation

## Goal

Define and implement explicit operator-controlled lifecycle behavior for failed,
revision-required, paused, resumed, cancelled, and retry-eligible deterministic
Workflow Steps without introducing automatic scheduling or external execution.

## Why it matters

MV AI OS can now resolve, invoke, validate, and complete one exact local deterministic
Workflow Step with durable identity and restart-safe evidence. It still lacks a
coherent lifecycle policy for outcomes that cannot be accepted immediately or for
operator intervention after reservation.

## Required scope

- Define bounded lifecycle commands and durable receipts for failure, revision,
  retry authorization, pause, resume, and cancellation.
- Preserve exact workflow, instance, step, invocation, executor, and version identity.
- Separate retry authorization from retry execution.
- Require explicit operator authority for lifecycle actions that change execution
  eligibility.
- Preserve atomic state, receipt, event, and audit persistence.
- Preserve restart-safe idempotency and conflicting-command rejection.
- Keep later readiness evaluation explicit.

## Forbidden scope

- Automatic retry loops, background workers, schedulers, parallel execution, or
  automatic next-step execution.
- Models, providers, tools, network, browser, publishing, outreach, payments,
  customer delivery, or other external actions.
- Approval UI, Web Console, n8n, callbacks, compensation, or a generic execution
  framework.
- New production dependencies or destructive migrations.

## Acceptance criteria

- Lifecycle decisions are explicit, exact-versioned, atomic, auditable, and
  idempotent.
- Retry cannot occur without separate durable authorization.
- Pause and cancellation prevent invocation before execution.
- No lifecycle command starts an agent or dependent step automatically.
- Existing deterministic vertical-slice guarantees remain intact.

## Definition of done

Failed and interrupted local deterministic Workflow Steps have a safe, operator-
controlled lifecycle without adding autonomy or external side effects.
