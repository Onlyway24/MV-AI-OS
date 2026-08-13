# Next Task

## Milestone name

Workflow Specification Runtime Semantics Design Review

## Goal

Define the smallest safe next increment that can execute more of the already validated
`WorkflowSpecification` semantics without creating a second engine, hidden scheduling,
or an external-effect path.

## Why it matters

Core V1 now admits an exact immutable specification into attributed durable runtime
state, but admission intentionally accepts only the semantics the current explicit
runtime can represent: an acyclic, conditionless graph with `fail_workflow`, no
preserved successful outputs, and at most 100 steps. Expanding that surface without a
design review could split authority between specification and runtime contracts or
create implicit execution behavior.

## Required scope

- Map each `WorkflowSpecification` field to current durable runtime behavior and name
  every semantic gap.
- Decide whether condition evaluation, output mapping, or alternate failure policy is
  the smallest independently safe implementation milestone.
- Specify deterministic ordering, exact input/output contract binding, durable
  evidence, replay, restart, stale-version, approval, Guardian, and policy invariants.
- Define compatibility behavior for already admitted and legacy Core V1 definitions.
- Produce an implementation-ready decision and update the authoritative roadmap and
  decision log.
- Add tests only for executable design assertions or contract examples; do not add
  production execution capability in this review milestone.

## Forbidden scope

- No scheduler, automatic next-step start, automatic retry, timer, polling, worker,
  callback, n8n, network, provider, tool, dashboard, HTTP, filesystem tool, or external
  effect.
- No dynamic Agent selection, version floating, migration of existing instances, or
  bypass of policy, ownership, approvals, Guardians, repositories, or audit.
- No implementation of multiple new semantic families in one milestone.

## Acceptance criteria

- The selected next increment has one authoritative state transition model and one
  bounded admission/runtime contract.
- Unsupported semantics continue to fail closed with explicit reasons.
- Compatibility, persistence, replay, rollback, restart, and redaction requirements
  are testable before implementation begins.
- The decision identifies security and operational failure modes without speculative
  infrastructure.
- Lint, typecheck, full tests, build, and `git diff --check` remain green.

## Definition of done

The repository has an evidence-backed, implementation-ready decision for exactly one
next Workflow Specification runtime semantic, while current Core V1 behavior and all
non-execution guarantees remain unchanged.
