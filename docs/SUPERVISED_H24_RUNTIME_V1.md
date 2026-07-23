# Onlyway supervised operations — authoritative local runbook V1

This is the single operational reference for the supervised H24 runtime, durable
event plane, Founder Workday #001, Daily Operating Brief, private Command Center,
Telegram read surface and official-social browser checkpoint. Component documents
describe their contracts; this runbook defines how they are composed and what an
operator may truthfully claim.

For this sprint the only authoritative checkout is
`/Users/onlyway24/Desktop/MV-AI-OS`. The shadow checkout
Any alternate or shadow checkout is outside the operational and release scope.

## Current activation posture

The implementation is complete and tested as a local, single-workspace supervised
plane. Nothing is installed or started by application import, database migration or
ordinary CLI use. Six secret-free `launchd` templates exist under `ops/launchd`, but
they contain placeholders and remain inert until Fabio explicitly renders and installs
them. There is no cloud deployment, public listener or multi-user mode.

`H24_READY` therefore means “the bounded local scheduler/worker implementation can be
started under supervision”; it does not mean that a persistent process is currently
installed, loaded or healthy. Process health is derived only from current fenced
leases and durable control state.

## Non-negotiable invariants

- SQLite is the system of record. Job claim, attempt/receipt, aggregate mutation and
  redaction-safe operational event are transaction-bound.
- Scheduler and worker ownership use expiring leases and monotonic fencing tokens.
  Expired work is reconciled before a successor can claim it.
- The durable kill switch and maintenance mode are rechecked before each claim and at
  callback boundaries. Cancellation, hard timeouts, bounded retry and dead-letter are
  explicit states; there is no blind retry.
- The default eleven-job catalog has `maxCostCents: 0` and
  `maxProviderCalls: 0`. Built-in handlers report exactly zero provider/tool calls;
  unavailable cost or external-effect coverage is never converted into a measured
  zero elsewhere.
- Publication, deployment, messaging, purchasing, email, CRM mutation and social
  posting are outside this runtime. `PUBLICATION` remains `LOCKED` in every surface.
- Prompts, provider payloads, secrets, tokens, stack traces and arbitrary summaries
  cannot be represented by the operational-event contract.

## Durable runtime and event plane

The scheduler provisions eleven idempotent schedules: morning brief, Agent Company
workday, social reconciliation, evidence freshness, approval reminder, production
reconciliation, cost/budget check, backup/restore verification, stale-task detection,
daily report and security posture. The CLI composes real local callbacks for Founder
Workday and Daily Operating Brief. Backup success is accepted only from the explicit
verification boundary; a missing callback fails honestly.

The Agent Company handler also fails honestly: the acceptance day terminates with
16 work items `COMPLETED` and Backup Guardian `BLOCKED` under
`BACKUP_RESTORE_RECEIPT_REQUIRED`. A bounded structured blocker is durable evidence;
it is not rewritten as success to produce a green roster. Agent output is capped at
65.536 JSON bytes per completed task and 1.048.576 bytes per workday; cyclic,
oversized or unverifiable output fails validation.

Every accepted event has a workspace, stable event ID, aggregate identity/version,
timestamp, allowlisted event type and allowlisted safe-summary code. SQLite assigns a
monotonic cursor. The Command Center `/api/events` stream supports authenticated
loopback replay from `Last-Event-ID`, bounded reset to an authoritative snapshot when
the cursor is expired or replay would overflow, heartbeat and connection limits. The
stream is a projection channel, never a mutation or secret channel.

## Founder Workday #001

`FounderWorkdayService` reads its bounded repository snapshot, evaluates coverage,
builds the 17-agent dependency plan, inserts the immutable workday and appends
`FOUNDER_WORKDAY_CREATED` inside one `RepositoryTransactionRunner` transaction. It
does not open a nested transaction. Restart and exact replay return the same record and
do not append a second event; an identity owned by another workspace or actor is
rejected.

