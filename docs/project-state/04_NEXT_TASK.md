# Next Task

## Milestone name

Controlled Local CLI Entrypoint

## Goal

Expose the validated local runtime through a small, deterministic command-line process
boundary for local task submission and clean shutdown without adding HTTP, a
dashboard, or external integrations.

## Why it matters

MV AI OS now has one production composition root, but using it still requires a
TypeScript caller. A controlled CLI is the smallest operational interface that proves
the local runtime can be configured, started, invoked, and stopped as a real process
while preserving the same validation and policy boundaries.

## Required scope

- Add a CLI/process entrypoint that calls `createLocalRuntime`.
- Load one versioned non-secret local runtime configuration from an explicit path.
- Accept one validated `RequestEnvelope` through a bounded JSON input mechanism.
- Emit one structured `TaskResponse` or sanitized structured error.
- Keep stdout machine-readable and send optional diagnostics to stderr.
- Handle process termination by closing the runtime exactly once.
- Reject missing, malformed, oversized, or unsupported configuration and request
  input before execution.
- Add process-level tests for success, validation failure, replay across invocations,
  and clean shutdown.

## Forbidden scope

- HTTP, webhooks, dashboard, browser automation, or background server mode.
- Environment-based secrets, API keys, real model providers, or provider SDKs.
- n8n, workflow execution, approval persistence, scheduling, or retries.
- Direct tools, filesystem mutation outside the configured SQLite database, vector
  search, or embeddings.
- Interactive prompts, shell execution, plugin loading, or a CLI framework dependency.
- Reimplementation of runtime composition outside `createLocalRuntime`.

## Likely files to create

- `src/cli/local-runtime-cli.ts`
- `src/cli/cli-error-response.ts`
- `tests/cli/local-runtime-cli.test.ts`

## Likely files to modify

- `package.json` only if an executable script or `bin` entry is strictly required
- `src/index.ts` only for intentionally public CLI contracts
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md` if process ownership establishes a durable
  decision

## Tests required

- Valid configuration and request produce one successful JSON response.
- Invalid configuration fails before database creation.
- Invalid or oversized request input produces a sanitized structured error.
- Reusing the same database and request ID replays the stored response.
- Actor/workspace mismatch fails closed.
- SIGINT/SIGTERM or equivalent shutdown handling closes the runtime once.
- stdout contains no diagnostic noise or secret material.
- Existing runtime, Core Brain, persistence, Memory, Knowledge, and agent tests
  continue passing.

## Acceptance criteria

- A local operator can run one content task without writing application code.
- The CLI uses `createLocalRuntime` and does not manually compose internal modules.
- Inputs and outputs remain versioned JSON contracts.
- Process failure paths return sanitized structured errors and non-zero status.
- No network listener, external provider, or side effect outside SQLite is added.

## Definition of done

- The local CLI entrypoint is implemented and process-tested.
- Runtime configuration, request validation, replay, and shutdown behavior remain
  fail-closed.
- Project-state documents accurately describe the operational CLI state.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- No commit is created.
- Final reporting waits for approval.
