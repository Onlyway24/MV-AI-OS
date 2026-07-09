# Next Task

## Milestone name

Inter-Agent Responsibility Matrix

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read every file in `docs/project-state/`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Inspect:
  - `src/assistants/agent-company-specification.ts`
  - `src/assistants/core-agent-specifications.ts`
  - `src/assistants/extended-business-agent-specifications.ts`
  - `tests/assistants/core-agent-specifications.test.ts`
  - `tests/assistants/extended-business-agent-specifications.test.ts`

## Goal

Create a deterministic, validated responsibility matrix that describes which internal
Agent Company roles may own, support, review, approve, or be excluded from each
major responsibility area before mission planning or workflow execution exists.

## Required scope

- Define a non-executing Inter-Agent Responsibility Matrix contract.
- Cover all ten declared Agent Company roles:
  - Research Agent.
  - Business Agent.
  - Content Director.
  - Developer Agent.
  - Publisher Agent.
  - Knowledge Curator.
  - Sales Agent.
  - Finance / Cost Analyst.
  - Legal / Risk Reviewer.
  - Customer Delivery Agent.
- Map responsibilities across business, research, content, publishing, sales,
  finance, legal/risk, customer delivery, knowledge, technical, quality, and future
  handoff areas.
- Distinguish owner, contributor, reviewer, approval-required, and forbidden roles.
- Validate that every role and responsibility references existing Agent Company
  roles and exact AgentSpecification IDs/versions.
- Preserve the current non-executing architecture.
- Export only appropriate public constants from `src/index.ts`.

## Forbidden scope

- Executing agents.
- Calling models or providers.
- Adding mission planning runtime.
- Adding workflow runtime.
- Adding workflow execution.
- Adding tool runtime or tool execution.
- Sending outreach, publishing, delivery, or customer communication.
- Spending money, changing budgets, or executing payments.
- Giving binding legal advice or final compliance approval.
- Running guardians automatically.
- Adding HTTP, dashboard, n8n, MCP, network behavior, browser automation,
  filesystem tools, cloud/VPS runtime, embeddings, vector search, durable
  persistence, runtime ledgers, or autonomous behavior.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.

## Likely files to create

- `src/assistants/inter-agent-responsibility-matrix.ts`
- `src/assistants/inter-agent-responsibility-matrix-validator.ts`
- `tests/assistants/inter-agent-responsibility-matrix.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid responsibility matrix is accepted.
- Every matrix role maps to the Agent Company role map.
- Every matrix role maps to an existing AgentSpecification ID/version.
- Every responsibility area has exactly one owner unless explicitly declared as
  shared.
- Approval-sensitive responsibilities require explicit approval markers.
- Forbidden role assignments are rejected.
- Missing owner assignments are rejected.
- Duplicate responsibility IDs are rejected.
- Unknown agent IDs are rejected.
- Non-deterministic ordering is rejected.
- Matrix remains redaction-safe and excludes prompts, completions, provider payloads,
  secret references, secret values, raw transcripts, raw knowledge, raw memory,
  sensitive paths, raw guardian payloads, and transport internals.
- Existing tests continue passing.

## Acceptance criteria

- The repository contains a deterministic, validated, non-executing Inter-Agent
  Responsibility Matrix for all current Agent Company roles.
- The matrix can be used by the future Mission Planning Dry-Run Boundary without
  adding execution behavior.
- Existing architecture boundaries remain unchanged.

## Definition of done

- Inter-Agent Responsibility Matrix contracts, validator, and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Mission Planning Dry-Run Boundary begins.
