# Next Task

## Milestone name

Incident Guardian Foundation

## Goal

Add a provider-neutral, deterministic Incident Guardian foundation that evaluates
supplied sanitized operational signals and guardian findings and produces local
operator-facing incident findings without sending alerts, calling external systems,
mutating state, scheduling work, or running autonomously.

## Why it matters

MV AI OS now has cost, security, and backup guardian foundations. Before external
integrations, workflows, 24/7 operation, dashboards, or n8n are introduced, Fabio
needs deterministic visibility into repeated failures and high-severity safety
signals without becoming a babysitter and without allowing the incident layer itself
to take action.

## Required scope

- Define Incident Guardian report contracts.
- Define sanitized incident signal contracts.
- Validate Incident Guardian inputs and reports at runtime.
- Produce deterministic report-only recommendations from supplied sanitized signals.
- Support repeated model failures, budget blocks, operation-limit blocks, invalid
  configuration attempts, backup/restore verification failures, provider unavailable
  patterns, and high-severity cost/security/backup findings where represented.
- Keep Incident Guardian provider-neutral and independent of provider SDKs, alerting
  systems, schedulers, and external services.
- Keep Incident Guardian outside Core Brain execution behavior unless strictly
  required.
- Ensure reports never include raw prompts, completions, provider payloads, provider
  diagnostics, secret references, resolved secret values, sensitive paths, raw
  database records, raw transcripts, raw knowledge, raw memory, or transport
  internals.

## Forbidden scope

- Sending alerts.
- Calling external systems.
- Scheduling incident checks.
- Running in the background.
- Network calls.
- Live model calls.
- Provider SDK integration.
- Telegram, email, dashboards, HTTP, n8n, MCP, workflow execution, real tool
  execution, billing, payments, subscriptions, embeddings, vector search, browser
  automation, or filesystem scanning.
- Durable incident ledgers unless project-state is first updated with a separate
  persistence milestone.
- Autonomous blocking or remediation behavior.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore operations, workflow, tool, CLI, or model request behavior unless
  strictly required by the report boundary.

## Likely files to create

- `src/guardians/incident-guardian.ts`
- `src/guardians/incident-guardian-validator.ts`
- `src/guardians/incident-guardian-service.ts`
- `tests/guardians/incident-guardian.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid sanitized incident signals are accepted.
- Invalid incident signals and reports are rejected.
- Reports are deterministic.
- Normal state produces no incident findings.
- Repeated failures produce findings.
- High-severity supplied guardian findings escalate incident severity.
- Reports redact or exclude prompts, completions, provider payloads, raw diagnostics,
  secret identifiers, secret values, paths, raw database records, transcripts,
  knowledge, memory, and transport internals.
- Existing cost, security, backup, model, runtime, CLI, persistence, backup/restore,
  and governed content tests continue passing.

## Acceptance criteria

- Incident Guardian is report-only, provider-neutral, deterministic, runtime
  validated, and does not alert, call network, call models, mutate state, schedule
  work, execute tools, or run autonomously.
- Incident Guardian consumes only supplied sanitized incident signals and guardian
  finding summaries.
- No external integrations, background behavior, source scanning, or new persistence
  are added.
- Existing policy, runtime validation, model-gateway, backup/restore, and repository
  boundaries remain unchanged.

## Definition of done

- Incident Guardian contracts, validators, deterministic reporting implementation,
  and tests are complete.
- Project-state documents accurately describe the Incident Guardian foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving to Quality Guardian Foundation.
