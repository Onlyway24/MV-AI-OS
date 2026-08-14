#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=${1:-}
[[ $ROOT == /* && -d $ROOT ]] \
  || { printf '%s\n' "usage: $0 ABSOLUTE_REPOSITORY_ROOT" >&2; exit 2; }

DEPLOY="${ROOT}/scripts/production/deploy-release.sh"
ROLLBACK="${ROOT}/scripts/production/rollback-release.sh"
READINESS="${ROOT}/scripts/production/readiness.sh"
PREFLIGHT="${ROOT}/scripts/production/release-preflight.sh"
BACKUP="${ROOT}/scripts/production/backup.sh"
RESTORE="${ROOT}/scripts/production/restore.sh"
REHEARSAL="${ROOT}/scripts/production/production-rehearsal.sh"
EVIDENCE="${ROOT}/scripts/production/collect-production-evidence.sh"
SECURITY_READINESS="${ROOT}/scripts/production/security-readiness.sh"
PAYMENT_READINESS="${ROOT}/scripts/production/payment-readiness.sh"
INSTALL_HOST="${ROOT}/scripts/production/install-host.sh"
CONFIRM_SSH="${ROOT}/scripts/production/confirm-ssh-hardening.sh"
REBOOT_RECOVERY="${ROOT}/scripts/production/reboot-recovery-evidence.sh"
HOST_RECEIPT_CONTRACT="${ROOT}/scripts/production/tests/host-receipt-signature-contract.sh"
PRE_SCAN_VERIFICATION="${ROOT}/scripts/production/pre-scan-verification.sh"
LEGACY_COMMON="${ROOT}/scripts/production/lib/legacy-migration-common.sh"
LEGACY_PREFLIGHT="${ROOT}/scripts/production/legacy-migration-preflight.sh"
LEGACY_QUIESCE="${ROOT}/scripts/production/legacy-migration-quiesce.sh"
LEGACY_SUCCESS="${ROOT}/scripts/production/mark-legacy-migration-success.sh"
LEGACY_ROLLBACK="${ROOT}/scripts/production/rollback-legacy-migration.sh"
LEGACY_INSTALL_CONTRACT="${ROOT}/scripts/production/tests/legacy-install-gate-contract.sh"
LEGACY_INSTALL_SIGNATURE_CONTRACT="${ROOT}/scripts/production/tests/legacy-install-gate-signature-contract.sh"
LEGACY_DEPLOY_CONTRACT="${ROOT}/scripts/production/lib/legacy-deploy-quiesce-contract.jq"
LEGACY_RUNTIME_RENDERER="${ROOT}/scripts/production/lib/render-legacy-runtime.jq"
CANDIDATE_RECOVERY="${ROOT}/scripts/production/lib/candidate-recovery.sh"
COMMON="${ROOT}/scripts/production/lib/common.sh"
TRANSACTION="${ROOT}/scripts/production/lib/release-transaction.sh"
UNIT="${ROOT}/ops/systemd/mv-ai-os.service"
BACKUP_SERVICE="${ROOT}/ops/systemd/mv-ai-os-backup.service"
BACKUP_TIMER="${ROOT}/ops/systemd/mv-ai-os-backup.timer"
COMPOSE="${ROOT}/compose.production.yml"
DOCKERFILE="${ROOT}/Dockerfile"
CADDYFILE="${ROOT}/ops/production/Caddyfile"

bash -n \
  "$DEPLOY" \
  "$ROLLBACK" \
  "$READINESS" \
  "$PREFLIGHT" \
  "$BACKUP" \
  "$RESTORE" \
  "$REHEARSAL" \
  "$EVIDENCE" \
  "$SECURITY_READINESS" \
  "$PAYMENT_READINESS" \
  "$INSTALL_HOST" \
  "$CONFIRM_SSH" \
  "$REBOOT_RECOVERY" \
  "$HOST_RECEIPT_CONTRACT" \
  "$PRE_SCAN_VERIFICATION" \
  "$LEGACY_COMMON" \
  "$LEGACY_PREFLIGHT" \
  "$LEGACY_QUIESCE" \
  "$LEGACY_SUCCESS" \
  "$LEGACY_ROLLBACK" \
  "$LEGACY_INSTALL_CONTRACT" \
  "$LEGACY_INSTALL_SIGNATURE_CONTRACT" \
  "$CANDIDATE_RECOVERY" \
  "$COMMON" \
  "$TRANSACTION" \
  "${ROOT}/scripts/production/update-release.sh" \
  "${ROOT}/scripts/production/stack.sh"
jq -n -f "$LEGACY_DEPLOY_CONTRACT" >/dev/null
jq -n -f "$LEGACY_RUNTIME_RENDERER" >/dev/null

require_text() {
  local pattern=$1
  local file=$2
  grep -Eq -- "$pattern" "$file" \
    || {
      printf 'required release invariant missing in %s: %s\n' "$file" "$pattern" >&2
      exit 1
    }
}

reject_text() {
  local pattern=$1
  local file=$2
  if grep -Eq -- "$pattern" "$file"; then
    printf 'forbidden release pattern found in %s: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_order() {
  local first_pattern=$1
  local second_pattern=$2
  local file=$3
  local first_line
  local second_line
  first_line=$(grep -nEm1 -- "$first_pattern" "$file" | cut -d: -f1)
  second_line=$(grep -nEm1 -- "$second_pattern" "$file" | cut -d: -f1)
  [[ -n $first_line && -n $second_line && $first_line -lt $second_line ]] \
    || {
      printf 'release invariant order failed in %s: %s before %s\n' \
        "$file" "$first_pattern" "$second_pattern" >&2
      exit 1
    }
}

require_text 'image: mv-ai-os:\$\{ONLYWAY_RELEASE_COMMIT:\?' "$COMPOSE"
[[ $(grep -Ec '^[[:space:]]+user: "2001:2001"$' "$COMPOSE") -eq 2 ]] \
  || {
    printf '%s\n' \
      "application and Caddy containers must both run as 2001:2001" >&2
    exit 1
  }
reject_text '^[[:space:]]+user: "(0|root)(:0|:root)?"$' "$COMPOSE"
reject_text '^[[:space:]]+ports:$' "$COMPOSE"
require_text 'caddy:2\.11\.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648' "$COMPOSE"
require_text '^[[:space:]]+cap_add:$' "$COMPOSE"
require_text '^[[:space:]]+- NET_BIND_SERVICE$' "$COMPOSE"
require_text 'ONLYWAY_ACCEPTANCE_PUBLIC_KEY_PATH: /run/onlyway/release-acceptance-ed25519\.pub\.pem' "$COMPOSE"
require_text '- \*acceptance-public-key-mount' "$COMPOSE"
[[ $(grep -Ec 'restart: "\$\{ONLYWAY_RESTART_POLICY:-unless-stopped\}"' \
  "$COMPOSE") -eq 2 ]] \
  || {
    printf '%s\n' \
      "application and Caddy restart policy must support the candidate no-restart override" >&2
    exit 1
  }
reject_text 'release-acceptance-ed25519\.pem' "$COMPOSE"
reject_text '(^|[[:space:]"'\''])(0\.0\.0\.0|\[::\]):[0-9]' "$COMPOSE"
if grep -R -Eq -- 'caddy:2\.10\.0|caddy:2\.11\.4-alpine([^@]|$)' \
  "${ROOT}/scripts/production" "${ROOT}/compose.production.yml"; then
  printf '%s\n' "release pipeline contains an unpinned or stale Caddy image reference" >&2
  exit 1
fi
require_text '^RUN ! getent passwd 2001 >/dev/null' "$DOCKERFILE"
require_order '^COPY scripts/clean-dist\.mjs ./scripts/clean-dist\.mjs$' \
  '^RUN npm run build$' "$DOCKERFILE"
require_text '&& ! getent group 2001 >/dev/null' "$DOCKERFILE"
require_text 'groupadd --gid 2001 onlyway' "$DOCKERFILE"
require_text 'useradd --uid 2001 --gid 2001 --system' "$DOCKERFILE"
require_text '^USER 2001:2001$' "$DOCKERFILE"
require_text '^EXPOSE 43101$' "$DOCKERFILE"
require_text 'install -d -o root -g root -m 0755 /run/onlyway' "$DOCKERFILE"
reject_text '^USER (0|root)(:0|:root)?$' "$DOCKERFILE"
require_text '^:8080 \{$' "$CADDYFILE"
require_text 'header_up Host \{http\.request\.hostport\}' "$CADDYFILE"
require_text 'header_up X-Forwarded-Host \{http\.request\.hostport\}' "$CADDYFILE"
reject_text 'header_up (Host|X-Forwarded-Host) \{http\.request\.host\}$' "$CADDYFILE"
reject_text '^:(80|443) \{' "$CADDYFILE"
WORKER_BLOCK=$(sed -n '/^  worker:/,/^  health-monitor:/p' "$COMPOSE")
COMMAND_CENTER_BLOCK=$(sed -n '/^  command-center:/,/^  scheduler:/p' "$COMPOSE")
printf '%s\n' "$COMMAND_CENTER_BLOCK" \
  | grep -Eq -- '- \*acceptance-public-key-mount' \
  || {
    printf '%s\n' \
      "Command Center must receive the read-only release trust anchor" >&2
    exit 1
  }
printf '%s\n' "$WORKER_BLOCK" \
  | grep -Eq -- '- \*acceptance-public-key-mount' \
  || {
    printf '%s\n' \
      "payment readiness worker must receive the read-only release trust anchor" >&2
    exit 1
  }
if printf '%s\n' "$WORKER_BLOCK" \
  | grep -Eq -- '--backup-directory|backups-mount|admin-state-(readonly-)?mount'; then
  printf '%s\n' \
    "H24 worker must not receive a backup writer or Admin Security backup mount" >&2
  exit 1
fi

require_text 'org\.opencontainers\.image\.revision' "$DEPLOY"
require_text '^candidate_compose up --detach --remove-orphans$' "$DEPLOY"
require_text 'loopback-proxy\.sh' "$DEPLOY"
require_text 'create_verified_live_backup' "$DEPLOY"
require_text 'write_release_acceptance_marker' "$DEPLOY"
require_text 'begin_release_transaction' "$DEPLOY"
require_text 'restore_release_transaction' "$DEPLOY"
require_text 'LEGACY_ROLLBACK_ARMED=true' "$DEPLOY"
require_text 'MIGRATED_LIVE_STATE_MUTATED=true' "$DEPLOY"
require_text 'CANDIDATE_START_ATTEMPTED=true' "$DEPLOY"
require_text 'ONLYWAY_RESTART_POLICY=no' "$DEPLOY"
require_text 'candidate_recovery_recover_all' "$DEPLOY"
require_text 'candidate_recovery_arm_guard' "$DEPLOY"
require_text 'candidate_recovery_assert_no_restart' "$DEPLOY"
require_text 'candidate_recovery_disarm_guard' "$DEPLOY"
require_text 'legacy-deploy-quiesce-contract\.jq' "$DEPLOY"
require_text 'render-legacy-runtime\.jq' "$DEPLOY"
require_text 'pre-existing containers require the signed legacy migration boundary' \
  "$DEPLOY"
require_text 'FAILED_ROLLBACK_INCOMPLETE' "$DEPLOY"
require_order 'trap early_legacy_on_exit EXIT' \
  'LEGACY_ROLLBACK_ARMED=true' "$DEPLOY"
require_order 'LEGACY_ROLLBACK_ARMED=true' \
  'legacy-deploy-quiesce-contract\.jq' "$DEPLOY"
require_order 'CANDIDATE_START_ATTEMPTED=true' \
  '^candidate_compose up --detach --remove-orphans$' "$DEPLOY"
require_order 'candidate_recovery_recover_all' \
  'PREEXISTING_INVENTORY=' "$DEPLOY"
require_order 'candidate_recovery_arm_guard' \
  'CANDIDATE_START_ATTEMPTED=true' "$DEPLOY"
require_text 'validate_release_systemd_units "\$SOURCE"' "$DEPLOY"
require_text 'mv-ai-os-backup\.service' "$DEPLOY"
require_text 'mv-ai-os-backup\.timer' "$DEPLOY"
require_text 'systemctl enable "\$ONLYWAY_SYSTEMD_UNIT" "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' "$DEPLOY"
require_text 'systemctl is-active --quiet "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' "$DEPLOY"
require_text '"\$CANDIDATE_PROJECT" "\$COMMIT" "\$IMAGE_ID" "\$CANDIDATE_PORT"' "$DEPLOY"
require_text '"\$ONLYWAY_COMPOSE_PROJECT" "\$COMMIT" "\$IMAGE_ID" "43100"' "$DEPLOY"
require_order 'candidate-offline-rehearsal' 'write_release_acceptance_marker' "$DEPLOY"
require_order 'write_release_acceptance_marker' 'mv -T -- "\$STAGING" "\$RELEASE"' "$DEPLOY"

require_text 'kind == "CANDIDATE_RECOVERY_GUARD"' "$CANDIDATE_RECOVERY"
require_text '\.containsSecrets == false' "$CANDIDATE_RECOVERY"
require_text '\.restartPolicy == "no"' "$CANDIDATE_RECOVERY"
require_text 'HostConfig\.RestartPolicy\.Name == "no"' "$CANDIDATE_RECOVERY"
require_text 'com\.docker\.compose\.project\.working_dir' "$CANDIDATE_RECOVERY"
require_text 'untracked candidate containers require operator review' \
  "$CANDIDATE_RECOVERY"
require_text 'non-empty unguarded candidate root requires operator review' \
  "$CANDIDATE_RECOVERY"
require_text '^candidate_recovery_remove_safe_temporary_entries\(\)' \
  "$CANDIDATE_RECOVERY"
require_text 'candidate recovery found an unsafe temporary entry' \
  "$CANDIDATE_RECOVERY"
require_text '^candidate_recovery_remove_staging_source\(\)' \
  "$CANDIDATE_RECOVERY"

require_text 'verify_release_acceptance_marker' "$ROLLBACK"
require_text "rev-parse 'HEAD\\^\\{tree\\}'" "$ROLLBACK"
require_text 'verify_release_image' "$ROLLBACK"
require_order 'verify_release_acceptance_marker' 'begin_release_transaction' "$ROLLBACK"
require_text 'restore_release_transaction' "$ROLLBACK"
require_text 'validate_release_systemd_units "\$TARGET"' "$ROLLBACK"
require_text 'mv-ai-os-backup\.service' "$ROLLBACK"
require_text 'mv-ai-os-backup\.timer' "$ROLLBACK"
require_text 'systemctl enable "\$ONLYWAY_SYSTEMD_UNIT" "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' "$ROLLBACK"
require_text 'systemctl is-active --quiet "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' "$ROLLBACK"
require_text '"\$ONLYWAY_COMPOSE_PROJECT" "\$TARGET_COMMIT" "\$TARGET_IMAGE_ID" "43100"' "$ROLLBACK"
require_order 'target-readiness' 'target-runtime-identity' "$ROLLBACK"
require_order 'target-runtime-identity' 'ROLLBACK_STEP=success-receipt' "$ROLLBACK"
require_order 'ROLLBACK_STEP=success-receipt' \
  'ROLLBACK_STEP=commit-release-transaction' "$ROLLBACK"

require_order 'rm -rf --one-file-system -- "\$RELEASE_TRANSACTION_DIR"' \
  'RELEASE_TRANSACTION_COMMITTED=true' "$TRANSACTION"
require_text 'preserving release transaction snapshot and release artifacts for recovery' "$DEPLOY"
require_text 'preserving rollback transaction snapshot for recovery' "$ROLLBACK"

require_text '\.summary\.releaseCommit == \$commit' "$READINESS"
require_text '\.unauthorizedExternalEffectOccurred == false' "$READINESS"
require_text '\.kind == \$kind' "$READINESS"
require_text 'org\.opencontainers\.image\.revision' "$READINESS"
require_text 'require_ssh_hardening_confirmed' "$PREFLIGHT"

require_text 'write_backup_manifest_signature "\$MANIFEST"' "$BACKUP"
require_text 'verify_backup_manifest_signature "\$MANIFEST"' "$BACKUP"
require_text 'BACKUP_SIGNATURE=%s' "$BACKUP"
require_order '^ensure_acceptance_signing_identity$' \
  '^compose --profile operations run --rm --no-deps backup-verifier$' "$BACKUP"
require_order 'write_backup_manifest_signature "\$MANIFEST"' \
  'write_receipt "backup"' "$BACKUP"
require_text 'verify_backup_manifest_signature "\$MANIFEST"' "$RESTORE"
require_order 'verify_backup_manifest_signature "\$MANIFEST"' \
  'EXPECTED_SHA=' "$RESTORE"
require_text '^sync_restore_file\(\)' "$RESTORE"
require_text '^sync_restore_directory\(\)' "$RESTORE"
require_text 'must share a filesystem for crash-durable restore' "$RESTORE"
require_text 'rollback_durable=0' "$RESTORE"
require_order '^[[:space:]]*sync_restore_file "\$ROLLBACK_COPY"$' \
  '^ROLLBACK_READY=1$' "$RESTORE"
require_order '^sync_restore_file "\$TEMPORARY_ADMIN_STATE"$' \
  '^FILES_REPLACED=1$' "$RESTORE"
require_order '^mv -T -- "\$TEMPORARY_ADMIN_STATE"' \
  '^sync_restore_directory "\$ONLYWAY_DATA_DIR"$' "$RESTORE"
[[ $(grep -Ec 'sync_restore_directory "\$ONLYWAY_ADMIN_STATE_DIR"' "$RESTORE") -ge 2 ]] \
  || {
    printf '%s\n' \
      "restore must durably publish both success and rollback state" >&2
    exit 1
  }
[[ $(grep -Ec '^validate_recovery_bundle$' "$RESTORE") -eq 2 ]] \
  || {
    printf '%s\n' \
      "restore must validate the recovery bundle before and after stack quiesce" >&2
    exit 1
  }
QUIESCE_LINE=$(grep -nEm1 'RUNNING_CONTAINERS=' "$RESTORE" | cut -d: -f1)
FINAL_BUNDLE_VALIDATION_LINE=$(grep -nE '^validate_recovery_bundle$' "$RESTORE" \
  | tail -n 1 | cut -d: -f1)
[[ -n $QUIESCE_LINE && -n $FINAL_BUNDLE_VALIDATION_LINE \
  && $QUIESCE_LINE -lt $FINAL_BUNDLE_VALIDATION_LINE ]] \
  || {
    printf '%s\n' \
      "restore must revalidate the recovery bundle after stack quiesce" >&2
    exit 1
  }

require_text '^AssertPathExists=/srv/onlyway/current/compose\.production\.yml$' "$UNIT"
require_text '^AssertPathExists=/srv/onlyway/config/compose\.env$' "$UNIT"
require_text '^ExecStartPre=.*/release-preflight\.sh --expected-commit' "$UNIT"
require_text '^ExecStart=.*/loopback-proxy\.sh --compose-project onlyway --listen-port 43100$' "$UNIT"
require_text '^Type=simple$' "$UNIT"
require_text '^KillMode=control-group$' "$UNIT"
reject_text '^RemainAfterExit=' "$UNIT"
require_text '^ExecStartPost=.*/readiness\.sh --expected-commit .*--expected-kind STARTUP' "$UNIT"
require_text '^ExecStopPost=/usr/bin/docker compose .* down --remove-orphans --timeout 45$' "$UNIT"
reject_text '^ConditionPathExists=' "$UNIT"
require_text '^User=root$' "$BACKUP_SERVICE"
require_text '^Group=root$' "$BACKUP_SERVICE"
require_text '^ExecCondition=/usr/bin/systemctl is-active --quiet mv-ai-os\.service$' "$BACKUP_SERVICE"
require_text '^ExecStart=/srv/onlyway/current/scripts/production/backup\.sh$' "$BACKUP_SERVICE"
require_text '^NoNewPrivileges=true$' "$BACKUP_SERVICE"
require_text '^TimeoutStartSec=1800$' "$BACKUP_SERVICE"
require_text '^OnCalendar=\*-\*-\* 04:00:00 Europe/Rome$' "$BACKUP_TIMER"
require_text '^Persistent=true$' "$BACKUP_TIMER"
require_text '^RandomizedDelaySec=15m$' "$BACKUP_TIMER"
require_text '^Unit=mv-ai-os-backup\.service$' "$BACKUP_TIMER"

require_text 'signatureAlgorithm: "ED25519"' "$COMMON"
require_text 'ONLYWAY_UID="\$\{ONLYWAY_UID:-2001\}"' "$COMMON"
require_text 'ONLYWAY_GID="\$\{ONLYWAY_GID:-2001\}"' "$COMMON"
require_text 'ONLYWAY_CADDY_IMAGE="caddy:2\.11\.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"' "$COMMON"
require_text 'Compose configuration directory ownership or mode is unsafe' "$COMMON"
require_text 'Compose environment contains an unexpected key' "$COMMON"
reject_text 'source "\$file"' "$COMMON"
require_text 'openssl pkeyutl -verify -rawin -pubin' "$COMMON"
require_text 'kind: "BACKUP_MANIFEST_SIGNATURE"' "$COMMON"
require_text '^write_backup_manifest_signature\(\)' "$COMMON"
require_text '^verify_backup_manifest_signature\(\)' "$COMMON"
require_text '^assert_private_running_stack\(\) \($' "$COMMON"
require_text '\.Config\.User == "2001:2001"' "$COMMON"
require_text 'set -o noclobber' "$COMMON"
require_text '/proc/\$\{BASHPID\}/fd/\$\{signature_fd\}' "$COMMON"
require_text 'stat -Lc.*%d:%i' "$COMMON"
require_text 'signature_created=1' "$COMMON"
require_text 'signature_created:-0.*== 1' "$COMMON"
require_text 'stat -c "%d:%i" "\$target".*== "\$signature_identity"' "$COMMON"
reject_text 'mktemp.*ONLYWAY_BACKUP_DIR.*backup-manifest-signature' "$COMMON"
require_text '^validate_release_systemd_units\(\)' "$COMMON"
require_text 'candidateExternalEffects == false' "$COMMON"
require_text 'candidateSecretProfile == "SYNTHETIC_ISOLATED"' "$COMMON"
require_text 'publicApplicationPorts == 0' "$COMMON"
require_text 'chown root:root "\$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"' "$COMMON"
require_text 'chmod 0644 "\$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"' "$COMMON"
require_text 'public key could not be normalized for the backup verifier' "$COMMON"
require_order 'chmod 0644 "\$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"' \
  'openssl pkey -pubin -in "\$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" -noout' "$COMMON"
require_text '^verify_host_receipt_signature\(\) \($' "$COMMON"
require_text 'local signature="\$\{receipt\}\.sig"' "$COMMON"
require_text 'iflag=nofollow,fullblock conv=excl' "$COMMON"
require_text 'signature_size == "64"' "$COMMON"
require_text 'host receipt trust anchor metadata is invalid' "$COMMON"
require_text 'host receipt detached Ed25519 signature is invalid' "$COMMON"
require_text '^write_receipt\(\) \($' "$COMMON"
require_text 'openssl pkeyutl -sign -rawin' "$COMMON"
require_text 'mv -T -- "\$signature_temporary" "\$signature_target"' "$COMMON"
require_text 'sync -f "\$receipt_dir"' "$COMMON"
require_text 'unlink "\$expired_receipt"' "$COMMON"
require_text 'unlink "\$expired_signature"' "$COMMON"
require_text '^invalidate_host_receipt\(\) \($' "$COMMON"
require_text 'receipt_published=true' "$COMMON"
require_text 'Removing the JSON first immediately makes the pair non-authoritative' "$COMMON"
RECEIPT_SIGNATURE_PUBLISH_LINE=$(grep -nE \
  'mv -T -- "\$signature_temporary" "\$signature_target"' \
  "$COMMON" | tail -n 1 | cut -d: -f1)
RECEIPT_JSON_PUBLISH_LINE=$(grep -nE \
  'mv -T -- "\$temporary" "\$target"' \
  "$COMMON" | tail -n 1 | cut -d: -f1)
[[ -n $RECEIPT_SIGNATURE_PUBLISH_LINE \
  && -n $RECEIPT_JSON_PUBLISH_LINE \
  && $RECEIPT_SIGNATURE_PUBLISH_LINE -lt $RECEIPT_JSON_PUBLISH_LINE ]] \
  || {
    printf '%s\n' \
      "host receipt signature must be published before its JSON" >&2
    exit 1
  }
require_order 'awk '\''NR >= 200' \
  'mv -T -- "\$signature_temporary" "\$signature_target"' "$COMMON"
require_order 'mv -T -- "\$temporary" "\$target"' \
  'receipt_published=true' "$COMMON"
require_order 'unlink "\$receipt"' 'unlink "\$signature"' "$COMMON"
require_text 'ONLYWAY_SECRETS_DIR="\$\{CANDIDATE_ROOT\}/runtime-secrets"' "$DEPLOY"
require_text 'ONLYWAY_ADMIN_PEPPER_FILE="\$\{CANDIDATE_ROOT\}/admin-secrets/admin-source-key-pepper"' "$DEPLOY"
require_text 'RELEASE_TRANSACTION_HAD_BACKUP_SERVICE_UNIT' "$TRANSACTION"
require_text 'RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT' "$TRANSACTION"
require_text 'RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE' "$TRANSACTION"
require_text 'RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ENABLED' "$TRANSACTION"
require_text 'systemctl start "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' "$TRANSACTION"
require_text '\.Config\.User == "2001:2001"' "$EVIDENCE"
require_text '^sign_release_attestation\(\)' "$EVIDENCE"
require_text 'ONLYWAY_ACCEPTANCE_PRIVATE_KEY' "$EVIDENCE"
require_text 'security-attestation\.json\.sig' "$EVIDENCE"
require_text 'deployment-attestation\.json\.sig' "$EVIDENCE"
require_text 'sync -f "\$ONLYWAY_CONFIG_DIR"' "$EVIDENCE"
require_text 'rehearsalReceiptFingerprint: \$rehearsalFingerprint' "$EVIDENCE"
require_text '\.openMaterialP2Findings == 0' "$EVIDENCE"
require_text '"artifactFingerprint", "branch", "completedAt", "contractVersion"' \
  "$EVIDENCE"
require_text 'assert_distinct_evidence_files "\$PRE_SCAN_TRUST_KEY" "\$TUNNEL_TRUST_KEY"' \
  "$EVIDENCE"
require_text 'distinct trust-anchor fingerprints' "$EVIDENCE"
require_text 'PASSKEY_USER_VERIFIED' "$EVIDENCE"
require_text '\$createdAt == \$stateCreatedAt' "$EVIDENCE"
require_text 'release-acceptance-ed25519\.pub\.pem,readonly' "$EVIDENCE"
require_text 'ATTESTATION_SIGNATURE="\$\{ATTESTATION\}\.sig"' "$SECURITY_READINESS"
require_text 'DEPLOYMENT_SIGNATURE="\$\{DEPLOYMENT_ATTESTATION\}\.sig"' "$PAYMENT_READINESS"
require_text 'deployment attestation is not bound to the rehearsal receipt' "$PAYMENT_READINESS"

require_text 'acquire_operation_lock production-rehearsal' "$REHEARSAL"
require_order '^STACK_STOPPED=true$' \
  '^systemctl stop "\$ONLYWAY_SYSTEMD_UNIT"$' "$REHEARSAL"

require_text 'verify_host_receipt_signature "\$file"' "$EVIDENCE"
require_text '^validate_legacy_signed_json_pair\(\)' "$EVIDENCE"
require_text 'legacy_verify_signed_json' "$EVIDENCE"
require_text 'ROLLBACK_LEGACY_WITHIN_RETENTION_V1' "$EVIDENCE"
require_text 'REQUIESCE_FOR_FORWARD_DEPLOY_V1' "$EVIDENCE"
require_text 'legacy cutover rollback evidence hash chain is invalid' "$EVIDENCE"
require_text 'ROLLBACK_FINGERPRINT=\$LEGACY_MIGRATION_FINGERPRINT' "$EVIDENCE"
reject_text '--rollback-receipt' "$EVIDENCE"
reject_text '--forward-deploy-receipt' "$EVIDENCE"
require_text 'postRebootBackupReceiptFingerprint=' "$EVIDENCE"
require_text 'postRebootBackupReceiptSignatureFingerprint=' "$EVIDENCE"
require_text 'receiptSignatureFingerprint' "$EVIDENCE"
require_text 'fail2ban-client get sshd maxretry' "$EVIDENCE"
require_text 'fail2ban-client get sshd findtime' "$EVIDENCE"
require_text 'fail2ban-client get sshd bantime' "$EVIDENCE"
require_text 'fail2ban-client get sshd journalmatch' "$EVIDENCE"
require_text 'systemctl is-enabled --quiet "\$timer"' "$EVIDENCE"
require_text 'systemctl is-active --quiet "\$timer"' "$EVIDENCE"
require_text 'APT::Periodic::Unattended-Upgrade "1";' "$EVIDENCE"
require_text 'UNATTENDED_UPGRADES_REPORT' "$EVIDENCE"

require_text '^enabled = true$' "$INSTALL_HOST"
require_text '^backend = systemd$' "$INSTALL_HOST"
require_text '^maxretry = 5$' "$INSTALL_HOST"
require_text '^findtime = 600$' "$INSTALL_HOST"
require_text '^bantime = 3600$' "$INSTALL_HOST"
require_text 'systemctl enable --now fail2ban\.service' "$INSTALL_HOST"
require_text 'conv=excl' "$COMMON"
require_text 'conv=excl' "$EVIDENCE"
require_order '^candidate_compose\(\) \{$' '^[[:space:]]*env \\$' "$DEPLOY"
require_order '^env \\$' '^ONLYWAY_RELEASE_COMMIT="\$COMMIT" \\$' "$DEPLOY"
require_order 'systemctl restart fail2ban\.service' \
  'fail2ban-client ping' "$INSTALL_HOST"
require_text 'systemctl enable --now apt-daily\.timer apt-daily-upgrade\.timer' \
  "$INSTALL_HOST"
require_text 'APT::Periodic::Update-Package-Lists "1";' "$INSTALL_HOST"
require_text 'APT::Periodic::Unattended-Upgrade "1";' "$INSTALL_HOST"
require_text '^verify_legacy_install_preflight_gate\(\) \($' "$INSTALL_HOST"
require_text 'legacy_verify_signed_json' "$INSTALL_HOST"
require_text 'legacy_validate_install_preflight_contract' "$INSTALL_HOST"
require_text 'legacy_capture_exact_inventory' "$INSTALL_HOST"
require_text 'legacy_assert_configuration_fingerprint' "$INSTALL_HOST"
require_text 'ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1' "$INSTALL_HOST"
require_text '\$\{#LEGACY_CONTAINER_SPECS\[@\]\} -eq 4' "$INSTALL_HOST"
require_order '^verify_legacy_install_preflight_gate$' \
  '^if \$DRY_RUN; then$' "$INSTALL_HOST"
require_order '^verify_legacy_install_preflight_gate$' \
  '^export DEBIAN_FRONTEND=noninteractive$' "$INSTALL_HOST"
require_order '^verify_legacy_install_preflight_gate$' \
  '^apt-get update$' "$INSTALL_HOST"
require_order '^verify_legacy_install_preflight_gate$' \
  '^systemctl enable --now docker\.service containerd\.service$' \
  "$INSTALL_HOST"
require_text 'fail2ban-client get sshd journalmatch' "$CONFIRM_SSH"
require_text 'apt-daily-upgrade\.timer' "$CONFIRM_SSH"
require_text '"\$\{RECEIPT\}\.sig" "\$CONFIRMATION_SIGNATURE_TEMPORARY"' \
  "$CONFIRM_SSH"
require_text 'verify_host_receipt_signature "\$ONLYWAY_SSH_HARDENING_CONFIRMATION"' \
  "$CONFIRM_SSH"

require_text 'systemctl is-enabled --quiet "\$ONLYWAY_SYSTEMD_UNIT"' \
  "$REBOOT_RECOVERY"
require_text 'systemctl is-active --quiet "\$ONLYWAY_SYSTEMD_UNIT"' \
  "$REBOOT_RECOVERY"
require_text 'systemctl is-enabled --quiet "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' \
  "$REBOOT_RECOVERY"
require_text 'systemctl is-active --quiet "\$ONLYWAY_BACKUP_SYSTEMD_TIMER"' \
  "$REBOOT_RECOVERY"
require_text 'systemctl start "\$ONLYWAY_BACKUP_SYSTEMD_SERVICE"' \
  "$REBOOT_RECOVERY"
require_text 'postRebootBackupServiceResult=success' "$REBOOT_RECOVERY"
require_text 'postRebootBackupReceiptFingerprint=' "$REBOOT_RECOVERY"
require_text 'postRebootBackupReceiptSignatureFingerprint=' "$REBOOT_RECOVERY"

require_text 'expect_rejection "tampered receipt content"' \
  "$HOST_RECEIPT_CONTRACT"
require_text 'expect_rejection "missing detached signature"' \
  "$HOST_RECEIPT_CONTRACT"
require_text 'expect_rejection "signature from an untrusted key"' \
  "$HOST_RECEIPT_CONTRACT"
require_text '"receipt ID drift"' "$LEGACY_INSTALL_CONTRACT"
require_text '"expired receipt"' "$LEGACY_INSTALL_CONTRACT"
require_text 'expect_rejection "tampered receipt content"' \
  "$LEGACY_INSTALL_SIGNATURE_CONTRACT"
require_text '"missing detached signature"' \
  "$LEGACY_INSTALL_SIGNATURE_CONTRACT"
require_text '"signature verified with an untrusted key"' \
  "$LEGACY_INSTALL_SIGNATURE_CONTRACT"

printf '%s\n' "release pipeline static checks: PASS"
