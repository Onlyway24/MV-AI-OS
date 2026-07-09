# Next Task

## Milestone name

Agent Company Specification Foundation

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Read every file in `docs/project-state/`.
- Read `docs/agent-lab/01_AGENT_TEAM.md`,
  `docs/agent-lab/02_AGENT_ROLES.md`,
  `docs/agent-lab/07_CONTROL_PLANE_AGENTS.md`, and
  `docs/agent-lab/08_AI_AGENT_OPERATING_DOCTRINE.md`.
- Verify repository implementation still matches the documented state before writing
  source code.

## Goal

Create the declarative map of Fabio's internal AI company.

This map defines which future internal specialist roles exist, what business value
each role creates, what each role may and may not do, which control-plane gates apply,
and how those roles will later map to exact Agent Specifications.

This is not agent runtime, multi-agent execution, workflow execution, tool execution,
model calling, external communication, or autonomous delegation.

## Why it matters

Only Way Assistant can now produce operator-facing decisions and non-executing
delegation-policy output. The next step is a stable internal company map so Fabio
does not babysit random agents. Only Way Assistant should eventually coordinate a
declared set of specialist roles that each exists for clear business value and
remains bounded by policy, guardians, approvals, memory, knowledge, budget, quality,
security, and backup readiness.

## Required scope

- Define `AgentCompanyRole` contract.
- Define `AgentCompanyMap` contract.
- Define `AgentCompanyDepartment` contract if useful.
- Define agent category and role-priority contracts if useful.
- Define business value classification.
- Define role boundaries.
- Define future AgentSpecification mapping.
- Define control-plane dependencies for each role.
- Define forbidden capabilities per role.
- Define approval requirements per role.
- Define memory and knowledge requirements if useful.
- Define operator-facing purpose per role.
- Add runtime validators for all public agent-company contracts.
- Add deterministic ordering rules for departments, roles, dependencies, approvals,
  forbidden capabilities, and specification mappings.
- Keep output deterministic and redaction-safe.

Initial roles:

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

Each role must answer at least one:

- saves Fabio time;
- helps Fabio make money;
- reduces risk;
- improves quality;
- reduces operational work.

## Forbidden scope

- Executing agents.
- Calling or invoking sub-agents.
- Multi-agent runtime.
- Workflow execution.
- Tool execution.
- Model calls, provider calls, live provider tests, or prompt generation.
- External communication, publishing, outreach, sales sending, or customer delivery.
- Running guardians or collecting guardian signals automatically.
- Scheduling, polling, background checks, monitoring, alerts, Telegram, email, Slack,
  dashboard, HTTP, n8n, MCP, browser automation, filesystem tools, cloud/VPS runtime,
  external APIs, network behavior, embeddings, vector search, durable persistence, or
  runtime ledgers.
- Mutating Core Brain behavior.
- Mutating Content Agent behavior.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/agent-company-specification.ts`
- `src/assistants/agent-company-specification-validator.ts`
- `tests/assistants/agent-company-specification.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid role map is accepted.
- Invalid role map is rejected.
- Unsafe role definitions are rejected.
- Missing business value classification is rejected.
- Role boundary violations are rejected.
- Forbidden capabilities are rejected.
- Missing approval requirements are rejected where required.
- Missing control-plane dependencies are rejected where required.
- Future AgentSpecification mappings are deterministic and valid.
- Role ordering is deterministic.
- Output is redaction-safe and excludes prompts, completions, provider payloads,
  secret references, secret values, transcripts, raw knowledge, raw memory, sensitive
  paths, raw guardian payloads, and transport internals.
- Existing Main Assistant runtime, Guardian Consultation, Operator Decision Engine,
  Delegation Policy, Operator Protocol, guardian, model, runtime, CLI, persistence,
  backup/restore, and governed content tests continue passing.

## Acceptance criteria

- The repository contains a validated declarative Agent Company map.
- Every initial role has clear business value, role boundaries, control-plane
  dependencies, forbidden capabilities, approval requirements, and future
  AgentSpecification mapping.
- The map does not execute agents, workflows, tools, models, providers, external
  communication, persistence, network behavior, dashboards, alerts, or autonomous
  behavior.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Agent Company contracts, validators, deterministic map data, and tests are
  complete.
- Project-state documents accurately describe the Agent Company Specification
  foundation.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Initial Core Agent Specifications begins.
