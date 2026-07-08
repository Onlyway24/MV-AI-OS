# Next Task

## Milestone name

Controlled Model Operation Limits

## Goal

Add explicit model-operation controls for timeout, retry, and cost handling around
provider invocation while preserving the existing provider-neutral `LlmGateway`,
Core Brain, agents, local runtime contracts, and deterministic offline test path.

## Why it matters

MV AI OS can now compose the production OpenAI provider through controlled local
runtime configuration and secret resolution. The next operational risk is unmanaged
provider behavior: production model calls need bounded invocation attempts,
deterministic timeout handling, and cost-limit enforcement without leaking provider
details or changing agent contracts.

## Required scope

- Define versioned model operation limit contracts for timeout, retry, and cost
  behavior.
- Apply operation limits at the model gateway/provider invocation boundary, not in
  Core Brain or agents.
- Preserve existing request/profile compatibility checks and response ownership
  validation.
- Keep deterministic local and fake OpenAI transport tests offline by default.
- Normalize timeout, retry-exhausted, and cost-limit failures into safe
  provider-neutral model errors.
- Ensure public errors do not expose API keys, secret references, raw provider
  diagnostics, transport payloads, or full prompts.

## Forbidden scope

- Core Brain, agent, memory, knowledge, repository, SQLite, backup/restore, workflow,
  tool, CLI request, dashboard, HTTP, n8n, embedding, or vector-search behavior
  changes.
- Live provider calls in the default test suite.
- Persisting model prompts, provider payloads, API keys, resolved secret values, or
  raw provider diagnostics.
- Adding multi-provider routing, scheduling, telemetry exporters, or dashboard UI.
- Changing the OpenAI adapter into an agent-visible dependency.

## Likely files to create

- `src/models/model-operation-limits.ts`
- `src/models/model-operation-limits-validator.ts`
- `tests/models/model-operation-limits.test.ts`

## Likely files to modify

- `src/models/validated-llm-gateway.ts`
- `src/runtime/create-local-runtime.ts`
- `src/runtime/local-runtime-config.ts`
- `src/runtime/local-runtime-config-validator.ts`
- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Timeout limits produce deterministic provider-neutral timeout failures.
- Retryable provider failures are retried only within the configured bounded budget.
- Non-retryable failures are not retried.
- Retry exhaustion produces a safe normalized failure without raw diagnostics.
- Cost limits remain enforced against request/profile/response usage.
- Deterministic local provider and fake OpenAI transport paths remain offline.
- Existing configuration, secret-resolution, provider-adapter, runtime, CLI,
  persistence, backup, restore, and governed model-content tests continue passing.

## Acceptance criteria

- Provider invocation behavior is bounded by explicit operation limits.
- Gateway and provider errors remain normalized and redaction-safe.
- Core Brain and agents remain provider-neutral.
- No live network access is introduced into default tests.
- No secret value, raw provider diagnostic, or full prompt appears in public errors or
  durable records.

## Definition of done

- Model operation-limit contracts and deterministic tests are implemented.
- Project-state documents accurately describe the new model-operation controls.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user’s explicit commit
  instruction.
