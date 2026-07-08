# Next Task

## Milestone name

Backup Guardian Foundation

## Goal

Add a provider-neutral, deterministic Backup Guardian foundation that evaluates
supplied sanitized backup and restore readiness state and produces local
operator-facing warnings without scheduling, creating, restoring, uploading,
deleting, or mutating backups.

## Why it matters

MV AI OS now has local SQLite backup/restore operations and deterministic cost and
security guardian foundations. Before moving toward VPS/cloud, 24/7 execution,
external integrations, or deeper orchestration, Fabio needs a local control-plane
view of whether recovery posture is safe enough to proceed.

## Required scope

- Define Backup Guardian report contracts.
- Define sanitized backup/restore state contracts.
- Validate Backup Guardian inputs and reports at runtime.
- Produce deterministic report-only recommendations from supplied sanitized state.
- Keep Backup Guardian provider-neutral and independent of filesystem scanning,
  storage-provider SDKs, cloud APIs, schedulers, and external services.
- Keep Backup Guardian outside Core Brain execution behavior unless strictly
  required.
- Ensure reports never include raw file contents, sensitive local paths, secret
  references, resolved secret values, raw database records, raw prompts, raw
  completions, raw provider payloads, raw transcripts, or transport internals.

## Forbidden scope

- Creating backups automatically.
- Restoring backups automatically.
- Scheduling backups.
- Uploading backups.
- Deleting backups.
- Mutating backup files.
- Scanning the filesystem.
- Network calls.
- Live model calls.
- Provider SDK integration.
- Background agents, schedulers, alerts, Telegram, email, dashboards, HTTP, n8n, MCP,
  workflow execution, real tool execution, billing, payments, subscriptions,
  embeddings, vector search, or browser automation.
- Durable backup ledgers unless project-state is first updated with a separate
  persistence milestone.
- Autonomous blocking behavior outside existing policy, runtime validation, and
  backup/restore validation paths.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore operations, workflow, tool, CLI, or model request behavior unless
  strictly required by the report boundary.

## Likely files to create

- `src/guardians/backup-guardian.ts`
- `src/guardians/backup-guardian-validator.ts`
- `src/guardians/backup-guardian-service.ts`
- `tests/guardians/backup-guardian.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid sanitized backup state is accepted.
- Invalid backup state and reports are rejected.
- Reports are deterministic.
- Healthy backup state produces no warning.
- Missing source database, missing backup, stale backup, missing restore
  verification, invalid backup path signal, failed restore verification, and
  schema/version mismatch signals produce findings when represented.
- Reports redact or exclude raw paths, raw database records, secret identifiers,
  secret values, prompts, completions, provider payloads, transcripts, and transport
  internals.
- Existing cost, security, model, runtime, CLI, persistence, backup, restore, and
  governed content tests continue passing.

## Acceptance criteria

- Backup Guardian is report-only, provider-neutral, deterministic, runtime validated,
  and does not create, restore, upload, delete, mutate, scan, call models, call
  network, or run autonomously.
- Backup Guardian consumes only supplied sanitized backup/restore state.
- No external integrations, background behavior, source scanning, or new persistence
  are added.
- Existing backup/restore operations, policy, runtime validation, model-gateway, and
  repository boundaries remain unchanged.

## Definition of done

- Backup Guardian contracts, validators, deterministic reporting implementation, and
  tests are complete.
- Project-state documents accurately describe the Backup Guardian foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving to Incident Guardian Foundation.
