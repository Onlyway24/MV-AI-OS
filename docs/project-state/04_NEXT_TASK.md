# Next Task

## Milestone name

Initial Core Agent Specifications

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Read every file in `docs/project-state/`.
- Read `docs/agent-lab/01_AGENT_TEAM.md`,
  `docs/agent-lab/02_AGENT_ROLES.md`,
  `docs/agent-lab/04_KNOWLEDGE_PLAN.md`,
  `docs/agent-lab/05_VOICE_PROFILE.md`, and
  `docs/agent-lab/08_AI_AGENT_OPERATING_DOCTRINE.md`.
- Inspect existing Agent Specification contracts, validators, immutable registry,
  Content Agent specification, and Agent Company map before writing source code.

## Goal

Create exact, validated AgentSpecification records for the first internal Agent
Company roles without executing them yet.

The specifications must convert the declarative Agent Company map into concrete
agent identities, task types, input/output schemas, capabilities, limits, policy
requirements, handoff targets, and versioned instruction references.

## Why it matters

The Agent Company map now defines which internal roles should exist and why. The next
step is making the first roles concrete enough for future mission planning and
workflow dry-runs while preserving the existing non-executing safety boundary.

## Required scope

- Define initial core AgentSpecification records for:
  - Research Agent.
  - Business Agent.
  - Content Director.
  - Developer Agent.
  - Sales Agent.
  - Finance / Cost Analyst.
  - Legal / Risk Reviewer.
- Reuse the existing AgentSpecification contract and validator.
- Keep all specifications status `experimental`.
- Declare exact task types, input schemas, output schemas, capabilities, limits,
  policy requirements, handoff targets, and instruction references.
- Ensure every specification maps back to the Agent Company map.
- Ensure permissions align with role business value, memory requirements, knowledge
  requirements, approval requirements, and control-plane dependencies.
- Add deterministic registry tests for duplicate prevention and lookup if needed.
- Export only appropriate public constants/types from `src/index.ts`.

## Forbidden scope

- Executing agents.
- Calling models or providers.
- Creating prompts that call live models.
- Adding multi-agent runtime.
- Adding mission planning runtime.
- Adding workflow execution.
- Adding tool execution.
- Adding external communication, publishing, sales sending, or customer delivery.
- Running guardians automatically.
- Adding HTTP, dashboard, n8n, MCP, network behavior, browser automation,
  filesystem tools, cloud/VPS runtime, embeddings, vector search, durable
  persistence, or runtime ledgers.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior unless strictly required for shared constants.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/core-agent-specifications.ts`
- `tests/assistants/core-agent-specifications.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Every initial core AgentSpecification validates with the existing validator.
- Every initial core AgentSpecification maps to an Agent Company role.
- Agent IDs and versions are deterministic.
- Task types are non-empty and role-specific.
- Input and output schemas are strict.
- Capabilities match declared memory, knowledge, model, workflow-proposal, and no
  direct tool execution boundaries.
- Policy requirements are present for knowledge, memory, model, workflow proposal,
  and approval-sensitive paths where applicable.
- Handoff targets are declared and deterministic.
- Registry rejects duplicates and resolves exact versions if registry composition is
  added.
- Specifications remain redaction-safe and exclude prompts, completions, provider
  payloads, secret references, secret values, raw transcripts, raw knowledge, raw
  memory, sensitive paths, raw guardian payloads, and transport internals.
- Existing assistant, guardian, model, runtime, CLI, persistence, backup/restore,
  workflow-specification, tool-gateway, and governed content tests continue passing.

## Acceptance criteria

- The repository contains exact experimental AgentSpecification records for the
  initial core Agent Company roles.
- The specifications are validated by existing AgentSpecification validation.
- The specifications do not execute agents, workflows, tools, models, providers,
  persistence, network behavior, dashboards, alerts, or autonomous behavior.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Initial core Agent Specifications and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Mission Planning Dry-Run Boundary begins.
