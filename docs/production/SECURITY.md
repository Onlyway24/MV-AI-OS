# Private deployment security

The accepted milestone state is `SECURE_DEPLOYMENT_READY_PRIVATE`, never
`SAFE_TO_EXPOSE_PUBLICLY`.

## Network boundary

- UFW denies inbound traffic except the verified SSH port.
- Docker publishes only `127.0.0.1:43100`.
- Caddy and Command Center share a network namespace; the application itself
  binds only `127.0.0.1:43101`.
- The Compose network is internal and has no provider egress.
- Ports 80 and 443 remain closed.
- `PRODUCTION_DOMAIN` remains `CONFIGURATION_REQUIRED`.

Verify listeners with both `ss -lntup` on the VPS and a non-destructive external
connection check. A Docker port shown as `0.0.0.0` or `[::]` is a release
blocker.

## Container boundary

Application containers run as UID/GID 2001 with a read-only root filesystem,
all Linux capabilities dropped, `no-new-privileges`, bounded log rotation and
no Docker socket/device/host network. There are no CPU, RAM, systemd
`MemoryMax`, or Docker resource limits. Reliability is enforced in the
application through bounded queue, retry, timeout, payload, artifact, budget
and kill-switch controls.

## Secret boundary

Runtime secret files are mounted read-only from
`/srv/onlyway/secrets/runtime`, never copied into an image or release. The
GitHub deploy key is isolated under `/srv/onlyway/secrets/deploy` and is never
mounted into an application container. The application resolver requires an
owner-matching regular file with exact mode `0600`.

```sh
sudo scripts/production/install-secret.sh --name NAME --source ABS --confirm INSTALL
sudo scripts/production/rotate-secret.sh --name NAME --source ABS --confirm ROTATE
sudo scripts/production/revoke-secret.sh --name NAME --confirm REVOKE
sudo scripts/production/verify-secret-permissions.sh
sudo scripts/production/secret-status.sh
```

Status commands expose names and redacted state only. They never display,
fingerprint or log values. OpenAI credentials must not be installed during the
offline milestone.

Public TLS, domain origin, WebAuthn RP ID and trusted-proxy changes require a
separate security gate and must not reuse localhost registration parameters.

The local `security-readiness` command consumes a bounded, canonically
fingerprinted evidence attestation and never starts Codex Security. Boolean
self-attestations are rejected. Every control must carry an allowlisted
measurement kind/source, the exact final commit, a SHA-256 fingerprint and a
UTC observation timestamp.

`collect-production-evidence.sh` is the production collector. It reruns the
full check in an exact-commit Docker verification image and measures the live
containers, internal Docker network, image/release identity, non-root and
confinement settings, Docker socket absence, loopback listeners, effective
`sshd -T` policy, UFW for IPv4 and IPv6, fail2ban, protected filesystem
metadata, signed acceptance, live readiness, and supplied durable operation
receipts. The compatibility name `collect-security-evidence.sh` delegates to
the same collector. It fails closed and writes:

- `/srv/onlyway/config/security-attestation.json`;
- `/srv/onlyway/config/deployment-attestation.json`;
- a root-owned evidence bundle under `/srv/onlyway/run/evidence/`.

The collector validates both generated attestations before publishing them,
uses fixed config filenames, and retains only the 30 newest root-owned evidence
bundles. Unexpected entries stop retention for operator review.

`/srv/onlyway/run` and `/srv/onlyway/.operation-locks` are host-control
directories owned by `root:onlyway` with mode `0750`; application containers
never mount them. Runtime-writable state remains confined to the explicitly
mounted data, backup, Admin State, and bootstrap boundaries.

It requires actual backup/restore, reboot-recovery, deployment and
production-rehearsal receipts. For the first migration, rollback/forward proof
is the signed legacy chain: exact four-container `CUTOVER` rollback, retained
new-state backup, re-quiesce, forward deployment and final success marker. A
second synthetic `rollback-release` exercise is neither required nor accepted
before any prior new-stack release exists. The collector cannot create these
historical facts. The inert examples remain `NOT_EXECUTED`/not ready.

The signed pre-scan receipt, its detached SSH signature and its dedicated
Ed25519 trust anchor are separate from the Deep Security Scan receipt and the
actual report/export. The scan must start at or after the signed pre-scan
completion time. `artifactFingerprint` must equal the report/export file
SHA-256; a self-consistent JSON receipt without that artifact is rejected.

Founder closure accepts either a consumed bootstrap with a registered Founder
passkey, or the single fresh, unexpired `founder-bootstrap.json` owner-only
channel while human enrollment is pending. The second state remains
`human-gated`: the file must be `2001:2001` mode `0600`, match durable state,
and unauthenticated Admin diagnostics must return `401`. Evidence contains
only fingerprints and state labels, never the bootstrap token.

Private-tunnel evidence is created on the operator workstation through a
temporary SSH tunnel opened by the verifier with the selected identity,
strict host checking and the pinned Ed25519 host key. It records that host-key
fingerprint and SSH target only after exact-commit readiness succeeds through
`localhost:43100`, the public VPS SSH port is reachable, and public ports `80`,
`443`, `43100`, `43101`, and `8080` are all unreachable. The receipt is
canonically fingerprinted and signed with the operator Ed25519 SSH key.
Transfer the receipt and its `.pub` trust anchor
separately, then install the receipt as `root:onlyway` mode `0600` and the
public trust anchor as `root:root` mode `0644`. The collector verifies the SSH
signature against that explicit trust anchor, the VPS host public key and the
active VPS SSH endpoint;
it never trusts only the public key embedded in the receipt.

The final Deep Security Scan is permitted only after the complete green suite,
final commit and push. It must target the updated
`feature/telegram-operator-console` commit—never `main@901c126`. The scan result
input must name that exact commit and include both the scan artifact fingerprint
and its own canonical fingerprint.
