# Backup and restore

SQLite lives at `/srv/onlyway/data/mv-ai-os.sqlite` and Admin Security state at
`/srv/onlyway/admin-state/admin-security.json`, outside every release and
image. The database, backup directory and backup bundle files must be owned by
UID/GID 2001; directories are `0700` and application-created files are `0600`.
The host-created manifest-signature sidecar is instead root-owned, group 2001
and mode `0640`.

## Create and verify

```sh
sudo /srv/onlyway/current/scripts/production/backup.sh
```

The command checks free space, uses the application’s online SQLite backup
boundary, opens a real restore probe, runs `PRAGMA integrity_check`, validates
and snapshots the bounded Admin Security JSON, fingerprints both artifacts and
writes a `0600` manifest. After validating every binding again, the root host
signs the exact manifest bytes with the Ed25519 release-acceptance key and
publishes `${manifest}.sig` as a root-owned `0640` sidecar. The private key
remains under `/srv/onlyway/secrets/deploy` and is never mounted into the
runtime container, so a compromised runtime cannot forge a recovery-grade
bundle. Retention treats the SQLite file, Admin Security sidecar, manifest and
signature as one bundle. Only a complete bundle whose Ed25519 signature,
manifest self-fingerprint, payload sizes and payload hashes all validate
against the mounted root-owned acceptance public key counts toward the recent
recovery floor. Recent unsigned files cannot displace those protected bundles.
A path digest, file copy, unsigned runtime bundle or self-fingerprint alone is
not recovery evidence.

The H24 worker has neither the backup directory nor Admin Security backup state
mounted and its scheduled `BACKUP_AND_RESTORE_VERIFICATION` job reports
`BACKUP_RESTORE_RECEIPT_REQUIRED` until a real host receipt is ingested. It
cannot create or claim an unsigned production backup. The `backup-verifier`
profile creates the application-side bundle only when the root host workflow
invokes it. A bundle becomes recovery-grade only after
`scripts/production/backup.sh` has validated it, published a valid host
signature, rechecked both payload fingerprints and written the host receipt.

## Automatic H24 backup

Deployment and rollback install `mv-ai-os-backup.service` and
`mv-ai-os-backup.timer` as part of the same rollback-protected systemd
transaction as `mv-ai-os.service`. The timer is enabled across reboot and runs
daily at 04:00 Europe/Rome with a bounded randomized delay:

```sh
systemctl status --no-pager mv-ai-os-backup.timer
systemctl list-timers --all mv-ai-os-backup.timer
journalctl -u mv-ai-os-backup.service --since '2 days ago'
```

The service runs as root and calls the exact current release’s `backup.sh`.
The application stack is never given the acceptance private key. The service
uses `ExecCondition` to skip safely while the H24 unit is inactive; it does not
start the application during maintenance, restore or a stopped-state incident.
Deploy and rollback stop the timer before quiescing live state, restore its
previous unit files/enabled/active state on transaction failure, and reactivate
the target timer before starting the target H24 unit.

Before writing an artifact, both the host command and its application-side verifier
require free space for three database-sized allocations, two Admin
Security-state allocations and a non-reducible 512 MiB reserve. Unsafe capacity
arithmetic, an unreadable filesystem capacity or a value below that reserve
fails closed before any partial bundle is created. Retention runs only after a
new bundle has passed its real restore probe; it never deletes the protected
source, the just-verified application-side bundle or the validated signed
recovery floor to manufacture a successful backup. Cleanup is bounded and
quarantines all present bundle members before unlinking them; identity or
ownership changes fail the pass closed.

Every current manifest states:

```text
BACKUP_AT_REST_ENCRYPTION_REQUIRED
```

This is intentional. Do not describe backups as encrypted until a reviewed,
provider-neutral at-rest boundary is installed and tested. Ordinary backups
must never include `/srv/onlyway/secrets`. In particular, the Founder bootstrap
channel, source-key pepper and every raw token are excluded. Only hashed,
durable authentication state is included.

## Restore

Restore is destructive to the current database and requires an exact explicit
confirmation:

```sh
sudo /srv/onlyway/current/scripts/production/restore.sh \
  --backup /srv/onlyway/backups/mv-ai-os--...sqlite \
  --confirm RESTORE
```

The script accepts only a canonical in-directory, non-symlink recovery-grade
bundle whose manifest has a valid Ed25519 signature under the host acceptance
public key, with matching manifest fingerprints, private ownership/modes,
bounded Admin Security state and a valid SQLite restore probe. Signature
verification happens before manifest fields are trusted. Because the backup
directory is service-writable, the complete signature/hash/size/schema check is
repeated after the stack is stopped and all containers are confirmed quiescent,
before any backup byte is staged or merged. It refuses leftover SQLite
sidecars, preserves an integrity-checked rollback bundle and installs both
selected artifacts as one rollback-protected transaction. Every failure after
the stop attempt—including `systemctl start` or startup verification
failure—attempts to restore both previous files before restarting.

Authentication recovery is deliberately monotone and fail-closed:

- current principals, passkeys and persistent rate-limit lockouts remain
  authoritative, so an older backup cannot resurrect a removed credential or
  roll back a disabled principal;
- restored and current sessions are all revoked, challenges are marked used,
  step-up receipts are consumed and the Admin Security revision advances beyond
  both inputs;
- the runtime recovery epoch advances beyond both databases, the runtime kill
  switch becomes `ACTIVE`, maintenance becomes `ENABLED`, process leases are
  cleared and the publication kill switch becomes enabled;
- only `/health/startup` is expected to become green. Full readiness must remain
  red until Fabio reviews the recovery and releases controls through the
  authenticated, step-up-protected operator path.

A missing or corrupt current database/Admin Security file does not prevent
restoring a verified bundle. Regular private current files are retained as
forensic rollback artifacts even when their contents are corrupt. If current
Admin Security cannot be validated, the script enters an explicit degraded
break-glass path: it uses the bundle’s principals/passkeys, invalidates every
session/challenge/step-up capability and still starts only with both kill
switches plus maintenance engaged. The receipt is
`RESTORE_COMPLETED_FAIL_CLOSED_DEGRADED_SOURCE`.

Failure receipts are evidence-sensitive. `FAILED_PREVIOUS_BUNDLE_RESTORED` is
written only after both prior files match their captured hashes and the prior
unit starts. A restored but unhealthy prior bundle is left stopped and recorded
as `FAILED_PREVIOUS_BUNDLE_RESTORED_UNIT_STOPPED`. If either file cannot be
restored exactly, the unit remains stopped and the receipt is
`FAILED_ROLLBACK_INCOMPLETE`; it never claims that rollback succeeded.

After a restore, verify Command Center state, the recovery receipt, the retained
rollback bundle, session revocation, scheduler and worker stop state, daily
brief and another fresh backup. Keep the rollback bundle until that review is
complete. The host keeps the three newest pre-restore forensic bundles and
prunes only older, canonical private files while the stack is still quiesced.
Export a reviewed bundle to an approved encrypted evidence boundary if it must
outlive that bounded local window. Never release maintenance or either kill
switch automatically.
