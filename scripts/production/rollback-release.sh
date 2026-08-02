#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/production/lib/release-transaction.sh
source "${SCRIPT_DIR}/lib/release-transaction.sh"

TARGET_COMMIT=
CONFIRM=
while (($# > 0)); do
  case "$1" in
    --commit) [[ $# -ge 2 ]] || die "--commit requires a value"; TARGET_COMMIT=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || die "--confirm requires a value"; CONFIRM=$2; shift ;;
    *) die "usage: $0 [--commit FULL_SHA] --confirm ROLLBACK" ;;
  esac
  shift
done

require_root
[[ $CONFIRM == "ROLLBACK" ]] || die "rollback requires --confirm ROLLBACK"
ensure_layout_exists
acquire_operation_lock rollback-release
source_compose_environment
for command in docker git jq openssl sha256sum systemctl systemd-analyze; do
  require_command "$command"
done

CURRENT=$(current_release) || die "current release is unavailable"
CURRENT=$(validate_release_path "$CURRENT")
CURRENT_COMMIT=$(basename -- "$CURRENT")
require_commit "$CURRENT_COMMIT"
verify_release_checkout "$CURRENT" "$CURRENT_COMMIT"
CURRENT_MARKER=$(acceptance_marker_path "$CURRENT_COMMIT")
CURRENT_IMAGE_ID=$(jq -r '.imageId // empty' "$CURRENT_MARKER")
verify_release_acceptance_marker "$CURRENT_COMMIT" "$CURRENT_IMAGE_ID" >/dev/null
[[ $(git -C "$CURRENT" rev-parse 'HEAD^{tree}') == "$(jq -r '.gitTree' "$CURRENT_MARKER")" ]] \
  || die "current release Git tree does not match signed acceptance"
verify_release_image "$CURRENT_COMMIT" "$CURRENT_IMAGE_ID" >/dev/null
if [[ -n $TARGET_COMMIT ]]; then
  require_commit "$TARGET_COMMIT"
  TARGET="${ONLYWAY_RELEASES_DIR}/${TARGET_COMMIT}"
else
  [[ -f "${ONLYWAY_RUN_DIR}/previous-release" \
    && ! -L "${ONLYWAY_RUN_DIR}/previous-release" ]] \
    || die "previous release record is unavailable or invalid"
  TARGET=$(<"${ONLYWAY_RUN_DIR}/previous-release")
fi
TARGET=$(validate_release_path "$TARGET")
[[ $TARGET != "$CURRENT" ]] || die "rollback target is already current"
TARGET_COMMIT=$(basename -- "$TARGET")
require_commit "$TARGET_COMMIT"

verify_release_checkout "$TARGET" "$TARGET_COMMIT"
TARGET_MARKER=$(acceptance_marker_path "$TARGET_COMMIT")
TARGET_IMAGE_ID=$(jq -r '.imageId // empty' "$TARGET_MARKER")
verify_release_acceptance_marker "$TARGET_COMMIT" "$TARGET_IMAGE_ID" >/dev/null
[[ $(git -C "$TARGET" rev-parse 'HEAD^{tree}') == "$(jq -r '.gitTree' "$TARGET_MARKER")" ]] \
  || die "rollback target Git tree does not match signed acceptance"
verify_release_image "$TARGET_COMMIT" "$TARGET_IMAGE_ID" >/dev/null

ONLYWAY_RELEASE_COMMIT="$TARGET_COMMIT" \
ONLYWAY_DATA_DIR="$ONLYWAY_DATA_DIR" \
ONLYWAY_BACKUP_DIR="$ONLYWAY_BACKUP_DIR" \
ONLYWAY_CONFIG_DIR="$ONLYWAY_CONFIG_DIR" \
ONLYWAY_ADMIN_STATE_DIR="$ONLYWAY_ADMIN_STATE_DIR" \
ONLYWAY_SECRETS_DIR="$ONLYWAY_SECRETS_DIR" \
ONLYWAY_ADMIN_SECRETS_DIR="$ONLYWAY_ADMIN_SECRETS_DIR" \
ONLYWAY_ADMIN_BOOTSTRAP_DIR="$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
ONLYWAY_ADMIN_PEPPER_FILE="$ONLYWAY_ADMIN_PEPPER_FILE" \
  docker compose \
    --project-directory "$TARGET" \
    --file "${TARGET}/compose.production.yml" \
    config --quiet
validate_release_systemd_units "$TARGET" \
  || die "rollback target systemd units failed validation"

ROLLBACK_STEP=transaction-snapshot
FAILURE_RECEIPT_WRITTEN=false
SUCCESS_RECEIPT=
ROLLBACK_START_ATTEMPTED=false
ROLLBACK_BACKUP=

create_rollback_backup() {
  local output
  local manifest
  output=$(mktemp "${ONLYWAY_RUN_DIR}/.rollback-backup-output.XXXXXX")
  "${CURRENT}/scripts/production/backup.sh" >"$output"
  ROLLBACK_BACKUP=$(awk -F= \
    '$1 == "BACKUP_FILE" {print substr($0, index($0, "=") + 1)}' "$output")
  manifest=$(awk -F= \
    '$1 == "BACKUP_MANIFEST" {print substr($0, index($0, "=") + 1)}' "$output")
  unlink "$output"
  [[ -f $ROLLBACK_BACKUP && ! -L $ROLLBACK_BACKUP \
    && -f $manifest && ! -L $manifest \
    && $(readlink -f -- "$manifest") == "$(readlink -f -- "${ROLLBACK_BACKUP}.manifest.json")" ]] \
    || die "rollback pre-mutation backup is invalid"
}

record_failure() {
  local status=$1
  local detail=$2
  if [[ $FAILURE_RECEIPT_WRITTEN == "false" ]]; then
    write_receipt "rollback-release" "$status" "$TARGET_COMMIT" "$detail" >/dev/null \
      && FAILURE_RECEIPT_WRITTEN=true \
      || log "ERROR: unable to persist the failed rollback receipt"
  fi
}

on_exit() {
  local exit_code=$?
  local restored=true
  trap - EXIT
  set +e
  if ((exit_code != 0)) && [[ $RELEASE_TRANSACTION_ACTIVE == "true" \
    && $RELEASE_TRANSACTION_COMMITTED == "false" ]]; then
    if [[ $ROLLBACK_START_ATTEMPTED == "true" ]]; then
      restore_release_transaction false || restored=false
      if [[ $restored == "true" ]]; then
        "${CURRENT}/scripts/production/restore.sh" \
          --backup "$ROLLBACK_BACKUP" \
          --confirm RESTORE \
          || restored=false
        if [[ $restored == "true" \
          && $RELEASE_TRANSACTION_WAS_ACTIVE == "false" ]]; then
          systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || restored=false
        fi
      fi
    else
      restore_release_transaction || restored=false
    fi
    if [[ -n $SUCCESS_RECEIPT ]]; then
      if invalidate_host_receipt \
        "$SUCCESS_RECEIPT" \
        "rollback-release" \
        "ROLLBACK_COMPLETED_ACCEPTED" \
        "$TARGET_COMMIT"; then
        SUCCESS_RECEIPT=
      else
        restored=false
      fi
    fi
    if [[ $restored == "true" ]]; then
      discard_release_transaction_snapshot || restored=false
    fi
    if [[ $restored == "true" ]]; then
      record_failure "FAILED_ORIGINAL_STATE_RESTORED" \
        "rollback failed at ${ROLLBACK_STEP}; original env, symlink, unit and systemd state restored"
    else
      record_failure "FAILED_ORIGINAL_STATE_INCOMPLETE" \
        "rollback failed at ${ROLLBACK_STEP}; automatic restoration is incomplete and the service is fail-closed"
      log "ERROR: preserving rollback transaction snapshot for recovery"
    fi
  fi
  exit "$exit_code"
}
trap on_exit EXIT

begin_release_transaction
ROLLBACK_STEP=stop-backup-schedule
if [[ $RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT == "true" \
  || $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE == "true" ]]; then
  systemctl stop "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
fi
ROLLBACK_STEP=stop-current
systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
ROLLBACK_STEP=coherent-pre-rollback-backup
create_rollback_backup
ROLLBACK_STEP=install-target-unit
install -o root -g root -m 0644 \
  "${TARGET}/ops/systemd/mv-ai-os.service" \
  "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}"
install -o root -g root -m 0644 \
  "${TARGET}/ops/systemd/mv-ai-os-backup.service" \
  "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}"
install -o root -g root -m 0644 \
  "${TARGET}/ops/systemd/mv-ai-os-backup.timer" \
  "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}"
ROLLBACK_STEP=write-target-environment
write_compose_environment "$TARGET_COMMIT"
ROLLBACK_STEP=switch-current
atomic_switch_current "$TARGET"
ROLLBACK_STEP=daemon-reload
systemctl daemon-reload
ROLLBACK_STEP=enable-unit
systemctl enable "$ONLYWAY_SYSTEMD_UNIT" "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
ROLLBACK_STEP=start-backup-timer
systemctl start "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "rollback target backup timer did not become active"
ROLLBACK_STEP=start-target
ROLLBACK_START_ATTEMPTED=true
systemctl restart "$ONLYWAY_SYSTEMD_UNIT"

ROLLBACK_STEP=target-readiness
TARGET_CONTAINER=$(docker ps --no-trunc \
  --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
  --filter "label=com.docker.compose.service=command-center" \
  --format '{{.ID}}')
[[ $TARGET_CONTAINER =~ ^[0-9a-f]{64}$ ]] \
  || die "rollback target Command Center container identity is invalid"
"${TARGET}/scripts/production/readiness.sh" \
  --attempts 24 \
  --interval 5 \
  --expected-commit "$TARGET_COMMIT" \
  --expected-image-id "$TARGET_IMAGE_ID" \
  --expected-kind READINESS \
  --expected-provider-mode OFFLINE_REHEARSAL \
  --compose-project "$ONLYWAY_COMPOSE_PROJECT" \
  --container-id "$TARGET_CONTAINER" >/dev/null
"${TARGET}/scripts/production/release-preflight.sh" \
  --expected-commit "$TARGET_COMMIT"
ROLLBACK_STEP=target-runtime-identity
assert_private_running_stack \
  "$ONLYWAY_COMPOSE_PROJECT" "$TARGET_COMMIT" "$TARGET_IMAGE_ID" "43100"

ROLLBACK_STEP=previous-release-record
PREVIOUS_TEMPORARY=$(mktemp "${ONLYWAY_RUN_DIR}/.previous-release.XXXXXX")
printf '%s\n' "$CURRENT" >"$PREVIOUS_TEMPORARY"
chown root:"$ONLYWAY_SERVICE_GROUP" "$PREVIOUS_TEMPORARY"
chmod 0640 "$PREVIOUS_TEMPORARY"
mv -T -- "$PREVIOUS_TEMPORARY" "${ONLYWAY_RUN_DIR}/previous-release"

ROLLBACK_STEP=success-receipt
SUCCESS_RECEIPT=$(write_receipt \
  "rollback-release" \
  "ROLLBACK_COMPLETED_ACCEPTED" \
  "$TARGET_COMMIT" \
  "${TARGET_IMAGE_ID}; signed acceptance, exact image, confinement and private readiness passed")
ROLLBACK_STEP=commit-release-transaction
commit_release_transaction
SUCCESS_RECEIPT=
trap - EXIT
log "rollback to accepted release ${TARGET_COMMIT} completed"
