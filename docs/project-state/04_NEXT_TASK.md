# Next Task

## Milestone name

Workflow Step Outcome Validation and Completion

## Goal

Validate one durably completed deterministic AgentRuntime invocation against its
exact Workflow Step and atomically accept or reject the outcome without automatically
starting another step.

## Why it matters

MV AI OS can now reserve, invoke, and durably replay one exact deterministic-local
Content Director outcome while leaving the Workflow Step in `AWAITING_RESULT`.
Successful invocation is not yet trusted as successful Workflow Step completion.

## Required scope

- Resolve the exact durable invocation, workflow, step, specification, executor, and
  fingerprint.
- Validate structured output, success requirements, evidence requirements, quality
  requirements, and the non-external-effects declaration.
- Produce an explicit accepted, revision, rejected, failed, invalid, or blocked
  outcome decision using the smallest sufficient status set.
- Atomically persist accepted step completion, workflow version, command receipt,
  outcome evidence, and Workflow Event.
- Preserve duplicate acceptance idempotency and restart-safe readback.
- Leave rejected, invalid, failed, and revision outcomes incomplete without automatic
  reinvocation.
- Reveal any newly ready step only on a later explicit readiness evaluation.
- Update project-state documents.

## Forbidden scope

- Browser, filesystem mutation, HTTP, n8n, dashboard, webhook, scheduler, background
  worker, autonomous loop, real tool execution, publishing, outreach, payment,
  customer delivery, or other external side effects.
- Agent invocation, automatic retry, automatic next-step execution, scheduling,
  callbacks, compensation, or workflow result aggregation.
- Treating successful invocation as sufficient evidence of step success.
- A second database, destructive migration, secrets/prompts/completions/provider
  payloads in durable workflow records, or weakening existing public contracts.
- Role-name matching, bypassing the exact active binding, mutation through catalog
  inspection, or treating resolution itself as execution authority.

## Likely files to create

- `src/workflows/runtime/workflow-step-outcome.ts`
- `src/workflows/runtime/repository-backed-workflow-step-outcome-service.ts`
- `tests/workflows/workflow-step-outcome.test.ts`

## Likely files to modify

- existing workflow persistence/state-machine services only where required for the
  atomic awaiting-result and completion/failure transitions
- `src/index.ts`
- affected project-state documents

## Tests required

- valid accepted output, missing fields/evidence, low quality, wrong identities,
  stale versions, blocked controls, external-effect claims, and sensitive leakage;
- accepted completion, rollback, duplicate acceptance, restart readback, and exact
  single version increment;
- no automatic AgentRuntime invocation or next-step execution;
- all existing tests remain green.

## Acceptance criteria

- Exactly one valid durable invocation outcome can be explicitly accepted.
- Completion is atomic and idempotent under exact version and fingerprint checks.
- Every invalid, stale, unsafe, or incomplete outcome fails closed.
- No external side effect is introduced.
- Full lint, typecheck, test, build, and diff checks pass in a separate clean commit.

## Definition of done

One deterministic/local Workflow Step can be completed only after separate explicit
outcome acceptance. Automatic progression and all external execution remain absent.
