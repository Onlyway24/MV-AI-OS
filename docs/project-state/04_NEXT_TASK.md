# Next Task

## Milestone name

Controlled Model Usage Accounting

## Goal

Add provider-neutral model usage accounting so MV AI OS can report model usage and
estimated cost from validated model responses without coupling Core Brain or agents to
provider pricing details.

## Why it matters

Controlled Model Operation Limits now prevent unbounded provider calls, oversized
requests, excessive output-token requests, excessive timeout requests, and retry
loops. The next production-model risk is operator visibility: Fabio needs a
deterministic way to understand usage and estimated cost after model calls without
storing prompts, secrets, provider payloads, or raw diagnostics.

## Required scope

- Define a provider-neutral model pricing/usage-accounting contract.
- Validate pricing/accounting configuration at the local runtime boundary.
- Calculate estimated usage cost only from validated `ModelUsage` and explicit
  pricing configuration.
- Keep the calculation outside Core Brain and agents.
- Preserve existing gateway operation limits and provider failure normalization.
- Keep automated tests deterministic and offline.
- Ensure accounting output contains no prompts, provider payloads, API keys, resolved
  secret values, or raw provider diagnostics.

## Forbidden scope

- Live provider calls in the default test suite.
- Billing, payments, subscriptions, quotas, dashboards, external monitoring,
  telemetry exporters, HTTP, n8n, MCP, workflow execution, real tool execution,
  embeddings, vector search, or browser automation.
- Hardcoding provider pricing without explicit local configuration.
- Persisting prompts, provider payloads, resolved secrets, raw provider diagnostics,
  or full model outputs solely for accounting.
- Changing Core Brain, agent, memory, knowledge, repository, SQLite, backup/restore,
  workflow, tool, or CLI request behavior unless strictly required by the accounting
  boundary.

## Likely files to create

- `src/models/model-pricing.ts`
- `src/models/model-pricing-validator.ts`
- `src/models/model-usage-accounting.ts`
- `tests/models/model-usage-accounting.test.ts`

## Likely files to modify

- `src/runtime/local-runtime-config.ts`
- `src/runtime/local-runtime-config-validator.ts`
- `src/runtime/create-local-runtime.ts`
- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid pricing/accounting configuration is accepted.
- Invalid pricing/accounting configuration fails closed.
- Estimated cost is calculated deterministically from validated usage.
- Missing usage does not invent cost.
- Unknown model/profile pricing fails closed where pricing is required.
- Accounting results never include prompts, secret values, raw provider diagnostics,
  or provider payloads.
- Existing operation-limit, OpenAI fake-transport, runtime, CLI, persistence, backup,
  restore, and governed model-content tests continue passing.

## Acceptance criteria

- Model usage accounting is provider-neutral, deterministic, and runtime validated.
- Cost estimates come only from explicit pricing configuration and validated usage.
- Core Brain and agents remain provider-neutral and unaware of provider pricing.
- No live network access is introduced into default tests.
- No sensitive data is stored or surfaced for accounting.

## Definition of done

- Usage-accounting contracts, validators, implementation, and deterministic tests are
  complete.
- Project-state documents accurately describe the new accounting boundary.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user's explicit commit
  instruction.