Missing Business Missions, fewer than three distinct fresh substantive Evidence Packs,
or a repository list that reaches its safety limit produce a structured blocker. No
task is labelled completed without a bound receipt. Cost and external-effect zeros in
this preflight dossier carry `PREFLIGHT_ONLY`, the production plan stays
`INTERNAL_PACKAGE_ONLY`, and publication stays `LOCKED`. This founder planning record
does not replace the existing executable `AgentCompanyWorkday` aggregate.

## Daily Operating Brief

`DailyOperatingBriefService` reads the source snapshot, inserts one date/workspace
brief and appends `DAILY_BRIEF_GENERATED` in one transaction. The business date is the
DST-safe `Europe/Rome` calendar day, not a UTC date. Repeating an unchanged snapshot
replays the exact record; a changed snapshot for the same day creates a new immutable,
incremented version, preserving morning and end-of-day history instead of overwriting
it.

The repository-backed source treats a result returned exactly at a list limit as
incomplete. Completed work includes operations receipts plus terminal Agent Company
outputs with `completedAt` and Founder Workday tasks with a bound completion receipt;
aggregate status alone cannot manufacture completed work. With complete bounded
coverage, blocked and in-progress Agent/Founder tasks remain visible in their own
sections. Cost and external-effect sections remain `UNAVAILABLE` until one
coverage-attested global ledger spans OpenAI,
publication, social, messaging, purchasing and deployment. Values displayed as zero
under `UNAVAILABLE` are placeholders, never a measured zero. Any other list with
incomplete coverage, absent backup receipt or absent runtime control is likewise
rendered `UNAVAILABLE`. Missing/stale leases, maintenance, a triggered kill switch,
dead-letter work or an open incident prevent a `READY` health claim.

The private Telegram command `/daily_brief` creates or replays today’s brief and
`/daily_brief <id>` renders bounded detail. The runtime closes its dedicated repository
resource with the Telegram process. Telegram remains an allowlisted Bot API transport;
it does not read Fabio’s personal account and cannot mutate the brief or publish.
Schema v30 validates the complete response locally and persists an opaque outbound
delivery intent before transport. An ambiguous send remains `DELIVERY_UNCERTAIN`,
advances its polling offset, emits `DELIVERY_RECONCILIATION_REQUIRED` and is never
redelivered automatically. A separate pre-transport validation failure can be isolated
as `REJECTED` after a safe fallback is delivered; it is not delivery uncertainty.

## Private Command Center and operator actions

The Command Center binds only to `127.0.0.1`, exchanges a random bootstrap token for
an `HttpOnly`, `SameSite=Strict` session, applies loopback Origin and CSRF checks to
mutations, and reads the same repositories. It shows operations control/health,
incidents, event history, Founder Workday, Daily Brief, production and social state.

Supported actions are proposals followed by a separate one-use confirmation. They are
limited to the allowlisted production/job/incident controls implemented by the action
service. Exact identity, version and fingerprint are rechecked in the durable
transaction. A refresh, double click, stale confirmation or wrong workspace cannot
repeat or broaden an action. No Command Center control authorizes publication.

Command Center queries are deliberately bounded. The principal operational windows
observe at most 25 productions, 25 Business Missions and 25 Agent Company workdays;
only three workdays are expanded in full detail, and the social window is capped at
500 records. Reaching a cap produces `LIMIT_REACHED`, lower-bound notation (`≥`) and
`ATTENTION_REQUIRED`; an empty bounded window is not proof of a global zero. Daily
Brief source limits follow the same fail-closed rule and emit `UNAVAILABLE`.

## Exact Visual Gate shared by Command Center and Telegram

Content approval is unavailable unless a fingerprinted manifest in the asset root is
`READY_FOR_HUMAN_DECISION` and binds the exact workspace, production ID/version,
content-package fingerprint, Social Publishing Pack fingerprint, Master Content Pack
fingerprint and asset-set fingerprint. The gate recomputes the manifest fingerprint,
reads every referenced file, verifies actual byte SHA-256 and declared image
dimensions, limits count/size, and rejects traversal, duplicate paths and symlink
escape.

