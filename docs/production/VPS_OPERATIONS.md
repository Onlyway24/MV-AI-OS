# VPS operations

Run host mutations through `sudo`. The `onlyway` system user must never receive
SSH login, sudo or Docker-group membership.

After the initial host installer changes SSH/UFW, reconnect in a second
key-authenticated terminal and run
`sudo /path/to/verified/source/scripts/production/confirm-ssh-hardening.sh`.
Release deployment is intentionally blocked until that receipt exists.

## Private access

On the local Mac:

```sh
scripts/production/open-private-tunnel.sh
```

Keep that process open, then browse to `http://localhost:43100`. The
`localhost` origin is the private WebAuthn relying-party ID; do not substitute
an IP literal. Do not forward
to a wildcard local address.
The tunnel is batch-only and refuses unknown host keys; first load the
passphrase-protected key through the local SSH agent/keychain and keep the
verified VPS host key in the selected owner-controlled `known_hosts` file.

## Stack commands

```sh
sudo /srv/onlyway/current/scripts/production/stack.sh status
sudo /srv/onlyway/current/scripts/production/stack.sh start
sudo /srv/onlyway/current/scripts/production/stack.sh stop
sudo /srv/onlyway/current/scripts/production/stack.sh restart
sudo /srv/onlyway/current/scripts/production/stack.sh logs
sudo /srv/onlyway/current/scripts/production/health.sh
sudo /srv/onlyway/current/scripts/production/readiness.sh \
  --expected-commit "$(basename "$(readlink -f /srv/onlyway/current)")"
```

`stack.sh status` is strict: it fails unless systemd is active, the signed
release preflight passes, all five core services are running and full
commit-bound readiness is green. The systemd boot boundary runs the
commit-bound `STARTUP` probe; deploy, rollback and `status` additionally require
full `READINESS` so restore containment can keep maintenance/kill controls
engaged without making boot recovery impossible.

Logs are bounded by Docker `json-file` rotation: 10 MiB per file, five files,
compression enabled. Application logs must remain structured and redacted. Do
not use debug mode or dump environment/configuration. Caddy access logging is
disabled to minimize retention of private paths and request metadata; the
Founder bootstrap token is never transported in a URL. Structured Caddy
runtime/error logs remain enabled.

## Operational gates

```sh
sudo /srv/onlyway/current/scripts/production/security-readiness.sh
sudo /srv/onlyway/current/scripts/production/production-rehearsal.sh
sudo /srv/onlyway/current/scripts/production/payment-readiness.sh
```

The rehearsal uses the internal, no-egress Docker network. A non-zero exit is a
failed gate, not a warning to bypass.

## Start internal production

After private readiness is green, install a completed zero-cost intake and run
the one-shot boundary described in
[PRIVATE_PRODUCTION_START.md](./PRIVATE_PRODUCTION_START.md):

```sh
sudo /srv/onlyway/current/scripts/production/start-private-production.sh
```

This may acquire only the explicitly authorized public HTTPS sources. It does
not activate a paid provider, publication, outreach or public application
access. A `NOT_READY` result is a blocker to correct, not permission to invent
missing evidence.

`security-readiness.sh` requires the collector-produced
`/srv/onlyway/config/security-attestation.json`; editing the inert example
cannot pass the gate. Run the final Deep Security Scan only after code
completion, a green suite, final commit and push, and only against the exact
feature commit. Preserve the signed pre-scan receipt and require the scan
`startedAt` to follow its `completedAt`. Then run the collector with explicit
absolute paths to the pre-scan receipt/signature/trust anchor, real scan,
deployment, backup/restore, signed legacy cutover rollback/forward chain and
reboot receipts. The collector's usage message lists every required input.

Reboot evidence is a two-boot measurement:

