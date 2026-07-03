# Next Task

## Milestone name

Durable SQLite Knowledge Persistence

## Goal

Make the existing policy-governed Knowledge Service durable across process restarts
without changing Core Brain, Content Agent, knowledge contracts, or retrieval
semantics.

## Why it matters

Task lifecycle and approved memory now survive restart, but governed model-backed
execution still loses its knowledge records when the process stops. The existing
`KnowledgeRepository` and repository-backed service already define the required
storage-neutral boundary, so a SQLite adapter adds real recoverability without a new
foundation.

## Required scope

- Implement SQLite storage behind the existing `KnowledgeRepository` interface.
- Extend the existing SQLite schema through an explicit version 2 to version 3
  migration.
- Validate every knowledge record on write and read.
- Preserve workspace, actor visibility, required scopes, permission tags, source
  types, tags, freshness, expiry, deletion, text matching, result limits, and
  deterministic ordering.
- Reuse the existing knowledge repository conformance suite against SQLite.
- Add restart tests proving permitted knowledge survives adapter reconstruction and
  can enrich a later governed execution context.
- Add corruption and migration tests that preserve existing lifecycle and memory data.

## Forbidden scope

- Workflow, approval, or tool persistence.
- Changes to Core Brain, Content Agent, policy calculation, or knowledge contracts.
- Vector search, embeddings, semantic similarity providers, or full-text extensions.
- HTTP, dashboard, n8n, external APIs, SDKs, real model providers, or tool execution.
- A second Knowledge Service or a parallel persistence abstraction.

## Likely files to create

- `src/persistence/sqlite/sqlite-knowledge-repository.ts`
- `tests/knowledge/sqlite-knowledge-repository.test.ts`

## Likely files to modify

- `src/persistence/sqlite/sqlite-schema.ts`
- `src/persistence/sqlite/sqlite-record-codec.ts`
- `src/index.ts`
- knowledge test fixtures or conformance utilities only where adapter-neutral reuse
  requires it
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` if a durable knowledge decision is established

## Tests required

- Existing Knowledge Repository conformance against SQLite.
- Valid and invalid knowledge record persistence.
- Workspace and actor isolation.
- Required-scope and permission-tag filtering.
- Tag, source-type, freshness, expiry, deletion, and text filtering.
- Deterministic bounded result ordering.
- Restart durability and execution-context enrichment.
- Corrupt stored knowledge rejection.
- SQLite schema version 2 to version 3 migration.
- Migration preserves task, request, audit, and memory records.
- Existing Core Brain, Content Agent, Memory, and lifecycle tests continue passing.

## Acceptance criteria

- Permitted knowledge stored before shutdown is retrievable after reopening the same
  SQLite database.
- Unauthorized, expired, deleted, stale, or out-of-scope knowledge never enters an
  execution context.
- Knowledge and Core modules import no SQLite types.
- Schema version 2 databases upgrade deterministically without losing existing state.
- No behavior outside knowledge persistence changes.

## Definition of done

- The SQLite Knowledge Repository is implemented and passes existing conformance.
- Restart, corruption, migration, and governed-context tests pass.
- Project-state documents accurately describe the new durable knowledge state.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
