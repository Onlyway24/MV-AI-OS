# Next Task

## Milestone name

Agent Capability Registry

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
  - `tests/assistants/inter-agent-responsibility-matrix.test.ts`

## Goal

Define a deterministic, validated, non-executing registry of which future business
and operating capabilities belong to which Agent Company roles.

This is not runtime capability execution. It is a planning and orchestration reference
for future Mission Planning Dry-Run and workflow design.

## Required scope

- Define an Agent Capability Registry contract.
- Reuse existing Agent Company role IDs and exact AgentSpecification IDs/versions.
- Map capabilities to owners and supporting roles.
- Categorize capabilities by business, research, content, publishing, sales, finance,
  legal/risk, customer delivery, knowledge, technical, quality, control, future tool,
  and future workflow concerns where appropriate.
- Mark future tool and future workflow mappings as non-executing declarations only.
- Declare guardian requirements per capability where relevant.
- Declare approval requirements per capability where relevant.
- Preserve deterministic ordering.
- Preserve redaction-safe public records.

## Forbidden scope

- Executing capabilities.
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

- `src/assistants/agent-capability-registry.ts`
- `src/assistants/agent-capability-registry-validator.ts`
- `tests/assistants/agent-capability-registry.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid capability registry is accepted.
- Every capability has an owner.
- Every owner maps to an Agent Company role and exact AgentSpecification ID/version.
- Unsafe capabilities require approval markers.
- Direct tool capability declarations are rejected unless marked future and
  non-executing.
- Future workflow declarations are rejected unless marked future and non-executing.
- Guardian requirements are validated.
- Approval requirements are validated.
- Duplicate capability IDs are rejected.
- Unknown agent IDs are rejected.
- Non-deterministic ordering is rejected.
- Registry remains redaction-safe and excludes prompts, completions, provider
  payloads, secret references, secret values, raw transcripts, raw knowledge, raw
  memory, sensitive paths, raw guardian payloads, and transport internals.
- Existing tests continue passing.

## Acceptance criteria

- The repository contains a deterministic, validated, non-executing Agent Capability
  Registry for the current Agent Company.
- The registry can be used by future Mission Planning Dry-Run and workflow design
  without adding execution behavior.
- Existing architecture boundaries remain unchanged.

## Definition of done

- Agent Capability Registry contracts, validator, and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Agent Permission Matrix begins.
