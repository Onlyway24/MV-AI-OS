# Live AI and Brand-Locked Media Factory

## Closure Run boundary

> Historical note: the image stage is now disabled because its recorded image
> model is deprecated. The Closure Run is closed and must not be reused. See
> [OPENAI TEXT FAILURE DIAGNOSIS AND RECOVERY V1](./OPENAI_TEXT_FAILURE_DIAGNOSIS_AND_RECOVERY_V1.md)
> for the text-only recovery milestone.

The Closure Run is deliberately narrower than the daily application ceiling. It permits exactly two named provider operations for actor `Fabio` and the configured Metodo Veloce workspace:

1. `OPENAI_TEXT_PROVIDER_SMOKE` — `gpt-4o-mini`, Responses API, JSON brief with `title`, `editorialAngle`, and `visualSceneSummary`.
2. `OPENAI_METODO_VELOCE_MASTER_IMAGE` — `gpt-image-1-mini`, `low`, one 1024×1536 PNG master.

`LivePilotSessionLedger` is a local SQLite ledger with `BEGIN IMMEDIATE` reservations. A session begins disabled, expires after 15 minutes, has a USD 0.10 cap, accepts one text operation and one image operation, then changes to `RELOCKED`. An operation ID is unique per session, so restart or replay cannot create a second image. A failed text operation closes the session before the image operation is reachable.

The broader guards remain encoded as EUR 5 daily API ceiling, USD 4 prudent hard stop, eight daily provider calls, one daily image, and EUR/USD server spend of zero. This run reserves at most USD 0.011 (USD 0.005 text, USD 0.006 image). No model fallback is available.

Preflight returns only `ready`/`blocked`, a reason when blocked, model, maximum cost, residual budget, and the authorized call counts. The command also requires a fresh operator attestation that the two approved OpenAI models are available immediately before it activates the session. It performs no additional OpenAI model-listing request, preserving the two-call maximum.

## Secret and provider boundary

The ignored file `config/live-ai-closure.local.json` is a validated local application configuration, not a secret store. It contains a single opaque `local-file` reference to the user-provided secret path and selects only `gpt-4o-mini`. `LocalSecretResolver` accepts the file only when it is a regular file owned by the runtime user with mode exactly `0600`, is non-empty UTF-8, and passes the secret-value validator. Public failures redact the path and value.

The text port is the existing provider-neutral `LlmGateway`; the image port is `MediaGenerationProvider`. `OpenAIImageGenerationProvider` is an OpenAI-only adapter behind that port. Offline fake transports cover request shape, provider failure normalization, no raw error body retention, and no secret retention. The renderer and approval manifest persist only safe metadata: identity, model, dimensions, SHA-256, an estimate/receipt record, and ledger totals—never a key, raw API body, base64 image response, cookies, OAuth material, or prompt.

## Brand asset and local rendering

Fabio's immutable source is `assets/brand/metodo-veloce-logo-original.jpg`, supplied as `IMG_5609.jpg`. Its SHA-256 is `9a622429e00fdef35e3dfd7472cf945b3a74834018bfd5a57a7c8a3aab97f121`. The only technical derivative is the faithful lossless pixel crop `assets/brand/derived/metodo-veloce-logo-overlay-technical.png`, SHA-256 `3f4f433853dc467e03eb56b5451928e6cb908f8187b123ccce542e841737f681`. Its crop coordinates and provenance are in the adjacent JSON manifest.

The source logo is never sent to OpenAI. After a master is generated, the local Pillow renderer produces:

- `master-openai.png` — retained, unmodified PNG master;
- `instagram-local-variant.png` — 1080×1350;
- `tiktok-local-variant.png` — 1080×1920.

It uses cover-cropping (no stretching), creates a protected local title area, and applies the original-faithful logo crop only as the final lower-right local overlay. The manifest records title safe areas, hashes, provenance, Quality, Risk, Cost, and Visual gates, plus a deterministic package fingerprint. Status can only become `READY_FOR_FABIO_REVIEW` after technical gates; it never means Fabio approved it.

## TikTok and Instagram: one browser checkpoint, no publishing

`SocialPlatformPublicationTransport` has only an offline fake transport and a typed `BROWSER_CONNECTION_REQUIRED` checkpoint. It cannot receive or invent an app identifier, client secret, token, account identifier, cookie, password, or publication request.

The one consolidated action still required from Fabio is to use the official browser flows to configure or verify the proper Meta and TikTok developer apps, registered redirect URLs, OAuth authorization and version-current posting scopes for the intended professional/creator accounts, completing any platform review. Any future remote-pull publishing implementation also needs an HTTPS media domain verified or allow-listed according to the selected platform flow. This local factory exposes no public media URL and performs no sandbox or public publication.

The canonical platform guidance is linked by the contract itself:

- [Instagram publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started/)

Until Fabio completes that checkpoint in an explicitly authorized future task, both states remain `BROWSER_CONNECTION_REQUIRED` and publication is false.
