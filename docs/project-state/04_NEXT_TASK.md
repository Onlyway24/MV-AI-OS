# Next Task

## Milestone name

Operator Workflow Report

## Goal

Create one deterministic, read-only operator report that turns durable Mission,
Workflow, control, lifecycle, risk, and audit evidence into Fabio's exact next action.

## Why it matters

Chapter 1 now provides complete explicit, restart-safe Workflow lifecycle controls.
Private V1 use next requires a clear operator view that does not force Fabio to infer
state from low-level records or misleading progress claims.

## Required scope

- Show Mission objective, Workflow status, and critical-path progress without
  misleading percentages.
- Separate completed, ready, blocked, and pending Steps with blocker reasons.
- Show pending approvals, Guardian states, active risks, and retry state.
- Include cost and effort summaries only where durable evidence exists.
- Show the last durable event and one exact next action for Fabio.
- Confirm from evidence that no unauthorized external action occurred.
- Validate, bound, redact, and freeze the report contract.
- Build only from existing local durable repositories and deterministic services.

## Forbidden scope

- Mutation, command execution, AgentRuntime invocation, models, providers, tools,
  network, browser, or external actions.
- Invented cost, effort, risk, approval, Guardian, or progress evidence.
- A second CLI architecture or UI work.
- Models, providers, tools, network, browser, external actions, or new dependencies.

## Acceptance criteria

- The report is deterministic for one exact durable snapshot.
- Missing or inconsistent evidence fails closed or is shown explicitly as unavailable.
- The next action is concrete, safe, and derived from current blockers and lifecycle
  state.
- No report path mutates Workflow state or triggers execution.
- Existing deterministic execution and completion guarantees remain green.

## Definition of done

Fabio can inspect one Workflow and understand its evidence-backed state and next exact
action without reading raw persistence records.
