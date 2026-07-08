# Next Task

## Milestone name

Quality Guardian Foundation

## Goal

Add a provider-neutral, deterministic Quality Guardian foundation that evaluates
supplied sanitized output and process-quality signals and produces local
operator-facing quality findings without calling models, judging content with AI,
publishing anything, mutating outputs, or running autonomously.

## Why it matters

MV AI OS now has cost, security, backup, and incident guardian foundations. Before
publishing, dashboarding, workflows, n8n, or deeper autonomy are introduced, Fabio
needs deterministic visibility into malformed outputs, missing review, missing
evidence, and repeated validation failures without turning quality review into
another model call or background agent.

## Required scope

- Define Quality Guardian report contracts.
- Define sanitized quality signal contracts.
- Validate Quality Guardian inputs and reports at runtime.
- Produce deterministic report-only recommendations from supplied sanitized signals.
- Support missing final response, malformed result, missing evidence references where
  expected, model-backed output rejected by validator, review-required state, low
  readiness score, incomplete task results, and repeated rejected outputs where
  represented.
- Keep Quality Guardian provider-neutral and independent of provider SDKs, model
  calls, publishing systems, schedulers, and external services.
- Keep Quality Guardian outside Core Brain execution behavior unless strictly
  required.
- Ensure reports never include raw prompts, completions, provider payloads, provider
  diagnostics, secret references, resolved secret values, sensitive paths, raw
  database records, raw transcripts, raw knowledge, raw memory, generated content, or
  transport internals.

## Forbidden scope

- Judging content using AI.
- Calling models.
- Calling providers.
- Publishing content.
- Mutating outputs.
- Sending alerts.
- Scheduling quality checks.
- Running in the background.
- Network calls.
- Provider SDK integration.
- Telegram, email, dashboards, HTTP, n8n, MCP, workflow execution, real tool
  execution, billing, payments, subscriptions, embeddings, vector search, browser
  automation, or filesystem scanning.
- Durable quality ledgers unless project-state is first updated with a separate
  persistence milestone.
- Autonomous blocking or remediation behavior.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore operations, workflow, tool, CLI, or model request behavior unless
  strictly required by the report boundary.

## Likely files to create

- `src/guardians/quality-guardian.ts`
- `src/guardians/quality-guardian-validator.ts`
- `src/guardians/quality-guardian-service.ts`
- `tests/guardians/quality-guardian.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid sanitized quality signals are accepted.
- Invalid quality signals and reports are rejected.
- Reports are deterministic.
- Healthy quality state produces no findings.
- Missing or malformed output produces findings.
- Review-required state produces findings.
- Validation failure state produces findings when represented.
- Reports redact or exclude prompts, completions, generated content, provider
  payloads, raw diagnostics, secret identifiers, secret values, paths, raw database
  records, transcripts, knowledge, memory, and transport internals.
- Existing cost, security, backup, incident, model, runtime, CLI, persistence,
  backup/restore, and governed content tests continue passing.

## Acceptance criteria

- Quality Guardian is report-only, provider-neutral, deterministic, runtime
  validated, and does not call models, judge content with AI, publish, mutate outputs,
  alert, call network, schedule work, execute tools, or run autonomously.
- Quality Guardian consumes only supplied sanitized quality signals.
- No external integrations, background behavior, source scanning, or new persistence
  are added.
- Existing policy, runtime validation, model-gateway, backup/restore, and repository
  boundaries remain unchanged.

## Definition of done

- Quality Guardian contracts, validators, deterministic reporting implementation, and
  tests are complete.
- Project-state documents accurately describe the Quality Guardian foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving to Operator Safety Report.
