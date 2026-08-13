#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

ACTION=${1:-}
shift || true
COMMIT=${ONLYWAY_RELEASE_COMMIT:-}
while (($# > 0)); do
  case "$1" in
    --commit)
      [[ $# -ge 2 ]] || die "--commit requires a value"
      COMMIT=$2
      shift
      ;;
    *)
      die "usage: $0 <prepare|verify> --commit FULL_SHA"
      ;;
  esac
  shift
done

[[ $ACTION == "prepare" || $ACTION == "verify" ]] \
  || die "usage: $0 <prepare|verify> --commit FULL_SHA"
require_root
require_commit "$COMMIT"
ensure_layout_exists
acquire_operation_lock reboot-recovery-evidence
source_compose_environment
[[ ${ONLYWAY_RELEASE_COMMIT:-} == "$COMMIT" ]] \
  || die "Compose environment is not bound to the requested commit"
for command in jq sha256sum stat systemctl; do
  require_command "$command"
done

RELEASE=$(current_release) || die "current release is unavailable"
RELEASE=$(validate_release_path "$RELEASE")
[[ $(basename -- "$RELEASE") == "$COMMIT" ]] \
  || die "current release is not the requested commit"
verify_release_checkout "$RELEASE" "$COMMIT"
PROBE_DIR="${ONLYWAY_RUN_DIR}/reboot-probes"
PROBE="${PROBE_DIR}/pending-${COMMIT}.json"
POST_REBOOT_BACKUP_MARKER=

cleanup() {
  if [[ -n ${POST_REBOOT_BACKUP_MARKER:-} \
    && -f $POST_REBOOT_BACKUP_MARKER \
    && ! -L $POST_REBOOT_BACKUP_MARKER \
    && $POST_REBOOT_BACKUP_MARKER == \
      "${ONLYWAY_RUN_DIR}/.post-reboot-backup-marker."* ]]; then
    unlink "$POST_REBOOT_BACKUP_MARKER"
  fi
}
trap cleanup EXIT

canonical_fingerprint() {
  local file=$1
  local filter=${2:-.}
  local canonical
  canonical=$(jq -Sc "$filter" "$file")
  printf '%s' "$canonical" | sha256sum | awk '{print $1}'
}

validate_boot_id() {
  [[ $1 =~ ^[a-f0-9-]{32,36}$ ]] \
    || die "kernel boot identity is invalid"
}

if [[ $ACTION == "prepare" ]]; then
  [[ ! -e $PROBE && ! -L $PROBE ]] \
    || die "a reboot recovery probe is already pending for this commit"
  "${RELEASE}/scripts/production/release-preflight.sh" \
    --expected-commit "$COMMIT"
  "${RELEASE}/scripts/production/readiness.sh" \
    --expected-commit "$COMMIT" \
    --attempts 24 \
    --interval 5 >/dev/null
  BOOT_ID=$(<"/proc/sys/kernel/random/boot_id")
  validate_boot_id "$BOOT_ID"
  install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 "$PROBE_DIR"
  TEMPORARY=$(mktemp "${PROBE_DIR}/.reboot-probe.XXXXXX")
  jq -S -n \
    --arg bootId "$BOOT_ID" \
    --arg commit "$COMMIT" \
    --arg preparedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{
      bootIdBefore: $bootId,
      commit: $commit,
      contractVersion: "1",
      kind: "REBOOT_RECOVERY_PROBE",
      preparedAt: $preparedAt,
      status: "AWAITING_REBOOT"
    }' >"${TEMPORARY}.unsigned"
  FINGERPRINT=$(canonical_fingerprint "${TEMPORARY}.unsigned")
  jq -S --arg fingerprint "$FINGERPRINT" \
    '. + {fingerprint: $fingerprint}' \
    "${TEMPORARY}.unsigned" >"$TEMPORARY"
  unlink "${TEMPORARY}.unsigned"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$TEMPORARY"
  chmod 0640 "$TEMPORARY"
  mv -T -- "$TEMPORARY" "$PROBE"
  printf 'REBOOT_PROBE=%s\n' "$PROBE"
  printf '%s\n' \
    "Probe armed. Reboot the VPS through the approved operator procedure, reconnect with the SSH key, then run: sudo ${RELEASE}/scripts/production/reboot-recovery-evidence.sh verify --commit ${COMMIT}"
  exit 0
fi

[[ -f $PROBE && ! -L $PROBE ]] \
  || die "a pre-reboot probe is unavailable for this commit"
[[ $(stat -c '%u:%g' "$PROBE") == "0:${ONLYWAY_GID}" \
  && $(stat -c '%a' "$PROBE") == "640" \
  && $(stat -c '%s' "$PROBE") -le 65536 ]] \
  || die "pre-reboot probe metadata is invalid"
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "REBOOT_RECOVERY_PROBE" and
    .status == "AWAITING_REBOOT" and
    .commit == $commit and
    (.bootIdBefore | type == "string") and
    (.preparedAt | type == "string") and
    (.fingerprint | test("^[a-f0-9]{64}$"))
  ' "$PROBE" >/dev/null \
  || die "pre-reboot probe contract is invalid"
[[ $(canonical_fingerprint "$PROBE" 'del(.fingerprint)') == \
  "$(jq -r '.fingerprint' "$PROBE")" ]] \
  || die "pre-reboot probe fingerprint is invalid"
BOOT_ID_BEFORE=$(jq -r '.bootIdBefore' "$PROBE")
BOOT_ID_AFTER=$(<"/proc/sys/kernel/random/boot_id")
validate_boot_id "$BOOT_ID_BEFORE"
validate_boot_id "$BOOT_ID_AFTER"
[[ $BOOT_ID_AFTER != "$BOOT_ID_BEFORE" ]] \
  || die "kernel boot identity did not change; no reboot can be attested"
systemctl is-enabled --quiet "$ONLYWAY_SYSTEMD_UNIT" \
  || die "production unit is not enabled after reboot"
systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
  || die "production unit is not active after reboot"
systemctl is-enabled --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "backup timer is not enabled after reboot"
systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "backup timer is not active after reboot"
"${RELEASE}/scripts/production/release-preflight.sh" \
  --expected-commit "$COMMIT"
"${RELEASE}/scripts/production/readiness.sh" \
  --expected-commit "$COMMIT" \
  --attempts 24 \
  --interval 5 >/dev/null
POST_REBOOT_BACKUP_MARKER=$(mktemp \
  "${ONLYWAY_RUN_DIR}/.post-reboot-backup-marker.XXXXXX")
systemctl reset-failed "$ONLYWAY_BACKUP_SYSTEMD_SERVICE" || true
systemctl start "$ONLYWAY_BACKUP_SYSTEMD_SERVICE"
[[ $(systemctl show "$ONLYWAY_BACKUP_SYSTEMD_SERVICE" \
    --property=Result --value) == "success" \
  && $(systemctl show "$ONLYWAY_BACKUP_SYSTEMD_SERVICE" \
    --property=ExecMainStatus --value) == "0" ]] \
  || die "post-reboot backup service did not complete successfully"
systemctl is-enabled --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "backup timer lost enablement during post-reboot backup"
systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "backup timer is not active after post-reboot backup"
mapfile -t POST_REBOOT_BACKUP_RECEIPTS < <(
  find "${ONLYWAY_RUN_DIR}/receipts" \
    -mindepth 1 -maxdepth 1 -type f \
    -name '[0-9]*-backup-[0-9]*.json' \
    -newer "$POST_REBOOT_BACKUP_MARKER" \
    -printf '%T@ %p\n' \
    | sort -nr \
    | awk '{sub(/^[^ ]+ /, ""); print}'
)
[[ ${#POST_REBOOT_BACKUP_RECEIPTS[@]} -eq 1 ]] \
  || die "post-reboot backup did not emit exactly one new receipt"
POST_REBOOT_BACKUP_RECEIPT=${POST_REBOOT_BACKUP_RECEIPTS[0]}
verify_host_receipt_signature "$POST_REBOOT_BACKUP_RECEIPT" >/dev/null
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .action == "backup" and
    .status == "VERIFIED_RESTORE_PROBE_PASSED" and
    .commit == $commit and
    .secretsExposed == false
  ' "$POST_REBOOT_BACKUP_RECEIPT" >/dev/null \
  || die "post-reboot backup receipt contract is invalid"
POST_REBOOT_BACKUP_FINGERPRINT=$(sha256sum \
  "$POST_REBOOT_BACKUP_RECEIPT" | awk '{print $1}')
[[ $POST_REBOOT_BACKUP_FINGERPRINT =~ ^[a-f0-9]{64}$ ]] \
  || die "post-reboot backup receipt fingerprint is invalid"
POST_REBOOT_BACKUP_SIGNATURE_FINGERPRINT=$(sha256sum \
  "${POST_REBOOT_BACKUP_RECEIPT}.sig" | awk '{print $1}')
[[ $POST_REBOOT_BACKUP_SIGNATURE_FINGERPRINT =~ ^[a-f0-9]{64}$ ]] \
  || die "post-reboot backup receipt signature fingerprint is invalid"
RECEIPT=$(write_receipt \
  "reboot-recovery" \
  "REBOOT_RECOVERY_VERIFIED" \
  "$COMMIT" \
  "bootIdentityChanged=true;productionUnitEnabledActive=true;backupTimerEnabledActive=true;postRebootBackupServiceResult=success;postRebootBackupReceipt=$(basename -- "$POST_REBOOT_BACKUP_RECEIPT");postRebootBackupReceiptFingerprint=${POST_REBOOT_BACKUP_FINGERPRINT};postRebootBackupReceiptSignatureFingerprint=${POST_REBOOT_BACKUP_SIGNATURE_FINGERPRINT}")
unlink "$PROBE"
unlink "$POST_REBOOT_BACKUP_MARKER"
POST_REBOOT_BACKUP_MARKER=
trap - EXIT
printf 'REBOOT_RECEIPT=%s\n' "$RECEIPT"
printf 'POST_REBOOT_BACKUP_RECEIPT=%s\n' \
  "$POST_REBOOT_BACKUP_RECEIPT"