Command Center and the private Telegram review validate this binding before offering
approval and again at confirmation/callback. The central
`LocalWorkflowCommandBoundary` independently enforces the same gate, so another local
adapter cannot bypass it. A changed manifest, asset, production version or package
consumes/invalidates the pending confirmation without approving anything. A successful
Fabio review persists the exact `visualApprovalBindingFingerprint` on the production.

Legacy reviews without that fingerprint remain readable for inspection and archive
compatibility, but cannot be scheduled, converted into a publication dry-run or
authorized. The official original logo does exist at its registered repository path,
with SHA-256
`9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121`.
`BLOCKED_ORIGINAL_LOGO_MISSING` embedded in the old social-pack manifest is therefore
stale historical metadata, not the current filesystem fact. The operational blocker
is that this legacy manifest has no exact `approvalBinding` and is not an exact
`READY_FOR_HUMAN_DECISION` manifest for the current production/assets.

A valid Visual Gate receipt plus Fabio's approval makes the exact production eligible
only for a separate internal scheduling command; the receipt does not itself schedule
anything. It never authorizes an upload, draft or post. Publication dry-run,
authorization, kill switch and external execution remain separate locked boundaries.
`PUBLICATION: LOCKED`.

## Official-social checkpoint

The offline connector runtime binds to `127.0.0.1:43123` and exposes health, status,
one machine-readable checkpoint and the exact callback routes documented in
`OFFICIAL_SOCIAL_CONNECTORS_V1.md`. Connection starts only through a CSRF-bound local
form `POST` from the operator root; direct `GET /oauth/{platform}/start` is not an
operator path. Fake transport covers OAuth state, PKCE, callback, redaction, restart,
expiry and removal-first credential handling without credentials or network calls.

The only remaining social step is Fabio’s consolidated browser checkpoint after the
media package is ready for review: configure/verify the official Instagram and TikTok
developer apps, exact redirects and minimum scopes; authorize the exact expected
professional accounts; then run local verification. Do not paste passwords, app
secrets or tokens into source, chat or logs. Connection/Insights/creator-info readiness
does not authorize uploads, drafts, scheduling or posts. `PUBLICATION: LOCKED`.

## Operating procedure

1. Build and run the offline gates: `npm run lint`, `npm run typecheck`,
   `npm run test`, `npm run build`, then `git diff --check`.
2. Keep runtime, Telegram and connector configuration untracked and secret-reference
   based. Verify the SQLite directory and any backup directory are private.
3. For a bounded foreground check, run
   `npm run operations -- --config /absolute/config.json --role smoke`.
4. Inspect the Command Center and `/daily_brief`. Treat `MISSING`, `STALE`,
   `UNAVAILABLE`, `BLOCKED`, `DEAD_LETTER` and `RECONCILIATION_PENDING` as action
   states, never as success.
5. If persistent local supervision is explicitly approved, render first and inspect
   the templates before installing them:

   ```sh
   scripts/onlyway-local-supervisor.sh render \
     --repo /absolute/path/MV-AI-OS \
     --node /absolute/path/node \
     --config /absolute/path/config.json \
     --log-dir /absolute/path/logs \
     --backup-dir /absolute/path/backups
   ```

6. Installation, status, stop, log rotation and uninstall are separate explicit
   supervisor commands. No root privilege is required. Stop/escalate on a stale lease,
   unknown cost, failed backup verification, open high-severity incident or uncertain
   external receipt; do not create a successor or retry merely to clear the UI.

## Acceptance evidence

Tests cover handler completeness, scheduling, fencing, heartbeat, timeout,
cancellation, retry/dead-letter, startup recovery, kill switch, maintenance, event
replay/pruning, SSE reset/heartbeat/authentication, atomic Founder/Daily persistence,
restart replay, workspace isolation, real Telegram `/daily_brief` composition, durable
pre-transport delivery intent/reconciliation, and central Visual Gate enforcement with
a persisted approval fingerprint. This is implementation evidence, not proof that a
persistent H24 process or social OAuth session is currently active.
