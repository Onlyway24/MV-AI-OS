# Next Task

## Milestone name

Durable SQLite Task Lifecycle

## Goal

Implement the first production persistence adapter by backing the existing task,
request, audit, and transaction interfaces with local SQLite while preserving every
current domain contract and repository conformance rule.

## Why it matters

MV AI OS can now execute a complete governed content task, but all end-to-end state is
held by test in-memory repositories. Durable task identity, audit history, replay, and
restart recovery are the next prerequisite for a usable local runtime.

## Required scope

- Implement a SQLite-backed `RepositoryTransactionRunner`.
- Implement SQLite adapters for `TaskRepository`, `RequestRepository`, and
  `AuditRepository` only.
- Preserve atomic task transition, request response, and audit event writes.
- Add schema initialization and explicit schema versioning.
- Store JSON-compatible domain records without changing their contracts.
- Normalize SQLite conflicts and invalid records into existing repository errors.
- Reuse the existing repository conformance suite.
- Add restart tests proving task and replay state survive adapter reconstruction.
- Keep connection/path ownership in the adapter boundary.

## Forbidden scope

- Memory or knowledge persistence.
- Workflow, approval, or tool execution state.
- Postgres, vector databases, HTTP, n8n, dashboard, external APIs, SDKs, or model
  providers.
- Changes to Core Brain behavior, public domain contracts, task transitions, policy,
  agents, or gateways.
- A second persistence abstraction parallel to the existing repositories.

## Likely files to create

- `src/persistence/sqlite/sqlite-repository-transaction-runner.ts`
- `src/persistence/sqlite/sqlite-task-repository.ts`
- `src/persistence/sqlite/sqlite-request-repository.ts`
- `src/persistence/sqlite/sqlite-audit-repository.ts`
- `src/persistence/sqlite/sqlite-schema.ts`
- `src/persistence/sqlite/sqlite-error.ts`
- `tests/persistence/sqlite-repositories.test.ts`

## Likely files to modify

- `src/index.ts`
- repository conformance test utilities only if adapter-neutral reuse requires it
- project configuration only if the pinned Node runtime cannot supply the required
  SQLite capability without a dependency
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` if SQLite storage details establish a durable
  decision

## Tests required

- Existing task/request/audit repository conformance against SQLite.
- Atomic commit and rollback.
- Duplicate task, request, and audit identifiers normalize correctly.
- Optimistic task conflicts normalize correctly.
- Invalid state transitions remain rejected.
- Request replay survives closing and reopening the adapter.
- Conflicting request payload remains rejected after restart.
- Stored responses and audit events retain exact ownership and ordering.
- Invalid or unsupported schema versions fail startup.
- Existing in-memory and Core Brain tests continue passing.

## Acceptance criteria

- Core Brain can use the SQLite transaction runner without importing SQLite types.
- A completed request is replayed after constructing a new runner for the same
  database.
- Task transition, request response, and audit persistence remain atomic.
- The adapter passes the same behavior required of existing repository interfaces.
- No other module gains database-specific imports.

## Definition of done

- SQLite task/request/audit adapters and migrations are implemented and tested.
- Project-state documents describe the durable repository state accurately.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
