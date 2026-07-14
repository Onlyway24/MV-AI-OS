# MV-AI-OS Core V1 Operator and Recovery Guide

## What Core V1 is

Core V1 is a controlled local Mission and Workflow runtime for Fabio. It validates a structured Founder Mission Brief, creates deterministic Mission Plans, applies the Only Way Quality Gate, persists Workflows in SQLite, enforces approvals and Guardian decisions, invokes one deterministic local Content Director, validates its structured preparation-only result, and supports explicit completion and lifecycle recovery.

Every CLI invocation reads one bounded JSON command from standard input, writes one JSON result to standard output, closes the runtime, and performs no unauthorized external action.

Core V1 does not include GPT or Claude calls, provider APIs, tools, browser or network automation, publication, outreach, payments, customer delivery, background workers, scheduling, a Web Console, a public server, or multi-user behavior.

## Build and configure

Requirements: Node.js 22.23.x and npm 10.9.8.

```sh
npm install
npm run build
mkdir -p data
```

The safe deterministic configuration is `examples/core-v1/local-config.json`. Its SQLite path is `./data/mv-ai-os-core-v1.sqlite`. Keep this file to recover state after restart. Deterministic Core V1 needs no credentials.

```sh
npm run cli -- --config examples/core-v1/local-config.json < examples/core-v1/create-workflow.json
npm run cli -- --config examples/core-v1/local-config.json < examples/core-v1/get-operator-report.json
npm run cli -- --config examples/core-v1/local-config.json < examples/core-v1/produce-metodo-veloce-content.json
```

The response contains `status`, `result`, `unauthorizedExternalEffectOccurred`, and exactly one `nextAction`. Use the returned Workflow version in the next command.

## Command envelope

```json
{"actorId":"actor-local","commandId":"stable-command-id","contractVersion":"1","input":{},"operation":"ALLOWLISTED_OPERATION","workspaceId":"workspace-local"}
```

Unknown operations, fields, identities, stale versions, oversized input, unsafe text, and conflicting IDs fail closed. If `input.commandId` exists, it must equal the outer `commandId`.

## Core V1 operations

| Operation | Purpose |
|---|---|
| `CREATE_MISSION` | Validate `{ "brief": <FounderMissionBrief> }`. |
| `PLAN_MISSION` | Generate the deterministic Mission Plan and Quality Gate report. |
| `CREATE_WORKFLOW` | Atomically create or replay a definition and instance. |
| `INSPECT_WORKFLOW` | Read `{ "instanceId": ... }`. |
| `PRODUCE_METODO_VELOCE_CONTENT` | Create one durable, preparation-only TikTok/Instagram/carousel production from an evidence-bound brief. |
| `INSPECT_METODO_VELOCE_CONTENT` | Read one production by `{ "productionId": ... }`. |
| `REVIEW_METODO_VELOCE_CONTENT` | Fabio records an exact-version `APPROVED` or `REJECTED` review. |
| `SCHEDULE_METODO_VELOCE_CONTENT` | Put one Fabio-approved production on the internal calendar; this never publishes it. |
| `RECORD_METODO_VELOCE_CONTENT_METRICS` | Record declared views, saves, leads, conversions, and cost after separate human confirmation. |
| `ARCHIVE_METODO_VELOCE_CONTENT` | Remove one active production from the queue without deleting its history. |
| `LIST_METODO_VELOCE_CONTENT_QUEUE` | Read up to 25 durable content records ordered for operational review. |
| `GET_OPERATOR_REPORT` | Get status, blockers, retry state, evidence, and one action. |
| `EVALUATE_READINESS` | Evaluate exact-version Step readiness without invocation. |
| `GET_NEXT_CANDIDATE` | Select exactly one controlled Step candidate. |
| `RECORD_APPROVAL` | Record `{ "checkpoint": ... }` from Fabio. |
| `RECORD_GUARDIAN` | Record one independent `{ "checkpoint": ... }`. |
| `INVOKE_AGENT` | Invoke only the deterministic local Content Director. |
| `INSPECT_AGENT_RESULT` | Read `{ "invocationId": ... }`. |
| `ACCEPT_OUTCOME` | Validate and atomically complete an acceptable Step. |
| `REJECT_OUTCOME` | Persist rejection plus `reasonCode` without false completion. |
| `FAIL_STEP` | Classify and persist a failed Step. |
| `INSPECT_RETRY_ELIGIBILITY` | Read bounded attempts and authorization state. |
| `AUTHORIZE_RETRY` | Authorize one exact eligible failure. |
| `EXECUTE_RETRY` | Consume authorization and restore `READY` only. |
| `PAUSE_WORKFLOW` | Pause without invoking or erasing evidence. |
| `RESUME_WORKFLOW` | Resume eligibility; prior controls remain stale. |
| `CANCEL_WORKFLOW` | Cancel remaining work without claiming compensation. |
| `EVALUATE_TIMEOUT` | Explicitly evaluate the configured timeout. |
| `INSPECT_AUDIT_EVENTS` | Return 1–100 events for one correlation ID. |

