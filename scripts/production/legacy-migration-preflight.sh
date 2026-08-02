#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=lib/legacy-migration-common.sh
source "${SOURCE_ROOT}/scripts/production/lib/legacy-migration-common.sh"

usage() {
  cat >&2 <<'EOF'
usage: legacy-migration-preflight.sh
  --container NAME=FULL_64_CHAR_ID                  (exactly four)
  --expected-image-id sha256:HEX64
  --expected-container-uid UID
  --expected-restart-policy unless-stopped
  --expected-listener 127.0.0.1:PORT
  --legacy-root ABS_PATH
  --database ABS_PATH --database-uid UID --database-gid GID --database-mode 600
  --expected-schema-version INTEGER
  --runtime-config ABS_PATH --config-uid UID --config-gid GID --config-mode 640
  --expected-actor-id ID --expected-workspace-id ID
  --expected-content-agent-mode deterministic
  --expected-sqlite-path /data/onlyway.sqlite
  --legacy-bootstrap ABS_PATH --bootstrap-uid UID --bootstrap-gid GID
  --bootstrap-mode 600 --expected-access-origin http://127.0.0.1:PORT
  --legacy-admin-state ABS_PATH --legacy-admin-pepper ABS_PATH
  --excluded-dormant-secret ABS_PATH
  --current-link ABS_PATH
  --new-service-unit-file ABS_PATH
  --new-backup-service-unit-file ABS_PATH
  --new-backup-timer-unit-file ABS_PATH
  --receipt ABS_PATH --private-key ABS_PATH --public-key ABS_PATH
  --service-gid GID --lock-file ABS_PATH --valid-for-seconds INTEGER
  --confirm PREPARE_LEGACY_MIGRATION_V1
EOF
  exit 2
}

declare -a CONTAINER_SPECS=()
EXPECTED_IMAGE_ID=
EXPECTED_CONTAINER_UID=
EXPECTED_RESTART_POLICY=
EXPECTED_LISTENER=
LEGACY_ROOT=
DATABASE=
DATABASE_UID=
DATABASE_GID=
DATABASE_MODE=
EXPECTED_SCHEMA_VERSION=
RUNTIME_CONFIG=
CONFIG_UID=
CONFIG_GID=
CONFIG_MODE=
EXPECTED_ACTOR_ID=
EXPECTED_WORKSPACE_ID=
EXPECTED_CONTENT_AGENT_MODE=
EXPECTED_SQLITE_PATH=
LEGACY_BOOTSTRAP=
BOOTSTRAP_UID=
BOOTSTRAP_GID=
BOOTSTRAP_MODE=
EXPECTED_ACCESS_ORIGIN=
LEGACY_ADMIN_STATE=
LEGACY_ADMIN_PEPPER=
EXCLUDED_DORMANT_SECRET=
CURRENT_LINK=
NEW_SERVICE_UNIT_FILE=
NEW_BACKUP_SERVICE_UNIT_FILE=
NEW_BACKUP_TIMER_UNIT_FILE=
RECEIPT=
PRIVATE_KEY=
PUBLIC_KEY=
SERVICE_GID=
LOCK_FILE=
VALID_FOR_SECONDS=
CONFIRM=

