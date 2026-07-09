# Next Task

## Milestone name

Extended Business Agent Specifications

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read every file in `docs/project-state/`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Read `docs/agent-lab/01_AGENT_TEAM.md`,
  `docs/agent-lab/02_AGENT_ROLES.md`,
  `docs/agent-lab/04_KNOWLEDGE_PLAN.md`,
  `docs/agent-lab/06_BUSINESS_USE_CASES.md`, and
  `docs/agent-lab/08_AI_AGENT_OPERATING_DOCTRINE.md`.
- Inspect `src/assistants/agent-company-specification.ts` and
  `src/assistants/core-agent-specifications.ts` before writing source code.

## Goal

Create exact, validated AgentSpecification records for the remaining business-facing
Agent Company roles without executing them yet.

## Required scope

- Define experimental AgentSpecification records for:
  - Publisher Agent.
  - Sales Agent.
  - Finance / Cost Analyst.
  - Legal / Risk Reviewer.
  - Customer Delivery Agent.
- Reuse the existing AgentSpecification contract, validator, and patterns from
  Initial Core Agent Specifications.
- Ensure every specification maps back to the Agent Company role map.
- Preserve approval-sensitive boundaries for publishing, sales, and customer
  delivery.
- Keep direct tool execution unavailable.
- Export only appropriate public constants from `src/index.ts`.

## Forbidden scope

- Executing agents.
- Calling models or providers.
- Adding multi-agent runtime.
- Adding mission planning runtime.
- Adding workflow execution.
- Adding tool execution.
- Sending, publishing, outreach, sales delivery, or customer delivery.
- Running guardians automatically.
- Adding HTTP, dashboard, n8n, MCP, network behavior, browser automation,
  filesystem tools, cloud/VPS runtime, embeddings, vector search, durable
  persistence, or runtime ledgers.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.

## Likely files to create

- `src/assistants/extended-business-agent-specifications.ts`
- `tests/assistants/extended-business-agent-specifications.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Every extended business AgentSpecification validates with the existing validator.
- Every specification maps to an Agent Company role.
- Publishing, sales, and customer delivery specs include approval policy
  requirements for approval-sensitive workflow proposals.
- Finance and Legal/Risk specs clearly remain advisory and non-binding.
- No specification declares `tool.execute` or `tool.read`.
- Handoff targets and task types are deterministic.
- Registry rejects duplicates and resolves exact versions if registry composition is
  extended.
- Specifications remain redaction-safe and exclude prompts, completions, provider
  payloads, secret references, secret values, raw transcripts, raw knowledge, raw
  memory, sensitive paths, raw guardian payloads, and transport internals.
- Existing tests continue passing.

## Acceptance criteria

- The repository contains exact experimental AgentSpecification records for the
  remaining business-facing Agent Company roles.
- All specifications validate and remain non-executing.
- Existing architecture boundaries remain unchanged.

## Definition of done

- Extended Business Agent Specifications and tests are complete.
- Project-state documents accurately describe the completed milestone.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Inter-Agent Responsibility Matrix begins.
