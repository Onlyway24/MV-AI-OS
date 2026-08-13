# Deployment

## 1. Prepare the host

From an existing key-authenticated SSH session:

```sh
sudo scripts/production/install-host.sh \
  --legacy-preflight-receipt /ROOT_CONTROLLED/PREFLIGHT.json \
  --legacy-preflight-signature /ROOT_CONTROLLED/PREFLIGHT.json.sig \
  --legacy-public-key /ROOT_CONTROLLED/acceptance-ed25519.pub.pem \
  --legacy-container NAME_1=FULL_64_CHARACTER_CONTAINER_ID_1 \
  --legacy-container NAME_2=FULL_64_CHARACTER_CONTAINER_ID_2 \
  --legacy-container NAME_3=FULL_64_CHARACTER_CONTAINER_ID_3 \
  --legacy-container NAME_4=FULL_64_CHARACTER_CONTAINER_ID_4 \
  --confirm ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1 \
  --dry-run

# Repeat the exact command without --dry-run only while the receipt is valid.
```

The four `NAME=ID` values must be byte-for-byte identical to the values used by
the strict preflight in
[LEGACY_MIGRATION.md](./LEGACY_MIGRATION.md). Both dry-run and live installation
verify the detached Ed25519 signature, the maximum one-hour validity window,
the exact four-container inventory and its configuration fingerprint before
the first apt, Docker, systemd, firewall, account or `/srv/onlyway` mutation.
Missing, expired or drifted evidence stops the installer.

The installer adds the official Docker apt repository without executing a
remote shell, installs only required tools, creates UID/GID 2001, enables UFW
only after allowing every effective SSH port on IPv4 and IPv6, and applies the
key-only SSH policy. It then stops at a mandatory safety boundary while keeping
an owner-only rollback copy of the prior sshd drop-in.

Before any deployment, open a second key-authenticated SSH session and run,
from the same verified source checkout used for installation:

```sh
sudo scripts/production/confirm-ssh-hardening.sh
```

The confirmation command evaluates `sshd -T -C` for the actual operator and
client address, verifies dual-stack UFW rules, enables and checks fail2ban and
unattended upgrades, then removes the rollback copy. Deployment remains blocked
while this second-session receipt is absent. Do not continue if the check fails.

## 2. Prepare Git access

Install a repository-scoped, read-only GitHub deploy key outside the repository,
normally as `/srv/onlyway/secrets/deploy/github-deploy-key`, mode `0600`. Add the
public half to the authorized repository with read-only access. The host
installer records GitHub’s current published SSH host keys from the official
metadata endpoint in the deployment-only `github-known-hosts` file. Review that
file before first fetch. Never use an account password or global PAT.

## 3. Deploy an exact verified commit

The branch and full commit are mandatory:

```sh
sudo /path/to/deploy-release.sh \
  --repo git@github.com:OWNER/REPOSITORY.git \
  --branch main \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --legacy-quiesce-receipt /srv/onlyway/run/legacy-initial-quiesce.json \
  --legacy-quiesce-signature /srv/onlyway/run/legacy-initial-quiesce.json.sig \
  --legacy-rollback-receipt /srv/onlyway/run/legacy-initial-auto-rollback.json
```

The script refuses a moving/unverified branch tip. It fetches the authorized
branch, requires its remote HEAD to equal the supplied commit and keeps the
checkout under `.staging` while it:

1. runs the image verification target and builds `mv-ai-os:<commit>` with an
   exact `org.opencontainers.image.revision` label;
2. validates Compose, Caddy and the systemd unit;
3. creates a verified online snapshot of the live SQLite/Admin Security bundle;
4. starts an isolated candidate on copied database/configuration directories,
   an internal no-egress network and a loopback-only temporary port;
5. requires commit-bound readiness plus the deterministic offline rehearsal,
   both reporting zero unauthorized external effects;
6. stops the live unit and creates a second coherent pre-promotion backup;
7. writes a fingerprinted Ed25519-signed acceptance marker and only then moves
   the checkout to `/srv/onlyway/releases/<commit>`.

