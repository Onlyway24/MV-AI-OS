# One-time legacy VPS migration

This runbook is only for the observed pre-Compose VPS. It is not a generic
container adoption mechanism. The normal production installer and release
rollback remain fail-closed for unlabelled containers.

The accepted source boundary is:

- exactly four operator-supplied `NAME=FULL_CONTAINER_ID` identities and no
  other Docker containers;
- one immutable, operator-supplied Docker image ID; the mutable
  `onlyway/mv-ai-os:1982d7f` reference is never trusted;
- runtime UID `2001`, restart policy `unless-stopped`, no Compose labels and one
  published endpoint, `127.0.0.1:41479`;
- `/srv/onlyway/data/onlyway.sqlite`, owner UID `2001`, mode `0600`, SQLite
  integrity `ok` and schema version `32`;
- `/srv/onlyway/config/runtime-private.json`, mode `0640`, with actor `fabio`,
  workspace `onlyway-private`, deterministic mode and
  `/data/onlyway.sqlite`; `providerMode` and `modelProvider` must be absent;
- no legacy Admin Security state and no Admin Security pepper. The receipt says
  `ABSENT`; it never invents passkey or credential continuity;
- the owner-only legacy Command Center bootstrap is used in memory for an
  authenticated loopback probe. Its URL/token is never printed, copied,
  fingerprinted into a receipt or imported;
- `/srv/onlyway/secrets/openai-api-key` is a dormant, unmounted legacy file. The
  scripts verify that it is outside every legacy and new container mount, but
  never read, copy, hash or import it.

All scripts require root, an exact literal confirmation and explicit absolute
paths. Every container mutation uses the four full IDs from a signed receipt;
there are no name globs, ancestor/tag filters or best-effort adoption.

## Trust and receipts

Supply the existing release-acceptance Ed25519 key pair:

```text
/srv/onlyway/secrets/deploy/release-acceptance-ed25519.pem
/srv/onlyway/secrets/deploy/release-acceptance-ed25519.pub.pem
```

The scripts do not generate a migration key. JSON receipts are published
owner-controlled, mode `0640`, with a detached `.sig` envelope bound to the
existing public-key fingerprint. Verification checks file identity before and
after Ed25519 verification.

Keep receipts, signatures and the copy root under a root-controlled migration
directory. Do not put them below a release checkout or a service-writable
backup directory.

## 1. Strict preflight

Run `legacy-migration-preflight.sh` before package installation, Docker daemon
restart, ownership changes or creation of the new `current` link. Pass the four
names and full IDs exactly as observed. Also pass the numeric legacy file GIDs
from a read-only `stat`; names are deliberately not resolved implicitly.

The preflight requires the future `current` link and all three new systemd unit
files to be absent. It snapshots the live SQLite database through the SQLite
backup API for an integrity observation, validates the deterministic config,
probes the authenticated legacy root URL without logging it and emits a
  short-lived signed receipt. It does not stop a container or copy a secret.
  `--legacy-root` also binds the device/inode and numeric owner/group/mode of
  the root, data, config and relevant source directories so rollback can undo
  later installer metadata changes without a recursive chown.

The literal confirmation is:

```text
PREPARE_LEGACY_MIGRATION_V1
```

Use `--valid-for-seconds` no greater than `3600`. A quiesce attempt after
`validUntil` is refused.

Before that receipt expires, pass the receipt, detached signature, verification
key and the same four `NAME=FULL_ID` values to `install-host.sh`, first with
`--dry-run` and then without it. Both invocations require:

```text
--confirm ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1
```

Dry-run performs the complete signature, validity, source-metadata and current
Docker inventory decision; it only skips the subsequent persistent host
changes. Never regenerate or substitute the four IDs between preflight and
installation.

## 2. Quiesce and copy

`legacy-migration-quiesce.sh` verifies the signed preflight, re-inspects the
exact IDs and recomputes the configuration fingerprint. It then:

1. changes only those four restart policies to `no`;
2. stops only those four IDs;
3. proves `127.0.0.1:41479` is closed;
4. creates a new root-owned copy root;
5. uses SQLite `.backup` for the database and a no-follow copy for the runtime
   config;
6. takes a second byte-exact forensic database copy after proving no SQLite
   WAL/SHM/journal sidecar remains; this copy is for failed-rollback recovery,
   never for the new runtime;
7. validates schema/integrity and proves both original files retained the same
   identity and fingerprint throughout the copy;
8. publishes `QUIESCED_COPY_VERIFIED`.

The literal confirmation is:

```text
QUIESCE_AND_COPY_LEGACY_V1
```

Use `--phase INITIAL` with `--rollback-receipt NONE` and
`--rollback-signature NONE`.

Any failure after the first restart-policy mutation attempts to restore
`unless-stopped`, start all four exact IDs, wait for a newly generated
owner-only legacy bootstrap and perform the authenticated loopback probe.
Incomplete restoration is reported as an error and never represented by a
success receipt.

The original database, config, containers and dormant secret are not removed
or changed. Deployment must copy from the migration copy; it must never move or
chown the retained source.

## 3. New release cutover

The normal release pipeline remains authoritative for candidate acceptance,
image identity, private readiness, systemd installation and the recovery-grade
backup timer. For this one initial cutover it must consume the signed quiesce
receipt before it treats the database as live state.

