#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

BACKUP=
CONFIRM=
while (($# > 0)); do
  case "$1" in
    --backup) [[ $# -ge 2 ]] || die "--backup requires a value"; BACKUP=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || die "--confirm requires a value"; CONFIRM=$2; shift ;;
    *) die "usage: $0 --backup ABSOLUTE_BACKUP.sqlite --confirm RESTORE" ;;
  esac
  shift
done

require_root
[[ $CONFIRM == "RESTORE" ]] || die "restore requires --confirm RESTORE"
require_absolute_path "$BACKUP" "backup"
ensure_layout_exists
acquire_operation_lock restore
source_compose_environment
require_command curl
require_command gpg
require_command jq
require_command sha256sum
require_command sqlite3
require_command sync
require_command systemctl

BACKUP_ENCRYPTION_KEY=${ONLYWAY_BACKUP_ENCRYPTION_KEY_FILE:-/srv/onlyway/secrets/backup/backup-encryption-passphrase}
[[ -f $BACKUP_ENCRYPTION_KEY && ! -L $BACKUP_ENCRYPTION_KEY \
  && $(stat -c '%u:%g:%a' "$BACKUP_ENCRYPTION_KEY") == "0:0:600" ]] \
  || die "backup encryption key is unavailable or unsafe"

validate_private_service_file() {
  local path=$1
  local label=$2
  local maximum_bytes=$3
  local minimum_bytes=${4:-1}
  local size
  [[ -f $path && ! -L $path ]] || die "${label} must be a regular non-symlink file"
  [[ $(stat -c '%u:%g' "$path") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
    || die "${label} ownership is invalid"
  [[ $(stat -c '%a' "$path") == "600" ]] || die "${label} mode must be 0600"
  size=$(stat -c '%s' "$path")
  [[ $size =~ ^[0-9]+$ ]] || die "${label} size is invalid"
  ((size >= minimum_bytes && size <= maximum_bytes)) \
    || die "${label} is outside its size limits"
}

validate_admin_security_schema() {
  local path=$1
  jq -e '
    type == "object"
    and (keys == [
      "bootstrap", "challenges", "contractVersion", "credentials", "principals",
      "rateLimits", "revision", "securityEvents", "sessions", "stateVersion",
      "stepUpReceipts"
    ])
    and .contractVersion == "1"
    and .stateVersion == 1
    and (.revision | type == "number" and floor == . and . >= 0)
    and (.bootstrap == null or (
      (.bootstrap | keys) == ["consumedAt", "createdAt", "expiresAt", "tokenHash"]
      and (.bootstrap.tokenHash | test("^[0-9a-f]{64}$"))
    ))
    and ([.principals, .credentials, .challenges, .sessions, .stepUpReceipts,
          .rateLimits, .securityEvents] | all(type == "array"))
    and ([paths(scalars) as $item
      | ($item[-1] | tostring | ascii_downcase)
      | select(. == "bootstraptoken" or . == "bootstrapsecret"
        or . == "rawbootstraptoken")] | length == 0)
  ' "$path" >/dev/null || die "admin-security state schema or secret exclusion is invalid"
}

wait_for_startup() {
  local response
  response=$(mktemp "${ONLYWAY_RUN_DIR}/.restore-startup.XXXXXX")
  local attempt
  for ((attempt = 1; attempt <= 24; attempt += 1)); do
    if curl --fail --silent --show-error \
      --connect-timeout 5 --max-time 10 \
      --output "$response" \
      "http://localhost:${ONLYWAY_TUNNEL_PORT:-43100}/health/startup" \
      && jq -e '.status == "READY"' "$response" >/dev/null; then
      unlink "$response"
      return 0
    fi
    if ((attempt < 24)); then
      sleep 5
    fi
  done
  unlink "$response"
  return 1
}

sync_restore_file() {
  local path=$1
  [[ -f $path && ! -L $path ]] \
    || {
      log "ERROR: restore durability requires a regular file: ${path}"
      return 1
    }
  # GNU coreutils sync without --data dispatches fsync(2) for the named file.
  sync -- "$path"
}

sync_restore_directory() {
  local path=$1
  [[ -d $path && ! -L $path ]] \
    || {
      log "ERROR: restore durability requires a regular directory: ${path}"
      return 1
    }
  # Opening and syncing the directory persists preceding rename/unlink entries.
  sync -- "$path"
}

[[ -f $BACKUP && ! -L $BACKUP ]] || die "backup must be a regular non-symlink file"
CANONICAL_BACKUP=$(readlink -f -- "$BACKUP")
CANONICAL_BACKUP_DIR=$(readlink -f -- "$ONLYWAY_BACKUP_DIR")
[[ $(dirname -- "$CANONICAL_BACKUP") == "$CANONICAL_BACKUP_DIR" ]] \
  || die "backup is outside the authorized backup directory"
[[ $(basename -- "$CANONICAL_BACKUP") =~ ^mv-ai-os--[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}\.[0-9]{3}Z--[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.sqlite\.gpg$ ]] \
  || die "backup filename is not canonical"
validate_private_service_file "$CANONICAL_BACKUP" "backup" $((1024 * 1024 * 1024 * 1024))

ENCRYPTED_BACKUP=$CANONICAL_BACKUP
BACKUP_RECEIPT_DETAIL=$(basename -- "$ENCRYPTED_BACKUP")
MANIFEST="${CANONICAL_BACKUP}.manifest.json"
ENCRYPTED_ADMIN_SECURITY_BACKUP="${CANONICAL_BACKUP}.admin-security.json.gpg"
DECRYPTED_BACKUP=$(mktemp /dev/shm/onlyway-restore-database.XXXXXX)
DECRYPTED_ADMIN_SECURITY_BACKUP=$(mktemp /dev/shm/onlyway-restore-admin.XXXXXX)
GPG_HOME=$(mktemp -d "${ONLYWAY_RUN_DIR}/.restore-gpg.XXXXXX")
chmod 0700 "$GPG_HOME"

cleanup_decrypted_bundle() {
  [[ ! -e $DECRYPTED_BACKUP ]] || unlink "$DECRYPTED_BACKUP"
  [[ ! -e $DECRYPTED_ADMIN_SECURITY_BACKUP ]] \
    || unlink "$DECRYPTED_ADMIN_SECURITY_BACKUP"
  if [[ $GPG_HOME == "${ONLYWAY_RUN_DIR}/.restore-gpg."* && -d $GPG_HOME ]]; then
    rm -rf -- "$GPG_HOME"
  fi
}
trap cleanup_decrypted_bundle EXIT

validate_recovery_bundle() {
  validate_private_service_file "$MANIFEST" "backup manifest" $((1024 * 1024))
  verify_backup_manifest_signature "$MANIFEST" >/dev/null
  [[ $(jq -er '.backupFile' "$MANIFEST") == "$(basename -- "$ENCRYPTED_BACKUP")" ]] \
    || die "backup manifest file binding is invalid"
  EXPECTED_SHA=$(jq -er '.sha256 | select(test("^[0-9a-f]{64}$"))' "$MANIFEST")
  ACTUAL_SHA=$(sha256sum "$ENCRYPTED_BACKUP" | awk '{print $1}')
  [[ $ACTUAL_SHA == "$EXPECTED_SHA" ]] \
    || die "backup fingerprint does not match its manifest"
  [[ $(stat -c '%s' "$ENCRYPTED_BACKUP") == \
    "$(jq -er '.sizeBytes' "$MANIFEST")" ]] \
    || die "backup size does not match its manifest"
  jq -e '
    .contractVersion == "1"
    and .integrityCheck == "ok"
    and .restoreProbe == "PASSED"
    and .encryptionState == "GPG_AES256_SYMMETRIC"
    and .secretsIncluded == false
    and .rawBootstrapIncluded == false
    and (.releaseCommit | type == "string" and test("^[0-9a-f]{40}$"))
    and (.manifestFingerprint | type == "string" and test("^[0-9a-f]{64}$"))
  ' "$MANIFEST" >/dev/null || die "backup manifest policy is invalid"
  MANIFEST_BODY=$(jq -c 'del(.manifestFingerprint)' "$MANIFEST")
  MANIFEST_FINGERPRINT=$(printf '%s' "$MANIFEST_BODY" \
    | sha256sum | awk '{print $1}')
  [[ $MANIFEST_FINGERPRINT == \
    "$(jq -er '.manifestFingerprint' "$MANIFEST")" ]] \
    || die "backup manifest self-fingerprint is invalid"
  validate_private_service_file "$ENCRYPTED_ADMIN_SECURITY_BACKUP" \
    "admin-security backup" $((5 * 1024 * 1024))
  [[ $(basename -- "$ENCRYPTED_ADMIN_SECURITY_BACKUP") == \
    "$(jq -er '.adminSecurityState.file' "$MANIFEST")" ]] \
    || die "admin-security backup filename binding is invalid"
  [[ $(stat -c '%s' "$ENCRYPTED_ADMIN_SECURITY_BACKUP") == \
    "$(jq -er '.adminSecurityState.sizeBytes' "$MANIFEST")" ]] \
    || die "admin-security backup size does not match its manifest"
  [[ $(sha256sum "$ENCRYPTED_ADMIN_SECURITY_BACKUP" | awk '{print $1}') == \
    "$(jq -er \
      '.adminSecurityState.sha256 | select(test("^[0-9a-f]{64}$"))' \
      "$MANIFEST")" ]] \
    || die "admin-security backup fingerprint does not match its manifest"
  gpg --homedir "$GPG_HOME" --no-options --batch --yes --pinentry-mode loopback \
    --passphrase-file "$BACKUP_ENCRYPTION_KEY" --decrypt \
    --output "$DECRYPTED_BACKUP" "$ENCRYPTED_BACKUP"
  gpg --homedir "$GPG_HOME" --no-options --batch --yes --pinentry-mode loopback \
    --passphrase-file "$BACKUP_ENCRYPTION_KEY" --decrypt \
    --output "$DECRYPTED_ADMIN_SECURITY_BACKUP" \
    "$ENCRYPTED_ADMIN_SECURITY_BACKUP"
  chown "${ONLYWAY_UID}:${ONLYWAY_GID}" \
    "$DECRYPTED_BACKUP" "$DECRYPTED_ADMIN_SECURITY_BACKUP"
  chmod 0600 "$DECRYPTED_BACKUP" "$DECRYPTED_ADMIN_SECURITY_BACKUP"
  [[ $(sqlite3 -batch "$DECRYPTED_BACKUP" 'PRAGMA integrity_check;') == "ok" ]] \
    || die "decrypted backup failed the pre-restore integrity check"
  [[ $(sqlite3 -batch "$DECRYPTED_BACKUP" 'PRAGMA user_version;') == \
    "$(jq -er '.schemaVersion' "$MANIFEST")" ]] \
    || die "decrypted backup schema does not match its manifest"
  validate_admin_security_schema "$DECRYPTED_ADMIN_SECURITY_BACKUP"
  [[ $(jq -er '.contractVersion' "$DECRYPTED_ADMIN_SECURITY_BACKUP") == \
    "$(jq -er '.adminSecurityState.contractVersion' "$MANIFEST")" ]] \
    || die "admin-security contract does not match its manifest"
  [[ $(jq -er '.stateVersion' "$DECRYPTED_ADMIN_SECURITY_BACKUP") == \
    "$(jq -er '.adminSecurityState.stateVersion' "$MANIFEST")" ]] \
    || die "admin-security state version does not match its manifest"
  [[ $(jq -er '.revision' "$DECRYPTED_ADMIN_SECURITY_BACKUP") == \
    "$(jq -er '.adminSecurityState.revision' "$MANIFEST")" ]] \
    || die "admin-security revision does not match its manifest"
}

validate_recovery_bundle
CANONICAL_BACKUP=$DECRYPTED_BACKUP
ADMIN_SECURITY_BACKUP=$DECRYPTED_ADMIN_SECURITY_BACKUP

DATABASE="${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite"
[[ $(stat -c '%d' "$ONLYWAY_DATA_DIR") == \
  "$(stat -c '%d' "$ONLYWAY_ADMIN_STATE_DIR")" ]] \
  || die "SQLite and Admin Security state must share a filesystem for crash-durable restore"
CURRENT_DATABASE_PRESENT=0
CURRENT_DATABASE_VALID=0
if [[ -e $DATABASE || -L $DATABASE ]]; then
  validate_private_service_file "$DATABASE" "current SQLite database" \
    $((1024 * 1024 * 1024 * 1024)) 0
  CURRENT_DATABASE_PRESENT=1
  if [[ $(sqlite3 -batch "$DATABASE" 'PRAGMA integrity_check;' 2>/dev/null) == "ok" ]]; then
    CURRENT_DATABASE_VALID=1
  else
    log "current SQLite database is corrupt; preserving a forensic copy and continuing break-glass restore"
  fi
else
  log "current SQLite database is missing; continuing break-glass restore"
fi
CURRENT_ADMIN_STATE_PRESENT=0
CURRENT_ADMIN_STATE_VALID=0
if [[ -e $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
  || -L $ONLYWAY_ADMIN_SECURITY_STATE_FILE ]]; then
  validate_private_service_file "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" \
    "current admin-security state" $((5 * 1024 * 1024)) 0
  CURRENT_ADMIN_STATE_PRESENT=1
  if jq -e . "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" >/dev/null 2>&1; then
    if (
      validate_admin_security_schema "$ONLYWAY_ADMIN_SECURITY_STATE_FILE"
    ) 2>/dev/null; then
      CURRENT_ADMIN_STATE_VALID=1
    else
      log "current admin-security state is invalid; preserving a forensic copy and continuing break-glass restore"
    fi
  else
    log "current admin-security state is corrupt; preserving a forensic copy and continuing break-glass restore"
  fi
else
  log "current admin-security state is missing; continuing break-glass restore"
fi
RECOVERY_DEGRADED=0
if ((CURRENT_DATABASE_VALID == 0 || CURRENT_ADMIN_STATE_VALID == 0)); then
  RECOVERY_DEGRADED=1
fi

RUNTIME_CONFIG="${ONLYWAY_CONFIG_DIR}/runtime.json"
[[ -f $RUNTIME_CONFIG && ! -L $RUNTIME_CONFIG ]] \
  || die "runtime configuration is unavailable"
WORKSPACE_ID=$(jq -er \
  '.runtime.workspaceId | select(test("^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$"))' \
  "$RUNTIME_CONFIG")

CURRENT_RELEASE=$(current_release) || die "current release is unavailable"
CURRENT_RELEASE=$(validate_release_path "$CURRENT_RELEASE")
CURRENT_COMMIT=$(basename -- "$CURRENT_RELEASE")
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECOVERY_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
ROLLBACK_COPY="${ONLYWAY_BACKUP_DIR}/mv-ai-os-pre-restore--${TIMESTAMP}--$$.sqlite"
ROLLBACK_ADMIN_STATE="${ROLLBACK_COPY}.admin-security.json"
TEMPORARY_DATABASE="${ONLYWAY_DATA_DIR}/.mv-ai-os.restore.$$.sqlite"
TEMPORARY_ADMIN_STATE="${ONLYWAY_ADMIN_STATE_DIR}/.admin-security.restore.$$.json"
[[ ! -e $ROLLBACK_COPY && ! -e $ROLLBACK_ADMIN_STATE \
  && ! -e $TEMPORARY_DATABASE && ! -e $TEMPORARY_ADMIN_STATE ]] \
  || die "restore temporary path already exists"

STACK_STOP_ATTEMPTED=0
ROLLBACK_READY=0
FILES_REPLACED=0
RESTORE_SUCCEEDED=0

restore_previous_on_failure() {
  local status=$?
  local containers_stopped=0
  local compose_inspection_ok=0
  local database_restored=0
  local admin_state_restored=0
  local rollback_durable=0
  local rollback_completed=0
  local service_recovered=0
  local running=
  trap - EXIT ERR
  cleanup_decrypted_bundle
  if ((RESTORE_SUCCEEDED == 1)); then
    return 0
  fi
  ((status == 0)) && status=1
  set +e
  unlink "$TEMPORARY_DATABASE" 2>/dev/null
  unlink "$TEMPORARY_ADMIN_STATE" 2>/dev/null
  if ((STACK_STOP_ATTEMPTED == 1)); then
    systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
    if running=$(compose ps --status running --quiet 2>/dev/null); then
      compose_inspection_ok=1
    fi
    if [[ -n $running ]]; then
      compose down --remove-orphans --timeout 45
    fi
    compose_inspection_ok=0
    if running=$(compose ps --status running --quiet 2>/dev/null); then
      compose_inspection_ok=1
    fi
    if ((compose_inspection_ok == 1)) && [[ -z $running ]]; then
      containers_stopped=1
    fi
    if ((FILES_REPLACED == 0)); then
      rollback_completed=1
    elif ((ROLLBACK_READY == 1 && containers_stopped == 1)); then
      if ((CURRENT_DATABASE_PRESENT == 1)); then
        install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
          "$ROLLBACK_COPY" "$TEMPORARY_DATABASE" \
          && sync_restore_file "$TEMPORARY_DATABASE" \
          && mv -T -- "$TEMPORARY_DATABASE" "$DATABASE"
      else
        unlink "$DATABASE" 2>/dev/null
      fi
      if ((CURRENT_ADMIN_STATE_PRESENT == 1)); then
        install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
          "$ROLLBACK_ADMIN_STATE" "$TEMPORARY_ADMIN_STATE" \
          && sync_restore_file "$TEMPORARY_ADMIN_STATE" \
          && mv -T -- "$TEMPORARY_ADMIN_STATE" "$ONLYWAY_ADMIN_SECURITY_STATE_FILE"
      else
        unlink "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" 2>/dev/null
      fi
      if sync_restore_directory "$ONLYWAY_DATA_DIR" \
        && sync_restore_directory "$ONLYWAY_ADMIN_STATE_DIR"; then
        rollback_durable=1
      fi
      if ((rollback_durable == 1 && CURRENT_DATABASE_PRESENT == 1)); then
        if [[ -f $DATABASE && ! -L $DATABASE \
          && $(sha256sum "$DATABASE" | awk '{print $1}') == "$ROLLBACK_DATABASE_SHA" ]] \
          && (
            ((CURRENT_DATABASE_VALID == 0)) \
            || [[ $(sqlite3 -batch "$DATABASE" 'PRAGMA integrity_check;' 2>/dev/null) == "ok" ]]
          ); then
          database_restored=1
        fi
      elif ((rollback_durable == 1)) \
        && [[ ! -e $DATABASE && ! -L $DATABASE ]]; then
        database_restored=1
      fi
      if ((rollback_durable == 1 && CURRENT_ADMIN_STATE_PRESENT == 1)); then
        if [[ -f $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
          && ! -L $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
          && $(sha256sum "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" | awk '{print $1}') == "$ROLLBACK_ADMIN_STATE_SHA" ]] \
          && (
            ((CURRENT_ADMIN_STATE_VALID == 0)) \
            || (
              validate_admin_security_schema "$ONLYWAY_ADMIN_SECURITY_STATE_FILE"
            ) >/dev/null 2>&1
          ); then
          admin_state_restored=1
        fi
      elif ((rollback_durable == 1)) \
        && [[ ! -e $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
        && ! -L $ONLYWAY_ADMIN_SECURITY_STATE_FILE ]]; then
        admin_state_restored=1
      fi
      if ((database_restored == 1 && admin_state_restored == 1)); then
        rollback_completed=1
        log "failed restore rolled back both SQLite and admin-security state exactly"
      fi
    fi
    if ((rollback_completed == 1 \
      && CURRENT_DATABASE_VALID == 1 \
      && CURRENT_ADMIN_STATE_VALID == 1)); then
      if systemctl start "$ONLYWAY_SYSTEMD_UNIT" && wait_for_startup; then
        service_recovered=1
      fi
    fi
  else
    rollback_completed=1
    service_recovered=1
  fi
  if ((rollback_completed == 0)); then
    systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
    write_receipt "restore" "FAILED_ROLLBACK_INCOMPLETE" \
      "$CURRENT_COMMIT" "$BACKUP_RECEIPT_DETAIL" >/dev/null
    log "CRITICAL: restore rollback is incomplete; the unit remains stopped"
  elif ((service_recovered == 1)); then
    write_receipt "restore" "FAILED_PREVIOUS_BUNDLE_RESTORED" \
      "$CURRENT_COMMIT" "$BACKUP_RECEIPT_DETAIL" >/dev/null
  else
    systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
    write_receipt "restore" "FAILED_PREVIOUS_BUNDLE_RESTORED_UNIT_STOPPED" \
      "$CURRENT_COMMIT" "$BACKUP_RECEIPT_DETAIL" >/dev/null
    log "previous bundle was restored, but it was degraded or did not restart; the unit remains stopped"
  fi
  exit "$status"
}
trap restore_previous_on_failure EXIT ERR

STACK_STOP_ATTEMPTED=1
systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
RUNNING_CONTAINERS=$(compose ps --status running --quiet) \
  || die "stack state could not be inspected after stop"
[[ -z $RUNNING_CONTAINERS ]] \
  || die "one or more stack containers remained running after stop"
for sidecar in "${DATABASE}-journal" "${DATABASE}-wal" "${DATABASE}-shm"; do
  [[ ! -e $sidecar ]] || die "SQLite sidecar remains after clean stack stop"
done
# The backup directory is writable by the runtime service. Revalidate the full
# signed bundle only after every container is quiesced, then use it immediately
# for staging; no pre-stop snapshot is trusted across this boundary.
validate_recovery_bundle

ROLLBACK_DATABASE_SHA=
ROLLBACK_ADMIN_STATE_SHA=
if ((CURRENT_DATABASE_PRESENT == 1)); then
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "$DATABASE" "$ROLLBACK_COPY"
  ROLLBACK_DATABASE_SHA=$(sha256sum "$ROLLBACK_COPY" | awk '{print $1}')
  [[ $ROLLBACK_DATABASE_SHA =~ ^[0-9a-f]{64}$ ]] \
    || die "pre-restore forensic database fingerprint is invalid"
  if ((CURRENT_DATABASE_VALID == 1)); then
    [[ $(sqlite3 -batch "$ROLLBACK_COPY" 'PRAGMA integrity_check;') == "ok" ]] \
      || die "pre-restore rollback copy failed integrity_check"
  fi
  sync_restore_file "$ROLLBACK_COPY"
fi
if ((CURRENT_ADMIN_STATE_PRESENT == 1)); then
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" "$ROLLBACK_ADMIN_STATE"
  ROLLBACK_ADMIN_STATE_SHA=$(sha256sum "$ROLLBACK_ADMIN_STATE" | awk '{print $1}')
  [[ $ROLLBACK_ADMIN_STATE_SHA =~ ^[0-9a-f]{64}$ ]] \
    || die "pre-restore forensic admin-state fingerprint is invalid"
  if ((CURRENT_ADMIN_STATE_VALID == 1)); then
    validate_admin_security_schema "$ROLLBACK_ADMIN_STATE"
  fi
  sync_restore_file "$ROLLBACK_ADMIN_STATE"
fi
sync_restore_directory "$ONLYWAY_BACKUP_DIR"
ROLLBACK_READY=1

install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
  "$CANONICAL_BACKUP" "$TEMPORARY_DATABASE"
[[ $(sqlite3 -batch "$TEMPORARY_DATABASE" 'PRAGMA integrity_check;') == "ok" ]] \
  || die "staged restore database failed integrity_check"

RECOVERY_EVENT_ID="evt-recovery-$(printf '%s\n%s\n' "$RECOVERY_AT" "$ACTUAL_SHA" \
  | sha256sum | awk '{print substr($1,1,48)}')"
CURRENT_ADMIN_FOR_MERGE=$ADMIN_SECURITY_BACKUP
PRESERVE_CURRENT_AUTH=false
RECOVERY_REASON=RESTORE_RECOVERY_DEGRADED
if ((CURRENT_ADMIN_STATE_VALID == 1)); then
  CURRENT_ADMIN_FOR_MERGE=$ROLLBACK_ADMIN_STATE
  PRESERVE_CURRENT_AUTH=true
  RECOVERY_REASON=RESTORE_RECOVERY_EPOCH
fi
install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
  /dev/null "$TEMPORARY_ADMIN_STATE"
jq -c --slurpfile current "$CURRENT_ADMIN_FOR_MERGE" \
  --arg eventId "$RECOVERY_EVENT_ID" \
  --arg now "$RECOVERY_AT" \
  --arg reasonCode "$RECOVERY_REASON" \
  --argjson preserveCurrentAuth "$PRESERVE_CURRENT_AUTH" '
  ($current[0]) as $live
  | .revision = ([.revision, $live.revision] | max) + 1
  | if $preserveCurrentAuth then
      .principals = $live.principals
      | .credentials = $live.credentials
      | .rateLimits = $live.rateLimits
    else .
    end
  | .bootstrap = (
      if .bootstrap == null then null
      else .bootstrap | .consumedAt = (.consumedAt // $now)
      end
    )
  | .sessions = (
      (.sessions + $live.sessions)
      | map(.revokedAt = (.revokedAt // $now))
      | sort_by(.tokenHash, .revokedAt)
      | group_by(.tokenHash)
      | map(sort_by(.revokedAt) | .[0])
      | sort_by(.lastSeenAt)
      | .[-1024:]
    )
  | .challenges = (
      (.challenges + $live.challenges)
      | map(.usedAt = (.usedAt // $now))
      | sort_by(.flowId, .usedAt)
      | group_by(.flowId)
      | map(sort_by(.usedAt) | .[0])
      | sort_by(.createdAt)
      | .[-256:]
    )
  | .stepUpReceipts = (
      (.stepUpReceipts + $live.stepUpReceipts)
      | map(.consumedAt = (.consumedAt // $now))
      | sort_by(.tokenHash, .consumedAt)
      | group_by(.tokenHash)
      | map(sort_by(.consumedAt) | .[0])
      | sort_by(.createdAt)
      | .[-512:]
    )
  | .securityEvents = (
      (.securityEvents + $live.securityEvents)
      | sort_by(.eventId)
      | unique_by(.eventId)
      | . + [{
          contractVersion: "1",
          eventId: $eventId,
          eventType: "ALL_SESSIONS_REVOKED",
          occurredAt: $now,
          outcome: "SUCCEEDED",
          principalId: null,
          reasonCode: $reasonCode,
          sourceKeyHash: null,
          subjectId: null
        }]
      | .[-5000:]
    )
  | .rateLimits = (.rateLimits | sort_by(.updatedAt) | .[-1024:])
' "$ADMIN_SECURITY_BACKUP" >"$TEMPORARY_ADMIN_STATE"
chown "$ONLYWAY_SERVICE_USER:$ONLYWAY_SERVICE_GROUP" "$TEMPORARY_ADMIN_STATE"
chmod 0600 "$TEMPORARY_ADMIN_STATE"
validate_private_service_file "$TEMPORARY_ADMIN_STATE" \
  "staged admin-security state" $((5 * 1024 * 1024))
validate_admin_security_schema "$TEMPORARY_ADMIN_STATE"

CURRENT_CONTROL_VERSION=0
if ((CURRENT_DATABASE_VALID == 1)); then
  CURRENT_CONTROL_CANDIDATE=$(sqlite3 -batch "$ROLLBACK_COPY" \
    "SELECT COALESCE(MAX(version),0) FROM operations_runtime_controls WHERE workspace_id='${WORKSPACE_ID}';" \
    2>/dev/null || true)
  if [[ $CURRENT_CONTROL_CANDIDATE =~ ^[0-9]+$ ]]; then
    CURRENT_CONTROL_VERSION=$CURRENT_CONTROL_CANDIDATE
  fi
fi
RESTORED_CONTROL_VERSION=$(sqlite3 -batch "$TEMPORARY_DATABASE" \
  "SELECT COALESCE(MAX(version),0) FROM operations_runtime_controls WHERE workspace_id='${WORKSPACE_ID}';")
[[ $CURRENT_CONTROL_VERSION =~ ^[0-9]+$ && $RESTORED_CONTROL_VERSION =~ ^[0-9]+$ ]] \
  || die "runtime recovery epoch is invalid"
if ((CURRENT_CONTROL_VERSION > RESTORED_CONTROL_VERSION)); then
  RECOVERY_EPOCH=$((CURRENT_CONTROL_VERSION + 1))
else
  RECOVERY_EPOCH=$((RESTORED_CONTROL_VERSION + 1))
fi
CONTROL_JSON=$(jq -cn \
  --arg updatedAt "$RECOVERY_AT" \
  --arg updatedBy "recovery-restore" \
  --arg workspaceId "$WORKSPACE_ID" \
  --argjson version "$RECOVERY_EPOCH" \
  '{
    contractVersion: "1",
    killSwitch: "ACTIVE",
    maintenanceMode: "ENABLED",
    reasonCode: "RESTORE_RECOVERY_EPOCH",
    updatedAt: $updatedAt,
    updatedBy: $updatedBy,
    version: $version,
    workspaceId: $workspaceId
  }')

CURRENT_PUBLICATION_VERSION=0
if ((CURRENT_DATABASE_VALID == 1)); then
  CURRENT_PUBLICATION_CANDIDATE=$(sqlite3 -batch "$ROLLBACK_COPY" \
    "SELECT COALESCE(MAX(version),0) FROM publication_kill_switches WHERE workspace_id='${WORKSPACE_ID}';" \
    2>/dev/null || true)
  if [[ $CURRENT_PUBLICATION_CANDIDATE =~ ^[0-9]+$ ]]; then
    CURRENT_PUBLICATION_VERSION=$CURRENT_PUBLICATION_CANDIDATE
  fi
fi
RESTORED_PUBLICATION_VERSION=$(sqlite3 -batch "$TEMPORARY_DATABASE" \
  "SELECT COALESCE(MAX(version),0) FROM publication_kill_switches WHERE workspace_id='${WORKSPACE_ID}';")
[[ $CURRENT_PUBLICATION_VERSION =~ ^[0-9]+$ \
  && $RESTORED_PUBLICATION_VERSION =~ ^[0-9]+$ ]] \
  || die "publication recovery epoch is invalid"
if ((CURRENT_PUBLICATION_VERSION > RESTORED_PUBLICATION_VERSION)); then
  PUBLICATION_RECOVERY_EPOCH=$((CURRENT_PUBLICATION_VERSION + 1))
else
  PUBLICATION_RECOVERY_EPOCH=$((RESTORED_PUBLICATION_VERSION + 1))
fi
((PUBLICATION_RECOVERY_EPOCH <= 1000000)) \
  || die "publication recovery epoch exceeds its contract limit"
PUBLICATION_JSON=$(jq -cn \
  --arg updatedAt "$RECOVERY_AT" \
  --arg updatedBy "recovery-restore" \
  --arg workspaceId "$WORKSPACE_ID" \
  --argjson version "$PUBLICATION_RECOVERY_EPOCH" \
  '{
    enabled: true,
    updatedAt: $updatedAt,
    updatedBy: $updatedBy,
    version: $version,
    workspaceId: $workspaceId
  }')

sqlite3 -batch "$TEMPORARY_DATABASE" "
  PRAGMA foreign_keys = ON;
  BEGIN IMMEDIATE;
  INSERT INTO operations_runtime_controls
    (workspace_id, version, kill_switch, maintenance_mode, updated_at, record_json)
  VALUES
    ('${WORKSPACE_ID}', ${RECOVERY_EPOCH}, 'ACTIVE', 'ENABLED',
      '${RECOVERY_AT}', '${CONTROL_JSON}')
  ON CONFLICT(workspace_id) DO UPDATE SET
    version=excluded.version,
    kill_switch=excluded.kill_switch,
    maintenance_mode=excluded.maintenance_mode,
    updated_at=excluded.updated_at,
    record_json=excluded.record_json;
  INSERT INTO publication_kill_switches
    (workspace_id, enabled, version, updated_at, record_json)
  VALUES
    ('${WORKSPACE_ID}', 1, ${PUBLICATION_RECOVERY_EPOCH},
      '${RECOVERY_AT}', '${PUBLICATION_JSON}')
  ON CONFLICT(workspace_id) DO UPDATE SET
    enabled=excluded.enabled,
    version=excluded.version,
    updated_at=excluded.updated_at,
    record_json=excluded.record_json;
  DELETE FROM operations_process_leases WHERE workspace_id='${WORKSPACE_ID}';
  COMMIT;
"
[[ $(sqlite3 -batch "$TEMPORARY_DATABASE" 'PRAGMA integrity_check;') == "ok" ]] \
  || die "fail-closed staged database failed integrity_check"

sync_restore_file "$TEMPORARY_DATABASE"
sync_restore_file "$TEMPORARY_ADMIN_STATE"
FILES_REPLACED=1
mv -T -- "$TEMPORARY_DATABASE" "$DATABASE"
mv -T -- "$TEMPORARY_ADMIN_STATE" "$ONLYWAY_ADMIN_SECURITY_STATE_FILE"
sync_restore_directory "$ONLYWAY_DATA_DIR"
sync_restore_directory "$ONLYWAY_ADMIN_STATE_DIR"

if find "$ONLYWAY_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type l \
  \( -name 'mv-ai-os-pre-restore--*.sqlite' \
    -o -name 'mv-ai-os-pre-restore--*.sqlite.admin-security.json' \) \
  -print -quit | grep -q .; then
  die "forensic retention encountered a symlinked artifact"
fi
mapfile -t FORENSIC_PREFIXES < <(
  find "$ONLYWAY_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type f \
    \( -name 'mv-ai-os-pre-restore--*.sqlite' \
      -o -name 'mv-ai-os-pre-restore--*.sqlite.admin-security.json' \) \
    -printf '%f\n' \
    | sed 's/\.admin-security\.json$//' \
    | sort -ru
)
for ((index = 3; index < ${#FORENSIC_PREFIXES[@]}; index += 1)); do
  forensic_prefix="${ONLYWAY_BACKUP_DIR}/${FORENSIC_PREFIXES[$index]}"
  [[ $forensic_prefix != "$ROLLBACK_COPY" \
    && $(basename -- "$forensic_prefix") =~ ^mv-ai-os-pre-restore--[0-9]{8}T[0-9]{6}Z--[0-9]+\.sqlite$ \
    && $(dirname -- "$(readlink -m -- "$forensic_prefix")") == \
      "$(readlink -f -- "$ONLYWAY_BACKUP_DIR")" ]] \
    || die "forensic retention encountered an unsafe bundle path"
  for forensic_artifact in \
    "$forensic_prefix" "${forensic_prefix}.admin-security.json"; do
    if [[ -e $forensic_artifact || -L $forensic_artifact ]]; then
      [[ -f $forensic_artifact && ! -L $forensic_artifact \
        && $(stat -c '%u:%g' "$forensic_artifact") == \
          "${ONLYWAY_UID}:${ONLYWAY_GID}" \
        && $(stat -c '%a' "$forensic_artifact") == "600" ]] \
        || die "forensic retention encountered an unsafe artifact"
      unlink "$forensic_artifact"
    fi
  done
done

systemctl start "$ONLYWAY_SYSTEMD_UNIT"
wait_for_startup || die "restored fail-closed bundle failed startup verification"
[[ $(sqlite3 -batch "$DATABASE" \
  "SELECT kill_switch || ':' || maintenance_mode FROM operations_runtime_controls WHERE workspace_id='${WORKSPACE_ID}';") == "ACTIVE:ENABLED" ]] \
  || die "restored runtime control is not fail-closed"
[[ $(sqlite3 -batch "$DATABASE" \
  "SELECT enabled FROM publication_kill_switches WHERE workspace_id='${WORKSPACE_ID}';") == "1" ]] \
  || die "restored publication control is not fail-closed"

RESTORE_STATUS=RESTORE_COMPLETED_FAIL_CLOSED
if ((RECOVERY_DEGRADED == 1)); then
  RESTORE_STATUS=RESTORE_COMPLETED_FAIL_CLOSED_DEGRADED_SOURCE
fi
write_receipt "restore" "$RESTORE_STATUS" "$CURRENT_COMMIT" \
  "${BACKUP_RECEIPT_DETAIL}:recovery-epoch-${RECOVERY_EPOCH}" >/dev/null
RESTORE_SUCCEEDED=1
trap - EXIT ERR
cleanup_decrypted_bundle
log "restore completed fail-closed; rollback bundle retained as $(basename -- "$ROLLBACK_COPY")"
if ((RECOVERY_DEGRADED == 1)); then
  log "break-glass recovery used because current DB or Admin Security state was missing/corrupt"
fi
log "runtime kill switch ACTIVE, maintenance ENABLED, publication locked; authenticated Founder release is required"
