#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
acquire_operation_lock production-rehearsal
source_compose_environment
require_command jq
require_command sha256sum
require_command stat
require_command df
require_command du
require_command docker
require_command systemctl
COMMIT=${ONLYWAY_RELEASE_COMMIT:-}
require_commit "$COMMIT"
[[ $(basename -- "$(current_release)") == "$COMMIT" ]] \
  || die "production rehearsal release identity is invalid"

DATABASE="${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite"
ADMIN_STATE=$ONLYWAY_ADMIN_SECURITY_STATE_FILE
[[ -f $DATABASE && ! -L $DATABASE ]] \
  || die "production rehearsal requires the live SQLite database"
[[ -f $ADMIN_STATE && ! -L $ADMIN_STATE ]] \
  || die "production rehearsal requires durable Admin Security state"
DATABASE_KIB=$(du -k --apparent-size "$DATABASE" | awk '{print $1}')
ADMIN_STATE_KIB=$(du -k --apparent-size "$ADMIN_STATE" | awk '{print $1}')
AVAILABLE_KIB=$(df -Pk "$ONLYWAY_DATA_DIR" | awk 'NR == 2 {print $4}')
[[ $DATABASE_KIB =~ ^[0-9]{1,15}$ \
  && $ADMIN_STATE_KIB =~ ^[0-9]{1,15}$ \
  && $AVAILABLE_KIB =~ ^[0-9]{1,15}$ ]] \
  || die "production rehearsal disk-space check is invalid"
REQUIRED_KIB=$((DATABASE_KIB * 3 + ADMIN_STATE_KIB * 2 + 524288))
((AVAILABLE_KIB >= REQUIRED_KIB)) \
  || die "insufficient free space for the durable production rehearsal"

systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
  || die "production rehearsal requires the H24 unit to be active"
STACK_STOPPED=false
STACK_START_ATTEMPTED=false
STACK_READINESS_VERIFIED=false
HOST_RUN_DIR=
POINTER_UNSIGNED=
POINTER_TEMPORARY=
POINTER_PUBLISHED=false
cleanup_incomplete_rehearsal() {
  local rehearsal_root
  local canonical_run
  [[ $POINTER_PUBLISHED == "false" && -n $HOST_RUN_DIR ]] \
    || return 0
  [[ -e $HOST_RUN_DIR || -L $HOST_RUN_DIR ]] || return 0
  rehearsal_root=$(readlink -f -- "${ONLYWAY_DATA_DIR}/rehearsals")
  canonical_run=$(readlink -f -- "$HOST_RUN_DIR")
  [[ -d $HOST_RUN_DIR \
    && ! -L $HOST_RUN_DIR \
    && $(basename -- "$HOST_RUN_DIR") =~ \
      ^vps-[0-9]{8}t[0-9]{6}z-[0-9]+$ \
    && $canonical_run == "${rehearsal_root}/"* ]] \
    || return 1
  find "$HOST_RUN_DIR" -xdev -depth -delete
}
cleanup_pointer_temporaries() {
  local temporary
  for temporary in "$POINTER_UNSIGNED" "$POINTER_TEMPORARY"; do
    [[ -n $temporary ]] || continue
    if [[ ! -e $temporary && ! -L $temporary ]]; then
      continue
    fi
    [[ -f $temporary \
      && ! -L $temporary \
      && $temporary == \
        "${ONLYWAY_RUN_DIR}/receipts/.rehearsal-pointer"* ]] \
      || return 1
    unlink "$temporary" || return 1
  done
}
restart_stack_on_exit() {
  local status=$?
  trap - EXIT
  if ! cleanup_pointer_temporaries; then
    log "CRITICAL: production rehearsal temporary pointer cleanup failed"
    status=1
  fi
  if ! cleanup_incomplete_rehearsal; then
    log "CRITICAL: incomplete production rehearsal cleanup failed"
    status=1
  fi
  if [[ $STACK_STOPPED == "true" ]]; then
    if [[ $STACK_START_ATTEMPTED == "true" \
      && $STACK_READINESS_VERIFIED == "false" ]]; then
      systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || true
      log "CRITICAL: the H24 unit remains stopped because post-rehearsal readiness failed"
      status=1
    elif [[ $STACK_START_ATTEMPTED == "false" ]]; then
      STACK_START_ATTEMPTED=true
      if systemctl start "$ONLYWAY_SYSTEMD_UNIT" \
        && "$(current_release)/scripts/production/readiness.sh" \
          --attempts 24 \
          --interval 5 \
          --expected-commit "$COMMIT" \
          --expected-kind READINESS \
          --expected-provider-mode OFFLINE_REHEARSAL >/dev/null; then
        STACK_READINESS_VERIFIED=true
      else
        systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || true
        log "CRITICAL: production rehearsal cleanup could not restore a ready H24 unit"
        status=1
      fi
    fi
  fi
  exit "$status"
}
trap restart_stack_on_exit EXIT
STACK_STOPPED=true
systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
RUNNING_CONTAINERS=$(compose ps --status running --quiet)
[[ -z $RUNNING_CONTAINERS ]] \
  || die "production rehearsal could not quiesce every runtime container"

