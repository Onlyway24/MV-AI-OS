# Next Task

## Milestone name

Operator Safety Report

## Goal

Create a deterministic local operator-safety report that aggregates existing
redaction-safe guardian reports into one safe, operator-facing view without adding
autonomy, scheduling, alerts, dashboards, network calls, model calls, tool execution,
or persistence.

## Why it matters

MV AI OS now has report-only Cost, Security, Backup, Incident, and Quality Guardian
foundations. Fabio needs one consolidated local safety picture before adding any
dashboard, scheduler, external alerting, workflow execution, n8n, cloud/VPS
operation, or autonomous guardian behavior.

## Required scope

- Define an Operator Safety Report contract.
- Define sanitized guardian-summary input contracts.
- Validate Operator Safety Report inputs and outputs at runtime.
- Aggregate supplied Cost, Security, Backup, Incident, and Quality Guardian summaries
  without importing raw prompts, completions, provider payloads, diagnostics, secret
  references, resolved secret values, sensitive paths, database records, transcripts,
  knowledge, memory, generated content, or transport internals.
- Produce deterministic report-only recommendations and a deterministic overall
  readiness/safety posture.
- Preserve provider neutrality, storage neutrality, and dependency injection.
- Keep the report outside Core Brain execution behavior unless strictly required.

## Forbidden scope

- Calling models.
- Calling providers.
- Reading secrets.
- Scanning source code, filesystems, databases, backups, transcripts, memory, or
  knowledge.
- Running in the background.
- Scheduling checks.
- Sending Telegram, email, Slack, webhook, HTTP, dashboard, or other alerts.
- Mutating files, backups, runtime state, repository state, workflows, tasks,
  content, or external systems.
- Executing tools.
- Adding HTTP, REST APIs, n8n, MCP, dashboards, browser automation, embeddings,
  vector search, cloud integrations, external monitoring, durable ledgers, or new
  persistence.
- Autonomous blocking, remediation, escalation, or approval behavior.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore operations, workflow, tool, CLI, or model request behavior unless
  strictly required by the report boundary.

## Likely files to create

- `src/guardians/operator-safety-report.ts`
- `src/guardians/operator-safety-report-validator.ts`
- `src/guardians/operator-safety-report-service.ts`
- `tests/guardians/operator-safety-report.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid sanitized guardian-summary input is accepted.
- Invalid input and reports are rejected.
- Healthy guardian summaries produce a healthy operator report.
- Warning and critical guardian summaries produce deterministic aggregate findings.
- Missing guardian summaries are reported safely.
- Overall posture is deterministic.
- Report output is redaction-safe and excludes prompts, completions, generated
  content, provider payloads, raw diagnostics, secret identifiers, secret values,
  sensitive paths, raw database records, transcripts, knowledge, memory, and
  transport internals.
- Existing cost, security, backup, incident, quality, model, runtime, CLI,
  persistence, backup/restore, and governed content tests continue passing.

## Acceptance criteria

- Operator Safety Report is local, report-only, provider-neutral, deterministic,
  runtime validated, and consumes only supplied sanitized guardian summaries.
- No external integrations, background behavior, source scanning, filesystem scanning,
  model calls, tool execution, persistence, dashboard, alerting, or autonomous action
  are added.
- Existing policy, runtime validation, model-gateway, guardian, backup/restore, and
  repository boundaries remain unchanged.

## Definition of done

- Operator Safety Report contracts, validators, deterministic reporting
  implementation, and tests are complete.
- Project-state documents accurately describe the Operator Safety Report milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving to Main Assistant / Orchestrator
  Specification Foundation.
