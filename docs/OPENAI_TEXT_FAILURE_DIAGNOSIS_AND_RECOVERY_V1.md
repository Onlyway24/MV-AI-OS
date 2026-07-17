# OPENAI TEXT FAILURE DIAGNOSIS AND RECOVERY V1

## Scope

This is a separate, one-use diagnostic milestone. It does not reopen or alter
the closed `live-ai-closure-*` session. It has no image operation, social
transport, OAuth flow, publication, deployment, server spend, or retry path.

The historical image stage is disabled. Its prior `gpt-image-1-mini` selection
is retained as provenance only; a future image run needs a separately approved
current-model catalog, pricing record, budget preflight, and authorization.

## Exact limits

| Control | Value |
| --- | --- |
| Session duration | 10 minutes |
| Text provider calls | at most 2 |
| Automatic retries | 0 |
| Images | 0 |
| Session hard cap | USD 0.02 |
| Reservation per call | USD 0.01 |
| Daily context | prior closed-pilot calls + this session must stay within 8 |
| Text model | `gpt-4o-mini` (explicit, no fallback) |

The isolated SQLite ledger records only opaque operation IDs, model ID, safe
reason code, timestamps, status and cost classification. It never stores a
secret, prompt, response body, image, token, account ID or cookie.

## Controlled sequence

1. Offline fake-transport tests verify provider request shape, redaction,
   authentication classification, response/Structured Output validation,
   usage reconciliation and session caps.
2. A fresh availability attestation is required immediately before the live
   session.
3. The first and only plain request asks for exactly `ONLYWAY_PROVIDER_OK`.
4. Only after that exact local validation passes, the second request asks for a
   strict JSON object with `status: "OK"` and a string `title`.
5. The ledger is closed in `finally`, whether the first request fails, the
   second request fails, or both pass.

## Safe diagnosis taxonomy

| Reason code | Stage |
| --- | --- |
| `PROVIDER_AUTHENTICATION` | provider response (HTTP 401) |
| `PROVIDER_PROJECT_OR_PERMISSION` | provider response (HTTP 403) |
| `PROVIDER_INVALID_REQUEST` | provider response (plain HTTP 400/422) |
| `PROVIDER_HTTP_TRANSPORT` | provider HTTP/transport |
| `PROVIDER_RESPONSE_EXTRACTION` | response extraction or response contract |
| `STRUCTURED_OUTPUT_VALIDATION` | JSON schema/strict structured output |
| `LOCAL_VALIDATION` | exact plain-text assertion |
| `USAGE_RECONCILIATION` | usage accounting or ledger settlement |
| `BUDGET_PREFLIGHT_BLOCKED` | local budget/session guard |

Raw provider messages, raw HTTP bodies and thrown transport diagnostics are
never written to the status artifact or the Command Center. For future HTTP
failures the adapter may retain only identifier-shaped `code`, `type` and
`param` fields together with the HTTP status; those fields contain no provider
message and are still subject to local validation.

## Historical reconciliation

The closed Closure Run made one text provider attempt. Its generic
`text_generation_failed` result is not evidence of a specific provider cause:
the prior gateway flattened the already-safe adapter failure before the stage
could be retained. Its USD 0.005 is therefore classified as
`RESERVED_PENDING_RECONCILIATION`, not effective billed cost. The separate
diagnosis reports a precise code for the new session and leaves the historical
session immutable.

## Command Center and social boundary

`diagnosis-status.json` is attached to the existing Brand-Locked Media Factory
card only after the diagnostic CLI completes. It presents the safe reason code,
stage, call count, ledger classification and session status. It cannot approve
for Fabio and does not expose a social action.

TikTok and Instagram remain untouched until a later sequence has independently
completed: text provider ready, separately authorized master image, native
local variants, Visual Gate, then Fabio review. No app ID, client secret,
token, account ID, sandbox publication or public publication is invented.
