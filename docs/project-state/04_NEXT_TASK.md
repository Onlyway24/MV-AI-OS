# Next Task

## Milestone name

Agent Company Readiness Review

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read every file in `docs/project-state/`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Inspect:
  - `src/assistants/agent-company-specification.ts`
  - `src/assistants/core-agent-specifications.ts`
  - `src/assistants/extended-business-agent-specifications.ts`
  - `src/assistants/inter-agent-responsibility-matrix.ts`
  - `src/assistants/agent-capability-registry.ts`
  - `src/assistants/agent-permission-matrix.ts`
  - `src/assistants/agent-handoff-contracts.ts`
  - related validators and tests

## Goal

Create a deterministic, validated, non-executing readiness review that evaluates
whether the current Agent Company declarations are internally coherent enough to
support the future Mission Planning Dry-Run Boundary.

The review must inspect existing declarative artifacts only. It must not execute
agents, create mission plans, run workflows, call models, call providers, execute
tools, or mutate runtime state.

## Required scope

- Define an Agent Company readiness report contract.
- Define readiness finding, severity, category, and status contracts.
- Validate inputs and reports at public boundaries.
- Evaluate coherence across:
  - Agent Company role map
  - exact AgentSpecifications
  - Inter-Agent Responsibility Matrix
  - Agent Capability Registry
  - Agent Permission Matrix
  - Agent Communication / Handoff Contracts
- Detect missing role coverage, missing specification coverage, missing capability
  coverage, missing permission coverage, missing responsibility coverage, missing
  handoff coverage, approval-marker gaps, guardian-marker gaps, duplicate or
  inconsistent IDs, and unsafe execution implications.
- Produce redaction-safe operator-facing findings.
- Preserve deterministic ordering.

## Forbidden scope

- Mission plan generation.
- Agent invocation.
- Handoff execution.
- Workflow runtime or workflow execution.
- Tool runtime or tool execution.
- Model or provider calls.
- Runtime permission grants.
- Durable persistence.
- HTTP, dashboard, n8n, MCP, network behavior, browser automation, filesystem tools,
  cloud/VPS runtime, embeddings, vector search, scheduler, alerts, or autonomous
  behavior.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.

## Likely files to create

- `src/assistants/agent-company-readiness-review.ts`
- `src/assistants/agent-company-readiness-review-validator.ts`
- `src/assistants/agent-company-readiness-review-service.ts`
- `tests/assistants/agent-company-readiness-review.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Healthy current Agent Company declarations produce a ready report.
- Missing Agent Company role coverage is reported.
- Missing AgentSpecification coverage is reported.
- Missing responsibility coverage is reported.
- Missing capability coverage is reported.
- Missing permission coverage is reported.
- Missing handoff coverage is reported.
- Approval-sensitive gaps are reported.
- Guardian-sensitive gaps are reported.
- Unsafe execution implication is reported.
- Findings are redaction-safe.
- Ordering is deterministic.
- Existing tests continue passing.

## Acceptance criteria

- A local caller can deterministically review whether the Agent Company declaration
  set is ready for Mission Planning Dry-Run without executing anything.
- The readiness report is validated, redaction-safe, and useful to Fabio as an
  operator-facing checkpoint.
- Existing declarative artifacts remain the source of truth and are not redesigned.

## Definition of done

- Agent Company Readiness Review contracts, validator, evaluator/service, and tests
  are complete.
- Project-state documents accurately describe the completed milestone and next task.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Mission Planning Dry-Run begins.
