# Next Task

## Milestone name

Production Runtime & Telegram Approval Center — controlled foundation

## Goal

Deliver a reliable foundation for Metodo Veloce production: durable work queue,
restart-safe worker ticks, bounded recovery, and private Telegram review. Keep every
external effect separately authorized and observable before introducing it.

## Delivered in this slice

- `/workflows` explains the bounded operator flow.
- `/workflow <riferimento-missione>` requires an `APPROVAL_READY` Mission and a
  separate one-use confirmation before it creates one durable Workflow.
- `/report <riferimento-missione>` reads the durable status, next checkpoint, risks,
  and the no-unauthorized-external-action statement.
- The Workflow starts at Fabio approval plus Quality and Operator-Safety/Risk Guardian
  checkpoints; it does not invoke an agent or any external system.
- The Metodo Veloce production line now has a durable queue, exact-version Fabio review,
  internal calendar, metrics record, and archive. Each production carries an editorial
  plan, 7-slide carousel, TikTok script, Instagram copy, variants, claim-risk block,
  Quality Guardian report, and weekly metrics plan. It remains preparation-only and
  never publishes automatically.
- The controlled production runtime now persists jobs, claims at most one due job per
  requested tick, recovers expired leases after restart, uses bounded retry/backoff,
  sends exhausted jobs to a dead-letter queue, and exposes safe health counts.
- Telegram now exposes `/productions` and `/production <id>` in the configured private
  chat. A waiting production can receive exactly one Fabio approval for the internal
  calendar through a bound, one-use confirmation; it is never published from Telegram.

## Required next scope

- Complete the private-phone continuity test: `/mission`, `/mission quick`, then a
  repeated `/mission quick` or `/status` while the same operator remains running.
- Add a Research Agent adapter that accepts only attributable, timestamped evidence and
  fails closed when no authorized source is available. It must not depend on an OpenAI
  key or browse the web until those credentials and scopes are deliberately enabled.
- Design publication adapters as separate, least-privilege integrations: selected
  channel, asset, planned time, final human confirmation, idempotency key, audit result,
  and an immediate disable switch. No adapter is authorized yet.
- Design the external-metrics import boundary with source attribution, time window,
  deduplication, declared currency, and correction history before continuous
  improvement is calculated.
- Keep all Telegram data minimization, replay protection, durable state, private
  allowlisting, safe diagnostics, and cost limits intact.

## Forbidden scope

- No automatically started scheduler, worker loop, automatic restart, or cloud
  deployment. The existing worker runs only through explicit controlled ticks.
- No publication, email, CRM change, customer contact, spending, deployment, merge,
  browsing, provider/model call, tool execution, or external action.
- No use, storage, or request for Fabio's OpenAI key in this scope.
- No Telegram personal-account observation or Developer Control Plane.
