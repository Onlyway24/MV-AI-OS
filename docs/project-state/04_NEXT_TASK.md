# Next Task

## Milestone name

Telegram Live Acceptance, Operational Hardening and Release Readiness

## Goal

Complete the remaining private-phone acceptance for the hardened Phase 1B Mission
Planning Console. The reliability implementation, offline checks and local bounded
startup/stop smoke test are complete; only direct observation of `/mission` followed
by `/mission quick` while the operator remains running is still required.

## Required scope

- Keep Phase 1C Workflow controls unstarted.
- Never expose tokens, configured identities, raw updates, or database records.

## Forbidden scope

- No Workflow creation or execution.
- No Agent Runtime, model, provider, tool, browser, network, n8n, or external action.
- No Telegram personal-account observation or Developer Control Plane.

## Exact remaining acceptance

With the already configured dedicated private bot, Fabio should start the documented
local operator, send `/mission`, send `/mission quick`, verify the bounded Italian
template list, then send a repeated `/mission quick` or `/status` while the same
process remains active. Stop it gracefully afterward. Do not expose configuration,
tokens, identities, raw updates or Mission content, and do not begin Phase 1C.

## Entry condition

Checkpoint C is committed, pushed, clean, synchronized, and fully verified at
`3feb0dbe0f4eb70838be54a250779a22207b3c8a`; Checkpoint D is authorized.
