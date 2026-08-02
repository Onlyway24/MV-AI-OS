#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
acquire_operation_lock backup
source_compose_environment
require_command docker
require_command jq
require_command sha256sum
require_command sqlite3
ensure_acceptance_signing_identity

DATABASE="${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite"
[[ -f $DATABASE && ! -L $DATABASE ]] || die "SQLite database is unavailable"
[[ $(stat -c '%u:%g' "$DATABASE") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "SQLite database ownership is invalid"
[[ $(stat -c '%a' "$DATABASE") == "600" ]] || die "SQLite database mode must be 0600"
ADMIN_SECURITY_STATE=$ONLYWAY_ADMIN_SECURITY_STATE_FILE
[[ -f $ADMIN_SECURITY_STATE && ! -L $ADMIN_SECURITY_STATE ]] \
  || die "admin-security state is unavailable"
[[ $(stat -c '%u:%g' "$ADMIN_SECURITY_STATE") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "admin-security state ownership is invalid"
[[ $(stat -c '%a' "$ADMIN_SECURITY_STATE") == "600" ]] \
  || die "admin-security state mode must be 0600"
ADMIN_SECURITY_BYTES=$(stat -c '%s' "$ADMIN_SECURITY_STATE")
[[ $ADMIN_SECURITY_BYTES =~ ^[1-9][0-9]{0,6}$ \
  && $ADMIN_SECURITY_BYTES -le $((5 * 1024 * 1024)) ]] \
  || die "admin-security state size is invalid"

DATABASE_KIB=$(du -k --apparent-size "$DATABASE" | awk '{print $1}')
ADMIN_SECURITY_KIB=$(du -k --apparent-size "$ADMIN_SECURITY_STATE" | awk '{print $1}')
AVAILABLE_KIB=$(df -Pk "$ONLYWAY_BACKUP_DIR" | awk 'NR == 2 {print $4}')
[[ $DATABASE_KIB =~ ^[0-9]{1,15}$ \
  && $ADMIN_SECURITY_KIB =~ ^[0-9]{1,15}$ \
  && $AVAILABLE_KIB =~ ^[0-9]{1,15}$ ]] \
  || die "disk-space check returned invalid values"
REQUIRED_KIB=$((DATABASE_KIB * 3 + ADMIN_SECURITY_KIB * 2 + 524288))
((AVAILABLE_KIB >= REQUIRED_KIB)) \
  || die "insufficient free space for backup and restore verification"

MARKER=$(mktemp "${ONLYWAY_RUN_DIR}/.backup-marker.XXXXXX")
cleanup() {
  [[ -f $MARKER ]] && unlink "$MARKER"
}
trap cleanup EXIT

compose --profile operations run --rm --no-deps backup-verifier

BACKUP=$(find "$ONLYWAY_BACKUP_DIR" -maxdepth 1 -type f \
  -name 'mv-ai-os--*.sqlite' -newer "$MARKER" \
  -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR == 1 {sub(/^[^ ]+ /, ""); print; exit}')
[[ -n $BACKUP && -f $BACKUP && ! -L $BACKUP ]] \
  || die "backup verifier did not create a new regular backup"
[[ $(stat -c '%u:%g' "$BACKUP") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "backup ownership is invalid"
[[ $(stat -c '%a' "$BACKUP") == "600" ]] || die "backup mode must be 0600"

INTEGRITY=$(sqlite3 -batch "$BACKUP" 'PRAGMA integrity_check;')
[[ $INTEGRITY == "ok" ]] || die "SQLite integrity_check failed for the new backup"
SCHEMA_VERSION=$(sqlite3 -batch "$BACKUP" 'PRAGMA user_version;')
[[ $SCHEMA_VERSION =~ ^[1-9][0-9]*$ ]] || die "backup schema version is invalid"
SHA256=$(sha256sum "$BACKUP" | awk '{print $1}')
[[ $SHA256 =~ ^[0-9a-f]{64}$ ]] || die "backup fingerprint is invalid"
SIZE_BYTES=$(stat -c '%s' "$BACKUP")
COMMIT=$(basename -- "$(current_release)")
require_commit "$COMMIT"

MANIFEST="${BACKUP}.manifest.json"
[[ -f $MANIFEST && ! -L $MANIFEST ]] \
  || die "backup verifier did not publish a regular manifest"
[[ $(stat -c '%u:%g' "$MANIFEST") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "backup manifest ownership is invalid"
[[ $(stat -c '%a' "$MANIFEST") == "600" ]] \
  || die "backup manifest mode must be 0600"
[[ $(jq -er '.backupFile' "$MANIFEST") == "$(basename -- "$BACKUP")" ]] \
  || die "backup manifest file binding is invalid"
[[ $(jq -er '.sha256' "$MANIFEST") == "$SHA256" ]] \
  || die "backup manifest fingerprint is invalid"
[[ $(jq -er '.sizeBytes' "$MANIFEST") == "$SIZE_BYTES" ]] \
  || die "backup manifest size binding is invalid"
[[ $(jq -er '.schemaVersion' "$MANIFEST") == "$SCHEMA_VERSION" ]] \
  || die "backup manifest schema binding is invalid"
[[ $(jq -er '.releaseCommit' "$MANIFEST") == "$COMMIT" ]] \
  || die "backup manifest release binding is invalid"
jq -e '
  .contractVersion == "1"
  and .integrityCheck == "ok"
  and .restoreProbe == "PASSED"
  and .encryptionState == "BACKUP_AT_REST_ENCRYPTION_REQUIRED"
  and .secretsIncluded == false
  and .rawBootstrapIncluded == false
  and (.manifestFingerprint | type == "string" and test("^[0-9a-f]{64}$"))
' "$MANIFEST" >/dev/null || die "backup manifest policy is invalid"
MANIFEST_BODY=$(jq -c 'del(.manifestFingerprint)' "$MANIFEST")
MANIFEST_FINGERPRINT=$(printf '%s' "$MANIFEST_BODY" | sha256sum | awk '{print $1}')
[[ $MANIFEST_FINGERPRINT == "$(jq -er '.manifestFingerprint' "$MANIFEST")" ]] \
  || die "backup manifest self-fingerprint is invalid"

ADMIN_SECURITY_BACKUP="${BACKUP}.admin-security.json"
[[ -f $ADMIN_SECURITY_BACKUP && ! -L $ADMIN_SECURITY_BACKUP ]] \
  || die "admin-security backup artifact is unavailable"
[[ $(stat -c '%u:%g' "$ADMIN_SECURITY_BACKUP") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "admin-security backup ownership is invalid"
[[ $(stat -c '%a' "$ADMIN_SECURITY_BACKUP") == "600" ]] \
  || die "admin-security backup mode must be 0600"
ADMIN_SECURITY_SIZE=$(stat -c '%s' "$ADMIN_SECURITY_BACKUP")
[[ $ADMIN_SECURITY_SIZE =~ ^[1-9][0-9]*$ ]] \
  || die "admin-security backup size is invalid"
((ADMIN_SECURITY_SIZE <= 5 * 1024 * 1024)) \
  || die "admin-security backup exceeds its size limit"
ADMIN_SECURITY_SHA=$(sha256sum "$ADMIN_SECURITY_BACKUP" | awk '{print $1}')
[[ $ADMIN_SECURITY_SHA == "$(jq -er '.adminSecurityState.sha256' "$MANIFEST")" ]] \
  || die "admin-security backup fingerprint is invalid"
[[ $ADMIN_SECURITY_SIZE == "$(jq -er '.adminSecurityState.sizeBytes' "$MANIFEST")" ]] \
  || die "admin-security backup size binding is invalid"
[[ $(basename -- "$ADMIN_SECURITY_BACKUP") == \
  "$(jq -er '.adminSecurityState.file' "$MANIFEST")" ]] \
  || die "admin-security backup filename binding is invalid"
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
  and ([paths(scalars) as $path
    | ($path[-1] | tostring | ascii_downcase)
    | select(. == "bootstraptoken" or . == "bootstrapsecret"
      or . == "rawbootstraptoken")] | length == 0)
' "$ADMIN_SECURITY_BACKUP" >/dev/null \
  || die "admin-security backup schema or secret exclusion is invalid"
[[ $(jq -er '.adminSecurityState.contractVersion' "$MANIFEST") == "1" ]] \
  || die "admin-security manifest contract is invalid"
[[ $(jq -er '.adminSecurityState.stateVersion' "$MANIFEST") == "1" ]] \
  || die "admin-security manifest state version is invalid"
[[ $(jq -er '.adminSecurityState.revision' "$MANIFEST") == \
  "$(jq -er '.revision' "$ADMIN_SECURITY_BACKUP")" ]] \
  || die "admin-security manifest revision binding is invalid"

SIGNATURE=$(write_backup_manifest_signature "$MANIFEST")
[[ $(verify_backup_manifest_signature "$MANIFEST") == "$SIGNATURE" ]] \
  || die "host backup manifest signature path is invalid"
[[ $(sha256sum "$BACKUP" | awk '{print $1}') == "$SHA256" \
  && $(stat -c '%s' "$BACKUP") == "$SIZE_BYTES" ]] \
  || die "backup changed during host signing"
[[ $(sha256sum "$ADMIN_SECURITY_BACKUP" | awk '{print $1}') == \
  "$ADMIN_SECURITY_SHA" \
  && $(stat -c '%s' "$ADMIN_SECURITY_BACKUP") == "$ADMIN_SECURITY_SIZE" ]] \
  || die "admin-security backup changed during host signing"

write_receipt "backup" "VERIFIED_RESTORE_PROBE_PASSED" "$COMMIT" \
  "$(basename -- "$MANIFEST")" >/dev/null
printf 'BACKUP_FILE=%s\n' "$BACKUP"
printf 'BACKUP_MANIFEST=%s\n' "$MANIFEST"
printf 'BACKUP_SIGNATURE=%s\n' "$SIGNATURE"
printf 'BACKUP_AT_REST_ENCRYPTION_REQUIRED\n'
