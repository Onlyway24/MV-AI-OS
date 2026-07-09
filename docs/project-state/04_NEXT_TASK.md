# Next Task

## Milestone name

Agent Communication / Handoff Contracts

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
  - `tests/assistants/agent-permission-matrix.test.ts`

## Goal

Define deterministic, validated, non-executing contracts for future handoffs between
Agent Company roles.

The contracts must describe how one future role may request support, review,
approval preparation, or escalation from another role during Mission Planning
Dry-Run without invoking agents or executing workflows.

## Required scope

- Define Agent Handoff / Communication contracts.
- Reuse existing Agent Company role IDs.
- Reuse exact AgentSpecification IDs/versions.
- Reuse Inter-Agent Responsibility Matrix areas where appropriate.
- Reuse Agent Capability Registry capability IDs.
- Reuse Agent Permission Matrix permission rule IDs.
- Declare handoff purpose, source role, target role, requested capability,
  requested permission declaration, required context summary, expected response
  shape, approval sensitivity, guardian sensitivity, and escalation markers.
- Preserve default-deny doctrine.
- Preserve deterministic ordering.
- Preserve redaction-safe public records.

## Forbidden scope

- Executing handoffs.
- Invoking agents.
- Adding mission planning runtime.
- Adding workflow runtime.
- Adding workflow execution.
- Adding tool runtime or tool execution.
- Calling models or providers.
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

- `src/assistants/agent-handoff-contracts.ts`
- `src/assistants/agent-handoff-contracts-validator.ts`
- `tests/assistants/agent-handoff-contracts.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid handoff contracts are accepted.
- Every declared handoff references known source and target roles.
- Every role reference maps to exact AgentSpecification ID/version.
- Referenced capabilities exist in the Agent Capability Registry.
- Referenced permission rules exist in the Agent Permission Matrix.
- Handoffs do not imply execution.
- Handoffs requiring approval contain approval markers.
- Handoffs requiring guardian consultation contain guardian markers.
- External, publishing, sales, customer delivery, budget, legal, tool, workflow, and
  model-sensitive handoffs remain non-executing and approval/guardian gated where
  relevant.
- Duplicate handoff IDs are rejected.
- Non-deterministic ordering is rejected.
- Redaction-sensitive raw content is rejected.
- Existing tests continue passing.

## Acceptance criteria

- The repository contains deterministic, validated, non-executing Agent
  Communication / Handoff contracts aligned with the Agent Company map,
  responsibility matrix, capability registry, and permission matrix.
- Future Mission Planning Dry-Run can reference handoff metadata without invoking
  agents, executing workflows, or granting runtime access.
- Existing architecture boundaries remain unchanged.

## Definition of done

- Agent Communication / Handoff contracts, validator, and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Mission Planning Dry-Run begins.