```sh
sudo /srv/onlyway/current/scripts/production/reboot-recovery-evidence.sh \
  prepare --commit FINAL_COMMIT
# perform the separately approved VPS reboot, reconnect with the SSH key
sudo /srv/onlyway/current/scripts/production/reboot-recovery-evidence.sh \
  verify --commit FINAL_COMMIT
```

`prepare` records the kernel boot identity only after exact-release readiness.
`verify` refuses the same boot identity and emits a receipt only after systemd
enablement, exact release preflight and private readiness all pass.

After the signed legacy cutover rollback, re-quiesce, forward deployment and
final success marker have returned the final commit to service, close any
existing tunnel on local port `43100`; the verifier opens its own pinned,
temporary SSH tunnel and creates external evidence on the Mac:

```sh
scripts/production/verify-private-tunnel.sh \
  --commit FINAL_COMMIT \
  --key "$HOME/.ssh/onlyway_ovh_ed25519" \
  --known-hosts "$HOME/.ssh/known_hosts" \
  --target ubuntu@145.239.73.248 \
  --ssh-port 22 \
  --receipt /private/tmp/onlyway-private-tunnel.json
```

The command fails if exact-commit loopback readiness is absent, if the approved
SSH port is unreachable, or if any application port (`80`, `443`, `43100`,
`43101`, `8080`) is externally reachable. It asks `ssh-keygen` to sign; the
private key is never copied or printed.
Use the VPS public IP in `--target`, not a DNS alias: the collector binds the
receipt to the server address and port of its active `SSH_CONNECTION` and to
the VPS Ed25519 host public key.

Transfer the receipt and the public `.pub` file, then install them through the
existing key-authenticated session:

```sh
sudo install -o root -g onlyway -m 0600 \
  /tmp/onlyway-private-tunnel.json \
  /srv/onlyway/run/receipts/private-tunnel-final.json
sudo install -o root -g root -m 0644 \
  /tmp/onlyway_ovh_ed25519.pub \
  /srv/onlyway/secrets/deploy/tunnel-evidence-signer.pub
```

Use those two exact paths as `--tunnel-receipt` and
`--tunnel-trust-key` inputs to `collect-production-evidence.sh`. Also pass the
actual Deep Security Scan report/export through `--scan-artifact`; it is
independent from the canonical `--scan-result` receipt.
Install both scan files as `root:onlyway` mode `0640` beneath
`/srv/onlyway/run/`; the collector rejects evidence outside root-controlled
runtime/configuration roots.

The first-migration collector does not require a fictitious rollback to a
previous new-stack release. Its rollback proof is the stronger signed legacy
chain in strict order: initial quiesce, deployment and first success/backup,
exact `CUTOVER` rollback to the four legacy containers and original sources,
`FORWARD_AFTER_ROLLBACK` re-quiesce, forward deployment, and final success
marker. Final backup/rehearsal and reboot evidence must follow that acceptance.
Reusing a path/inode, breaking a detached signature/hash binding, or changing
this chronology fails the gate.

## Daily checks

Check systemd, container health, readiness, free disk, the latest verified
backup manifest and failed host services:

```sh
systemctl --failed
systemctl status --no-pager mv-ai-os.service
systemctl status --no-pager mv-ai-os-backup.timer
systemctl list-timers --all mv-ai-os-backup.timer
journalctl -u mv-ai-os-backup.service --since '2 days ago'
docker compose \
  --project-directory /srv/onlyway/current \
  -f /srv/onlyway/current/compose.production.yml ps
df -h /srv/onlyway
```

`mv-ai-os-backup.timer` is the sole automatic production backup scheduler. Its
root oneshot invokes the current release’s signed host workflow; the H24 worker
does not mount the backup path or signing key. Treat an inactive or disabled
timer, a failed `mv-ai-os-backup.service`, or the absence of a recent complete
SQLite/Admin Security/manifest/signature bundle as an incident.

Any public listener other than the approved SSH listener is an incident. Stop
the stack before investigating unexpected exposure.
