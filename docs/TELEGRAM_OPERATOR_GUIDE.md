# Telegram Operator Console — Phase 1 guide

Telegram is a controlled local transport for the existing MV-AI-OS runtime. It is not
an account integration, a personal-chat reader, a developer terminal, or an autonomous
agent. Read `TELEGRAM_PERSONAL_PRIVACY_BOUNDARY.md` before setup.

## Secure setup

1. Create one dedicated bot with BotFather. Never use Fabio's personal account,
   phone number, login code, Telegram Desktop session, MTProto, TDLib, or a userbot.
2. Disable group joining; enable Group Privacy Mode; disable inline mode and inline
   location; do not enable Business, payments, attachment-menu, group/channel, or
   administrator features.
3. Keep the bot token outside this repository. Reference it through the existing
   `SecretReference` mechanism, using a local environment variable or local secret
   file. Never paste it into Codex, source, Git, logs, or chat.
4. Run secure `IDENTIFY_ONLY` validation locally, then put only Fabio's numeric user
   ID and the numeric ID of the one private bot chat into untracked local config.

## Operation

Prepare an untracked local JSON configuration containing the existing local-runtime
configuration plus the Telegram allowlist and one `SecretReference`; never put token
values or real identities in Git. Run the deterministic, no-network preflight first:

`npm run telegram -- preflight <untracked-local-config.json>`

It resolves the token only in memory, checks a private writable database directory,
validates and opens the SQLite schema, then closes it. Its output contains only a safe
status and the opaque secret-reference name. Start the local console with:

`npm run telegram -- <untracked-local-config.json>`

The process keeps an exclusive local lock next to its SQLite database, preserves a
durable polling offset across restart, removes any webhook without dropping pending
updates, and requests only `message` and `callback_query`. Bootstrap, polling, signal
shutdown, unexpected terminal failure, and cleanup all use one awaited shutdown path:
the runtime, SQLite state and process lock are each closed once. SIGINT/SIGTERM request
a graceful stop; they do not abandon asynchronous cleanup with `process.exit`.

If startup reports `OPERATOR_LOCK_HELD`, treat the lock as owned until you have proved
that no operator process is active. Only then may you remove the stale lock manually;
the operator never steals or deletes an existing lock automatically.

Phase 1 accepts `/start`, `/help`, `/status`, `/mission`, `/workflow`, `/workflows`,
`/report`, `/cancel_action`, `/stop`, and `/developer`. `/mission` opens the
Mission Console home: `Nuova missione`, `Avvio rapido`, safe help and status are
shown, while resume and last-result choices appear only when durable state exists.
`/mission quick` lists the explicit immutable templates and `/mission template <id>`
applies only its exact Mission type and versioned profile references. The list validates
the complete registry before rendering, fails closed on an altered entry, and does not
create a session or draft merely by listing. Templates never provide a deadline,
budget, market fact, threshold, evidence, approval, or external authorization.
`/mission help` is contextual, deterministic and non-persistent.

The guided flow displays the current section and honest step count. `/mission` data
collection remains based only on the structured FounderMissionBrief contract, shows an
Italian review, requires “Conferma dati Missione”, then requires the separately bound
“Genera piano Missione” action before running the local deterministic Mission
validation, planner, and Quality Gate.
It never creates a Workflow or runs an Agent Runtime, model, provider, tool, network,
or external action. `/stop` requires a second explicit `/stop` confirmation and never
changes a Core V1 Workflow. The Developer response is inactive by design. It replies
only in the configured private chat. Unknown, group, channel, forwarded, edited,
business, media, contact, location, and unauthorized updates are discarded before the
Local Runtime is reached.

