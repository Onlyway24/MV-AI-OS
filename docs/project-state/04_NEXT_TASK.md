# Next Task

## Milestone name

Durable SQLite Memory Persistence

## Goal

Make the existing policy-governed Memory Service durable across process restarts
without changing Core Brain, memory contracts, or memory visibility behavior.

## Why it matters

Task identity and audit history now survive restart, but execution context still loses
all approved memory when the process stops. Durable memory is the next concrete
capability required for a recoverable local runtime and is already bounded by validated
records, scopes, retention rules, permissions, and an injected `MemoryService`.

## Required scope

- Define the minimum storage-neutral memory repository boundary required by the
  existing Memory Service behavior.
- Implement a repository-backed Memory Service that preserves current validation,
  permission, scope, visibility, expiry, ordering, write, conflict, and soft-delete
  semantics.
- Extend the existing SQLite schema through an explicit forward migration.
- Implement the SQLite memory repository behind the new repository interface.
- Validate every memory record on write and read.
- Keep Core Brain dependent only on `MemoryReader`.
- Add repository conformance shared by deterministic in-memory and SQLite test
  adapters.
- Add restart tests proving permitted memory survives adapter reconstruction and
  deleted or expired memory remains unavailable.
- Preserve deterministic retrieval ordering.

## Forbidden scope

- Knowledge, workflow, approval, or tool persistence.
- Changes to Content Agent behavior.
- Changes to policy or effective-permission calculation.
- Vector search, embeddings, semantic similarity providers, full-text extensions, or
  external databases.
- HTTP, dashboard, n8n, external APIs, SDKs, real model providers, or tool execution.
- A general-purpose persistence framework or speculative data-access abstraction.

## Likely files to create

- `src/memory/memory-repository.ts`
- `src/memory/repository-backed-memory-service.ts`
- `src/persistence/sqlite/sqlite-memory-repository.ts`
- `tests/memory/repository-conformance.ts`
- `tests/memory/sqlite-memory-repository.test.ts`
- `tests/memory/repository-backed-memory-service.test.ts`

## Likely files to modify

- `src/persistence/sqlite/sqlite-schema.ts`
- `src/index.ts`
- the test-only in-memory memory adapter or a dedicated test repository
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` if the memory persistence model establishes a
  durable decision

## Tests required

- Memory repository conformance for write, lookup, deterministic search, duplicate
  identity, and soft deletion.
- Existing Memory Service validation and policy behavior against the repository-backed
  implementation.
- Workspace, actor, task, session, category, visibility, permission-tag, expiry, and
  deletion filtering.
- Restart durability for accepted memory records.
- Restart behavior for deleted and expired records.
- Corrupt stored memory rejection.
- SQLite migration from schema version 1 to the memory-enabled version.
- Existing Core Brain, Content Agent, and SQLite lifecycle tests continue passing.

## Acceptance criteria

- A valid permitted memory record written before shutdown can enrich a later execution
  after reopening the same SQLite database.
- Deleted, expired, out-of-scope, or unauthorized memory never enters execution
  context.
- Memory domain and Core modules import no SQLite types.
- SQLite schema version 1 databases upgrade deterministically without losing task,
  request, or audit data.
- No behavior outside memory persistence changes.

## Definition of done

- The repository-backed Memory Service and SQLite memory adapter are implemented and
  tested.
- Existing in-memory behavior remains conformant.
- Project-state documents accurately describe the new durable memory state.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
