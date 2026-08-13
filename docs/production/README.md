# Onlyway private production

This directory is the operator entry point for the private, zero-cost VPS
profile. It does not attest that a VPS deployment, reboot, restore or rollback
has succeeded; those states are valid only after the corresponding receipts and
acceptance checks exist on the host.

## Topology

The only public host service is SSH. A local browser reaches
`127.0.0.1:43100` through an SSH tunnel. Docker publishes that port only on VPS
loopback. Caddy and the Command Center share one network namespace: Caddy listens
on `:8080`, while the Command Center remains bound to
`127.0.0.1:43101`. Scheduler, worker and health monitor use the same immutable
application image and durable SQLite volume on an internal network with no
provider egress.

The default profile has:

- OpenAI absent and disabled;
- provider budget zero;
- live paid calls disabled;
- publication locked;
- no Instagram or TikTok transport activation;
- no Telegram daemon;
- no public application port.

Once the exact release is accepted, [PRIVATE_PRODUCTION_START.md](./PRIVATE_PRODUCTION_START.md)
describes the one-shot, zero-cost intake that supplies real authorized evidence
and starts internal production. Its temporary research-egress profile is not
part of the five-service H24 stack and mounts no provider secret.

## Host layout

```text
/srv/onlyway/
├── app/
├── releases/<40-character-commit>/
├── current -> releases/<commit>
├── data/
├── backups/
├── logs/
├── run/
│   └── accepted-releases/<commit>.json
├── secrets/
│   └── deploy/release-acceptance-ed25519.{pem,pub.pem}
└── config/
```

Acceptance markers bind the clean Git tree, exact application image/OCI
revision, candidate readiness, no-egress/no-public-port state and the coherent
pre-promotion backup fingerprint. They are signed on the host; they are not a
substitute for the post-push Deep Security Scan.

Runtime processes use UID/GID `2001:2001`. The image root filesystem is
read-only. Authorized writable mounts are `/var/lib/onlyway`,
`/var/backups/onlyway` where required, and tmpfs `/tmp`.

Start with [DEPLOYMENT.md](DEPLOYMENT.md), then use
[VPS_OPERATIONS.md](VPS_OPERATIONS.md). Security and payment activation remain
separate decisions.
