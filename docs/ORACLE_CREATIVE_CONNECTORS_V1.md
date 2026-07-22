# ORACLE Creative Connectors V1

## Scope

In MV-AI-OS, **ORACLE** is the call sign of the internal `research-agent`. It is not an Oracle Cloud integration and it never receives cloud credentials, provider secrets, publication tokens, or unrestricted browser access.

This milestone adds one governed path from a prompt in the private Command Center to an internal Metodo Veloce content package:

```text
Fabio prompt
  → NEXUS / onlyway-assistant
  → ORACLE / research-agent
  → VECTOR / business-agent
  → PRISM / content-director
  → FORGE / content-producer
  → Quality + Risk + Cost status
  → Centro Approvazioni
  → Fabio review
```

The path creates no publication plan, schedule, OAuth request, post, deployment, or other external action.

## Governed Motion UI

The Command Center uses the vanilla `motion` package through a local browser-only adapter. React and `motion/react` are not installed. Both the adapter and Motion runtime are served from same-origin external script routes; there is no CDN, inline script, CSP relaxation, or dependency from the ORACLE domain to the animation library.

The adapter owns only bounded visual functions: panel enter/exit, workflow progress, review open, status transition, metric change, validation failure, success receipt, and global stop. It limits concurrent controls, disposes observers and controls on shutdown/background/reduced-motion changes, and dynamically follows `prefers-reduced-motion`.

Operational animation is downstream of the redacted, monotonic SSE contract. Duplicate/stale cursors are rejected before animation. The only workflow states represented are `IDLE`, `QUEUED`, `RUNNING`, `COMPLETED`, `BLOCKED`, and `AWAITING_FABIO`; `QUEUED` never pulses as running, blockers are never hidden, and a kill-switch event stops all motion. Animation never writes business state.

The TikTok transition surface is a deterministic UI preview with marker `PREVIEW_ONLY_NOT_RENDERED_VIDEO`. It may preview pan, zoom, fade, and text stagger over the persisted five-beat blueprint. It creates no MP4, makes zero provider calls, and keeps publication `LOCKED`. The provider-neutral video generation port remains separately disabled.

## Required context

The prompt does not create facts, evidence, an offer, economics, or a target customer. Before confirmation, the connector requires:

1. an explicitly selected Business Mission owned by the current actor and workspace;
2. Business Mission status `APPROVED`;
3. passed Quality, Risk, and Cost gates on that dossier;
4. exactly three immutable Evidence Packs bound to the three opportunity scorecards;
5. all three packs still fresh and with unchanged SHA-256 fingerprints;
6. one selected opportunity and its evidence pack;
7. the complete deterministic local bundle: carousel, Instagram copy, and TikTok blueprint.

If any condition is missing, the preflight returns a precise blocker and `canConfirm: false`. It does not fall back to unverified data.

## Supported output matrix

| Requested output | V1 state | What V1 creates |
| --- | --- | --- |
| Carousel | `READY_LOCAL` | Six-slide structured carousel inside the durable package; always included in V1 |
| Instagram copy | `READY_LOCAL` | Caption, opening line, hashtags, and variants; always included in V1 |
| TikTok video blueprint | `READY_LOCAL` | Hook, five timed content beats, spoken/on-screen copy, and caption; always included in V1 |
| Image master | `SEPARATE_AUTHORIZATION_REQUIRED` | No raster asset; the existing provider-neutral image boundary remains separately gated |
| Rendered video | `DISABLED_PROVIDER_NOT_CONFIGURED` | No binary video; a provider-neutral asynchronous video contract is available for a future authorized adapter |

The three local outputs are one atomic FORGE bundle, because the existing deterministic production record persists them together. The UI therefore keeps those three controls selected and read-only. The TikTok blueprint is a production plan, not a rendered video. Image master and video render are optional requests, off by default, and their statuses must never be presented as generated assets.

## Two-step operator flow

