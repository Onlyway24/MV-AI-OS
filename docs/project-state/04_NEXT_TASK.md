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
  plan, 6-slide carousel, TikTok script, Instagram copy, variants, claim-risk block,
  Quality Guardian report, and weekly metrics plan. It remains preparation-only and
  never publishes automatically.
- The controlled production runtime now persists jobs, claims at most one due job per
  requested tick, recovers expired leases after restart, uses bounded retry/backoff,
  sends exhausted jobs to a dead-letter queue, and exposes safe health counts.
- Telegram now exposes `/productions` and `/production <id>` in the configured private
  chat. A waiting production can receive exactly one Fabio approval for the internal
  calendar through a bound, one-use confirmation; it is never published from Telegram.
- The Evidence Plane now has a durable Source Registry and immutable evidence records
  with attribution, source/content/acquisition dates, SHA-256 fingerprint, bounded
  excerpt, claim mapping, limits, freshness, risk domain, and status. Unauthorized and
  stale evidence fails closed; high-risk verified claims require independent support.
- The External Action Plane now creates exact-version publication dry-runs only. It
  persists account/platform/time/package fingerprint/idempotency key, separate final
  authorization, terminal receipt including `UNCERTAIN`, and a workspace-global kill
  switch. It has no platform connector and no retry operation.
- The Feedback Plane now accepts append-only, fingerprinted external snapshots only
  after a confirmed publication receipt. Corrections are linked rather than overwritten;
  conversions require verified attribution.

## Required next scope

- Import the first attributable Metodo Veloce analytics export through the strict CSV
  adapter. The first bounded Google Trends Italy snapshot is already durable: classify
  it without treating unclassified attention as demand. Then obtain Fabio's exact
  authorization for the six-account 2+2+1+1 competitor set, capture one attributable
  public observation per account, and verify Commercial Music Library compatibility.
  Keep every missing field absent and every publishing action locked.

- Complete the private-phone continuity test: `/mission`, `/mission quick`, then a
  repeated `/mission quick` or `/status` while the same operator remains running.
- Add a least-privilege Research Agent adapter that can use only Source Registry
  entries explicitly authorized for its task. It must preserve the current evidence
  contract and fail closed on unavailable, stale or conflicting support. No web access
  or OpenAI key is authorized yet.
- Design and separately authorize a platform connector. It must recheck the kill
  switch, exact authorization and idempotency key immediately before a call, then write
  the returned receipt without treating delivery uncertainty as success.
- Design and separately authorize provider-specific metric import connectors. They must
  produce the existing snapshot fingerprints and attribution data; they may not create
  synthetic metrics or update history in place.
- Keep all Telegram data minimization, replay protection, durable state, private
  allowlisting, safe diagnostics, and cost limits intact.

## Forbidden scope

- No automatically started scheduler, worker loop, automatic restart, or cloud
  deployment. The existing worker runs only through explicit controlled ticks.
- No publication, email, CRM change, customer contact, spending, deployment, merge,
  browsing, provider/model call, tool execution, or external action.
- No use, storage, or request for Fabio's OpenAI key in this scope.
- No Telegram personal-account observation or Developer Control Plane.
