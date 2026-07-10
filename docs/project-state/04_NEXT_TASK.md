# Next Task

## Milestone name

Founder Intent / Mission Brief Foundation

## Required context before implementation

- Read `docs/MV_AI_OS_CONSTITUTION.md`.
- Read `AI_ENGINEERING_RULES.md`.
- Read every file in `docs/project-state/`.
- Read `docs/ARCHITECTURE.md`, `docs/AGENTS.md`, and `docs/ROADMAP.md`.
- Inspect the completed Agent Company declarations and readiness evaluator.
- Inspect existing validation, immutability, and redaction patterns.

## Goal

Create the validated, deterministic, non-executing contract through which Fabio gives
MV AI OS a structured objective. The brief must preserve business value, constraints,
quality, originality, uncertainty, evidence, cost, risk, brand, approval, and forbidden
action intent without planning or executing the mission.

## Required scope

- Define a versioned Founder Mission Brief contract and public validator.
- Support business opportunity, product or offer design, market research, content
  strategy, software development, internal operations, customer delivery preparation,
  monetization experiment, quality improvement, and risk review missions.
- Represent objective, purpose, audience, desired deliverables, success metrics,
  deadline, budget/cost limit, priority, constraints, non-negotiables, forbidden
  actions, risk tolerance, quality, originality, style, brand, approvals, known facts,
  assumptions, unknowns, and evidence expectations.
- Classify unknowns as `DECISION_BLOCKING`, `MATERIAL_BUT_ASSUMABLE`, or `LOW_IMPACT`.
- Produce clarification questions only for decision-blocking unknowns.
- Support conservative explicit assumptions for lower-impact unknowns.
- Provide configurable, non-sensitive founder and brand preference profiles, including
  default MV AI OS and Metodo Veloce profiles without leaking visual requirements into
  unrelated missions.
- Preserve deterministic ordering, deep immutability, and redaction safety.

## Forbidden scope

- Mission Plan contracts or mission-plan generation.
- Agent selection, agent invocation, delegation, or handoff execution.
- Workflow runtime, tool runtime, model/provider calls, or Core Brain changes.
- Persistence, HTTP, dashboard, n8n, MCP, network behavior, browser automation,
  filesystem tools, cloud/VPS runtime, embeddings, vector search, scheduler, alerts,
  external communication, publishing, spending, delivery, or autonomy.
- Private biographical data in default preferences.
- Hardcoding the mission system exclusively for restaurants or one brand.

## Likely files to create

- `src/missions/founder-mission-brief.ts`
- `src/missions/founder-mission-brief-validator.ts`
- `tests/missions/founder-mission-brief.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Valid mission briefs and every supported mission type.
- Missing required objective or deliverable intent.
- Invalid deadline or budget.
- Contradictory constraints and forbidden actions.
- Approval-sensitive and forbidden external actions.
- Decision-blocking, assumable, and low-impact unknown behavior.
- Multiple brand profiles and mission-relevant preference application.
- Unknown-field, redaction-safety, deterministic-ordering, and deep-immutability tests.
- Existing tests continue passing.

## Acceptance criteria

- Fabio's structured intent can be validated without creating or executing a plan.
- Only decision-blocking unknowns require clarification; lower-impact gaps remain
  explicit assumptions.
- Mission briefs are useful across business, content, technical, research, operations,
  delivery-preparation, monetization, quality, and risk scenarios.
- No execution capability or external side effect is added.

## Definition of done

- Founder Mission Brief contracts, validator, defaults, and tests are complete.
- Project-state accurately describes the milestone and next task.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed separately before Mission Plan contracts begin.
