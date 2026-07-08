# Next Task

## Milestone name

Controlled Local Configuration and Secret References

## Goal

Add a validated local configuration-loading boundary that can assemble runtime and CLI
configuration from explicit local inputs while representing secrets only as references,
not raw values.

## Why it matters

The system can now execute locally, persist state durably, and recover SQLite state
through backup and restore. The next operational gap is configuration discipline:
before adding a real model provider, credentials and provider settings need a
controlled, redacted, testable boundary that does not leak secrets into Core Brain,
agents, logs, errors, or project files.

## Required scope

- Define versioned local application configuration contracts.
- Define secret-reference contracts that identify where a secret may be resolved
  without storing the secret value in configuration.
- Add runtime validators for configuration and secret references.
- Add a local configuration loader for explicit local JSON input.
- Add redaction-safe error behavior for invalid configuration.
- Preserve the existing `LocalRuntimeConfig` and CLI behavior unless a small adapter
  is required.
- Keep secret values out of public result, error, and audit-like structures.
- Add deterministic tests for valid config, invalid config, secret-reference
  validation, redaction, and runtime creation from loaded configuration.

## Forbidden scope

- Real provider SDKs, OpenAI, Anthropic, Gemini, or external API calls.
- Reading secrets from cloud services or remote secret managers.
- Adding HTTP, dashboard, n8n, MCP, browser automation, tools, embeddings, or vector
  search.
- Changing Core Brain, agents, memory, knowledge, workflow, tool, or repository
  contracts.
- Storing raw secret values in committed files, logs, errors, or tests.
- Environment-wide implicit configuration discovery.

## Likely files to create

- `src/config/local-application-config.ts`
- `src/config/local-application-config-validator.ts`
- `src/config/secret-reference.ts`
- `src/config/secret-reference-validator.ts`
- `src/config/local-configuration-loader.ts`
- `tests/config/local-application-config.test.ts`

## Likely files to modify

- `src/index.ts` for intentionally public configuration contracts
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid local application configuration is accepted.
- Invalid configuration fails closed before runtime creation.
- Unknown fields and unsupported versions are rejected.
- Secret references are validated without resolving raw secret values.
- Secret reference identifiers are redacted from public error output where needed.
- A loaded configuration can create the existing Local Runtime.
- Existing runtime, CLI, persistence, backup, and restore tests continue passing.

## Acceptance criteria

- Configuration loading is explicit, deterministic, and runtime validated.
- Secret references exist as contracts only; no real provider or secret manager is
  integrated.
- Core Brain and agents remain unaware of configuration loading.
- No raw secret values are introduced into repository fixtures or project-state docs.

## Definition of done

- Configuration and secret-reference boundaries are implemented and tested.
- Project-state documents accurately describe the new configuration capability.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- Final reporting waits for approval or follows the user’s explicit commit instruction.
