# Next Task

## Milestone name

Agent Permission Matrix

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
  - `tests/assistants/agent-capability-registry.test.ts`

## Goal

Define a deterministic, validated, non-executing permission matrix for the Agent
Company.

The matrix must describe which future permissions each role and capability may
request during planning, which permissions are forbidden, and which permissions
require Fabio approval or guardian consultation before any future runtime can use
them.

This milestone must not grant runtime permissions. It prepares MV AI OS for Mission
Planning Dry-Run and later governed workflow/tool execution.

## Required scope

- Define an Agent Permission Matrix contract.
- Reuse existing Agent Company role IDs.
- Reuse exact AgentSpecification IDs/versions.
- Reuse Agent Capability Registry capability IDs.
- Map each capability to allowed future permission requirements.
- Map each role to forbidden permission categories.
- Mark approval-sensitive permissions explicitly.
- Mark guardian-sensitive permissions explicitly.
- Preserve default-deny doctrine: undeclared permissions remain denied.
- Preserve deterministic ordering.
- Preserve redaction-safe public records.

## Forbidden scope

- Granting runtime permissions.
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

- `src/assistants/agent-permission-matrix.ts`
- `src/assistants/agent-permission-matrix-validator.ts`
- `tests/assistants/agent-permission-matrix.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid permission matrix is accepted.
- Every Agent Company role has explicit permission boundaries.
- Every Agent Capability Registry capability maps to declared future permission
  requirements or an explicit no-permission-needed marker.
- Permission owners map to Agent Company roles and exact AgentSpecification
  ID/version.
- Unknown roles are rejected.
- Unknown capabilities are rejected.
- Duplicate permission entries are rejected.
- Runtime-granting language is rejected.
- Publishing, outreach, delivery, budget, tool, workflow, model, memory-write, and
  external-side-effect permissions require explicit approval markers where relevant.
- Guardian-sensitive permissions require guardian requirements.
- Forbidden permission categories are enforced.
- Non-deterministic ordering is rejected.
- Matrix remains redaction-safe and excludes prompts, completions, provider payloads,
  secret references, secret values, raw transcripts, raw knowledge, raw memory,
  sensitive paths, raw guardian payloads, and transport internals.
- Existing tests continue passing.

## Acceptance criteria

- The repository contains a deterministic, validated, non-executing Agent Permission
  Matrix for the current Agent Company and Agent Capability Registry.
- The matrix can be used by future Mission Planning Dry-Run without adding runtime
  grants or execution behavior.
- Existing architecture boundaries remain unchanged.

## Definition of done

- Agent Permission Matrix contracts, validator, and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Mission Planning Dry-Run begins.
