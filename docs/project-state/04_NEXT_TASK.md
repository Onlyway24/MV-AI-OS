# Next Task

## Milestone name

Security Guardian Foundation

## Goal

Add a provider-neutral, deterministic Security Guardian foundation that evaluates
supplied sanitized security signals and produces local operator-facing warnings
without scanning live systems, calling models, sending alerts, mutating state, or
executing tools.

## Why it matters

MV AI OS now has cost visibility after operation limits, usage accounting, and budget
enforcement. The next founder/operator risk is unsafe expansion: secrets, provider
diagnostics, prompt content, raw tool payloads, or unreviewed external actions must
not leak or execute as the system grows. Security Guardian should make those risks
visible without becoming an autonomous actor.

## Required scope

- Define Security Guardian report contracts.
- Define sanitized security signal contracts.
- Validate Security Guardian inputs and reports at runtime.
- Produce deterministic report-only recommendations from supplied sanitized data.
- Keep Security Guardian provider-neutral and independent of provider SDKs.
- Keep Security Guardian outside Core Brain execution behavior unless strictly
  required.
- Ensure reports never include prompts, completions, provider payloads, raw provider
  diagnostics, API keys, secret references, resolved secret values, raw knowledge, raw
  memory, raw transcript text, local file contents, or transport internals.

## Forbidden scope

- Live model calls.
- Repository-wide scanners or filesystem crawling.
- Provider SDK integration.
- Background agents, schedulers, alerts, Telegram, email, dashboards, HTTP, n8n, MCP,
  workflow execution, real tool execution, billing, payments, subscriptions,
  embeddings, vector search, browser automation, or network access.
- Durable security ledgers unless project-state is first updated with a separate
  persistence milestone.
- Autonomous blocking behavior outside existing policy, runtime validation, and
  gateway enforcement paths.
- Provider-specific Security Guardian logic.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore, workflow, tool, CLI, or model request behavior unless strictly
  required by the report boundary.

## Likely files to create

- `src/guardians/security-guardian.ts`
- `src/guardians/security-guardian-validator.ts`
- `src/guardians/security-guardian-service.ts`
- `tests/guardians/security-guardian.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid sanitized security signals are accepted.
- Invalid security signals and reports are rejected.
- Reports are deterministic.
- Missing policy or approval markers produce warnings.
- Secret exposure markers produce high-severity recommendations without exposing the
  secret or secret reference.
- Raw prompt, completion, provider payload, diagnostics, file content, and transport
  internals are rejected or excluded from reports.
- Existing cost, model, runtime, CLI, persistence, backup, restore, and governed
  content tests continue passing.

## Acceptance criteria

- Security Guardian is report-only, provider-neutral, deterministic, runtime
  validated, and does not call models, providers, filesystems, network, tools, or
  external systems.
- Security Guardian consumes only supplied sanitized signals.
- No external integrations, background behavior, source scanning, or new persistence
  are added.
- Existing policy, runtime validation, model-gateway, and repository boundaries remain
  unchanged.

## Definition of done

- Security Guardian contracts, validators, deterministic reporting implementation, and
  tests are complete.
- Project-state documents accurately describe the Security Guardian foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving beyond the guardian-foundation chapter.
