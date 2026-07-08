# Next Task

## Milestone name

Controlled Local Secret Resolution

## Goal

Add a controlled local secret-resolution boundary that can resolve already-validated
secret references into ephemeral secret values for future provider adapters without
exposing those values to Core Brain, agents, logs, errors, tests, or configuration
records.

## Why it matters

MV AI OS now has explicit local application configuration and inert secret-reference
contracts. The next operational gap is controlled resolution: a real model provider
must eventually receive credentials, but those credentials must remain outside domain
contracts, project files, public errors, and audit-like records.

## Required scope

- Define a `SecretResolver` interface.
- Define ephemeral secret-value and resolution-result contracts.
- Implement local environment-variable and local-file secret resolvers for validated
  secret references only.
- Add runtime validators for secret resolution inputs and outputs.
- Redact secret values and secret locations from public errors.
- Keep resolved secret values out of `LocalApplicationConfig`, `LocalRuntimeConfig`,
  Core Brain, agents, memory, knowledge, persistence, and audit records.
- Add deterministic tests using process-local test environment values and temporary
  files.

## Forbidden scope

- Real model providers, OpenAI, Anthropic, Gemini, provider SDKs, or external API
  calls.
- Cloud secret managers, network calls, HTTP, dashboard, n8n, MCP, tools, embeddings,
  or vector search.
- Changing Core Brain, agents, policy, memory, knowledge, workflow, tool, repository,
  runtime, or CLI execution behavior.
- Persisting resolved secret values.
- Logging resolved secret values.
- Adding environment-wide implicit configuration discovery.

## Likely files to create

- `src/config/secret-resolver.ts`
- `src/config/local-secret-resolver.ts`
- `src/config/secret-value.ts`
- `src/config/secret-resolution-validator.ts`
- `tests/config/local-secret-resolver.test.ts`

## Likely files to modify

- `src/index.ts` for intentionally public secret-resolution contracts
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Environment secret references resolve only when explicitly supplied to the resolver.
- Local-file secret references resolve from explicit local files only.
- Missing environment variables and missing files fail closed.
- Invalid secret references are rejected before resolution.
- Resolved secret values are never serialized in public error details.
- Existing configuration, runtime, CLI, persistence, backup, and restore tests continue
  passing.

## Acceptance criteria

- Secret resolution is explicit, deterministic, and redaction-safe.
- Resolved values are ephemeral and never enter durable or public contracts.
- Core Brain and agents remain unaware of secret resolution.
- No provider integration or external network capability is introduced.

## Definition of done

- Secret-resolution contracts and local resolvers are implemented and tested.
- Project-state documents accurately describe the new secret-resolution capability.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user’s explicit commit instruction.