Authoritative request shapes are exported TypeScript contracts and exercised in `tests/core-v1/core-v1-local-vertical-slice.test.ts`. Copy IDs and exact versions from the latest report; never guess them or edit SQLite.

## Normal operating sequence

1. Submit `CREATE_MISSION`, then `PLAN_MISSION`.
2. For a reviewed Metodo Veloce content brief, submit `PRODUCE_METODO_VELOCE_CONTENT`.
   The resulting durable production contains only declared evidence, carousel copy,
   TikTok script, Instagram copy, variants, risk findings, quality state, approval
   status, and metrics to measure later. It is never published automatically.
3. Fabio records `REVIEW_METODO_VELOCE_CONTENT` on the exact returned version. Only an
   approved production may be scheduled; rejection archives it. A schedule remains an
   internal calendar entry and needs a separate future publication decision.
4. After the separate human confirmation of external performance, record metrics,
   inspect the queue, or archive the production. None of those commands publish,
   contact, spend, deploy, or invoke a provider.
5. Create the reviewed Workflow with `CREATE_WORKFLOW`.
6. Call `GET_OPERATOR_REPORT` and follow its one `nextAction`.
7. Call `EVALUATE_READINESS`.
8. Record required Fabio approval and each Guardian decision independently.
9. Call `GET_NEXT_CANDIDATE`, then `INVOKE_AGENT`.
10. Inspect the result with `INSPECT_AGENT_RESULT`.
11. Use `ACCEPT_OUTCOME` only when evidence is acceptable; otherwise use `REJECT_OUTCOME`, then explicitly classify failure or revise through a later command.
12. Request a fresh Operator Report after every state change.

The Content Director prepares direction only. It never publishes, contacts anyone, changes external assets, modifies a logo, pays, deploys, or delivers.

## Lifecycle and recovery

- Failure: `FAIL_STEP` requires the exact invocation, Step, version, category, and configured maximum of three attempts.
- Retry: inspect eligibility, authorize the exact latest failure, then execute it. Execution restores eligibility but invokes nothing.
- Pause: `PAUSE_WORKFLOW` prevents new or interrupted invocation across its changed version.
- Resume: `RESUME_WORKFLOW`, then obtain fresh readiness, policy, approval, Guardian, specification, executor, and version evidence.
- Cancel: `CANCEL_WORKFLOW` retains completed and failure evidence and claims no compensation.
- Timeout: `EVALUATE_TIMEOUT` uses the durable reservation timestamp, injected clock, and fixed 60-second local ceiling. Time passing alone does nothing.

## Shutdown, restart, and persisted recovery

Each CLI command closes automatically. On interruption, send `SIGINT` or `SIGTERM`; do not delete or manually edit SQLite. To recover, rerun the same build and configuration and submit `GET_OPERATOR_REPORT` with the last version. If stale, use `INSPECT_WORKFLOW`, copy the authoritative version, and request a new report. Matching stable IDs replay; conflicting reuse fails closed.

Before backup or restore, stop CLI processes. Use the repository's controlled SQLite backup/restore capability, not a copy of an open database.

## Safe errors

- `cli_request_invalid`: correct the allowlisted envelope or input contract.
- identity mismatch: use the configured actor and workspace.
- stale version: inspect the Workflow and resubmit; never overwrite state.
- approval or Guardian blocker: record only the requested checkpoint.
- invocation blocked: resolve every blocker; never bypass candidate selection.
- retry denied/exhausted: correct the condition or cancel; never raise the ceiling or loop.
- internal error: no stack or secret is returned. Preserve SQLite and inspect bounded audit evidence.

## Verify Git and release state

```sh
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
git status -sb
git rev-list --left-right --count origin/main...HEAD
```

A release-ready checkout is clean, reports `0 0` divergence, and passes every command. This does not claim cloud deployment or external-action capability; both are intentionally absent.