Every candidate service, including Caddy, is created with Docker restart policy
`no`. Before candidate creation the deploy writes a crash-durable,
root-owned `0600` guard under `/srv/onlyway/run/candidate-recovery`. The guard
contains only the commit, exact Compose project, image ID, loopback port and
candidate/source paths; its closed JSON contract explicitly contains no
secret. It is retained until the candidate root has been removed.

If `deploy-release.sh` is interrupted by `SIGKILL`, host loss or reboot, rerun
the exact deployment command. Under the global production mutation lock, the
next invocation consumes every valid guard before normal Docker inventory
validation. It accepts only the recorded `onlyway-candidate-<12-SHA>` project,
matching Compose working directory, exact image/commit, service allowlist,
restart policy `no`, expected internal network and bind mounts confined to the
candidate root or the two declared read-only files. It then removes those
exact container/network IDs, the exact candidate root and, only when it is a
clean checkout of the same full commit, its `.staging.<commit>.*` source.
Tampered guards, unexpected resources, non-empty unguarded roots or project
collisions stop fail-closed for operator review; they are never guessed away.
An empty root left in the small `mktemp`-to-guard window is the sole unguarded
artifact eligible for automatic removal.

This guard closes candidate zombie/restart risk, not the wider availability
problem of a host loss during a legacy cutover. The legacy containers have
already been deliberately changed to restart policy `no`; after a reboot they
remain stopped until the exact signed deploy command is rerun. A boot service
must not guess whether to start legacy or the new stack while a release
transaction may be partially published. Full unattended boot recovery would
require a crash-durable release-transaction state machine spanning systemd,
the live-state restore and signed legacy rollback. Until that separate control
exists and is tested, this is an explicit fail-closed P1 availability residual,
not a fully autonomous recovery claim.

The three `--legacy-*` arguments are mandatory for the first cutover on the
observed VPS. Omitting them while any pre-existing container remains is a hard
failure; the release pipeline never starts a second stack beside unclaimed
legacy state. The rollback receipt target must be absent. After the signed
legacy receipt passes its minimal phase/action contract, automatic rollback is
armed before copy, integrity, disk-space, Git or candidate checks can fail.
For the post-rollback forward leg, pass the new
`FORWARD_AFTER_ROLLBACK` quiesce receipt and a new absent rollback-receipt
target.

Promotion of the unit, Compose environment and `current` symlink is one
transaction. A failure in install, daemon reload, enable, start, readiness or
receipt persistence restores the previous unit, environment, symlink and
active/enabled state. If the new application start was attempted, the coherent
pre-promotion SQLite/Admin Security bundle is also restored through the
break-glass restore boundary; the recovered runtime intentionally returns in
kill-switch/maintenance containment and requires operator review. An incomplete
automatic restoration is recorded fail-closed and must be treated as an
incident.

Before building, deployment requires a free-space reserve for the image,
candidate, live state copies and rollback. After a committed promotion it keeps
the current release, the rollback target and one additional accepted release;
older release checkouts, acceptance markers and unused `mv-ai-os:<commit>`
images are pruned together. A container reference or unsafe path makes cleanup
fail closed and leaves an operator-visible warning.

`update-release.sh` intentionally requires the same exact arguments:

```sh
sudo /srv/onlyway/current/scripts/production/update-release.sh \
  --repo git@github.com:OWNER/REPOSITORY.git \
  --branch main \
  --commit VERIFIED_FULL_SHA
```

## Release invariants

- deploy only `main`;
- deploy the commit already tested, committed and pushed;
- never deploy a dirty checkout;
- never merge main, create tags or force-push from these scripts;
- never put secrets in image build arguments, Compose environment or releases;
- never copy the release-acceptance private key out of
  `/srv/onlyway/secrets/deploy`; losing it makes future acceptance impossible
  and losing its public mate makes rollback fail closed;
- never hand-create or edit
  `/srv/onlyway/run/accepted-releases/<commit>.json`;
- never claim deployment/reboot success without current host receipts and checks.
