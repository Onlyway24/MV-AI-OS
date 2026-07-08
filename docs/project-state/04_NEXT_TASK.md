# Next Task

## Milestone name

Cost Guardian Foundation

## Goal

Add a provider-neutral, deterministic Cost Guardian foundation that reports model cost
risk from sanitized operation-limit, usage-accounting, and budget-enforcement signals
without executing models, tools, network calls, workflows, alerts, or dashboards.

## Why it matters

MV AI OS now has operation limits, usage accounting, and budget enforcement at the
model gateway boundary. The next operator need is visibility: Fabio should receive
concise cost-risk assessments and recommendations without becoming a babysitter and
without allowing the guardian itself to burn tokens or bypass architecture.

## Required scope

- Define Cost Guardian report contracts.
- Define sanitized cost signal contracts.
- Validate Cost Guardian inputs and reports at runtime.
- Produce deterministic report-only recommendations from supplied sanitized data.
- Keep Cost Guardian provider-neutral and independent of provider SDKs.
- Keep Cost Guardian outside Core Brain execution behavior unless strictly required.
- Ensure reports never include prompts, completions, provider payloads, raw provider
  diagnostics, API keys, secret references, resolved secret values, raw knowledge, or
  raw transcript text.

## Forbidden scope

- Live model calls.
- Provider SDK integration.
- Background agents, schedulers, alerts, Telegram, email, dashboards, HTTP, n8n, MCP,
  workflow execution, real tool execution, billing, payments, subscriptions,
  embeddings, vector search, or browser automation.
- Durable usage ledgers unless project-state is first updated with a separate
  persistence milestone.
- Autonomous blocking behavior outside the existing gateway budget enforcement.
- Hardcoded provider pricing.
- Changes to Core Brain, agents, memory, knowledge, repositories, SQLite,
  backup/restore, workflow, tool, or CLI request behavior unless strictly required by
  the report boundary.

## Likely files to create

- `src/guardians/cost-guardian.ts`
- `src/guardians/cost-guardian-validator.ts`
- `src/guardians/cost-guardian-service.ts`
- `tests/guardians/cost-guardian.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid cost signals are accepted.
- Invalid cost signals and reports are rejected.
- Reports are deterministic.
- Over-budget signals produce high-severity recommendations.
- Missing usage/cost data is reported as uncertainty, not invented spend.
- Reports redact or exclude prompts, completions, provider payloads, raw diagnostics,
  secret identifiers, secret values, and raw source content.
- Existing operation-limit, usage-accounting, budget-enforcement, OpenAI
  fake-transport, runtime, CLI, persistence, backup, restore, and governed content
  tests continue passing.

## Acceptance criteria

- Cost Guardian is report-only, provider-neutral, deterministic, runtime validated,
  and does not call models or providers.
- Cost Guardian consumes only sanitized supplied signals.
- No external integrations, background behavior, or new persistence are added.
- Existing model gateway enforcement remains the only automatic budget blocking path.

## Definition of done

- Cost Guardian contracts, validators, deterministic reporting implementation, and
  tests are complete.
- Project-state documents accurately describe the Cost Guardian foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before moving beyond the cost-governance chapter.
