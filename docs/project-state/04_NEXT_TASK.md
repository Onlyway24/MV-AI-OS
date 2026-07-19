# Next Task

## Milestone name

Supervised Operations Acceptance — Fabio checkpoints only

## Verified repository state

- The bounded local H24 scheduler/worker, eleven-job catalog, leases/fencing,
  kill switch, maintenance, heartbeat, timeout, cancellation, retry/dead-letter,
  recovery, usage summaries and redaction-safe event plane are implemented.
- Founder Workday #001 and Daily Operating Brief persist aggregate plus event in one
  transaction and replay exactly after restart. Missing coverage blocks or renders
  `UNAVAILABLE`; it is not converted into success. Changed morning/EOD evidence is
  retained as a new immutable version on the `Europe/Rome` business date.
- Command Center snapshot, SSE replay and allowlisted propose/confirm controls are
  implemented on loopback. Bounded windows expose incomplete coverage instead of
  global totals.
- Telegram `/daily_brief` uses the real durable brief service. The Bot API privacy
  boundary and one-private-chat allowlist remain authoritative. Schema v30 records the
  validated outbound intent before transport. An ambiguous send advances its offset,
  remains `DELIVERY_UNCERTAIN`, reports `DELIVERY_RECONCILIATION_REQUIRED` and is never
  redelivered automatically; a local validation failure is separately isolated as
  `REJECTED`.
- Agent Company acceptance is 16 `COMPLETED` plus Backup Guardian `BLOCKED` with
  `BACKUP_RESTORE_RECEIPT_REQUIRED`; this is the expected truthful blocker until an
  explicit verified backup/restore receipt exists.
- Command Center and Telegram share the exact fail-closed Visual Gate. The current
  central command boundary also enforces it and persists the exact successful binding
  fingerprint. Legacy reviews without that receipt remain readable but cannot be
  scheduled, used for publication dry-run or authorized. The official logo exists
  with SHA-256
  `9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121`;
  the legacy `BLOCKED_ORIGINAL_LOGO_MISSING` field is stale. The actual blocker is the
  missing exact `approvalBinding` and matching `READY_FOR_HUMAN_DECISION` manifest.
  A passing receipt permits only a separate internal scheduling decision.
- Instagram/TikTok contracts, fake transport, PKCE/state handling, local checkpoint
  runtime and verification scripts are complete offline. Connect starts by a
  CSRF-bound form `POST` from the local operator root, never by direct start `GET`;
  credential deletion precedes best-effort revoke on disconnect or account mismatch.
- `PUBLICATION: LOCKED`. No persistent H24 process, OAuth connection, social post,
  cloud deployment or external effect is claimed by implementation tests.

## Next authorized checkpoints

1. Fabio may perform the already documented private-phone Telegram continuity check:
   `/mission`, `/mission quick`, then `/status` or a repeated `/mission quick` while
   the same local operator remains alive.
2. Fabio may decide whether to keep H24 foreground-only or explicitly render, inspect
   and install the user-level launch agents. Installation is not required to accept
   the implementation and must not be inferred from repository state.
3. Only after the media package is ready for review, Fabio may complete the single
   browser checkpoint in `docs/OFFICIAL_SOCIAL_CONNECTORS_V1.md` for the exact
   Instagram/TikTok developer apps, redirects, minimum scopes and expected professional
   accounts. Fabio opens only `http://127.0.0.1:43123/` and uses its local form
   controls; he does not construct an OAuth start URL. Verification does not authorize
   publication.

## Forbidden scope

- No post, draft, upload, schedule, message, email, CRM mutation, purchase, deploy,
  merge, public listener or cloud process.
- No password, token, app secret or resolved `SecretReference` in source, chat or logs.
- No blind retry after an uncertain provider or external receipt. In particular, a
  Telegram `DELIVERY_UNCERTAIN` receipt requires manual reconciliation, never automatic
  redelivery.
- No claim that H24 is active without current lease/control evidence, that social is
  connected without completed browser verification, or that placeholder zeroes are
  measured values.

The single operational authority for these checkpoints is
`docs/SUPERVISED_H24_RUNTIME_V1.md`.
