# Next Task

## Milestone name

Controlled Local OpenAI Provider Wiring

## Goal

Wire the production OpenAI model provider into the existing local configuration and
runtime composition path using explicit secret resolution, without changing Core
Brain, agents, policy, memory, knowledge, repositories, workflows, tools, or CLI
request semantics.

## Why it matters

MV AI OS now has a provider-neutral LLM Gateway, a governed model-backed Content
Agent, controlled local secret resolution, and a production OpenAI provider adapter.
The remaining gap is controlled composition: local operators need a validated way to
select the production provider while keeping credentials ephemeral and preserving the
deterministic local mode for offline development and tests.

## Required scope

- Extend local application configuration with an explicit model-provider selection.
- Resolve only referenced secrets that are explicitly required by the selected
  provider.
- Construct the OpenAI provider adapter through the existing local composition root.
- Preserve deterministic local provider mode as the default offline/test path.
- Keep resolved secret values out of `LocalRuntimeConfig`, CLI JSON output, durable
  records, audit-like data, logs, and public errors.
- Add deterministic offline composition tests with fake transport only.
- Keep live OpenAI calls disabled by default and outside the standard test suite.

## Forbidden scope

- Core Brain, agent, policy, memory, knowledge, workflow, tool, repository, SQLite
  schema, backup/restore, or request contract changes.
- Hidden environment discovery, implicit API-key loading, or fallback credential
  lookup.
- Persisting, logging, snapshotting, or echoing resolved secret values.
- Dashboard, HTTP server, n8n, scheduling, embeddings, vector search, tool execution,
  or multi-provider routing.
- Live network calls in default tests.

## Likely files to create

- `tests/runtime/local-runtime-openai-provider.test.ts`

## Likely files to modify

- `src/config/local-application-config.ts`
- `src/config/local-application-config-validator.ts`
- `src/runtime/create-local-runtime.ts`
- `src/runtime/local-runtime-config.ts`
- `src/runtime/local-runtime-config-validator.ts`
- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Deterministic local provider mode remains the default and continues passing.
- OpenAI provider mode requires an explicit valid secret reference and resolved
  ephemeral `SecretValue`.
- Missing, duplicate, invalid, or unused secret references fail closed.
- Fake OpenAI transport proves end-to-end runtime execution through
  `ValidatedLlmGateway` without live network access.
- Public errors redact secret values, secret IDs, secret locations, and provider
  diagnostics.
- Existing configuration, secret-resolution, provider-adapter, runtime, CLI,
  persistence, backup, restore, and governed model-content tests continue passing.

## Acceptance criteria

- Local runtime can be composed with the OpenAI provider adapter through explicit
  configuration.
- Core Brain and agents remain provider-neutral.
- Credentials remain ephemeral and adapter-local.
- Offline deterministic tests remain the default.
- No secret value appears in source, public errors, logs, or durable records.

## Definition of done

- Local provider wiring is implemented and integration-tested with fake transport.
- Project-state documents accurately describe the new composition capability.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user’s explicit commit
  instruction.
