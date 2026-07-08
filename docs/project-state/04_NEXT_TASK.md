# Next Task

## Milestone name

Controlled Production Model Provider Adapter

## Goal

Add the first production model-provider adapter behind the existing
`ModelProvider` interface, using explicit local secret resolution for credentials
without changing Core Brain, agents, runtime orchestration, repositories, memory,
knowledge, tools, workflows, or CLI execution behavior.

## Why it matters

MV AI OS has a provider-neutral LLM Gateway, a governed model-backed Content Agent,
validated local configuration, and a redaction-safe local secret-resolution boundary.
The next gap is a real provider adapter that proves external model capability can be
introduced as infrastructure while preserving the existing domain and orchestration
contracts.

## Required scope

- Add one production `ModelProvider` adapter behind the existing provider-neutral
  model contracts.
- Accept credentials only through already-resolved ephemeral `SecretValue` input.
- Keep provider-specific request/response translation inside the adapter.
- Preserve existing `ValidatedLlmGateway` validation, limits, ownership checks, and
  error normalization.
- Add deterministic offline tests using a local fake transport; live provider calls
  must be separately gated and disabled by default.
- Redact credential values, credential references, provider diagnostics, and transport
  details from public errors.
- Document provider configuration boundaries and the separation between offline and
  live integration tests.

## Forbidden scope

- Core Brain, agent, policy, memory, knowledge, workflow, tool, repository, SQLite,
  CLI, or dashboard behavior changes.
- Storing API keys or resolved secret values in configuration, source files,
  persistence, audit records, snapshots, logs, or test fixtures.
- Adding hidden environment discovery or implicit credential loading.
- Replacing `LlmGateway` or allowing agents to call provider SDKs directly.
- Workflow execution, tool execution, n8n, HTTP server mode, dashboard work,
  embeddings, vector search, or multi-provider routing.
- Live network tests in the default test suite.

## Likely files to create

- `src/models/providers/openai-model-provider.ts`
- `src/models/providers/openai-model-provider-config.ts`
- `src/models/providers/openai-model-provider-validator.ts`
- `tests/models/openai-model-provider.test.ts`

## Likely files to modify

- `src/index.ts` for intentionally public provider-adapter contracts
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid provider-neutral model requests translate into provider transport requests.
- Provider responses translate back into validated `ModelResponse` records.
- Missing credentials fail before transport access.
- Provider failures are normalized without leaking secrets or raw diagnostics.
- Token, timeout, profile, and output ownership constraints remain enforced by the
  existing gateway.
- Default automated tests use no live network access.
- Existing configuration, secret-resolution, runtime, CLI, persistence, backup,
  restore, and governed model-content tests continue passing.

## Acceptance criteria

- A production provider adapter exists behind `ModelProvider`.
- Core Brain and agents remain provider-neutral.
- Resolved credentials remain ephemeral and adapter-local.
- Default validation is deterministic and offline.
- No secret value appears in source, public errors, logs, or durable records.

## Definition of done

- Provider adapter contracts and deterministic tests are implemented.
- Project-state documents accurately describe the new provider capability.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user’s explicit commit
  instruction.
