# MV-AI-OS Core V1 Release Report

## Release scope

Core V1 is the deterministic, operator-governed, local MV-AI-OS baseline. It gives
Fabio one bounded local CLI path from a validated Founder Mission Brief through Mission
Planning, quality gating, durable SQLite Workflow creation, approval and Guardian
evidence, exact candidate selection, one deterministic local Content Director result,
explicit outcome review, lifecycle recovery controls, operator reporting, restart, and
bounded audit inspection.

The `v1.0.1-core` correctness hotfix preserves this scope and durable state. It fixes
only the Operator Workflow Report projection: terminal Workflow and Step state now
takes precedence over stale readiness and control findings, so completed or cancelled
work is never presented as requiring approval or Guardian remediation.

The path is version-bound, default-deny, durable, redaction-safe, and local-only. All
mutations pass through existing validators, command/service boundaries, transaction
repositories, and append-only evidence. The implementation uses no live model call,
provider credential, network, browser, tool execution, n8n, scheduler, background
worker, HTTP server, dashboard, publication, outreach, payment, or customer delivery.

## Included capabilities

- 22 allowlisted Core V1 commands on the existing controlled local CLI.
- SQLite schema version 12 with task/request/audit, memory, knowledge, Workflow,
  lifecycle, command-receipt, and local Workflow ownership durability.
- Exact request/command IDs, fingerprints, expected-version checks, conflict rejection,
  and safe replay.
- Atomic Workflow state, receipt, lifecycle, outcome, checkpoint, and audit writes.
- Exact-snapshot Fabio approval and independent `operator_safety` and `quality`
  Guardian evidence.
- Deterministic local Content Director invocation with `externalEffectsAllowed: false`.
- Explicit acceptance, rejection, failure classification, retry authorization and
  execution, pause, resume, cancellation, and timeout evaluation.
- Immutable, bounded, redaction-safe Operator Workflow Reports and command responses.
- Restart recovery through a new Local Runtime over the same SQLite database.

## Adversarial-review findings and disposition

No P0 or unresolved P1 finding remains.

- The Core V1 acceptance replay found that a completed Step could be listed as both
  completed and blocked because report derivation re-applied static approval
  requirements after terminal controls had become `NOT_REQUIRED`. The `v1.0.1-core`
  hotfix gives terminal Workflow and Step state explicit precedence in the immutable
  report projection. Historical approval, Guardian, invocation, outcome, event, and
  audit evidence remains durable and queryable; no persistent record is changed.

- Durable Guardian and approval evidence is considered only when its atomic control
  event exists and its exact Workflow version matches the current decision.
- Retry/failure handling now binds the configured runtime actor and derives accepted
  categories from durable invocation/outcome evidence.
- Local Workflow command receipts now validate response JSON on write and read, verify
  indexed command ID/operation consistency, and reject corrupt or unsafe replay data.
- Durable Agent invocation, Step outcome, and lifecycle records reject unsupported
  fields and invalid result/failure shapes before storage or replay.
- The Core V1 retry slice records fresh Guardian `CLEAR` evidence at the post-retry
  version. Invocation tests create Guardian evidence through the authorized checkpoint
  service, including atomic audit events.

## Verification evidence

At the Core V1 Operator Report correctness hotfix closeout the deterministic local
suite passes:

- `npm run lint`
- `npm run typecheck`
- `npm run test` — 87 test files, 792 tests
- `npm run build`
- `git diff --check`

Focused tests cover local command receipt validation, Core V1 restart slices,
invocation/outcome/lifecycle state, checkpoints, persistence, terminal-report
precedence, and report behavior.

## Known limits and future admission criteria

Core V1 is not an external-action platform. A reserved deterministic invocation can
be replayed after an interrupted local process only because the admitted executor has
no external effects. Any future provider, tool, network, or side-effecting executor
requires an explicit at-most-once/idempotency design before it may participate in this
recovery path.

Formal Workflow Specifications exist but are not yet the admission source for a durable
Core V1 Workflow. The next milestone is **Workflow Specification Admission Boundary**:
it will admit one exact existing specification into the current durable runtime without
adding scheduling, autonomy, network behavior, or external effects.
