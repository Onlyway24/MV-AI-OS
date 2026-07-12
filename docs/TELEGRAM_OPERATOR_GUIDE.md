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
updates, and requests only `message` and `callback_query`. Every process stops cleanly
on SIGINT/SIGTERM. If startup fails, run preflight again; do not remove a lock file
unless you have first confirmed no operator process is running.

Phase 1 accepts `/start`, `/help`, `/status`, `/mission`, `/cancel_action`, `/stop`,
and `/developer`; `/workflows` and `/report` remain hidden. `/mission` collects only
the structured FounderMissionBrief data, shows an Italian review, requires “Conferma
dati Missione”, then requires the separately bound “Genera piano Missione” action
before running the local deterministic Mission validation, planner, and Quality Gate.
It never creates a Workflow or runs an Agent Runtime, model, provider, tool, network,
or external action. `/stop` requires a second explicit `/stop` confirmation and never
changes a Core V1 Workflow. The Developer response is inactive by design. It replies
only in the configured private chat. Unknown, group, channel, forwarded, edited,
business, media, contact, location, and unauthorized updates are discarded before the
Local Runtime is reached.

Live acceptance has not been performed from this repository environment because no
Telegram secret reference is currently available to the local resolver. After a
successful preflight with Fabio's existing untracked secret/configuration, the only
human step is to run the start command above from the authorized private chat and
follow the `/mission` flow; no token should be copied into chat or source code.

Phase 1 creates no transcript and stores no raw Update, message text, names,
usernames, language, profile, contact, location, media, response body, or token.
Update receipts, callback hashes, sessions, confirmations, and delivery metadata have
bounded retention. Delivery is best effort: a crash after the durable MV-AI-OS command
but before Telegram acknowledgement can leave delivery uncertain; the underlying
command remains replay-safe and is never repeated solely to retry delivery.

## Live acceptance checklist

Verify BotFather settings above, exact user/chat allowlisting, `/start`, a rejected
unknown sender, a rejected forwarded message, restart behavior, and graceful stop.
Do not enable Developer Mode, H24, tools, external models, Workflow controls, n8n,
Web Console, or any Phase 2 capability.
