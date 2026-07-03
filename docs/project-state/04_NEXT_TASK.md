# Next Task

## Milestone name

Validated Local Runtime Composition

## Goal

Create one production composition boundary that constructs a usable local MV AI OS
runtime from validated configuration and the existing SQLite lifecycle, memory, and
knowledge adapters without adding a transport or external provider.

## Why it matters

The orchestration path and durable adapters are individually complete, but callers
must still assemble many dependencies manually. A validated composition root turns the
existing modules into one recoverable local runtime while preserving dependency
injection and keeping Core Brain free of infrastructure concerns.

## Required scope

- Define a minimal local runtime configuration contract and runtime validator.
- Configure the SQLite database path and timeout through existing connection
  configuration.
- Compose Core Brain, task lifecycle repositories, repository-backed Memory and
  Knowledge Services, default-deny policy, registries, router, runtime, validators,
  clock, identifiers, and deterministic local Content Agent.
- Return an explicit runtime handle with task execution and deterministic resource
  shutdown.
- Keep all constructors dependency-injected and permit deterministic test overrides
  for clocks, identifiers, and agent execution.
- Add restart tests proving a composed runtime replays completed tasks and reuses
  durable permitted memory and knowledge.
- Validate configuration before opening SQLite or executing requests.

## Forbidden scope

- HTTP, webhooks, dashboard, browser, filesystem tools, or network transports.
- Real model providers, API keys, external APIs, SDKs, n8n, or tool execution.
- Workflow execution, scheduling, retries, or approval persistence.
- New memory, knowledge, task, request, or audit contracts.
- Hidden global singletons, environment reads inside domain modules, or implicit
  permissions.
- A general dependency-injection container or plugin framework.

## Likely files to create

- `src/runtime/local-runtime-config.ts`
- `src/runtime/local-runtime-config-validator.ts`
- `src/runtime/local-runtime.ts`
- `src/runtime/create-local-runtime.ts`
- `tests/runtime/local-runtime.test.ts`

## Likely files to modify

- `src/index.ts`
- existing local policy composition only if a production grant resolver is required
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` if composition ownership establishes a durable
  decision

## Tests required

- Valid configuration creates a runtime.
- Invalid configuration fails before database creation.
- One content request executes through the composed runtime.
- Closing and reopening the runtime replays the stored response without agent
  re-execution.
- Permitted durable memory and knowledge enrich execution after restart.
- Missing grants remain denied by default.
- Shutdown closes every owned SQLite adapter deterministically.
- Existing Core Brain, Content Agent, repository, Memory, Knowledge, and migration
  tests continue passing.

## Acceptance criteria

- A caller can construct and close one local runtime without manually wiring internal
  dependencies.
- Core Brain and agents import no SQLite or configuration-loader types.
- Runtime restart preserves replay, audit, memory, and knowledge behavior.
- Configuration and permissions fail closed.
- No transport, external provider, or side effect outside SQLite is added.

## Definition of done

- The validated local composition root and runtime handle are implemented and tested.
- Existing public contracts and execution behavior remain unchanged.
- Project-state documents accurately describe the composed local runtime.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
