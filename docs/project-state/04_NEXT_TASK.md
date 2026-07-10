# Next Task

## Milestone name

Durable Workflow Approval and Guardian Checkpoints

## Goal

Persist validated operator approvals and Guardian checkpoint decisions for exact
workflow step snapshots so candidate preparation no longer relies only on transient
caller-supplied control evidence.

## Why it matters

The Workflow Step Execution Boundary can prove that one durable step is ready,
properly assigned, policy-permitted, and supported by supplied control evidence. That
evidence is not yet durable or independently reloadable after restart. The next safe
increment is to record exact, revocable, redaction-safe approval and Guardian
decisions atomically behind the existing workflow repository boundary before any
AgentRuntime invocation is considered.

## Required scope

- Define immutable workflow approval and Guardian checkpoint record contracts bound
  to definition ID, workflow version, instance ID, instance version, and step ID.
- Define closed approval and Guardian decision/status values, including explicit
  grant/clear, deny/block, expiry, and revocation behavior.
- Add runtime validators with strict unknown-field, identity, ordering, bounds,
  immutability, semantic, and redaction checks.
- Extend the existing SQLite workflow schema additively and reuse the current
  migration, codec, repository, and transaction patterns.
- Add repository interfaces and SQLite adapters for writing and reading exact
  approval and Guardian checkpoint records in deterministic order.
- Enforce Fabio/operator authority for approval grants and exact Guardian domain
  identity for checkpoint decisions.
- Reject conflicting duplicate decision IDs and preserve idempotent replay of exact
  duplicates.
- Make revoked, expired, denied, blocked, stale, or mismatched records fail closed.
- Update Workflow Step Execution Boundary to resolve checkpoint evidence from the
  same repository transaction while preserving a narrow compatibility path only if
  required by the existing public contract.
- Add restart, migration, conflict, corruption, rollback, deterministic ordering,
  redaction, and boundary-integration tests.
- Update project-state documents.

## Forbidden scope

- AgentRuntime, model, provider, tool, browser, filesystem, network, n8n, HTTP,
  dashboard, CLI workflow command, external action, publishing, outreach, payment,
  or customer-delivery execution.
- Background workers, schedulers, autonomous loops, notifications, retries,
  callbacks, or result-completion orchestration.
- Approval UI, remote approval transport, Guardian execution, autonomous Guardian
  evaluation, or invented Guardian conclusions.
- A second database, a second transaction framework, destructive migration, event
  sourcing, raw prompts/completions/provider payloads, secrets, raw knowledge/memory,
  transcript text, or sensitive paths.

## Likely files to create

- `src/workflows/runtime/workflow-control-checkpoint.ts`
- `src/workflows/runtime/workflow-control-checkpoint-validator.ts`
- `src/workflows/runtime/workflow-control-checkpoint-service.ts`
- `tests/workflows/workflow-control-checkpoint.test.ts`

## Likely files to modify

- `src/workflows/runtime/workflow-persistence.ts`
- `src/workflows/runtime/repository-backed-workflow-step-execution-boundary.ts`
- existing SQLite schema, codec, and transaction-runner files only as required for
  the additive workflow checkpoint tables and repositories
- `src/index.ts`
- affected project-state documents

## Tests required

- exact Fabio approval grants and Guardian clear decisions persist and reload;
- exact duplicate decisions replay idempotently while conflicting duplicates fail;
- denied, blocked, expired, revoked, stale, wrong-step, wrong-version, wrong-authority,
  and wrong-domain records fail closed;
- the candidate boundary reads control evidence from the same durable transaction;
- restart preserves decisions and deterministic ordering;
- corrupted records are rejected on read;
- migration preserves existing lifecycle, memory, knowledge, and workflow data;
- transaction failure leaves no partial checkpoint state;
- outputs and events are bounded, immutable, JSON-safe, and redaction-safe;
- no agent, model, provider, tool, network, CLI, or external execution occurs;
- all existing tests remain green.

## Acceptance criteria

- Approval and Guardian control evidence is durable, exact-snapshot-bound, validated
  on write and read, and restart-safe.
- Only Fabio/operator authority can grant a workflow approval.
- Missing, stale, denied, blocked, expired, revoked, corrupted, or mismatched evidence
  cannot produce a step candidate.
- Checkpoint writes and their audit evidence are atomic under the existing repository
  transaction architecture.
- The Workflow Step Execution Boundary remains non-executing and returns at most one
  candidate.
- Full lint, typecheck, test, build, and diff checks pass in a separate clean commit.

## Definition of done

The repository can durably record, reload, revoke, and evaluate exact workflow
approval and Guardian checkpoints without executing a step. A subsequent milestone
must separately define AgentRuntime step invocation and result completion.
