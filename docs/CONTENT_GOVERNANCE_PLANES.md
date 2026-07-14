# Content Governance Planes

MV-AI-OS separates evidence, planned publication, and feedback. These planes are
durable local records. They do not browse, call a model, sign into Instagram or TikTok,
publish, or invent a metric.

## Evidence Plane

Register a source before any evidence is accepted. A source is one of:

- `OFFICIAL_SITE`, `OFFICIAL_DOCUMENTATION`, or `AUTHORIZED_DATASET`;
- `EDITORIAL` or `SECONDARY`;
- `FORBIDDEN`.

Each source record has a canonical reference, reliability, public-citation permission,
permitted risk domains, maximum freshness period, and a second-source rule. Forbidden
sources cannot produce evidence. A health, finance, or legal claim requires an
independent corroborating verified evidence record from a different source before it
can be marked `VERIFIED`.

Each immutable evidence record carries the authorized source ID and URL/reference,
acquisition date, source-content date, SHA-256 fingerprint, reliability inherited from
the source, bounded structured excerpt, claim mappings, limitations, expiry, risk
domain, and one of `VERIFIED`, `CONTESTED`, `INSUFFICIENT`, or `STALE`.

The runtime rejects an expired record marked current, an expiry beyond the source policy,
an unregistered URL family, or a verified claim without required corroboration. It does
not fetch a URL: source intake is an explicit controlled import.

`PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE` binds a new content package to the exact
evidence IDs. The IDs, safe source references and claim statements must match immutable,
current `VERIFIED` evidence records whose sources permit public citation. This is the
production route for evidence-backed factual content.

## External Action Plane

`CREATE_PUBLICATION_DRY_RUN` requires an internally scheduled content record and binds:

- exact production and version;
- exact package SHA-256 fingerprint;
- Instagram or TikTok account reference and platform;
- exact scheduled time;
- unique idempotency key.

The resulting record is `DRY_RUN` and has `dryRun: true`. It cannot publish anything.
`AUTHORIZE_PUBLICATION_DRY_RUN` requires the exact record version and checks the global
kill switch. It creates an authorization record only; no connector is called.

An external operator may later record one `SUCCEEDED`, `UNCERTAIN`, or `FAILED` receipt
with a fingerprint. `UNCERTAIN` is deliberately distinct from success. There is no
publication-retry command, so no blind retry is possible. `SET_PUBLICATION_KILL_SWITCH`
is workspace-global; when enabled it blocks all final authorizations.

No platform publishing connector is installed in this version. A future connector must
recheck the kill switch and exact authorization immediately before any API call, use the
stored idempotency key, and record the platform receipt through this plane.

## Feedback Plane

`IMPORT_FEEDBACK_METRICS` accepts a snapshot only after a `SUCCEEDED` publication
receipt and only when it supplies that receipt fingerprint plus an independent snapshot
fingerprint. Snapshot fields are views, watch time, completions, saves, shares,
comments, profile visits, clicks, leads, and conversions.

Conversion count must be zero unless the record explicitly says
`conversionAttribution: VERIFIED`. Snapshots are insert-only. A correction references
the prior snapshot for the same publication, preserving both entries. Feedback analysis
uses the uncorrected latest snapshot and reports correction and snapshot counts; it does
not fabricate performance, causality, or optimization results.

## Current safety boundary

All commands are private local-runtime operations, replay-safe through the existing
command receipt boundary, and return
`unauthorizedExternalEffectOccurred: false`. Telegram does not expose any publication
or feedback command in this version.
