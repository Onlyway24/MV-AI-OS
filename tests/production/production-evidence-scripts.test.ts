import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("production evidence scripts", () => {
  it("binds scan, tunnel trust and ordered distinct operation receipts", async () => {
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    expect(collector).toContain("--scan-artifact");
    expect(collector).toContain("--tunnel-receipt");
    expect(collector).toContain("--tunnel-trust-key");
    expect(collector).toContain(
      'file_fingerprint "$SCAN_ARTIFACT"',
    );
    expect(collector).toContain(
      'assert_distinct_evidence_files "$SCAN_RESULT" "$SCAN_ARTIFACT"',
    );
    expect(collector).toContain("snapshot_nofollow");
    expect(collector).toContain("iflag=nofollow,fullblock");
    expect(collector).toContain(
      'BACKUP_SIGNATURE=$(verify_backup_manifest_signature "$BACKUP_MANIFEST")',
    );
    expect(collector).toContain(
      ".signerPublicKey == $trustedPublicKey",
    );
    expect(collector).toContain(
      ".externalProbe.sshHostKeyFingerprint == $hostKeyFingerprint",
    );
    expect(collector).toContain(
      "SSHD_HOST_PUBLIC_KEY=/etc/ssh/ssh_host_ed25519_key.pub",
    );
    expect(collector).toContain(
      "receipt order must be final legacy-forward acceptance, post-reboot backup, then reboot recovery",
    );
    expect(collector).toContain(
      'assert_distinct_evidence_files \\\n  "$DEPLOYMENT_RECEIPT"',
    );
    expect(collector).toContain(
      "node ./dist/production/production-closure-cli.js",
    );
    expect(collector).toContain(
      "security evidence bundle target was created concurrently",
    );
    expect(collector).toContain("retain_evidence_bundles");
    expect(collector).toContain("local maximum=30");
    expect(collector).toContain(
      "security attestation output must use its fixed config path",
    );
    expect(collector).toContain(
      '"${ONLYWAY_CONFIG_DIR}/security-attestation.json.sig"',
    );
    expect(collector).toContain(
      '"${ONLYWAY_CONFIG_DIR}/deployment-attestation.json.sig"',
    );
    expect(collector).toContain("sign_release_attestation");
    expect(collector).toContain(
      '-inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY"',
    );
    expect(collector).toContain(
      '"type=bind,src=${ONLYWAY_ACCEPTANCE_PUBLIC_KEY},dst=/run/onlyway/release-acceptance-ed25519.pub.pem,readonly"',
    );
    expect(collector).toContain('sync -f "$ONLYWAY_CONFIG_DIR"');
    expect(collector).toContain(
      "rehearsalReceiptFingerprint: $rehearsalFingerprint",
    );
    expect(collector).toContain(".openMaterialP2Findings == 0");
    expect(collector).toContain(
      '"artifactFingerprint", "branch", "completedAt", "contractVersion"',
    );
    expect(collector).toContain(
      'assert_distinct_evidence_files "$PRE_SCAN_TRUST_KEY" "$TUNNEL_TRUST_KEY"',
    );
    expect(collector).toContain(
      "distinct trust-anchor fingerprints",
    );
    expect(collector).toContain(".startedAt | type == \"string\"");
    expect(collector).toContain(
      "Deep Security Scan must follow signed pre-scan verification",
    );
  });

  it("requires signed host and legacy receipts and keeps signature pairs", async () => {
    const common = await readFile(resolve(
      "scripts/production/lib/common.sh",
    ), "utf8");
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    const confirmation = await readFile(resolve(
      "scripts/production/confirm-ssh-hardening.sh",
    ), "utf8");
    expect(common).toContain("verify_host_receipt_signature() (");
    expect(common).toContain('local signature="${receipt}.sig"');
    expect(common).toContain("iflag=nofollow,fullblock");
    expect(common).toContain(
      "host receipt detached Ed25519 signature is invalid",
    );
    expect(common).toContain(
      '-inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY"',
    );
    expect(common).toContain(
      'mv -T -- "$signature_temporary" "$signature_target"',
    );
    expect(common).toContain('sync -f "$receipt_dir"');
    expect(common).toContain('unlink "$expired_signature"');
    expect(collector).toContain(
      'verify_host_receipt_signature "$file"',
    );
    expect(collector).toContain("validate_legacy_signed_json_pair");
    expect(collector).toContain("legacy_verify_signed_json");
    expect(collector).toContain(
      '"$LEGACY_CUTOVER_ROLLBACK_SIGNATURE"',
    );
    expect(collector).toContain("receiptSignatureFingerprint");
    expect(confirmation).toContain(
      '"${RECEIPT}.sig" "$CONFIRMATION_SIGNATURE_TEMPORARY"',
    );
    expect(confirmation).toContain(
      'verify_host_receipt_signature "$ONLYWAY_SSH_HARDENING_CONFIRMATION"',
    );
  });

  it("binds the real legacy cutover rollback to re-quiesce and forward acceptance", async () => {
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    for (const flag of [
      "--legacy-cutover-rollback-receipt",
      "--legacy-cutover-rollback-signature",
      "--legacy-forward-quiesce-receipt",
      "--legacy-forward-quiesce-signature",
      "--legacy-forward-deploy-receipt",
      "--legacy-final-success-marker",
      "--legacy-final-success-signature",
    ]) {
      expect(collector).toContain(flag);
    }
    expect(collector).not.toContain("--rollback-receipt");
    expect(collector).not.toContain("--forward-deploy-receipt");
    expect(collector).toContain(
      '.confirmedAction == "ROLLBACK_LEGACY_WITHIN_RETENTION_V1"',
    );
    expect(collector).toContain(
      '.status == "ROLLED_BACK_TO_EXACT_LEGACY_RUNTIME"',
    );
    expect(collector).toContain(
      '.confirmedAction == "REQUIESCE_FOR_FORWARD_DEPLOY_V1"',
    );
    expect(collector).toContain(
      ".rollbackEvidence.receiptSha256 == $rollbackSha",
    );
    expect(collector).toContain(
      ".rollbackEvidence.firstSuccessMarkerSha256 == $successMarkerSha",
    );
    expect(collector).toContain(
      "legacy cutover rollback evidence hash chain is invalid",
    );
    expect(collector).toContain(
      ".newAdminSecurity.state.path == $state",
    );
    expect(collector).toContain(
      ".newAdminSecurity.pepper.path == $pepper",
    );
    expect(collector).toContain(
      ".newAdminSecurity.founderBootstrap.path == $founderBootstrap",
    );
    expect(collector).toContain(".newData.database == $database");
    expect(collector).toContain(".newStack.composeProject == $project");
    expect(collector).toContain(".newStack.containerCount == 5");
    expect(collector).toContain(
      "legacy evidence order must prove initial quiesce/deploy, cutover rollback, re-quiesce, forward deploy, and final acceptance",
    );
    expect(collector).toContain(
      'ROLLBACK_FINGERPRINT=$LEGACY_MIGRATION_FINGERPRINT',
    );
  });

  it("verifies the dedicated pre-scan signature and both private Founder closure states", async () => {
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    for (const flag of [
      "--pre-scan-receipt",
      "--pre-scan-signature",
      "--pre-scan-trust-key",
    ]) {
      expect(collector).toContain(flag);
    }
    expect(collector).toContain("-I onlyway-pre-scan");
    expect(collector).toContain("-n onlyway-pre-scan-verification-v1");
    expect(collector).toContain(
      '.signature.signerPublicKey == $signerPublicKey',
    );
    expect(collector).toContain("github_repository_identity");
    expect(collector).toContain(
      "signed pre-scan receipt targets a different deployed repository",
    );
    expect(collector).toContain(
      "CONSUMED_PASSKEY_REGISTERED",
    );
    expect(collector).toContain(
      "OWNER_ONLY_AVAILABLE_HUMAN_GATED",
    );
    expect(collector).toContain(
      'http://127.0.0.1:43100/api/admin/diagnostics',
    );
    expect(collector).toContain(
      '[[ $ADMIN_UNAUTHENTICATED_STATUS == "401" ]]',
    );
    expect(collector).toContain(
      '"$ONLYWAY_UID" "$ONLYWAY_GID" 600 16384',
    );
    expect(collector).toContain(
      "rawBootstrapMaterialExposed: false",
    );
    expect(collector).toContain('"backedUp", "counter", "createdAt", "credentialId"');
    expect(collector).toContain("PASSKEY_USER_VERIFIED");
    expect(collector).toContain("$createdAt == $stateCreatedAt");
    expect(collector).toContain(
      "owner-only Founder bootstrap boundary changed during verification",
    );
    expect(collector).toContain(
      'localFounderBootstrap: evidence("RUNTIME_RECEIPT"; "runtime/founder-bootstrap"; $bootstrapFp)',
    );
  });

  it("binds reboot recovery to an immediate signed backup", async () => {
    const reboot = await readFile(resolve(
      "scripts/production/reboot-recovery-evidence.sh",
    ), "utf8");
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    expect(reboot).toContain(
      'systemctl is-enabled --quiet "$ONLYWAY_SYSTEMD_UNIT"',
    );
    expect(reboot).toContain(
      'systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT"',
    );
    expect(reboot).toContain(
      'systemctl is-enabled --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER"',
    );
    expect(reboot).toContain(
      'systemctl start "$ONLYWAY_BACKUP_SYSTEMD_SERVICE"',
    );
    expect(reboot).toContain("--property=Result --value");
    expect(reboot).toContain(
      'verify_host_receipt_signature "$POST_REBOOT_BACKUP_RECEIPT"',
    );
    expect(reboot).toContain(
      "postRebootBackupReceiptSignatureFingerprint=",
    );
    expect(collector).toContain(
      "postRebootBackupReceiptFingerprint=",
    );
    expect(collector).toContain(
      "postRebootBackupReceiptSignatureFingerprint=",
    );
    expect(collector).toContain(
      "reboot receipt does not bind the backup receipt signature",
    );
  });

  it("enforces effective fail2ban and unattended-upgrades policy", async () => {
    const installer = await readFile(resolve(
      "scripts/production/install-host.sh",
    ), "utf8");
    const confirmation = await readFile(resolve(
      "scripts/production/confirm-ssh-hardening.sh",
    ), "utf8");
    const collector = await readFile(resolve(
      "scripts/production/collect-production-evidence.sh",
    ), "utf8");
    for (const policy of [
      "enabled = true",
      "backend = systemd",
      "maxretry = 5",
      "findtime = 600",
      "bantime = 3600",
    ]) {
      expect(installer).toContain(policy);
    }
    expect(installer).toContain(
      "systemctl enable --now apt-daily.timer apt-daily-upgrade.timer",
    );
    expect(installer).toContain(
      'APT::Periodic::Unattended-Upgrade "1";',
    );
    for (const script of [confirmation, collector]) {
      expect(script).toContain("fail2ban-client get sshd maxretry");
      expect(script).toContain("fail2ban-client get sshd findtime");
      expect(script).toContain("fail2ban-client get sshd bantime");
      expect(script).toContain("fail2ban-client get sshd journalmatch");
      expect(script).toContain("apt-daily-upgrade.timer");
      expect(script).toContain(
        'APT::Periodic::Unattended-Upgrade "1";',
      );
    }
    expect(collector).toContain("UNATTENDED_UPGRADES_REPORT");
    expect(collector).toContain("unattendedUpgrades: $unattended[0]");
  });

  it("rejects tampered, missing and wrong-key host receipt signatures", () => {
    const output = execFileSync("bash", [
      resolve("scripts/production/tests/host-receipt-signature-contract.sh"),
      resolve("."),
    ], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(output).toMatch(
      /host receipt signature contract: (PASS|SKIP)/u,
    );
  });

  it("measures exact tunnel readiness and public application-port closure before signing", async () => {
    const verifier = await readFile(resolve(
      "scripts/production/verify-private-tunnel.sh",
    ), "utf8");
    expect(verifier).toContain(
      "readonly APPLICATION_PORTS=(80 443 43100 43101 8080)",
    );
    expect(verifier).toContain(".summary.releaseCommit == $commit");
    expect(verifier).toContain("HostKeyAlgorithms=ssh-ed25519");
    expect(verifier).toContain("StrictHostKeyChecking=yes");
    expect(verifier).toContain(
      "-L 127.0.0.1:43100:127.0.0.1:43100",
    );
    expect(verifier).toContain('nc -z -w 5 "$SSH_HOST" "$SSH_PORT"');
    expect(verifier).toContain("ssh-keygen -Y sign");
    expect(verifier).toContain("ssh-keygen -Y verify");
    expect(verifier).toContain('chmod 0600 "$TEMPORARY"');
    expect(verifier).toContain(
      'ssh -S "$SSH_CONTROL" -p "$SSH_PORT" -O check',
    );
    expect(verifier).not.toContain("cat \"$KEY\"");
  });

  it("passes payment readiness a root-controlled no-follow receipt snapshot", async () => {
    const wrapper = await readFile(resolve(
      "scripts/production/payment-readiness.sh",
    ), "utf8");
    expect(wrapper).toContain("iflag=nofollow,fullblock");
    expect(wrapper).toContain(
      'CONTAINER_RECEIPT="/etc/onlyway/$(basename -- "$REHEARSAL_SNAPSHOT")"',
    );
    expect(wrapper).toContain('chown root:"$ONLYWAY_SERVICE_GROUP"');
    expect(wrapper).toContain(
      "acquire_operation_lock payment-readiness",
    );
    expect(wrapper).toContain(
      'DEPLOYMENT_SIGNATURE="${DEPLOYMENT_ATTESTATION}.sig"',
    );
    expect(wrapper).toContain(
      "deployment attestation is not bound to the rehearsal receipt",
    );
    const rehearsal = await readFile(resolve(
      "scripts/production/production-rehearsal.sh",
    ), "utf8");
    expect(rehearsal).toContain(
      "acquire_operation_lock production-rehearsal",
    );
    expect(rehearsal.lastIndexOf("STACK_READINESS_VERIFIED=true")).toBeLessThan(
      rehearsal.indexOf('mv -fT -- "$POINTER_TEMPORARY" "$LATEST_POINTER"'),
    );
    expect(rehearsal).toContain("cleanup_pointer_temporaries");
    expect(rehearsal).toContain("cleanup_incomplete_rehearsal");
    const security = await readFile(resolve(
      "scripts/production/security-readiness.sh",
    ), "utf8");
    expect(security).toContain(
      "acquire_operation_lock security-readiness",
    );
    expect(security).toContain(
      'ATTESTATION_SIGNATURE="${ATTESTATION}.sig"',
    );
  });
});
