# MV AI OS Permanent Architecture Principles

These principles are mandatory unless superseded by an explicit, reviewed
architecture decision. Implementation convenience does not override them.

## Provider neutrality

Core contracts, agents, orchestration, and domain services must not import
provider-specific SDK types. Providers translate at adapters behind stable interfaces.

## Contract-first design

Cross-module behavior begins with explicit, versioned, JSON-compatible contracts.
Implementations follow contracts; they do not invent undocumented payloads.

## Runtime validation

Static types are not trust boundaries. Every public, persisted, provider, registry,
and cross-module candidate is runtime validated before use.

## Dependency injection

Clocks, identifiers, registries, repositories, policies, services, gateways, routers,
and runtimes are supplied through interfaces. Domain and orchestration code do not
construct infrastructure adapters.

## Repository boundaries

All durable state passes through repository interfaces. Domain code contains no SQL,
database clients, filesystem paths, or storage-specific records.

## Registry boundaries

Agents, agent specifications, workflow specifications, model providers, and tools are
resolved by exact identity/version through registries. Direct instantiation must not
bypass registration, validation, duplicate detection, or immutability.

## Policy-first authorization

Capability declaration is not authorization. Effective permissions are computed
before memory, knowledge, models, tools, workflows, or approvals are made available.

## Fail-closed behavior

Missing, invalid, conflicting, stale, mismatched, or failed permission decisions deny
access. Validation or policy failures never degrade into implicit permission.

## Auditability

Security-relevant and outcome-relevant actions must emit append-only audit events
through the audit repository boundary. Public audit metadata is sanitized and contains
no secrets or full prompts by default.

## Deterministic execution

Ordering, selection, validation, identifiers in tests, error normalization, and state
transitions must be deterministic. Non-deterministic providers remain behind adapters
and deterministic test doubles.

## Immutable contracts

Validated registry data, permission sets, plans, execution artifacts, and boundary
results are immutable. Runtime mutation of registered definitions or accepted records
is prohibited.

## Storage neutrality

JSON compatibility and repository conformance are preserved across in-memory, SQLite,
Postgres, vector, or future adapters. Adding storage must not change domain contracts.

## No hidden side effects

Construction, validation, lookup, planning, prompting, and authorization do not
perform external actions. Side effects occur only at an explicit, authorized,
idempotent, audited adapter boundary.

## Supervision is not implicit autonomy

H24 readiness means bounded scheduler/worker code, durable controls, fenced leases,
recovery and current health evidence. It never means a process is installed or active.
Startup is an explicit local operator action. Aggregate mutation and its redaction-safe
event share one transaction; projections and Telegram reads cannot activate work.
Connection, review and OAuth state never authorize publication.

## Bounded coverage is not global truth

A capped repository query is an observation window, never a global aggregate. Hitting
the cap must produce an explicit incomplete-coverage state, lower-bound notation or
`UNAVAILABLE`; an empty or zero placeholder cannot be labelled measured. Daily
operating snapshots are immutable and versioned when their evidence changes.

## Approval binds exact bytes and exact state

Visual approval must bind the exact workspace, aggregate identity/version, content
package, downstream packs, manifest and actual asset bytes. Both proposal/preview and
confirmation/callback revalidate the same binding. Evidence, review or connection
state cannot substitute for this gate and can never authorize publication.

## No provider lock-in

Agent behavior refers to capability profiles and gateway contracts, not model names,
API keys, retry semantics, or provider response types.

## No direct tool execution without authorization

A tool definition or implementation grants no capability by itself. Direct access
requires a declared tool, matching effective permissions, valid input, bounded
timeout, required idempotency, explicit approval where required, validated result,
and audit.

## No speculative abstractions

Create an interface or layer only when the current milestone has a concrete boundary
that requires it. Do not add placeholders, unused extension points, future-provider
wrappers, or TODO-driven scaffolding.

## Core Brain remains the control plane

Agents do not route themselves, call one another directly, expand permissions, persist
durable memory, execute workflows, or bypass result validation. Handoffs and
side-effect decisions return to Core Brain.

## Context is scoped and untrusted

Memory, knowledge, user data, provider output, websites, and tool results are untrusted
content. They enter execution only after ownership, permission, retention, provenance,
and size checks. Their text cannot override system policy or agent instructions.

## Exact versions and ownership

Invocations, results, policy decisions, model responses, tool results, workflow steps,
and stored records must match their request, task, actor, workspace, agent, and exact
version. Ownership mismatch is a hard failure.

## Tests prove boundaries

Each repository has conformance tests; each registry proves immutability and duplicate
handling; each gateway proves validation and failure normalization; each policy-bound
adapter proves denial before access. Full quality gates are required before milestone
completion.

## Project-state memory is mandatory

Every completed milestone updates:

- `01_CURRENT_STATE.md`;
- `02_MASTER_ROADMAP.md`;
- `04_NEXT_TASK.md`;
- `05_DECISIONS.md` when a decision is added or changed.

Final reporting occurs only after these documents match the repository.