The first Workflow Operator slice is deliberately separate from Mission planning. Only
an `APPROVAL_READY` plan can be proposed with `/workflow <riferimento-missione>` and a
one-use confirmation button. The result is one durable, preparation-only Workflow with
one `content-direction` step. It cannot invoke the Agent Runtime until Fabio approval,
Quality Guardian, and Operator-Safety/Risk Guardian evidence has been recorded through
the controlled Core V1 boundaries. `/report <riferimento-missione>` returns the durable
status, next checkpoint, bounded risks, and external-action statement; `/workflows`
shows the available flow. These commands do not publish, send email, contact clients,
spend money, change a CRM, deploy, merge, browse, call a model/provider, or activate a
scheduler/worker.

The private-phone acceptance remains incomplete until Fabio observes the corrected
flow. After a successful preflight with the existing untracked local configuration,
start the operator, send `/mission`, then send `/mission quick`; confirm the bounded
Italian template list arrives and that the operator remains running for a subsequent
`/status` or repeated `/mission quick`. No token should be copied into chat or source
code.

Phase 1 creates no transcript and stores no raw Update, message text, names,
usernames, language, profile, contact, location, media, response body, or token.
Update receipts, callback hashes, sessions, confirmations, and delivery metadata have
bounded retention. Delivery is best effort: a crash after the durable MV-AI-OS command
but before Telegram acknowledgement can leave delivery uncertain; the underlying
command remains replay-safe and is never repeated solely to retry delivery.

## Local reports and diagnostics

### Safe operator errors

Normal operator failures contain only one stable reason code. The supported codes are
`CONFIGURATION_UNAVAILABLE`, `SECRET_REFERENCE_UNAVAILABLE`, `DATABASE_UNAVAILABLE`,
`OPERATOR_LOCK_HELD`, `TELEGRAM_IDENTITY_FAILED`, `TELEGRAM_BOOTSTRAP_FAILED`,
`POLLING_TRANSIENT_FAILURE`, `UPDATE_PROCESSING_FAILED`,
`OUTBOUND_DELIVERY_FAILED`, `OPERATOR_SHUTDOWN_FAILED`, and
`INTERNAL_OPERATOR_FAILURE`.

For a bounded local diagnostic, add `--diagnostics` to the start command. It adds only
the lifecycle stage, retryability and a safe remediation. It never prints exception
messages, stack traces, tokens, identities, URLs, update/message/callback content, SQL
or database records.

Long-poll transport failures are retried sequentially with a finite 100 ms, 250 ms,
then 500 ms backoff. A successful poll resets the retry budget. A non-retryable failure
or exhausted budget stops through the same cleanup path and reports its stable code;
there is no parallel poller, tight loop, background scheduler or automatic restart.
An invalid supported update, Mission rendering failure or outbound-delivery failure is
isolated to that update. Its bounded receipt is retained as rejected, no completed
domain command is repeated, and later updates continue when the local state store is
healthy.

After a completed deterministic Mission, export its intentionally safe report with an
explicit absolute output path:

`npm run telegram -- export-mission <untracked-local-config.json> <safe-mission-reference> --format markdown --output <absolute-output-path>`

Use `--format json` for the structured contract and `--overwrite` only when replacing
an existing file deliberately. Files are created with private permissions. Reports
contain Mission planning information, exact profile references, Quality Gate and
non-execution statements; they never contain Telegram metadata, callbacks, tokens,
database paths, transcripts or raw errors.

Run sanitized readiness diagnostics with:

`npm run telegram -- doctor <untracked-local-config.json>`

Use `--json` for machine-readable PASS/WARN/FAIL reason codes. For a deterministic
offline release gate, use:

`npm run telegram -- release-check <untracked-local-config.json> --offline`

Neither command performs Telegram polling, invokes an Agent Runtime, model, provider,
tool, Workflow, or external action. The remaining live acceptance is the exact private
phone `/mission` then `/mission quick` continuity check described above.

## Live acceptance checklist

Verify BotFather settings above, exact user/chat allowlisting, `/start`, a rejected
unknown sender, a rejected forwarded message, restart behavior, and graceful stop.
Do not enable Developer Mode, H24, tools, external models, n8n, Web Console, or any
Phase 2 capability. The one preparation-only Workflow promotion described above is the
sole Phase 1C exception and remains behind its explicit confirmation and checkpoints.
