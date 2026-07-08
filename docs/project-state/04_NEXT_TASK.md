# Next Task

## Milestone name

Controlled Model Budget Enforcement

## Goal

Add provider-neutral budget enforcement for model usage so MV AI OS can deny model
requests that would exceed explicit local model budgets before deeper autonomy or
broader provider use is enabled.

## Why it matters

Controlled Model Usage Accounting makes per-response estimated cost visible from
validated usage and explicit pricing. The next risk is uncontrolled spend across
requests: Fabio needs deterministic budget gates before model autonomy, live provider
expansion, scheduled work, or guardian agents can safely grow.

## Required scope

- Define provider-neutral model budget contracts.
- Validate budget configuration at the local runtime boundary.
- Enforce budgets outside Core Brain and agents.
- Use explicit budgets only; do not infer spend from provider billing systems.
- Preserve existing model operation limits and usage accounting.
- Keep automated tests deterministic and offline.
- Ensure budget failures contain no prompts, provider payloads, API keys, resolved
  secret values, or raw provider diagnostics.

## Forbidden scope

- Billing, payments, subscriptions, dashboards, external telemetry, HTTP, n8n, MCP,
  workflow execution, real tool execution, embeddings, vector search, browser
  automation, or live provider calls in the default test suite.
- Durable usage ledgers unless strictly required by the budget contract and kept
  behind existing persistence boundaries.
- Hardcoded pricing or budgets.
- Changing Core Brain, agent, memory, knowledge, repository, SQLite, backup/restore,
  workflow, tool, or CLI request behavior unless strictly required by the budget
  boundary.

## Likely files to create

- `src/models/model-budget.ts`
- `src/models/model-budget-validator.ts`
- `src/models/model-budget-enforcer.ts`
- `tests/models/model-budget-enforcement.test.ts`

## Likely files to modify

- `src/models/validated-llm-gateway.ts`
- `src/runtime/local-runtime-config.ts`
- `src/runtime/local-runtime-config-validator.ts`
- `src/runtime/create-local-runtime.ts`
- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid budget configuration is accepted.
- Invalid budget configuration fails closed.
- Requests with configured maximum per-call cost pass when within budget.
- Requests are denied when requested or estimated usage cost exceeds budget.
- Missing accounting data does not invent spend.
- Budget failures are redaction-safe.
- Existing model operation-limit, usage-accounting, OpenAI fake-transport, runtime,
  CLI, persistence, backup, restore, and governed content tests continue passing.

## Acceptance criteria

- Model budget enforcement is provider-neutral, deterministic, runtime validated, and
  outside Core Brain and agents.
- Budgets are explicit and fail closed when required budget data is missing.
- Operation limits and usage accounting continue to work unchanged.
- No live network access is introduced into default tests.
- No sensitive data is stored or surfaced for budgeting.

## Definition of done

- Budget contracts, validators, enforcement implementation, and deterministic tests
  are complete.
- Project-state documents accurately describe the budget boundary.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- The milestone is committed before continuing to Cost Guardian Foundation.
