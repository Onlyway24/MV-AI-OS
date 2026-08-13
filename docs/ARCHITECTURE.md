# MV-AI-OS canonical architecture

## Purpose

MV-AI-OS is a local-first, single-operator operating system for validated missions,
durable workflows, internal agent work, evidence-led content and supervised
operations. SQLite is the source of truth. Network providers and external-effect
connectors are optional adapters, not alternate control planes.

This document describes the integrated implementation. The mandatory invariants are
also recorded in `docs/project-state/03_ARCHITECTURE_PRINCIPLES.md` and
`docs/MV_AI_OS_CONSTITUTION.md`.

## Canonical execution paths

All operator mutations use validated application services. The primary command path
is:

```text
CLI / private Command Center / private Telegram / scheduler callback
  -> transport-specific validation and authentication
  -> LocalWorkflowCommandBoundary
  -> actor + workspace ownership and policy checks
  -> domain application service
  -> repository transaction
  -> SQLite aggregate + receipt/audit/event evidence
  -> bounded response / projection / operator report
```

The attributed Core workflow path is:

```text
approved Mission or explicit CLI request
  -> ADMIT_WORKFLOW_SPECIFICATION
  -> exact immutable Workflow Specification
  -> exact immutable Agent Specifications
  -> specification and agent fingerprints
  -> atomic definition + instance + ownership + admission audit
  -> approval and Guardian checkpoints
  -> readiness and exact candidate binding
  -> controlled Agent Runtime invocation
  -> explicit result acceptance/rejection
  -> durable lifecycle receipt and operator report
```

Telegram's `/workflow <mission-reference>` confirmation uses this admission path. It
does not construct a definition or instance itself. `CREATE_WORKFLOW` remains only as
a compatibility boundary for existing unattributed definitions and cannot create
admission attribution.

The evidence-led production path is:

```text
validated Business Mission / authorized research input
  -> registered source + verified evidence
  -> immutable Evidence Pack
  -> deterministic content or Social Publishing Pack
  -> exact Visual Gate over manifest and asset bytes
  -> Fabio's exact-version internal approval
  -> internal scheduling eligibility
  -> separate publication dry-run and authorization controls
```

No step in this path silently publishes, spends, contacts, deploys or performs an
irreversible external mutation.

## Application planes

### Core Brain

`src/core`, memory, knowledge, policy and the provider-neutral model gateway implement
the validated request/task lifecycle. They own context scoping, permissions, budgets,
agent selection, result validation and redaction-safe audit. Sensitive memory is
excluded from provider payloads by default.

### Specification and workflow runtime

`src/agents/specification` and `src/workflows/specification` hold immutable, exact
version registries. `src/workflows/runtime` owns admission, state transitions,
checkpoints, readiness, invocation binding, lifecycle, retry, timeout and reports.
Runtime records are non-executing declarations until a separate controlled invocation
crosses all required gates.

### Mission and specialist aggregates

Mission planning, Business Mission dossiers, Agent Company workdays, venture records,
research missions, Evidence Packs and content productions are distinct domain
aggregates. They are not alternative workflow engines. Each crosses the shared command,
identity, repository and audit/event boundaries and may feed a canonical workflow or
another explicitly typed downstream service.

Specification admission validates the mission reference and objective against the
exact Workflow input schema and stores them as an immutable, fingerprinted instance
binding. Admission audit records the input fingerprint; controlled Agent invocation
and operator reporting consume that same binding. A legacy definition may retain its
optional display-only objective, but cannot forge admitted provenance.

### Supervised operations

The scheduler/worker implements 19 registered job types. Schedules and jobs are
durable and use expiring leases, monotonic fencing, heartbeats, bounded timeouts,
automatic retry limits, dead-letter state, maintenance mode, kill switches and usage
receipts. Startup is always explicit. Importing code, opening SQLite, starting
Telegram or viewing the Command Center never activates H24 work.

The autonomous loop is therefore bounded and durable:

```text
observe -> choose due eligible job -> policy/budget/control checks
  -> fenced claim -> execute typed callback -> verify -> receipt/event
  -> complete, retry later, dead-letter, cancel or wait
```

There is no uncontrolled `while (true)` mission executor and no blind replay of a
completed or uncertain side effect.

## Adapters and trust boundaries

### CLI

