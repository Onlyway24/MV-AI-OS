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

`npm run telegram -- <untracked-local-config.json>` validates configuration before
network access, resolves the token only in memory, removes the webhook while dropping
pending historical updates, establishes a fresh polling position, and requests only
`message` and `callback_query`. Every process stops cleanly on SIGINT/SIGTERM.

The bot accepts `/start`, `/help`, `/status`, `/mission`, `/workflows`, `/report`,
`/settings`, `/cancel_action`, and `/stop`. It replies only in the configured private
chat. Unknown, group, channel, forwarded, edited, business, media, contact, location,
and unauthorized updates are discarded before the Local Runtime is reached.

Phase 1 creates no transcript and stores no raw Update, message text, names,
usernames, language, profile, contact, location, media, response body, or token.
Update receipts, callback hashes, sessions, confirmations, and delivery metadata have
bounded retention. Delivery is best effort: a crash after the durable MV-AI-OS command
but before Telegram acknowledgement can leave delivery uncertain; the underlying
command remains replay-safe and is never repeated solely to retry delivery.

## Live acceptance checklist

Verify BotFather settings above, exact user/chat allowlisting, `/start`, a rejected
unknown sender, a rejected forwarded message, restart behavior, and graceful stop.
Do not enable Developer Mode, H24, tools, external models, workflows, n8n, Web Console,
or any Phase 2 capability.
