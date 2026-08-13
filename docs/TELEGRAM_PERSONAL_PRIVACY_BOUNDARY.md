# Telegram personal privacy boundary

This document is the authoritative, non-negotiable privacy boundary for every future
MV-AI-OS Telegram, H24, Developer Control Plane, Continuous Improvement, and Web
Console milestone. It takes precedence over any Telegram feature request.

## Allowed surface

MV-AI-OS may use only the standard Telegram Bot API for one dedicated BotFather bot.
It may process only bounded plain-text messages and signed callbacks that Fabio
deliberately sends in one exact allowlisted private user/chat pair. Telegram is an
output and explicit-command channel only, never an observation source.

## Permanently forbidden

- Personal-account authentication, MTProto, TDLib, client API login, userbots,
  Telegram Desktop session reuse, login codes, session files, or user credentials.
- Telegram Business connections, groups, supergroups, channels, forum topics, group
  or channel administration, inline mode, Mini Apps, payments, Stars, gifts, stories,
  attachment-menu integration, or account-data import.
- Access to contacts, phone data, Saved Messages, personal conversations, message
  history, chat enumeration, group/channel lists, social graphs, profiles, names,
  usernames, presence, reactions, locations, calls, or relationship inference.
- Scanning or using Telegram activity as an H24, developer, or improvement signal.
- Media download, `getFile`, file IDs, attachments, forwarded/copy-origin content,
  contact/location selectors, or any unreviewed future update/content type.
- Raw Update persistence, transcripts, raw text logging, raw callback persistence,
  names/usernames/language/profile/phone/location/contact/media persistence, raw API
  responses, raw transport errors, bot tokens, or token-bearing URLs.
- Outbound delivery to any non-allowlisted chat; delivery is permitted only to the
  exact configured private chat.

## Fail-closed authorization and retention

Before domain processing, the transport must reject every update except `message` or
`callback_query` from the exact configured numeric Fabio user ID and private chat ID.
It rejects groups, channels, bots, edited, business, forwarded, copied, missing, and
unknown updates without logging unauthorized identity values. This is default-deny.

Raw input exists only briefly in process memory for validation and normalization.
Durable state contains only bounded replay/security metadata: update identity, hashed
callback identity, allowlisted identity binding, normalized action, fingerprint,
associated MV-AI-OS command, processing/delivery state, and bounded timestamps.
Mission data becomes durable only after Fabio has reviewed and explicitly confirmed
the structured Mission Brief. Unconfirmed drafts, callback tokens, sessions, delivery
metadata, and deduplication receipts require bounded retention and safe expiry.

No Telegram content may become Continuous Improvement evidence unless Fabio explicitly
selects and confirms exact sanitized feedback.

## Operator configuration

The dedicated bot must have group joining disabled, Group Privacy Mode enabled, inline
mode and inline location disabled, no Business connection, no payments, no attachment
menu, and no group/channel administrator role. The live acceptance procedure must
verify these settings before the bot starts.