The local CLI reads one bounded JSON command, emits one validated JSON response and
closes all resources. Command IDs are idempotency keys; reuse with a different payload
fails.

### Private Command Center

The server is loopback-only. Founder access uses owner-only bootstrap material,
passkey-backed sessions, RBAC, strict Origin/CSRF checks and command-bound step-up.
Mutations are propose/confirm actions tied to exact aggregate fingerprints. SSE is an
authenticated bounded projection channel, not a mutation channel.

### Telegram

Telegram uses one dedicated Bot API identity and one allowlisted private chat. It
stores no raw updates, transcripts or message bodies. One-use callbacks bind the
operator, action and aggregate version. Delivery intent is persisted before network
I/O; an ambiguous send becomes `DELIVERY_UNCERTAIN` and is not automatically repeated.

### Model providers

Agents depend on model profiles and gateway contracts, never provider SDK types.
Optional OpenAI execution accepts only the canonical official HTTPS API origin,
rejects redirects, resolves credentials ephemerally and bounds request, stream,
timeout, token, call and cost dimensions. Deterministic local providers cover the
default verification path.

### Tools and research

A declared tool or source is not authorization. Tool execution requires effective
permissions, validated input, bounded runtime, an idempotency key where applicable,
validated output and audit. Research uses registered sources and explicit acquisition
contracts; unsupported or unavailable evidence remains unavailable rather than being
invented.

### Social and publication connectors

Offline connector state and OAuth foundations are present, but account connection is
separate from content approval and publication authority. Publication requires the
dedicated dry-run, exact authorization, kill-switch and receipt boundaries. Ambiguous
external outcomes are reconciled, never retried blindly.

## Persistence

Repository interfaces isolate domain code from SQLite. One migration line owns the
local schema. Records are runtime validated on write and read, JSON is bounded, and
actor/workspace ownership is checked before resource access. Aggregate mutations and
their command receipts, audit evidence or operational events share transactions where
the contract requires atomicity.

The local database and admin-security state live outside release directories. Neither
is committed. Backup uses SQLite's online backup boundary plus integrity and
application-schema validation. Production bundles add private modes, exact hashes,
Admin Security state and host Ed25519 signatures. Restore is explicit, destructive,
rollback-protected and restarts fail-closed with maintenance and kill switches active.

## Autonomy and approval policy

Safe internal computation, planning, registered-evidence processing, deterministic
artifact creation, bounded recovery and durable progress do not require repetitive
human approval. Approval remains machine-enforced for materially risky effects:

- public publication or account mutation;
- unsolicited outreach or messaging;
- purchases, payments, capital allocation or paid-provider exposure beyond a bound;
- deployment, merge or infrastructure mutation;
- destructive or irreversible operations;
- acceptance of exact visual/content packages where Fabio's decision is required.

An approval binds exact identity, version, fingerprint and bytes where relevant. It
does not grant adjacent authority.

## Dependency rules

- Domain contracts do not import transport, provider, database or deployment types.
- Application services depend on ports and repositories supplied by composition.
- Exact registries are the source of agent/workflow attribution.
- Adapters translate external types and cannot bypass application validation.
- Cross-module contracts are versioned, JSON-compatible, size-bounded and runtime
  validated.
- Missing, stale, conflicting or unverifiable state fails closed.
- Logs and public errors exclude secrets, raw prompts, provider payloads and stack
  traces.

## Runtime entry points

- `npm run cli` — one-command local JSON CLI.
- `npm run command-center` — private loopback operator console.
- `npm run telegram` — private Telegram operator and offline diagnostics.
- `npm run operations` — scheduler, worker, monitor and safe smoke roles.
- `npm run social-connectors` — loopback offline/OAuth connector boundary.
- `npm run revenue-os` and `npm run venture-holding` — evidence-bound internal
  planning surfaces.
- The operations worker injects the same canonical Venture service/repository into
  all eight zero-budget Venture jobs; missing policy, evidence, coverage or real
  observations stays explicitly `BLOCKED`.
- production scripts and `production-closure-cli` — explicit release, readiness,
  backup, restore and rollback boundaries.

Configuration, SQLite files, bootstrap data, connector state and secrets must remain
untracked. Live providers, phone acceptance, social OAuth and VPS deployment are
external checkpoints; they are not prerequisites for deterministic local integrity.
