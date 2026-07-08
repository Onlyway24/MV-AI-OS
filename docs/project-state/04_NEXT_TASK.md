# Next Task

## Milestone name

Guardian Consultation Boundary

## Goal

Define how Only Way Assistant consumes supplied Operator Safety Report and guardian
status before continuing, warning, requiring confirmation, or blocking escalation.

This milestone must remain a deterministic consultation boundary only. It must not
execute guardians automatically, schedule checks, run background jobs, call models,
use network, mutate state, persist ledgers, execute tools, execute workflows, or act
autonomously.

## Why it matters

Only Way Assistant now has a validated runtime boundary that can accept supplied
Operator Safety context. The next safe step is to isolate the safety consultation
decision so future operator-facing behavior has one deterministic, validated,
redaction-safe gate before autonomy, delegation, tools, workflows, publishing, cloud,
or external side effects expand.

## Required scope

- Define `GuardianConsultationRequest` contract.
- Define `GuardianConsultationDecision` contract.
- Define `GuardianConsultationPolicy` contract.
- Add a deterministic guardian consultation evaluator or service boundary.
- Map Operator Safety status to continuation decisions:
  - healthy → may continue;
  - attention required → continue with warning or require acknowledgement;
  - critical → block escalation;
  - unknown or missing → require operator confirmation or block risky escalation.
- Map safety-to-autonomy decisions to allowed, warning, confirmation, or blocked
  outcomes.
- Map required approvals for escalation categories.
- Validate all public consultation request and decision contracts.
- Keep all outputs redaction-safe.

## Forbidden scope

- Running Cost, Security, Backup, Incident, Quality, or Operator Safety guardians.
- Collecting signals automatically.
- Scheduling, polling, background checks, or monitoring.
- Model calls, provider calls, live provider tests, or prompt generation.
- Tool calls or tool execution.
- Workflow calls or workflow execution.
- Agent delegation execution or multi-agent runtime.
- Core Brain behavior changes.
- Content Agent behavior changes.
- HTTP, dashboard, n8n, MCP, browser automation, filesystem tools, Telegram, email,
  Slack, cloud/VPS runtime, external APIs, network behavior, embeddings, vector
  search, durable persistence, or runtime ledgers.
- Mutating memory, knowledge, tasks, audits, files, backups, runtime state, or
  external systems.

## Likely files to create

- `src/assistants/guardian-consultation.ts`
- `src/assistants/guardian-consultation-validator.ts`
- `src/assistants/deterministic-guardian-consultation.ts`
- `tests/assistants/guardian-consultation.test.ts`

## Likely files to modify

- `src/index.ts`
- `docs/project-state/01_CURRENT_STATE.md`
- `docs/project-state/02_MASTER_ROADMAP.md`
- `docs/project-state/04_NEXT_TASK.md`
- `docs/project-state/05_DECISIONS.md`

## Tests required

- Healthy Operator Safety state allows bounded continuation.
- Attention-required Operator Safety state produces warning or acknowledgement
  requirement.
- Critical Operator Safety state blocks escalation.
- Unknown or missing Operator Safety state requires confirmation or blocks risky
  escalation.
- Safety-to-autonomy mapping is deterministic.
- Required approval mapping is deterministic.
- Invalid consultation requests are rejected.
- Invalid consultation decisions are rejected.
- Consultation output is redaction-safe and excludes prompts, completions, provider
  payloads, secret references, secret values, transcripts, raw knowledge, raw memory,
  sensitive paths, and transport internals.
- Existing Main Assistant specification/runtime, guardian, model, runtime, CLI,
  persistence, backup/restore, and governed content tests continue passing.

## Acceptance criteria

- Only Way Assistant has a validated guardian consultation boundary that consumes
  supplied Operator Safety context and produces deterministic continuation, warning,
  confirmation, approval, or blocking decisions.
- No guardian execution, scheduling, model calls, provider calls, tool calls,
  workflow execution, persistence, network behavior, dashboard, alerts, or autonomous
  behavior is added.
- Existing Core Brain, policy, guardian, model, memory, knowledge, tool, workflow,
  runtime, CLI, and repository boundaries remain unchanged.

## Definition of done

- Guardian consultation contracts, validators, deterministic evaluator, and tests are
  complete.
- Project-state documents accurately describe the consultation boundary.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and
  `git diff --check` pass.
- The milestone is committed before Main Assistant Delegation Policy Foundation
  begins.
