# Next Task

## Milestone name

Controlled Local SQLite Backup and Restore

## Goal

Add an operator-controlled, validated way to back up and restore the single local
SQLite source of truth without changing repository contracts or runtime behavior.

## Why it matters

The local runtime now persists task, request, audit, memory, and knowledge state and
has an official process entrypoint. Recovery is the remaining operational safety gap:
durability without a verified backup and restore path does not protect local state
from file loss or corruption.

## Required scope

- Define versioned backup and restore request/result contracts.
- Validate source database identity and schema compatibility.
- Produce a transactionally consistent SQLite backup at an explicit local path.
- Restore only into an explicit, inactive destination after validation.
- Refuse overwrite unless the exact operation explicitly permits it.
- Preserve lifecycle, audit, memory, and knowledge records without reinterpretation.
- Keep backup/restore outside Core Brain and behind a narrow local operations
  boundary.
- Add restart verification against restored data.

## Forbidden scope

- Changes to Core Brain, agents, policy, memory, knowledge, or repository contracts.
- Online restore into a running Local Runtime.
- Cloud storage, remote transfer, HTTP, dashboard, n8n, or external APIs.
- Encryption/key management, scheduling, retention automation, or background jobs.
- Vector search, embeddings, provider SDKs, or tool execution.
- General filesystem tools or arbitrary file-copy capabilities.

## Likely files to create

- `src/persistence/sqlite/sqlite-backup.ts`
- `src/persistence/sqlite/sqlite-backup-contract.ts`
- `src/persistence/sqlite/sqlite-backup-validator.ts`
- `tests/persistence/sqlite-backup.test.ts`

## Likely files to modify

- `src/index.ts` for intentionally public local-operation contracts
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- A valid backup contains all lifecycle, audit, memory, and knowledge data.
- A restored database passes schema identity checks and replays stored task results.
- Backup creation is consistent while writes are bounded by the operation.
- Missing, corrupt, incompatible, or non-MV-AI-OS source databases fail closed.
- Existing destinations are not overwritten without explicit authorization.
- Failed restore leaves no partially accepted destination database.
- Existing persistence, runtime, and CLI tests continue passing.

## Acceptance criteria

- A local operator can create and verify a recoverable SQLite backup.
- Restore produces a database accepted by every existing SQLite adapter.
- Repository and domain contracts remain unchanged.
- No network access or unrelated filesystem capability is introduced.

## Definition of done

- Backup and restore operations are runtime validated and integration-tested.
- Restored state is proven usable through Local Runtime recreation and request replay.
- Project-state documents accurately describe recovery capability.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
