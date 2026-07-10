# Next Task

## Milestone name

Workflow Persistence and Atomic Audit

## Goal

Add durable SQLite-backed Workflow Runtime persistence, restart-safe idempotency,
optimistic concurrency, and atomic redaction-safe audit evidence by reusing the
existing persistence architecture.

## Why it matters

The Workflow Runtime domain can now validate deterministic, non-executing state
transitions in memory. Before a future readiness engine or any execution boundary can
rely on it, its authoritative workflow state must survive restart, reject stale
writes, replay duplicate commands safely, and leave durable audit evidence without
partial writes.

## Required scope

- Add minimal additive SQLite migrations under the existing schema/versioning system.
- Add repository-consistent abstractions for immutable Workflow Definitions, Workflow
  Instances, processed command receipts, and Workflow Events.
- Persist Workflow Step state, blockers, failures, stop reasons, versions, and
  non-execution declarations already represented by the Workflow Runtime contracts.
- Use the existing transaction runner so each state-changing command atomically writes
  the updated instance, step state where applicable, processed-command receipt,
  redaction-safe event, and incremented version.
- Enforce exact persisted versions and return structured, redaction-safe stale-write
  conflicts without consuming the command or writing a successful event.
- Preserve restart-safe duplicate-command replay: an identical command ID and payload
  returns its stable prior result without a second version increment or event; a
  reused ID with different payload fails closed.
- Add validated JSON serialization/deserialization and fail closed for malformed,
  incompatible, or unsafe stored records and missing definition references.
- Ensure deterministic event order, bounded event reads, transaction rollback, and
  backup/restore compatibility through the existing local SQLite recovery design.
- Add deterministic SQLite repository conformance, restart, conflict, rollback,
  corruption, redaction, and backup/restore coverage using temporary local databases.
- Update all affected project-state documents after implementation.

## Forbidden scope

- Agent, model, provider, tool, browser, filesystem, network, publishing, sales
  outreach, payment, or customer-delivery execution.
- CLI workflow commands, HTTP, dashboard, n8n, external APIs, scheduling, background
  workers, autonomous loops, retries, dependency readiness/scheduling behavior, or
  approval/guardian checkpoint engines.
- A second persistence framework or database, destructive migrations, data rewrite,
  schema/table removal, provider-specific storage, or event sourcing. The current
  Workflow Instance remains the authoritative state.
- Changes to CoreBrain or Content Agent behavior unless a confirmed persistence
  integration defect makes a minimal compatible change necessary.

## Likely files to create

- `src/workflows/runtime/workflow-persistence.ts`
- `src/workflows/runtime/workflow-persistence-validator.ts`
- `src/workflows/runtime/workflow-persistence-service.ts`
- `src/persistence/sqlite/sqlite-workflow-definition-repository.ts`
- `src/persistence/sqlite/sqlite-workflow-instance-repository.ts`
- `src/persistence/sqlite/sqlite-workflow-command-receipt-repository.ts`
- `src/persistence/sqlite/sqlite-workflow-event-repository.ts`
- `tests/workflows/workflow-persistence.test.ts`
- `tests/persistence/sqlite-workflow-repositories.test.ts`

## Likely files to modify

- `src/persistence/repository-transaction.ts`
- `src/persistence/sqlite/sqlite-schema.ts`
- `src/persistence/sqlite/sqlite-record-codec.ts`
- `src/persistence/sqlite/sqlite-repository-transaction-runner.ts`
- existing SQLite backup/restore or test support only where explicit workflow-table
  registration is required.
- `src/index.ts`
- affected repository test-support files and project-state documents.

## Tests required

- Create and reload an immutable Workflow Definition; reject conflicting replacement.
- Create and reload an instance, including step state and exact version.
- Persist state transitions and recover them after a genuine repository/runtime
  recreation.
- Replay duplicate commands after restart without a second transition, version
  increment, or event; reject command-ID payload conflicts.
- Reject stale and concurrent expected-version writes so only one command from a
  starting version succeeds.
- Prove state, receipt, event, and version update atomically; prove rollback when the
  instance, receipt, event, or version write fails and that no partial state remains.
- Prove deterministic, bounded event ordering.
- Reject missing definitions, malformed definition/instance/receipt/event records,
  unsafe stored text, and redaction-unsafe errors.
- Prove backup/restore retains definitions, instances, step state, versions, receipts,
  events, and duplicate-command idempotency where the existing recovery architecture
  automatically includes the new tables.
- Prove no AgentRuntime, model/provider/tool execution, network behavior, or CLI
  change is introduced, and retain all existing test coverage.

## Acceptance criteria

- Workflow state survives process restart.
- Duplicate commands remain idempotent after restart.
- Stale writes fail safely and do not write successful transition evidence.
- State, command receipt, event, and version change atomically.
- Transaction failure leaves no partial persistent state.
- Every persisted value is validated on read and missing definitions fail closed.
- Events are deterministic, bounded, and redaction-safe.
- The migration is additive and compatible with existing backup/restore behavior.
- Full lint, typecheck, test, build, and diff checks pass.
- The milestone is delivered in a separate local commit with a clean working tree.

## Definition of done

Durable workflow persistence and atomic audit evidence exist only behind validated,
storage-neutral repositories and the existing SQLite transaction boundary. The
implementation remains fully non-executing. The next milestone is **Dependency
Scheduler and Step Readiness Engine**.