The candidate stack has restart policy `no` and a durable, secret-free recovery
guard. A reboot cannot restart that temporary stack beside either the retained
legacy runtime or the promoted service. If the deployment process is killed,
rerun the same signed cutover command: before it revalidates ordinary Docker
inventory, it deterministically removes only the guard-bound candidate
project, internal network, candidate root and strictly validated clean staging
checkout. The signed legacy quiesce/rollback boundary remains authoritative;
unknown or tampered candidate resources stop recovery fail-closed.

During the legacy cutover the retained containers also have restart policy
`no`, so they do not recover availability by themselves after host loss.
Automatic boot-time choice between legacy and new runtime is intentionally not
attempted: the release transaction may be only partly published and guessing
could create split-brain. Rerunning the exact signed deploy is required. This
is a declared P1 availability residual until one durable boot recovery state
machine covers candidate cleanup, release-transaction restore and signed
legacy rollback as one tested operation.

Import the copied SQLite database into the new UID/GID `2001` data path. Do not
reuse the legacy runtime config verbatim as the production config: render the
new production contract while preserving the approved actor/workspace
semantics and continuing in `OFFLINE_REHEARSAL`.

Because the source predates Admin Security, create a new random owner-only
pepper and allow the first new Command Center start to create:

- new Admin Security state;
- a fresh Founder bootstrap with `authentication: PASSKEY`;
- the owner-only bootstrap channel.

Never claim legacy credential continuity. Never mount the dormant
`/srv/onlyway/secrets/openai-api-key`.

## 4. Success and retention marker

After the accepted release is live and private readiness has passed, call
`mark-legacy-migration-success.sh`. It verifies:

- the signed quiesce receipt and retained source/copy fingerprints;
- the signed release-acceptance marker and matching deploy receipt;
- the exact `current` commit and immutable image ID;
- the four legacy IDs are still stopped with restart policy `no`;
- the new stack is running only on the supplied loopback listener and does not
  mount the dormant legacy secret;
- the new database passes SQLite integrity/schema checks;
- the new Admin Security state, pepper and fresh Founder bootstrap are
  owner-only and structurally valid.

The literal confirmation is:

```text
RETAIN_LEGACY_ROLLBACK_V1
```

The signed marker records `retainUntil`, between one hour and thirty days from
creation. Until that time, retain the four stopped containers, their original
state, the copy root and every signed receipt. This script performs no legacy
deletion.

## 5. Rollback

There are two explicit modes.

`QUIESCED` is an immediate abort before a successful cutover. It accepts no
success marker, new-state backup or systemd unit and requires:

```text
ROLLBACK_QUIESCED_LEGACY_V1
```

`CUTOVER` is a point-in-time rollback during the signed retention window. It
requires the success marker, a fresh recovery-grade new-state backup and its
host Ed25519 signature, plus the exact new service and backup timer units. Its
confirmation is:

```text
ROLLBACK_LEGACY_WITHIN_RETENTION_V1
```

The cutover rollback verifies the backup before and after stopping the new
stack, disables the new service and backup timer, proves both new and legacy
listeners are closed, restores the signed numeric metadata for the retained
legacy root/data/config boundary, then restores `unless-stopped` and starts the
four exact legacy IDs. Success requires the authenticated legacy bootstrap
probe and exact `127.0.0.1:41479` listener.

If rollback fails after mutation starts, the script stops the partial legacy
runtime, returns its policies to `no`, restores the byte-exact pre-attempt
legacy database from the forensic copy, restores the installer-era directory
metadata and restores the prior enabled/active state of the new service and
timer. A successful rollback leaves the new stack disabled so reboot cannot
create split-brain.

Post-cutover writes are **not** applied backward to schema-32 legacy state.
They remain in the signed new-state backup and the rollback receipt says so
explicitly. Retain that bundle for forensic recovery.

For the mandatory forward-deploy leg after a successful `CUTOVER` rollback,
run the quiesce command again with a new copy root and receipt:

```text
--phase FORWARD_AFTER_ROLLBACK
--confirm REQUIESCE_FOR_FORWARD_DEPLOY_V1
--rollback-receipt <signed rollback receipt>
--rollback-signature <its detached signature>
```

This path accepts an expired initial preflight only because the signed rollback
receipt proves the same exact IDs, `unless-stopped`, authenticated health and
legacy listener. Every live topology, config, directory and file invariant is
still revalidated. The forward deployment must import this second database
copy, not the stale first-cutover copy, and must publish a second success
marker. The Admin Security state and pepper created by the first cutover are
retained while legacy serves traffic: the re-quiesce requires their exact
owner-only metadata from the signed first success marker, validates the state
contract and proves neither path is mounted by a legacy container.

## Integration boundary

The shared production files need only orchestrate the standalone contract:

- `install-host.sh`: run the strict read-only inventory decision before
  `apt-get`, Docker enable/restart or any `/srv/onlyway` ownership mutation;
  accept legacy state only through a verified, unexpired preflight receipt;
- `deploy-release.sh`: when `current` is absent, require a signed quiesce
  receipt, import its copied database without moving it, and invoke the
  success-marker command only after live private readiness;
- `release-transaction.sh`: if deployment fails after quiesce, invoke the
  `QUIESCED` rollback path before reporting previous state restored;
- `compose.production.yml`: continue mounting only the new runtime/admin secret
  directories. No mount may cover the dormant legacy secret path;
- `rollback-release.sh`: normal signed-release rollback remains unchanged.
  Direct first-cutover rollback routes to `rollback-legacy-migration.sh`.

Do not delete the legacy boundary automatically when `retainUntil` passes.
Decommissioning requires a separate operator-reviewed destructive procedure
after the rollback drill and final evidence acceptance.
