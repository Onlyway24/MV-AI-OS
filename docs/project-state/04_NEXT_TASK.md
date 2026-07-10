# Next Task

## Milestone name

Only Way Mission Quality Gate

## Goal

Create a deterministic, non-LLM quality evaluator that scores Mission Plans for
clarity, specificity, actionability, value, differentiation, founder alignment,
feasibility, manual-work efficiency, evidence/uncertainty, and safety/control.

## Required scope

- Integer scores from 0 to 10 for all ten quality dimensions.
- Total score from 0 to 100, blocking defects, warnings, strengths, weaknesses,
  remediation recommendations, status, and release recommendation.
- `APPROVAL_READY` requires at least 82/100, no critical dimension below 7, no
  blocking safety defect, useful expected outputs, complete approval/guardian
  controls, and no generic filler step.
- Deterministic anti-slop checks for vague directives without actor, target,
  deliverable, evidence, metric, output, decision, or boundary.
- Originality must never compensate for infeasibility, unsupported claims, excessive
  cost, unsafe action, unclear value, or unnecessary complexity.
- Fixed-template, redaction-safe, deeply immutable output.

## Forbidden scope

- LLM judges, model/provider calls, live research, agent invocation, workflow/tool
  execution, persistence, network, dashboard, external actions, or autonomy.

## Likely files to create

- `src/missions/mission-quality-gate.ts`
- `src/missions/mission-quality-gate-validator.ts`
- `src/missions/deterministic-mission-quality-gate.ts`
- `tests/missions/mission-quality-gate.test.ts`

## Likely files to modify

- `src/index.ts`
- all affected project-state documents.

## Tests required

- Strong approval-ready plan and exact 82/100 threshold behavior.
- Generic filler, original-but-infeasible, safe-but-valueless, unsafe commercial,
  missing metrics, excessive manual work, unsupported certainty, unclear audience,
  weak output, and blocking safety cases.
- Critical dimension threshold, deterministic remediation, redaction, and immutability.

## Acceptance criteria

- Every plan receives actionable deterministic quality evidence.
- Numerical quality never overrides a blocking safety defect.
- Every low score provides concrete remediation.

## Definition of done

- Quality contracts, validator, evaluator, tests, exports, and project-state updates are complete.
- All quality gates and `git diff --check` pass.
- The milestone is committed separately before Scenario Lab work.