while (($# > 0)); do
  case "$1" in
    --container) [[ $# -ge 2 ]] || usage; CONTAINER_SPECS+=("$2"); shift ;;
    --expected-image-id) [[ $# -ge 2 ]] || usage; EXPECTED_IMAGE_ID=$2; shift ;;
    --expected-container-uid) [[ $# -ge 2 ]] || usage; EXPECTED_CONTAINER_UID=$2; shift ;;
    --expected-restart-policy) [[ $# -ge 2 ]] || usage; EXPECTED_RESTART_POLICY=$2; shift ;;
    --expected-listener) [[ $# -ge 2 ]] || usage; EXPECTED_LISTENER=$2; shift ;;
    --legacy-root) [[ $# -ge 2 ]] || usage; LEGACY_ROOT=$2; shift ;;
    --database) [[ $# -ge 2 ]] || usage; DATABASE=$2; shift ;;
    --database-uid) [[ $# -ge 2 ]] || usage; DATABASE_UID=$2; shift ;;
    --database-gid) [[ $# -ge 2 ]] || usage; DATABASE_GID=$2; shift ;;
    --database-mode) [[ $# -ge 2 ]] || usage; DATABASE_MODE=$2; shift ;;
    --expected-schema-version) [[ $# -ge 2 ]] || usage; EXPECTED_SCHEMA_VERSION=$2; shift ;;
    --runtime-config) [[ $# -ge 2 ]] || usage; RUNTIME_CONFIG=$2; shift ;;
    --config-uid) [[ $# -ge 2 ]] || usage; CONFIG_UID=$2; shift ;;
    --config-gid) [[ $# -ge 2 ]] || usage; CONFIG_GID=$2; shift ;;
    --config-mode) [[ $# -ge 2 ]] || usage; CONFIG_MODE=$2; shift ;;
    --expected-actor-id) [[ $# -ge 2 ]] || usage; EXPECTED_ACTOR_ID=$2; shift ;;
    --expected-workspace-id) [[ $# -ge 2 ]] || usage; EXPECTED_WORKSPACE_ID=$2; shift ;;
    --expected-content-agent-mode) [[ $# -ge 2 ]] || usage; EXPECTED_CONTENT_AGENT_MODE=$2; shift ;;
    --expected-sqlite-path) [[ $# -ge 2 ]] || usage; EXPECTED_SQLITE_PATH=$2; shift ;;
    --legacy-bootstrap) [[ $# -ge 2 ]] || usage; LEGACY_BOOTSTRAP=$2; shift ;;
    --bootstrap-uid) [[ $# -ge 2 ]] || usage; BOOTSTRAP_UID=$2; shift ;;
    --bootstrap-gid) [[ $# -ge 2 ]] || usage; BOOTSTRAP_GID=$2; shift ;;
    --bootstrap-mode) [[ $# -ge 2 ]] || usage; BOOTSTRAP_MODE=$2; shift ;;
    --expected-access-origin) [[ $# -ge 2 ]] || usage; EXPECTED_ACCESS_ORIGIN=$2; shift ;;
    --legacy-admin-state) [[ $# -ge 2 ]] || usage; LEGACY_ADMIN_STATE=$2; shift ;;
    --legacy-admin-pepper) [[ $# -ge 2 ]] || usage; LEGACY_ADMIN_PEPPER=$2; shift ;;
    --excluded-dormant-secret) [[ $# -ge 2 ]] || usage; EXCLUDED_DORMANT_SECRET=$2; shift ;;
    --current-link) [[ $# -ge 2 ]] || usage; CURRENT_LINK=$2; shift ;;
    --new-service-unit-file) [[ $# -ge 2 ]] || usage; NEW_SERVICE_UNIT_FILE=$2; shift ;;
    --new-backup-service-unit-file) [[ $# -ge 2 ]] || usage; NEW_BACKUP_SERVICE_UNIT_FILE=$2; shift ;;
    --new-backup-timer-unit-file) [[ $# -ge 2 ]] || usage; NEW_BACKUP_TIMER_UNIT_FILE=$2; shift ;;
    --receipt) [[ $# -ge 2 ]] || usage; RECEIPT=$2; shift ;;
    --private-key) [[ $# -ge 2 ]] || usage; PRIVATE_KEY=$2; shift ;;
    --public-key) [[ $# -ge 2 ]] || usage; PUBLIC_KEY=$2; shift ;;
    --service-gid) [[ $# -ge 2 ]] || usage; SERVICE_GID=$2; shift ;;
    --lock-file) [[ $# -ge 2 ]] || usage; LOCK_FILE=$2; shift ;;
    --valid-for-seconds) [[ $# -ge 2 ]] || usage; VALID_FOR_SECONDS=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || usage; CONFIRM=$2; shift ;;
    *) usage ;;
  esac
  shift
done

for required in \
  "$EXPECTED_IMAGE_ID" "$EXPECTED_CONTAINER_UID" "$EXPECTED_RESTART_POLICY" \
  "$EXPECTED_LISTENER" "$LEGACY_ROOT" "$DATABASE" "$DATABASE_UID" "$DATABASE_GID" \
  "$DATABASE_MODE" "$EXPECTED_SCHEMA_VERSION" "$RUNTIME_CONFIG" "$CONFIG_UID" \
  "$CONFIG_GID" "$CONFIG_MODE" "$EXPECTED_ACTOR_ID" "$EXPECTED_WORKSPACE_ID" \
  "$EXPECTED_CONTENT_AGENT_MODE" "$EXPECTED_SQLITE_PATH" "$LEGACY_BOOTSTRAP" \
  "$BOOTSTRAP_UID" "$BOOTSTRAP_GID" "$BOOTSTRAP_MODE" \
  "$EXPECTED_ACCESS_ORIGIN" "$LEGACY_ADMIN_STATE" "$LEGACY_ADMIN_PEPPER" \
  "$EXCLUDED_DORMANT_SECRET" "$CURRENT_LINK" "$NEW_SERVICE_UNIT_FILE" \
  "$NEW_BACKUP_SERVICE_UNIT_FILE" "$NEW_BACKUP_TIMER_UNIT_FILE" "$RECEIPT" \
  "$PRIVATE_KEY" "$PUBLIC_KEY" "$SERVICE_GID" "$LOCK_FILE" \
  "$VALID_FOR_SECONDS" "$CONFIRM"; do
  [[ -n $required ]] || usage
done

[[ $CONFIRM == "PREPARE_LEGACY_MIGRATION_V1" ]] \
  || legacy_die "literal confirmation PREPARE_LEGACY_MIGRATION_V1 is required"
[[ $EXPECTED_RESTART_POLICY == "unless-stopped" ]] \
  || legacy_die "only the observed unless-stopped legacy policy is accepted"
[[ $EXPECTED_CONTAINER_UID == "2001" ]] \
  || legacy_die "only the observed legacy UID 2001 is accepted"
[[ $EXPECTED_CONTENT_AGENT_MODE == "deterministic" ]] \
  || legacy_die "only the observed deterministic legacy mode is accepted"
[[ $EXPECTED_SCHEMA_VERSION == "32" ]] \
  || legacy_die "only the observed legacy SQLite schema 32 is accepted"
[[ $EXPECTED_LISTENER =~ ^(127\.0\.0\.1):([1-9][0-9]{0,4})$ ]] \
  || legacy_die "legacy listener must be an explicit IPv4 loopback endpoint"
EXPECTED_LISTENER_HOST=${BASH_REMATCH[1]}
EXPECTED_LISTENER_PORT=${BASH_REMATCH[2]}
((EXPECTED_LISTENER_PORT <= 65535)) || legacy_die "legacy listener port is invalid"
[[ $EXPECTED_ACCESS_ORIGIN == \
  "http://${EXPECTED_LISTENER_HOST}:${EXPECTED_LISTENER_PORT}" ]] \
  || legacy_die "legacy access origin must match the exact loopback listener"

legacy_require_root
for command in curl dd docker flock install jq openssl readlink sqlite3 ss stat; do
  legacy_require_command "$command"
done
legacy_require_image_id "$EXPECTED_IMAGE_ID"
legacy_require_canonical_directory "$LEGACY_ROOT" "legacy root"
legacy_require_integer "$EXPECTED_CONTAINER_UID" "legacy container UID"
legacy_require_integer "$DATABASE_UID" "legacy database UID"
legacy_require_integer "$DATABASE_GID" "legacy database GID"
legacy_require_integer "$CONFIG_UID" "legacy config UID"
legacy_require_integer "$CONFIG_GID" "legacy config GID"
legacy_require_integer "$BOOTSTRAP_UID" "legacy bootstrap UID"
legacy_require_integer "$BOOTSTRAP_GID" "legacy bootstrap GID"
legacy_require_integer "$SERVICE_GID" "service GID"
legacy_require_positive_integer "$VALID_FOR_SECONDS" "preflight validity"
((VALID_FOR_SECONDS <= 3600)) \
  || legacy_die "legacy preflight validity cannot exceed one hour"

legacy_require_absolute_safe_path "$RECEIPT" "preflight receipt"
legacy_prepare_secure_directory "$(dirname -- "$RECEIPT")" "$SERVICE_GID" 0750
legacy_require_absent_path "$RECEIPT" "preflight receipt"
legacy_require_absent_path "${RECEIPT}.sig" "preflight receipt signature"
legacy_acquire_lock "$LOCK_FILE" "$SERVICE_GID"

legacy_assert_path_absent "$CURRENT_LINK" "new current release link"
legacy_assert_path_absent "$NEW_SERVICE_UNIT_FILE" "new service unit"
legacy_assert_path_absent \
  "$NEW_BACKUP_SERVICE_UNIT_FILE" "new backup service unit"
legacy_assert_path_absent \
  "$NEW_BACKUP_TIMER_UNIT_FILE" "new backup timer unit"
legacy_assert_path_absent "$LEGACY_ADMIN_STATE" "legacy Admin Security state"
legacy_assert_path_absent "$LEGACY_ADMIN_PEPPER" "legacy Admin Security pepper"

legacy_require_file_metadata \
  "$DATABASE" "$DATABASE_UID" "$DATABASE_GID" "$DATABASE_MODE" \
  $((128 * 1024 * 1024 * 1024)) "legacy database"
legacy_require_file_metadata \
  "$RUNTIME_CONFIG" "$CONFIG_UID" "$CONFIG_GID" "$CONFIG_MODE" \
  $((1024 * 1024)) "legacy runtime config"
legacy_require_file_metadata \
  "$LEGACY_BOOTSTRAP" "$BOOTSTRAP_UID" "$BOOTSTRAP_GID" "$BOOTSTRAP_MODE" \
  16384 "legacy bootstrap"
legacy_require_canonical_existing_file \
  "$EXCLUDED_DORMANT_SECRET" "excluded dormant secret"
for legacy_path in \
  "$DATABASE" "$RUNTIME_CONFIG" "$LEGACY_BOOTSTRAP" "$LEGACY_ADMIN_STATE" \
  "$LEGACY_ADMIN_PEPPER" "$EXCLUDED_DORMANT_SECRET"; do
  [[ $legacy_path == "${LEGACY_ROOT}/"* ]] \
    || legacy_die "legacy source and absence paths must remain below legacy root"
done

WORK_DIR=$(mktemp -d "$(dirname -- "$RECEIPT")/.legacy-preflight.XXXXXX")
chmod 0700 "$WORK_DIR"
cleanup() {
  find "$WORK_DIR" -xdev -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

SPECIFICATIONS="${WORK_DIR}/container-specifications.json"
INSPECT="${WORK_DIR}/container-inspect.json"
INVENTORY="${WORK_DIR}/safe-inventory.json"
DATABASE_SNAPSHOT="${WORK_DIR}/database-observation.sqlite"
RUNTIME_OBSERVATION="${WORK_DIR}/runtime-config-observation.json"
DIRECTORY_OBSERVATIONS="${WORK_DIR}/directory-observations.json"
UNSIGNED="${WORK_DIR}/preflight-receipt.json"

legacy_write_container_specs "$SPECIFICATIONS" "${CONTAINER_SPECS[@]}"
legacy_capture_exact_inventory "$INSPECT" "$SPECIFICATIONS"
legacy_validate_inventory_file \
  "$INSPECT" "$SPECIFICATIONS" "$EXPECTED_IMAGE_ID" "$EXPECTED_CONTAINER_UID" \
  "$EXPECTED_RESTART_POLICY" "$EXPECTED_LISTENER_HOST" \
  "$EXPECTED_LISTENER_PORT" "$DATABASE" "$RUNTIME_CONFIG" \
  "$EXCLUDED_DORMANT_SECRET"
INVENTORY_FINGERPRINT=$(legacy_inventory_configuration_fingerprint "$INSPECT")
legacy_inventory_configuration_json "$INSPECT" >"$INVENTORY"

legacy_validate_runtime_config \
  "$RUNTIME_CONFIG" "$EXPECTED_ACTOR_ID" "$EXPECTED_WORKSPACE_ID" \
  "$EXPECTED_CONTENT_AGENT_MODE" "$EXPECTED_SQLITE_PATH"
legacy_validate_legacy_bootstrap "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN"
legacy_assert_listener_open "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"
legacy_probe_legacy_bootstrap "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN"

legacy_create_sqlite_copy \
  "$DATABASE" "$DATABASE_SNAPSHOT" "$EXPECTED_SCHEMA_VERSION"
DATABASE_SNAPSHOT_SHA=$(legacy_sha256_file "$DATABASE_SNAPSHOT")
legacy_file_observation_json "$RUNTIME_CONFIG" >"$RUNTIME_OBSERVATION"
printf '[]\n' >"$DIRECTORY_OBSERVATIONS"
declare -A OBSERVED_DIRECTORIES=()
for source_directory in \
  "$LEGACY_ROOT" "$(dirname -- "$DATABASE")" "$(dirname -- "$RUNTIME_CONFIG")" \
  "$(dirname -- "$LEGACY_BOOTSTRAP")" "$(dirname -- "$EXCLUDED_DORMANT_SECRET")"; do
  [[ -z ${OBSERVED_DIRECTORIES[$source_directory]+present} ]] || continue
  OBSERVED_DIRECTORIES[$source_directory]=1
  legacy_directory_observation_json \
    "$source_directory" >"${WORK_DIR}/directory-observation.json"
  jq --slurpfile observation "${WORK_DIR}/directory-observation.json" \
    '. + $observation | sort_by(.path)' \
    "$DIRECTORY_OBSERVATIONS" >"${DIRECTORY_OBSERVATIONS}.next"
  mv -fT -- "${DIRECTORY_OBSERVATIONS}.next" "$DIRECTORY_OBSERVATIONS"
done
CREATED_AT=$(legacy_current_timestamp)
VALID_UNTIL=$(legacy_future_timestamp "$VALID_FOR_SECONDS")

jq -S -n \
  --arg bootstrapGid "$BOOTSTRAP_GID" \
  --arg bootstrapMode "$BOOTSTRAP_MODE" \
  --arg bootstrapPath "$LEGACY_BOOTSTRAP" \
  --arg bootstrapUid "$BOOTSTRAP_UID" \
  --arg configFingerprint "$INVENTORY_FINGERPRINT" \
  --arg confirmedAction "$CONFIRM" \
  --arg createdAt "$CREATED_AT" \
  --arg databaseGid "$DATABASE_GID" \
  --arg databaseMode "$DATABASE_MODE" \
  --arg databasePath "$DATABASE" \
  --arg databaseSnapshotSha "$DATABASE_SNAPSHOT_SHA" \
  --arg databaseUid "$DATABASE_UID" \
  --arg dormantSecretPath "$EXCLUDED_DORMANT_SECRET" \
  --arg expectedAccessOrigin "$EXPECTED_ACCESS_ORIGIN" \
  --arg expectedActorId "$EXPECTED_ACTOR_ID" \
  --arg expectedContentAgentMode "$EXPECTED_CONTENT_AGENT_MODE" \
  --arg expectedImageId "$EXPECTED_IMAGE_ID" \
  --arg expectedListenerHost "$EXPECTED_LISTENER_HOST" \
  --arg expectedListenerPort "$EXPECTED_LISTENER_PORT" \
  --arg expectedRestartPolicy "$EXPECTED_RESTART_POLICY" \
  --arg expectedSchemaVersion "$EXPECTED_SCHEMA_VERSION" \
  --arg expectedSqlitePath "$EXPECTED_SQLITE_PATH" \
  --arg expectedUid "$EXPECTED_CONTAINER_UID" \
  --arg expectedWorkspaceId "$EXPECTED_WORKSPACE_ID" \
  --arg legacyAdminPepper "$LEGACY_ADMIN_PEPPER" \
  --arg legacyAdminState "$LEGACY_ADMIN_STATE" \
  --arg validUntil "$VALID_UNTIL" \
  --slurpfile inventory "$INVENTORY" \
  --slurpfile directories "$DIRECTORY_OBSERVATIONS" \
  --slurpfile runtimeConfig "$RUNTIME_OBSERVATION" \
  '{
    confirmedAction: $confirmedAction,
    contractVersion: "1",
    createdAt: $createdAt,
    inventory: {
      configurationFingerprint: $configFingerprint,
      containerCount: 4,
      containers: $inventory[0],
      expectedImageId: $expectedImageId,
      expectedListener: {
        host: $expectedListenerHost,
        port: ($expectedListenerPort | tonumber)
      },
      expectedRestartPolicy: $expectedRestartPolicy,
      expectedRuntimeUid: ($expectedUid | tonumber)
    },
    kind: "LEGACY_MIGRATION_PREFLIGHT",
    migrationPolicy: {
      adminSecurityContinuity: "NOT_APPLICABLE_PRE_ADMIN_SECURITY",
      copyOnMigrate: true,
      dormantSecretImport: "FORBIDDEN",
      immutableSourceRequired: true,
      mutableImageTagTrusted: false
    },
    secretsExposed: false,
    sources: {
      adminPepper: {path: $legacyAdminPepper, status: "ABSENT"},
      adminSecurityState: {path: $legacyAdminState, status: "ABSENT"},
      database: {
        observedSnapshotSha256: $databaseSnapshotSha,
        path: $databasePath,
        sqliteIntegrity: "ok",
        stat: {
          gid: ($databaseGid | tonumber),
          mode: $databaseMode,
          uid: ($databaseUid | tonumber)
        },
        userVersion: ($expectedSchemaVersion | tonumber)
      },
      dormantSecret: {
        contentRead: false,
        importAllowed: false,
        mountedByLegacyContainer: false,
        path: $dormantSecretPath,
        status: "PRESENT_NOT_MOUNTED_EXCLUDED"
      },
      legacyBootstrap: {
        accessUrlDisclosed: false,
        expectedOrigin: $expectedAccessOrigin,
        healthProbe: "AUTHENTICATED_OK",
        path: $bootstrapPath,
        secretCopied: false,
        stat: {
          gid: ($bootstrapGid | tonumber),
          mode: $bootstrapMode,
          uid: ($bootstrapUid | tonumber)
        },
        status: "OWNER_ONLY_VALID"
      },
      directories: $directories[0],
      runtimeConfig: (
        $runtimeConfig[0] + {
          validated: {
            actorId: $expectedActorId,
            contentAgentMode: $expectedContentAgentMode,
            modelProvider: "ABSENT",
            providerMode: "ABSENT",
            sqlitePath: $expectedSqlitePath,
            workspaceId: $expectedWorkspaceId
          }
        }
      )
    },
    status: "READY_FOR_EXPLICIT_QUIESCE",
    validUntil: $validUntil
  }' >"$UNSIGNED"

legacy_publish_signed_json \
  "$UNSIGNED" "$RECEIPT" "$PRIVATE_KEY" "$PUBLIC_KEY" "$SERVICE_GID" \
  >/dev/null
trap - EXIT
cleanup

printf 'LEGACY_PREFLIGHT_RECEIPT=%s\n' "$RECEIPT"
printf 'LEGACY_PREFLIGHT_SIGNATURE=%s\n' "${RECEIPT}.sig"
