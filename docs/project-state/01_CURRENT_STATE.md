# MV-AI-OS current verified state

## Release posture

This file describes the integrated repository as verified on 2026-08-13. Historical
milestone detail remains in Git and `05_DECISIONS.md`; it is not repeated here.

The hardened Core V1 checkpoint `11a24b2` and the advanced
`feature/telegram-operator-console` history through `3b8389d` are unified on the final
integration line. The code uses one local composition root, one
`LocalWorkflowCommandBoundary`, one SQLite migration line, one actor/workspace
ownership model and shared durable audit/receipt/event repositories.

The implementation is practically complete for deterministic local operation. It is
not a claim that live Telegram, social accounts, paid providers or a VPS are currently
connected.

## Canonical boundaries

- Public and persisted values are runtime validated and size bounded.
- Immutable Agent and Workflow Specifications resolve by exact ID/version.
- Attributed workflow creation uses atomic `ADMIT_WORKFLOW_SPECIFICATION`.
- Admission fingerprints the workflow and every referenced Agent Specification and
  atomically persists definition, instance, ownership and sanitized audit evidence.
- Admission also validates and durably fingerprints the exact mission
  reference/objective on the instance; invocation and reporting consume that binding.
- Workflow controls include exact-version approval/Guardian checkpoints, readiness,
  exact candidate binding, controlled agent invocation, explicit result review,
  retry authorization/execution, pause/resume/cancel and timeout evaluation.
- `CREATE_WORKFLOW` remains a compatibility operation for unattributed legacy state;
  it cannot forge admission metadata.
- Telegram's confirmed `/workflow` promotion uses canonical specification admission
  and no longer hand-builds runtime definitions or instances.

## Operator surfaces

### Local CLI

The CLI processes exactly one bounded command and returns one validated structured
response. Command receipts survive restart and conflicting idempotency reuse fails.
It exposes the unified Core, mission, workflow, research, evidence, content, social,
Agent Company, venture and operations commands.

### Private Command Center

The loopback server reads the same repositories. Founder access uses owner-only
bootstrap state, passkey sessions, RBAC, CSRF/Origin enforcement and command-bound
step-up. Control actions are proposed and separately confirmed against exact durable
fingerprints. Its authenticated SSE plane is bounded and read-only.

### Telegram

The dedicated-bot adapter is private-chat allowlisted, privacy-minimizing and
restart-safe. Guided Mission planning, templates, daily brief, workflow admission and
reports, production/evidence inspection, Visual-Gate-bound approval, venture briefs,
status and stop controls use canonical application services. Durable outbound intent
precedes transport; uncertain delivery is never blindly replayed.

## Missions, agents and internal work

- Founder Mission validation/planning and Quality Gate are deterministic and
  non-executing.
- A deterministic 17-role Agent Company has validated permissions, responsibility,
  handoff and operational workday contracts.
- Business Mission dossiers, authorized research missions, venture records and
  evidence/content records are separate typed aggregates behind shared ownership,
  repository and command boundaries. They are not parallel workflow engines.
- All eight enabled Venture H24 schedules are wired in the production worker to the
  canonical Venture SQLite/service boundary. Internal work is bounded and missing
  Founder policy, evidence coverage or real observations fails closed.
- Agent runtime execution is provider-neutral. The default Content Director path is
  deterministic and local; optional OpenAI execution remains behind the hardened
  gateway.
- Internal work may proceed without repeated approval when it is local, bounded and
  policy permitted. External or irreversible effects retain exact machine-enforced
  gates.

## Evidence, content and media

- Research accepts explicit authorized sources and records acquisition truthfully.
- Evidence records and immutable Evidence Packs bind sources, claims, limitations,
  fingerprints and freshness.
- Metodo Veloce content and Social Publishing Packs remain preparation-only until
  review.
- Command Center and Telegram share one central Visual Gate. It verifies exact
  workspace/production versions, content and downstream pack fingerprints, manifest
  fingerprint, asset paths, byte hashes and dimensions both at proposal and confirm.
- Internal content approval is distinct from scheduling; scheduling is distinct from
  publication dry-run; dry-run authorization is distinct from a real external receipt.
- Media Factory and OpenAI image/text diagnostic pilots are bounded operator tools,
  not hidden runtime side effects.

## Supervised operations and H24

- The complete catalog contains 19 job types with a matching typed handler catalog.
- Durable schedules/jobs use Europe/Rome calendar or fixed cadence, expiring leases,
  fencing tokens, heartbeats, hard timeouts, bounded retry/backoff, cancellation,
  recovery, dead-letter state, successors, maintenance mode and kill switches.
- Aggregate changes and safe operational events are transaction-bound.
- Founder Workday and Daily Operating Brief are durable, restart-safe and honest about
  bounded coverage. Missing global usage/effect evidence is `UNAVAILABLE`, never a
  fabricated zero.
- H24 readiness means the machinery can be explicitly supervised. No daemon is
  installed or started by import, migration, Telegram or Command Center startup.

## Persistence and recovery

- SQLite schema version 32 is the single current local migration line.
- Repository reads validate stored JSON and ownership; malformed, oversized, stale or
  conflicting data fails closed.
- Secrets are referenced, resolved ephemerally, descriptor-pinned, bounded,
  owner-checked and mode-checked. Raw secret values are not accepted in committed
  config.
- SQLite backup opens a pinned regular source, uses the online backup API, validates
  integrity and application schema, and publishes private output without unsafe
  overwrite races.
- Production backup additionally binds Admin Security state, hashes and a host Ed25519
  signature. Restore is explicit, quiesced, rollback-protected and returns with
  maintenance/publication controls engaged.
- Docker/Compose, systemd, launchd and VPS scripts implement one private deployment
  model; they do not attest that an external host is active.

## Provider, tool and external-effect safety

- Provider-neutral gateway contracts enforce permissions, time, result, token/call and
  budget limits.
- Optional OpenAI requests are restricted to the canonical official HTTPS origin,
  reject redirects, bound streams and exclude sensitive memory from provider context.
- Tool declarations grant no permission. Tool/research execution requires effective
  authorization, validated I/O, bounds, idempotency where relevant and audit.
- Publication, unsolicited outreach, payment, purchases, capital allocation,
  destructive actions and deployment remain explicitly gated.
- Official Instagram/TikTok connector foundations do not equate OAuth connection with
  publication authority.

## Verification evidence

On the integrated source and dependency lockfile:

- `npm ci`: pass;
- `npm run lint`: pass, zero warnings;
- `npm run typecheck`: pass;
- `npm test`: 193 files and 1,465 tests pass;
- `npm run build`: pass with a clean `dist` rebuild;
- `npm audit`: zero vulnerabilities after updating only the patched transitive
  `brace-expansion` and `nanoid` lockfile entries;
- focused Telegram admission tests prove canonical definition identity, ownership,
  admission audit, report and replay;
- loopback HTTP/SSE tests require the local listener permission and pass when run in
  that intended environment.

The final package/import/CLI/restart/backup/scheduler smokes and final architecture and
security reviews are release evidence recorded by the final integration commit and
session report.

## Intentional external checkpoints

- a private-phone Telegram continuity check with Fabio's untracked bot/chat config;
- Instagram/TikTok developer applications, browser consent and exact account checks;
- any live paid-provider request with an approved credential and budget;
- authenticated VPS deploy/reboot/tunnel/restore evidence and signed host receipts;
- real publication, outreach, purchase, payment, capital or venture decisions.

These are genuine external/account decisions. They do not create an incomplete local
architecture and may not be simulated as successful.
