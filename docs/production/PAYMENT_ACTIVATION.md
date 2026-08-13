# Payment and provider activation

The deployed default is `OFFLINE_REHEARSAL`:

```text
OpenAI provider       DISABLED
OpenAI secret         NOT_CONFIGURED
provider budget       EUR 0
paid calls allowed    false
Instagram connector  CONFIGURATION_REQUIRED
TikTok connector     CONFIGURATION_REQUIRED
publication           LOCKED
```

First run the durable rehearsal. Its root-owned latest pointer binds the exact
release commit, the owner-only receipt path, its internal receipt fingerprint
and its file fingerprint:

```sh
sudo /srv/onlyway/current/scripts/production/production-rehearsal.sh
sudo /srv/onlyway/current/scripts/production/payment-readiness.sh
```

The payment wrapper refuses symlinks, wrong owners/modes, oversized inputs,
paths outside the mounted data/config roots, stale commits, or non-canonical
fingerprints. It passes the actual rehearsal receipt and the evidence
collector's deployment attestation into the container. Consequently it remains
`PAYMENT_NOT_READY` until real deployment, readiness, rollback/forward and
reboot-recovery evidence has been collected.

The latest rehearsal pointer is published only after systemd restart and
commit-bound readiness succeed. An incomplete run is removed instead of being
retained as pass evidence.

`PAYMENT_READY_OFFLINE` means the controlled fake path is ready. It is not
permission to spend, publish or contact anyone.

Any future `LIVE_PAID` activation is a separate decision and requires all of:

1. an approved provider and model identifier;
2. an owner-only `SecretReference`;
3. non-zero daily, monthly, mission, agent and provider budgets;
4. reservation and actual-cost receipts;
5. Cost Gate, anomaly stop and released kill switch;
6. green readiness and backup/restore;
7. Fabio command-bound step-up and approval receipt;
8. a trusted approval verifier plus a production composition that wraps every
   paid provider call in durable reservation/settlement Cost Control;
9. an explicit activation command and audit event.

Never enable paid mode through a lone environment variable. Instagram/TikTok
configuration and a production domain remain independent gates. Provider
readiness never unlocks publication.

The current production composition intentionally does not install the trusted
live Cost Control capability, so a `LIVE_PAID` JSON block remains fail-closed
even if its fields are syntactically valid.
