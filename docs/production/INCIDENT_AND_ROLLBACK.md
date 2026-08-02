# Incident response and rollback

## Immediate containment

For suspected unauthorized effects, secret leakage, budget bypass, public
exposure, database corruption or runaway work:

1. activate the authorized durable kill switch when the control plane is
   reachable;
2. stop the stack if containment cannot be proven;
3. preserve redacted logs, release identity and receipts;
4. do not retry uncertain external operations;
5. do not delete releases, databases or backups during triage.

```sh
sudo /srv/onlyway/current/scripts/production/stack.sh stop
systemctl status --no-pager mv-ai-os.service
docker compose \
  --project-directory /srv/onlyway/current \
  -f /srv/onlyway/current/compose.production.yml ps -a
```

## Release rollback

Use the recorded previous release:

```sh
sudo /srv/onlyway/current/scripts/production/rollback-release.sh \
  --confirm ROLLBACK
```

Or name an immutable installed release:

```sh
sudo /srv/onlyway/current/scripts/production/rollback-release.sh \
  --commit FULL_40_CHARACTER_SHA \
  --confirm ROLLBACK
```

Rollback accepts only a clean checkout whose Git tree, exact image ID, OCI
revision and commit match its fingerprinted Ed25519-signed candidate acceptance
marker. It prevalidates the target Compose file and unit before mutation.

The unit, image environment, `current` symlink, systemd daemon reload,
enable/start, commit-bound readiness and receipt are a transaction. Any failure,
including a `systemctl` failure, restores the original unit, environment,
symlink and active/enabled state. A coherent bundle backup is created while the
current stack is stopped; if target start was attempted, failure recovery
restores that bundle and intentionally returns the original release in
fail-closed containment. A target without a valid acceptance marker is not a
rollback target. The script never deletes either accepted release.

Database restore is separate from code rollback. Use
[BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) only when evidence identifies a
data problem.

## Recovery proof

Do not close an incident until liveness/readiness, scheduler and worker leases,
kill switch, cost state, database integrity, a verified backup, private-only
listeners and the exact running commit are checked. Reboot recovery and rollback
are successful only when tested on the VPS and recorded; documentation or a
green local test is not proof.
