# MV AI OS · Onlyway

MV AI OS is a contract-first, operator-governed AI runtime for deterministic local
missions, durable workflows, scoped memory and knowledge, and optional OpenAI model
execution. The current release is deliberately local-first: SQLite is the durable
source of truth, every mutation crosses a validated boundary, and supervised jobs run
only after explicit startup under bounded policy, budget, lease and kill-switch
controls.

## Current capabilities

- Strict TypeScript/ESM contracts and runtime validators.
- Repository-backed Core Brain request lifecycle with replay-safe command IDs.
- Scoped memory and knowledge retrieval with durable SQLite adapters.
- Provider-neutral model gateway with permissions, timeouts, token/call limits,
  usage accounting, and budget enforcement.
- Optional OpenAI Responses API adapter restricted to the official API origin;
  credentials are resolved ephemerally and are never accepted in source config.
- Immutable Agent and Workflow Specification registries.
- Exact Workflow Specification admission into a durable, non-executing
  `WorkflowDefinition` and initial `WorkflowInstance`.
- Explicit approval and Guardian checkpoints, readiness evaluation, exact agent
  candidate binding, deterministic local Content Director invocation, outcome
  review, bounded retry, pause/resume/cancel, and timeout evaluation.
- One-command-per-process local CLI with the canonical Core and advanced operation
  allowlist, structured responses, SQLite restart recovery, and bounded audit inspection.
- Private Command Center and Telegram Bot API operator adapters over the same local
  command boundary.
- A deterministic 17-role Agent Company, evidence-led Business Missions, authorized
  research, Evidence Packs, content production, Media Factory/Visual Gate, Venture
  Holding, and supervised H24 operations.
- A 19-job durable scheduler/worker with leases, fencing, heartbeats, bounded retry,
  dead-letter handling, maintenance mode, kill switches, and usage receipts.
- Controlled SQLite backup/restore and private Docker/Compose/VPS release boundaries.
- Provider-neutral model and tool contracts; the OpenAI adapter is restricted to the
  official API origin and all public publication/outreach/payment actions remain gated.

The integrated system performs safe internal work locally. Publication, unsolicited
outreach, payments, spend, destructive changes, OAuth activation, and deployment are
not silently authorized by a mission, agent, scheduler, Telegram, or the web console.

## Start locally

```text
npm run check
npm run command-center -- --config <private-local-config.json>
```

The Command Center is loopback-only by default. Never commit private configuration,
bootstrap material, SQLite databases, OAuth state, provider credentials, or secrets.

Revenue inputs can be validated without contacting providers or customers:

```text
npm run build
npm run revenue-os -- --input <private-revenue-mission.json>
```

See `docs/revenue-os/README.md` and `assets/revenue-os/` for the operating pack and
empty input contracts.

## Canonical architecture

Dependencies point inward from adapters to application/domain contracts:

```text
CLI / Command Center / Telegram / scheduler callback
        |
        v
validated LocalWorkflowCommandBoundary and application services
        |
        v
Core Brain / Mission + Business domains / canonical Workflow admission
        |
        v
Agent runtime / research / evidence / content / supervised operations
        |
        v
repository, model, memory, knowledge, tool and clock ports
        ^
        |
SQLite / deterministic executors / optional hardened provider adapters
```

The most important invariants are:

- caller-supplied data is validated at every public boundary;
- exact IDs and versions are resolved, never floated;
- policy, ownership, approval, and Guardian checks fail closed;
- durable mutations and their evidence are atomic and replay-safe;
- provider prompts exclude sensitive memory by default;
- no candidate, retry, or elapsed timeout implicitly starts work.

Telegram's confirmed Mission-to-Workflow promotion uses the exact registered Core
Workflow Specification and persists admission, ownership and audit atomically. Domain
aggregates such as Business Missions, Evidence Packs, content productions and venture
records use the same command, identity and repository boundaries; they are not
competing workflow engines.

See [Architecture](docs/ARCHITECTURE.md), the
[MV AI OS Constitution](docs/MV_AI_OS_CONSTITUTION.md), and the
[current verified state](docs/project-state/01_CURRENT_STATE.md).

## Requirements

- Node.js `22.23.x`
- npm `10.9.8`

## Install and verify

```sh
npm ci
npm run check
```

`npm run check` runs lint, strict typechecking, the deterministic test suite, and the
production build. Tests discover only the repository's `tests/` tree, so local Codex
worktrees cannot be mistaken for product tests.

## Run the deterministic local CLI

```sh
mkdir -p data
npm run build
npm run cli -- --config examples/core-v1/local-config.json \
  < examples/core-v1/admit-workflow-specification.json
```

Each invocation consumes exactly one bounded JSON request from standard input, emits
exactly one JSON response, and closes all runtime resources. The deterministic Core
V1 path requires no credentials or network access.

For exact command shapes, operating sequence, recovery, and backup guidance, read the
[Core V1 Operator and Recovery Guide](docs/CORE_V1_OPERATOR_GUIDE.md).

## Workflow Specification admission

New attributed workflows should use `ADMIT_WORKFLOW_SPECIFICATION`. The request binds
the outer command ID to `admissionId`, the configured actor/workspace, one exact
Workflow Specification version, and a new instance ID. Admission resolves every
declared Agent Specification, fingerprints the immutable declarations,
deterministically derives runtime state, and atomically persists definition, instance,
ownership, and redaction-safe audit evidence.

The legacy `CREATE_WORKFLOW` operation remains compatible for existing un-attributed
Core V1 definitions, but it cannot forge specification-admission metadata.

## Repository layout

```text
src/                    application and domain source
  agents/               agent contracts and executors
  core/                 request lifecycle and orchestration kernel
  models/               provider-neutral gateway and provider adapters
  persistence/          repository contracts and SQLite adapters
  runtime/              local composition and command boundary
  workflows/            specification and durable runtime boundaries
tests/                  deterministic unit, integration, restart, and CLI tests
examples/core-v1/       safe local CLI configuration and command fixtures
docs/                   architecture, operator, release, and project-state records
```

## Development rules

Read `AI_ENGINEERING_RULES.md` and `docs/AGENTS.md` before changing architecture.
Keep dependencies pinned, avoid provider/storage types in domain code, preserve user
data and unrelated worktree changes, and finish changes with:

```sh
npm run check
git diff --check
```

No live-provider call is part of the default test or build path.

Revenue, pipeline, and delivery values are shown only when supported by explicit
input or durable evidence; missing data stays `NOT_AVAILABLE`. The private UI cannot
bypass policy or authorize publication, outreach, payments, spend, merge, or deploy.