# The internal network has no provider egress. This runs the same deterministic
# production rehearsal command shipped in the verified application image.
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
RUN_ID="vps-$(date -u +%Y%m%dt%H%M%Sz)-$$"
HOST_RUN_DIR="${ONLYWAY_DATA_DIR}/rehearsals/${RUN_ID}"
CONTAINER_RUN_DIR="/var/lib/onlyway/rehearsals/${RUN_ID}"
install -d -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0700 \
  "$HOST_RUN_DIR"
compose --profile operations run --rm --no-deps backup-verifier \
  npm run production-rehearsal -- \
  --database "${CONTAINER_RUN_DIR}/source.sqlite" \
  --backup "${CONTAINER_RUN_DIR}/backup.sqlite" \
  --restore "${CONTAINER_RUN_DIR}/restored.sqlite" \
  --receipt "${CONTAINER_RUN_DIR}/receipt.json" \
  --run-id "$RUN_ID" \
  --started-at "$STARTED_AT"
[[ -f "${HOST_RUN_DIR}/receipt.json" ]] \
  || die "production rehearsal completed without a durable receipt"
if find "$HOST_RUN_DIR" -type l -print -quit | grep -q .; then
  die "production rehearsal emitted an unexpected symlink"
fi
while IFS= read -r -d '' artifact; do
  [[ ! -L $artifact \
    && $(stat -c '%u:%g' "$artifact") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
    || die "production rehearsal artifact ownership or type is invalid"
  if [[ -d $artifact ]]; then
    [[ $(stat -c '%a' "$artifact") == "700" ]] \
      || die "production rehearsal directory mode is not private"
  elif [[ -f $artifact ]]; then
    [[ $(stat -c '%a' "$artifact") == "600" ]] \
      || die "production rehearsal file mode is not private"
  else
    die "production rehearsal emitted an unsupported artifact type"
  fi
done < <(find "$HOST_RUN_DIR" -xdev -print0)
RECEIPT="${HOST_RUN_DIR}/receipt.json"
[[ $(stat -c '%u:%g' "$RECEIPT") == \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" \
  && $(stat -c '%a' "$RECEIPT") == "600" \
  && $(stat -c '%s' "$RECEIPT") -le 1048576 ]] \
  || die "production rehearsal receipt metadata is invalid"
jq -e '
  .contractVersion == "1" and
  .status == "PASSED" and
  .providerMode == "OFFLINE_REHEARSAL" and
  .externalEffectsExecuted == false and
  .paidProviderCalls == 0 and
  .costCents == 0 and
  .authorization.publicationKillSwitch.finalLocked == true and
  .recovery.fullDatabaseReopenVerified == true and
  (.receiptFingerprint | test("^[a-f0-9]{64}$"))
' "$RECEIPT" >/dev/null \
  || die "production rehearsal receipt contract is invalid"
RECEIPT_FINGERPRINT=$(jq -r '.receiptFingerprint' "$RECEIPT")
FILE_FINGERPRINT=$(sha256sum "$RECEIPT" | awk '{print $1}')

STACK_START_ATTEMPTED=true
systemctl start "$ONLYWAY_SYSTEMD_UNIT"
"$(current_release)/scripts/production/readiness.sh" \
  --attempts 24 \
  --interval 5 \
  --expected-commit "$COMMIT" \
  --expected-kind READINESS \
  --expected-provider-mode OFFLINE_REHEARSAL >/dev/null
STACK_READINESS_VERIFIED=true

RECORDED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RECEIPT_DIR="${ONLYWAY_RUN_DIR}/receipts"
LATEST_POINTER="${RECEIPT_DIR}/latest-production-rehearsal.json"
install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 "$RECEIPT_DIR"
if [[ -e $LATEST_POINTER || -L $LATEST_POINTER ]]; then
  [[ -f $LATEST_POINTER && ! -L $LATEST_POINTER \
    && $(stat -c '%u:%g' "$LATEST_POINTER") == "0:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$LATEST_POINTER") == "640" ]] \
    || die "existing latest rehearsal pointer is unsafe"
fi
POINTER_UNSIGNED=$(mktemp "${RECEIPT_DIR}/.rehearsal-pointer-unsigned.XXXXXX")
POINTER_TEMPORARY=$(mktemp "${RECEIPT_DIR}/.rehearsal-pointer.XXXXXX")
jq -S -n \
  --arg commit "$COMMIT" \
  --arg fileFingerprint "$FILE_FINGERPRINT" \
  --arg receiptFingerprint "$RECEIPT_FINGERPRINT" \
  --arg receiptPath "$RECEIPT" \
  --arg recordedAt "$RECORDED_AT" \
  '{
    commit: $commit,
    contractVersion: "1",
    fileFingerprint: $fileFingerprint,
    kind: "PRODUCTION_REHEARSAL_POINTER",
    receiptFingerprint: $receiptFingerprint,
    receiptPath: $receiptPath,
    recordedAt: $recordedAt
  }' >"$POINTER_UNSIGNED"
CANONICAL_POINTER=$(jq -Sc . "$POINTER_UNSIGNED")
POINTER_FINGERPRINT=$(printf '%s' "$CANONICAL_POINTER" \
  | sha256sum | awk '{print $1}')
jq -S --arg pointerFingerprint "$POINTER_FINGERPRINT" \
  '. + {pointerFingerprint: $pointerFingerprint}' \
  "$POINTER_UNSIGNED" >"$POINTER_TEMPORARY"
unlink "$POINTER_UNSIGNED"
POINTER_UNSIGNED=
chown root:"$ONLYWAY_SERVICE_GROUP" "$POINTER_TEMPORARY"
chmod 0640 "$POINTER_TEMPORARY"
mv -fT -- "$POINTER_TEMPORARY" "$LATEST_POINTER"
POINTER_TEMPORARY=
POINTER_PUBLISHED=true
HOST_RECEIPT=$(write_receipt \
  "production-rehearsal" \
  "OFFLINE_REHEARSAL_PASSED" \
  "$COMMIT" \
  "${RUN_ID};${FILE_FINGERPRINT}")

REHEARSAL_ROOT="${ONLYWAY_DATA_DIR}/rehearsals"
mapfile -t REHEARSAL_RUNS < <(
  find "$REHEARSAL_ROOT" -mindepth 1 -maxdepth 1 -type d \
    -name 'vps-*' -printf '%T@ %p\n' \
    | sort -nr \
    | awk '{sub(/^[^ ]+ /, ""); print}'
)
for ((index = 3; index < ${#REHEARSAL_RUNS[@]}; index += 1)); do
  candidate=${REHEARSAL_RUNS[$index]}
  [[ $candidate != "$HOST_RUN_DIR" \
    && $(basename -- "$candidate") =~ ^vps-[0-9]{8}t[0-9]{6}z-[0-9]+$ \
    && ! -L $candidate \
    && $(readlink -f -- "$candidate") == \
      "$(readlink -f -- "$REHEARSAL_ROOT")/"* ]] \
    || die "rehearsal retention encountered an unsafe path"
  if find "$candidate" -xdev -type l -print -quit | grep -q .; then
    die "rehearsal retention encountered a symlinked bundle"
  fi
  find "$candidate" -xdev -depth -delete
done
trap - EXIT
log "offline production rehearsal ${RUN_ID}: PASSED"
printf 'REHEARSAL_RECEIPT=%s\n' "$RECEIPT"
printf 'REHEARSAL_POINTER=%s\n' "$LATEST_POINTER"
printf 'HOST_RECEIPT=%s\n' "$HOST_RECEIPT"