The private Command Center exposes two same-origin routes:

- `POST /api/prompt-missions/propose`
- `POST /api/prompt-missions/confirm`

Both require the existing loopback session cookie, exact local `Origin`, and `X-Onlyway-Csrf` token. Browser input cannot provide `actorId`, `workspaceId`, model IDs, provider IDs, secrets, or publication authority. The mission selector uses a dedicated owner-scoped query for approved dossiers, so another actor's missions are never exposed and an approved dossier cannot be hidden behind the general 25-record control window.

The proposal:

- validates the prompt contract;
- computes a normalized prompt SHA-256 without returning the prompt;
- recalculates and binds the approved dossier and all three canonical Evidence Pack fingerprints;
- shows the five-agent route and each requested capability;
- reports exactly zero provider calls and USD 0 estimated cost;
- creates a single-use confirmation token with a five-minute TTL;
- keeps publication `LOCKED`.

The confirmation resubmits the prompt, verifies its SHA-256, the proposal fingerprint, token, TTL, dossier, evidence fingerprints, and freshness, then delegates content creation to the existing durable `LocalWorkflowCommandBoundary`. The proposal fingerprint is also persisted as `generationContextFingerprint` on the production record and participates in the workflow command fingerprint.

## Idempotency and redaction

`promptId` deterministically binds both the content `productionId` and workflow `commandId`. Replaying an identical confirmed prompt returns the existing command receipt and does not create a second production. Reusing the same identifier with a changed prompt, objective, capability set, Business Mission, or Evidence Pack context fails as a command conflict. If a process stops after the production insert but before the command receipt, an identical retry reconciles the context-bound production instead of creating a duplicate; a different context remains blocked.

Pack-specific evidence limitations are carried into the brief and durable package. The Risk result is never derived from an unqualified claim whose registered limitations were silently discarded.

The ephemeral proposal store contains the non-secret request controls and fingerprints, never the prompt. Proposal and confirmation receipts do not echo the prompt. Durable operational events contain only safe event semantics and entity identifiers. The resulting internal content package necessarily contains the derived creative topic because that is the artifact Fabio must review.

Inputs containing key-like values, password/client-secret language, raw provider payload requests, stack traces, or explicit policy-override instructions fail validation before dispatch.

## Provider and secret boundary

The locally verified OpenAI secret reference is unchanged. This milestone does not read it and does not make a live OpenAI call. Future image or video execution must be composed outside the ORACLE domain through the existing secret resolver and provider-neutral ports, with explicit model, pricing, budget, idempotency, reconciliation, and separate Fabio authorization.

The video port is asynchronous (`submit`/`inspect`) because provider operations may outlive an HTTP request. Its request, submission, and operation validators bind client request ID, idempotency key, explicit model, prompt fingerprint, budget, provider operation, status, and final byte hash. A completed operation requires a verified MP4 payload; incomplete/failed states cannot carry a video. Its default implementation is disabled and fails closed, with no automatic fallback or retry.

## Operator usage

1. Open the local private Command Center.
2. Approve a complete Business Mission if none is available.
3. Enter a 12–240 character creative direction in the top composer.
4. Select the approved Business Mission and objective; optionally request the separately gated image master or disabled video render capability.
5. Choose **Prepara con ORACLE**.
6. Inspect mission, all three pack fingerprints, route, capability blockers, provider calls, cost, and publication lock.
7. Choose **Crea bozza interna** only if `canConfirm` is true.
8. Review the new package in Production and Centro Approvazioni.

This flow does not approve the package for Fabio and cannot publish it.

## Verification

The offline suite covers contract rejection, missing and stale context, three-pack binding, prompt-fingerprint mismatch, one-time confirmation, durable replay, carousel/Instagram/TikTok output, absent publication records, redacted receipts/events, disabled video transport, and the Command Center session/Origin/CSRF boundary.

Run:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Expected external effects during this verification: **zero**.
