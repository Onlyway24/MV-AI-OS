#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=lib/legacy-migration-common.sh
source "${SOURCE_ROOT}/scripts/production/lib/legacy-migration-common.sh"

usage() {
  cat >&2 <<'EOF'
usage: legacy-migration-quiesce.sh
  --phase INITIAL|FORWARD_AFTER_ROLLBACK
  --preflight-receipt ABS_PATH --preflight-signature ABS_PATH
  --rollback-receipt ABS_PATH|NONE --rollback-signature ABS_PATH|NONE
  --database-copy ABS_PATH --database-forensic-copy ABS_PATH
  --runtime-config-copy ABS_PATH
  --copy-root ABS_PATH
  --receipt ABS_PATH --private-key ABS_PATH --public-key ABS_PATH
  --service-gid GID --lock-file ABS_PATH
  --stop-timeout SECONDS --probe-attempts N --probe-interval SECONDS
  --confirm QUIESCE_AND_COPY_LEGACY_V1|REQUIESCE_FOR_FORWARD_DEPLOY_V1
EOF
  exit 2
}

PHASE=
PREFLIGHT_RECEIPT=
PREFLIGHT_SIGNATURE=
ROLLBACK_RECEIPT=
ROLLBACK_SIGNATURE=
DATABASE_COPY=
DATABASE_FORENSIC_COPY=
RUNTIME_CONFIG_COPY=
COPY_ROOT=
RECEIPT=
PRIVATE_KEY=
PUBLIC_KEY=
SERVICE_GID=
LOCK_FILE=
STOP_TIMEOUT=
PROBE_ATTEMPTS=
PROBE_INTERVAL=
CONFIRM=

while (($# > 0)); do
  case "$1" in
    --phase) [[ $# -ge 2 ]] || usage; PHASE=$2; shift ;;
    --preflight-receipt) [[ $# -ge 2 ]] || usage; PREFLIGHT_RECEIPT=$2; shift ;;
    --preflight-signature) [[ $# -ge 2 ]] || usage; PREFLIGHT_SIGNATURE=$2; shift ;;
    --rollback-receipt) [[ $# -ge 2 ]] || usage; ROLLBACK_RECEIPT=$2; shift ;;
    --rollback-signature) [[ $# -ge 2 ]] || usage; ROLLBACK_SIGNATURE=$2; shift ;;
    --database-copy) [[ $# -ge 2 ]] || usage; DATABASE_COPY=$2; shift ;;
    --database-forensic-copy) [[ $# -ge 2 ]] || usage; DATABASE_FORENSIC_COPY=$2; shift ;;
    --runtime-config-copy) [[ $# -ge 2 ]] || usage; RUNTIME_CONFIG_COPY=$2; shift ;;
    --copy-root) [[ $# -ge 2 ]] || usage; COPY_ROOT=$2; shift ;;
    --receipt) [[ $# -ge 2 ]] || usage; RECEIPT=$2; shift ;;
    --private-key) [[ $# -ge 2 ]] || usage; PRIVATE_KEY=$2; shift ;;
    --public-key) [[ $# -ge 2 ]] || usage; PUBLIC_KEY=$2; shift ;;
    --service-gid) [[ $# -ge 2 ]] || usage; SERVICE_GID=$2; shift ;;
    --lock-file) [[ $# -ge 2 ]] || usage; LOCK_FILE=$2; shift ;;
    --stop-timeout) [[ $# -ge 2 ]] || usage; STOP_TIMEOUT=$2; shift ;;
    --probe-attempts) [[ $# -ge 2 ]] || usage; PROBE_ATTEMPTS=$2; shift ;;
    --probe-interval) [[ $# -ge 2 ]] || usage; PROBE_INTERVAL=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || usage; CONFIRM=$2; shift ;;
    *) usage ;;
  esac
  shift
done

for required in \
  "$PHASE" "$PREFLIGHT_RECEIPT" "$PREFLIGHT_SIGNATURE" "$ROLLBACK_RECEIPT" \
  "$ROLLBACK_SIGNATURE" "$DATABASE_COPY" \
  "$DATABASE_FORENSIC_COPY" "$RUNTIME_CONFIG_COPY" "$COPY_ROOT" "$RECEIPT" \
  "$PRIVATE_KEY" "$PUBLIC_KEY" \
  "$SERVICE_GID" "$LOCK_FILE" "$STOP_TIMEOUT" "$PROBE_ATTEMPTS" \
  "$PROBE_INTERVAL" "$CONFIRM"; do
  [[ -n $required ]] || usage
done

case "$PHASE" in
  INITIAL)
    [[ $CONFIRM == "QUIESCE_AND_COPY_LEGACY_V1" \
      && $ROLLBACK_RECEIPT == "NONE" && $ROLLBACK_SIGNATURE == "NONE" ]] \
      || legacy_die "INITIAL quiesce requires QUIESCE_AND_COPY_LEGACY_V1 and no rollback receipt"
    ;;
  FORWARD_AFTER_ROLLBACK)
    [[ $CONFIRM == "REQUIESCE_FOR_FORWARD_DEPLOY_V1" \
      && $ROLLBACK_RECEIPT != "NONE" && $ROLLBACK_SIGNATURE != "NONE" ]] \
      || legacy_die "forward re-quiesce requires a signed rollback and REQUIESCE_FOR_FORWARD_DEPLOY_V1"
    ;;
  *)
    legacy_die "quiesce phase must be INITIAL or FORWARD_AFTER_ROLLBACK"
    ;;
esac
legacy_require_root
for command in \
  curl dd docker find flock install jq openssl readlink sqlite3 ss stat; do
  legacy_require_command "$command"
done
legacy_require_integer "$SERVICE_GID" "service GID"
legacy_require_positive_integer "$STOP_TIMEOUT" "container stop timeout"
legacy_require_positive_integer "$PROBE_ATTEMPTS" "legacy recovery attempts"
legacy_require_positive_integer "$PROBE_INTERVAL" "legacy recovery interval"
((STOP_TIMEOUT <= 300)) || legacy_die "container stop timeout is too large"
((PROBE_ATTEMPTS <= 120)) || legacy_die "legacy recovery attempts are too large"
((PROBE_INTERVAL <= 30)) || legacy_die "legacy recovery interval is too large"

legacy_require_absolute_safe_path "$COPY_ROOT" "migration copy root"
legacy_require_absolute_safe_path "$DATABASE_COPY" "database migration copy"
legacy_require_absolute_safe_path \
  "$DATABASE_FORENSIC_COPY" "database forensic copy"
legacy_require_absolute_safe_path \
  "$RUNTIME_CONFIG_COPY" "runtime config migration copy"
[[ $(dirname -- "$DATABASE_COPY") == "$COPY_ROOT" \
  && $(dirname -- "$DATABASE_FORENSIC_COPY") == "$COPY_ROOT" \
  && $(dirname -- "$RUNTIME_CONFIG_COPY") == "$COPY_ROOT" \
  && $DATABASE_COPY != "$DATABASE_FORENSIC_COPY" \
  && $DATABASE_COPY != "$RUNTIME_CONFIG_COPY" \
  && $DATABASE_FORENSIC_COPY != "$RUNTIME_CONFIG_COPY" ]] \
  || legacy_die "migration copies must be distinct direct children of copy root"
legacy_assert_path_absent "$COPY_ROOT" "migration copy root"
legacy_require_absolute_safe_path "$RECEIPT" "quiesce receipt"
legacy_prepare_secure_directory "$(dirname -- "$RECEIPT")" "$SERVICE_GID" 0750
legacy_require_absent_path "$RECEIPT" "quiesce receipt"
legacy_require_absent_path "${RECEIPT}.sig" "quiesce receipt signature"
legacy_acquire_lock "$LOCK_FILE" "$SERVICE_GID"

PREFLIGHT_SHA=$(legacy_verify_signed_json \
  "$PREFLIGHT_RECEIPT" "$PREFLIGHT_SIGNATURE" "$PUBLIC_KEY" "$SERVICE_GID")
jq -e '
  .contractVersion == "1" and
  .kind == "LEGACY_MIGRATION_PREFLIGHT" and
  .status == "READY_FOR_EXPLICIT_QUIESCE" and
  .confirmedAction == "PREPARE_LEGACY_MIGRATION_V1" and
  .secretsExposed == false and
  .inventory.containerCount == 4 and
  (.inventory.configurationFingerprint | test("^[0-9a-f]{64}$")) and
  (.inventory.expectedImageId | test("^sha256:[0-9a-f]{64}$")) and
  .inventory.expectedRestartPolicy == "unless-stopped" and
  .inventory.expectedRuntimeUid == 2001 and
  .sources.database.sqliteIntegrity == "ok" and
  .sources.database.userVersion == 32 and
  .sources.adminSecurityState.status == "ABSENT" and
  .sources.adminPepper.status == "ABSENT" and
  .sources.dormantSecret.status == "PRESENT_NOT_MOUNTED_EXCLUDED" and
  .sources.dormantSecret.contentRead == false and
  .sources.dormantSecret.importAllowed == false and
  .sources.legacyBootstrap.accessUrlDisclosed == false and
  .sources.legacyBootstrap.secretCopied == false and
  .migrationPolicy.mutableImageTagTrusted == false and
  .migrationPolicy.copyOnMigrate == true
' "$PREFLIGHT_RECEIPT" >/dev/null \
  || legacy_die "signed legacy preflight receipt contract is invalid"
ROLLBACK_SHA="NOT_APPLICABLE_INITIAL_QUIESCE"
ROLLBACK_SIGNATURE_SHA="NOT_APPLICABLE_INITIAL_QUIESCE"
FIRST_SUCCESS_MARKER="NOT_APPLICABLE_INITIAL_QUIESCE"
FIRST_SUCCESS_MARKER_SHA="NOT_APPLICABLE_INITIAL_QUIESCE"
FIRST_SUCCESS_SIGNATURE_SHA="NOT_APPLICABLE_INITIAL_QUIESCE"
EXPECTED_ADMIN_STATE_UID=
EXPECTED_ADMIN_STATE_GID=
EXPECTED_ADMIN_STATE_MODE=
EXPECTED_ADMIN_PEPPER_UID=
EXPECTED_ADMIN_PEPPER_GID=
EXPECTED_ADMIN_PEPPER_MODE=
if [[ $PHASE == "INITIAL" ]]; then
  legacy_assert_not_expired \
    "$(jq -er '.validUntil' "$PREFLIGHT_RECEIPT")" "legacy preflight"
else
  ROLLBACK_SHA=$(legacy_verify_signed_json \
    "$ROLLBACK_RECEIPT" "$ROLLBACK_SIGNATURE" "$PUBLIC_KEY" "$SERVICE_GID")
  jq -e \
    --slurpfile preflight "$PREFLIGHT_RECEIPT" \
    '
      .contractVersion == "1" and
      .kind == "LEGACY_MIGRATION_ROLLBACK" and
      .status == "ROLLED_BACK_TO_EXACT_LEGACY_RUNTIME" and
      .phase == "CUTOVER" and
      .secretsExposed == false and
      .legacyRuntime.running == true and
      .legacyRuntime.restartPolicy == "unless-stopped" and
      .legacyRuntime.health == "AUTHENTICATED_OK" and
      ([.legacyRuntime.exactIdentities[] | {id, name}] | sort_by(.name)) ==
        ([$preflight[0].inventory.containers[] | {id, name}] | sort_by(.name))
    ' "$ROLLBACK_RECEIPT" >/dev/null \
    || legacy_die "signed rollback receipt cannot authorize forward re-quiesce"
  ROLLBACK_SIGNATURE_SHA=$(legacy_sha256_file "$ROLLBACK_SIGNATURE")
  FIRST_SUCCESS_MARKER=$(jq -er '.evidence.successMarker' "$ROLLBACK_RECEIPT")
  FIRST_SUCCESS_MARKER_SHA=$(legacy_verify_signed_json \
    "$FIRST_SUCCESS_MARKER" "${FIRST_SUCCESS_MARKER}.sig" \
    "$PUBLIC_KEY" "$SERVICE_GID")
  [[ $FIRST_SUCCESS_MARKER_SHA == \
      "$(jq -er '.evidence.successMarkerSha256' "$ROLLBACK_RECEIPT")" \
    && $(legacy_sha256_file "${FIRST_SUCCESS_MARKER}.sig") == \
      "$(jq -er '.evidence.successSignatureSha256' "$ROLLBACK_RECEIPT")" ]] \
    || legacy_die "rollback evidence does not bind the first success marker"
  jq -e '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_SUCCESS" and
    .status == "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED" and
    .legacyRollbackBoundary.quiescePhase == "INITIAL" and
    .newAdminSecurity.state.status == "NEW_PRE_ADMIN_MIGRATION" and
    .newAdminSecurity.pepper.status == "NEW_OWNER_ONLY" and
    (.newAdminSecurity.state.uid | type == "number" and floor == .) and
    (.newAdminSecurity.state.gid | type == "number" and floor == .) and
    .newAdminSecurity.state.mode == "600" and
    (.newAdminSecurity.pepper.uid | type == "number" and floor == .) and
    (.newAdminSecurity.pepper.gid | type == "number" and floor == .) and
    .newAdminSecurity.pepper.mode == "600" and
    .newAdminSecurity.legacyCredentialContinuityClaimed == false and
    .secretsExposed == false
  ' "$FIRST_SUCCESS_MARKER" >/dev/null \
    || legacy_die "first success marker cannot authorize retained Admin Security state"
  FIRST_SUCCESS_SIGNATURE_SHA=$(legacy_sha256_file \
    "${FIRST_SUCCESS_MARKER}.sig")
  EXPECTED_ADMIN_STATE_UID=$(jq -er \
    '.newAdminSecurity.state.uid' "$FIRST_SUCCESS_MARKER")
  EXPECTED_ADMIN_STATE_GID=$(jq -er \
    '.newAdminSecurity.state.gid' "$FIRST_SUCCESS_MARKER")
  EXPECTED_ADMIN_STATE_MODE=$(jq -er \
    '.newAdminSecurity.state.mode' "$FIRST_SUCCESS_MARKER")
  EXPECTED_ADMIN_PEPPER_UID=$(jq -er \
    '.newAdminSecurity.pepper.uid' "$FIRST_SUCCESS_MARKER")
  EXPECTED_ADMIN_PEPPER_GID=$(jq -er \
    '.newAdminSecurity.pepper.gid' "$FIRST_SUCCESS_MARKER")
  EXPECTED_ADMIN_PEPPER_MODE=$(jq -er \
    '.newAdminSecurity.pepper.mode' "$FIRST_SUCCESS_MARKER")
fi

DATABASE=$(jq -er '.sources.database.path' "$PREFLIGHT_RECEIPT")
DATABASE_UID=$(jq -er '.sources.database.stat.uid' "$PREFLIGHT_RECEIPT")
DATABASE_GID=$(jq -er '.sources.database.stat.gid' "$PREFLIGHT_RECEIPT")
DATABASE_MODE=$(jq -er '.sources.database.stat.mode' "$PREFLIGHT_RECEIPT")
EXPECTED_SCHEMA_VERSION=$(jq -er '.sources.database.userVersion' "$PREFLIGHT_RECEIPT")
RUNTIME_CONFIG=$(jq -er '.sources.runtimeConfig.path' "$PREFLIGHT_RECEIPT")
RUNTIME_CONFIG_SHA=$(jq -er '.sources.runtimeConfig.sha256' "$PREFLIGHT_RECEIPT")
CONFIG_UID=$(jq -er '.sources.runtimeConfig.stat.uid' "$PREFLIGHT_RECEIPT")
CONFIG_GID=$(jq -er '.sources.runtimeConfig.stat.gid' "$PREFLIGHT_RECEIPT")
CONFIG_MODE=$(jq -er '.sources.runtimeConfig.stat.mode' "$PREFLIGHT_RECEIPT")
EXPECTED_ACTOR_ID=$(jq -er '.sources.runtimeConfig.validated.actorId' "$PREFLIGHT_RECEIPT")
EXPECTED_WORKSPACE_ID=$(jq -er '.sources.runtimeConfig.validated.workspaceId' "$PREFLIGHT_RECEIPT")
EXPECTED_CONTENT_AGENT_MODE=$(jq -er '.sources.runtimeConfig.validated.contentAgentMode' "$PREFLIGHT_RECEIPT")
EXPECTED_SQLITE_PATH=$(jq -er '.sources.runtimeConfig.validated.sqlitePath' "$PREFLIGHT_RECEIPT")
LEGACY_BOOTSTRAP=$(jq -er '.sources.legacyBootstrap.path' "$PREFLIGHT_RECEIPT")
BOOTSTRAP_UID=$(jq -er '.sources.legacyBootstrap.stat.uid' "$PREFLIGHT_RECEIPT")
BOOTSTRAP_GID=$(jq -er '.sources.legacyBootstrap.stat.gid' "$PREFLIGHT_RECEIPT")
BOOTSTRAP_MODE=$(jq -er '.sources.legacyBootstrap.stat.mode' "$PREFLIGHT_RECEIPT")
EXPECTED_ACCESS_ORIGIN=$(jq -er '.sources.legacyBootstrap.expectedOrigin' "$PREFLIGHT_RECEIPT")
LEGACY_ADMIN_STATE=$(jq -er '.sources.adminSecurityState.path' "$PREFLIGHT_RECEIPT")
LEGACY_ADMIN_PEPPER=$(jq -er '.sources.adminPepper.path' "$PREFLIGHT_RECEIPT")
EXCLUDED_DORMANT_SECRET=$(jq -er '.sources.dormantSecret.path' "$PREFLIGHT_RECEIPT")
EXPECTED_IMAGE_ID=$(jq -er '.inventory.expectedImageId' "$PREFLIGHT_RECEIPT")
EXPECTED_CONTAINER_UID=$(jq -er '.inventory.expectedRuntimeUid' "$PREFLIGHT_RECEIPT")
EXPECTED_RESTART_POLICY=$(jq -er '.inventory.expectedRestartPolicy' "$PREFLIGHT_RECEIPT")
EXPECTED_LISTENER_HOST=$(jq -er '.inventory.expectedListener.host' "$PREFLIGHT_RECEIPT")
EXPECTED_LISTENER_PORT=$(jq -er '.inventory.expectedListener.port' "$PREFLIGHT_RECEIPT")
CONFIGURATION_FINGERPRINT=$(jq -er \
  '.inventory.configurationFingerprint' "$PREFLIGHT_RECEIPT")

for path_value in \
  "$DATABASE" "$RUNTIME_CONFIG" "$LEGACY_BOOTSTRAP" "$LEGACY_ADMIN_STATE" \
  "$LEGACY_ADMIN_PEPPER" "$EXCLUDED_DORMANT_SECRET"; do
  legacy_require_absolute_safe_path "$path_value" "signed legacy path"
done
case "$COPY_ROOT/" in
  "$(dirname -- "$DATABASE")/"*|"$(dirname -- "$RUNTIME_CONFIG")/"*)
    legacy_die "copy root must not be nested inside legacy source directories"
    ;;
esac

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
ADMIN_STATE_STATUS="ABSENT"
ADMIN_PEPPER_STATUS="ABSENT"
validate_admin_security_boundary() {
  if [[ $PHASE == "INITIAL" ]]; then
    legacy_assert_path_absent \
      "$LEGACY_ADMIN_STATE" "legacy Admin Security state"
    legacy_assert_path_absent \
      "$LEGACY_ADMIN_PEPPER" "legacy Admin Security pepper"
    return
  fi

  [[ $(jq -er '.newAdminSecurity.state.path' "$FIRST_SUCCESS_MARKER") == \
      "$LEGACY_ADMIN_STATE" \
    && $(jq -er '.newAdminSecurity.pepper.path' "$FIRST_SUCCESS_MARKER") == \
      "$LEGACY_ADMIN_PEPPER" ]] \
    || legacy_die "retained Admin Security paths differ from the signed first cutover"
  legacy_require_file_metadata \
    "$LEGACY_ADMIN_STATE" "$EXPECTED_ADMIN_STATE_UID" \
    "$EXPECTED_ADMIN_STATE_GID" "$EXPECTED_ADMIN_STATE_MODE" \
    $((5 * 1024 * 1024)) "retained Admin Security state"
  legacy_validate_new_admin_state "$LEGACY_ADMIN_STATE"
  legacy_require_file_metadata \
    "$LEGACY_ADMIN_PEPPER" "$EXPECTED_ADMIN_PEPPER_UID" \
    "$EXPECTED_ADMIN_PEPPER_GID" "$EXPECTED_ADMIN_PEPPER_MODE" \
    4096 "retained Admin Security pepper"
  [[ $(stat -c '%s' "$LEGACY_ADMIN_PEPPER") -ge 32 ]] \
    || legacy_die "retained Admin Security pepper is too short"
  ADMIN_STATE_STATUS="RETAINED_NEW_STACK_STATE"
  ADMIN_PEPPER_STATUS="RETAINED_NEW_STACK_PEPPER"
}
validate_admin_security_boundary
[[ $(legacy_sha256_file "$RUNTIME_CONFIG") == "$RUNTIME_CONFIG_SHA" ]] \
  || legacy_die "legacy runtime config changed after preflight"
legacy_validate_runtime_config \
  "$RUNTIME_CONFIG" "$EXPECTED_ACTOR_ID" "$EXPECTED_WORKSPACE_ID" \
  "$EXPECTED_CONTENT_AGENT_MODE" "$EXPECTED_SQLITE_PATH"
legacy_validate_legacy_bootstrap "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN"
legacy_probe_legacy_bootstrap "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN"

WORK_DIR=$(mktemp -d "$(dirname -- "$RECEIPT")/.legacy-quiesce.XXXXXX")
chmod 0700 "$WORK_DIR"
SPECIFICATIONS="${WORK_DIR}/container-specifications.json"
INSPECT="${WORK_DIR}/container-inspect.json"
STOPPED_INSPECT="${WORK_DIR}/container-stopped-inspect.json"
DATABASE_SOURCE_OBSERVATION="${WORK_DIR}/database-source.json"
DATABASE_COPY_OBSERVATION="${WORK_DIR}/database-copy.json"
DATABASE_FORENSIC_OBSERVATION="${WORK_DIR}/database-forensic-copy.json"
CONFIG_SOURCE_OBSERVATION="${WORK_DIR}/config-source.json"
CONFIG_COPY_OBSERVATION="${WORK_DIR}/config-copy.json"
SOURCE_DIRECTORIES="${WORK_DIR}/source-directories.json"
UNSIGNED="${WORK_DIR}/quiesce-receipt.json"

jq -S '[.inventory.containers[] | {id, name}] | sort_by(.name)' \
  "$PREFLIGHT_RECEIPT" >"$SPECIFICATIONS"
jq -S '.sources.directories' "$PREFLIGHT_RECEIPT" >"$SOURCE_DIRECTORIES"
legacy_verify_directory_metadata "$SOURCE_DIRECTORIES"
legacy_capture_exact_inventory "$INSPECT" "$SPECIFICATIONS"
legacy_validate_inventory_file \
  "$INSPECT" "$SPECIFICATIONS" "$EXPECTED_IMAGE_ID" "$EXPECTED_CONTAINER_UID" \
  "$EXPECTED_RESTART_POLICY" "$EXPECTED_LISTENER_HOST" \
  "$EXPECTED_LISTENER_PORT" "$DATABASE" "$RUNTIME_CONFIG" \
  "$EXCLUDED_DORMANT_SECRET"
if [[ $PHASE == "FORWARD_AFTER_ROLLBACK" ]]; then
  legacy_assert_host_path_not_mounted "$INSPECT" "$LEGACY_ADMIN_STATE"
  legacy_assert_host_path_not_mounted "$INSPECT" "$LEGACY_ADMIN_PEPPER"
fi
legacy_assert_configuration_fingerprint \
  "$INSPECT" "$CONFIGURATION_FINGERPRINT"
legacy_assert_listener_open "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"

mapfile -t CONTAINER_IDS < <(jq -er '.[].id' "$SPECIFICATIONS")
POLICY_CHANGED=false
LEGACY_STOPPED=false
COPY_ROOT_CREATED=false
SUCCESS=false

restore_legacy_after_failure() {
  local restored=true
  set +e
  if [[ $LEGACY_STOPPED == "true" || $POLICY_CHANGED == "true" ]]; then
    docker update --restart="$EXPECTED_RESTART_POLICY" \
      "${CONTAINER_IDS[@]}" >/dev/null 2>&1 || restored=false
    docker start "${CONTAINER_IDS[@]}" >/dev/null 2>&1 || restored=false
    docker inspect "${CONTAINER_IDS[@]}" >"${WORK_DIR}/failure-restored-inspect.json" \
      2>/dev/null || restored=false
    (
      legacy_assert_configuration_fingerprint \
        "${WORK_DIR}/failure-restored-inspect.json" "$CONFIGURATION_FINGERPRINT"
      legacy_assert_container_state \
        "${WORK_DIR}/failure-restored-inspect.json" true \
        "$EXPECTED_RESTART_POLICY"
      legacy_wait_for_legacy_bootstrap \
        "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN" \
        "$PROBE_ATTEMPTS" "$PROBE_INTERVAL"
      legacy_assert_listener_open \
        "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"
    ) >/dev/null 2>&1 || restored=false
  fi
  if [[ $COPY_ROOT_CREATED == "true" && -d $COPY_ROOT && ! -L $COPY_ROOT \
    && $(readlink -f -- "$COPY_ROOT") == "$COPY_ROOT" ]]; then
    find "$COPY_ROOT" -xdev -depth -delete >/dev/null 2>&1 || restored=false
  fi
  find "$WORK_DIR" -xdev -depth -delete >/dev/null 2>&1 || restored=false
  if [[ $restored == "true" ]]; then
    legacy_log "failed quiesce restored the exact legacy containers and removed staged copies"
  else
    legacy_log "ERROR: failed quiesce could not fully restore the legacy boundary"
  fi
  set -e
}

on_exit() {
  local exit_code=$?
  if [[ $SUCCESS != "true" ]]; then
    restore_legacy_after_failure
  fi
  exit "$exit_code"
}
trap on_exit EXIT

for container_id in "${CONTAINER_IDS[@]}"; do
  docker update --restart=no "$container_id" >/dev/null
  POLICY_CHANGED=true
done
docker stop --time "$STOP_TIMEOUT" "${CONTAINER_IDS[@]}" >/dev/null
LEGACY_STOPPED=true

legacy_capture_selected_containers "$STOPPED_INSPECT" "$SPECIFICATIONS"
legacy_assert_configuration_fingerprint_with_policy \
  "$STOPPED_INSPECT" "$CONFIGURATION_FINGERPRINT" "$EXPECTED_RESTART_POLICY"
legacy_assert_container_state "$STOPPED_INSPECT" false no
legacy_assert_listener_closed "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"
for sqlite_sidecar_suffix in -wal -shm -journal; do
  [[ ! -e "${DATABASE}${sqlite_sidecar_suffix}" \
    && ! -L "${DATABASE}${sqlite_sidecar_suffix}" ]] \
    || legacy_die "legacy SQLite sidecar remains after clean quiesce"
done

legacy_require_file_metadata \
  "$DATABASE" "$DATABASE_UID" "$DATABASE_GID" "$DATABASE_MODE" \
  $((128 * 1024 * 1024 * 1024)) "quiesced legacy database"
legacy_require_file_metadata \
  "$RUNTIME_CONFIG" "$CONFIG_UID" "$CONFIG_GID" "$CONFIG_MODE" \
  $((1024 * 1024)) "quiesced legacy runtime config"
validate_admin_security_boundary
[[ $(legacy_sha256_file "$RUNTIME_CONFIG") == "$RUNTIME_CONFIG_SHA" ]] \
  || legacy_die "legacy runtime config changed before coherent copy"

legacy_prepare_secure_directory "$COPY_ROOT" "$SERVICE_GID" 0700
COPY_ROOT_CREATED=true
DATABASE_IDENTITY_BEFORE=$(legacy_file_identity "$DATABASE")
DATABASE_SHA_BEFORE=$(legacy_sha256_file "$DATABASE")
CONFIG_IDENTITY_BEFORE=$(legacy_file_identity "$RUNTIME_CONFIG")
CONFIG_SHA_BEFORE=$(legacy_sha256_file "$RUNTIME_CONFIG")

legacy_create_sqlite_copy \
  "$DATABASE" "$DATABASE_COPY" "$EXPECTED_SCHEMA_VERSION"
legacy_copy_regular_file_nofollow "$DATABASE" "$DATABASE_FORENSIC_COPY"
legacy_copy_regular_file_nofollow "$RUNTIME_CONFIG" "$RUNTIME_CONFIG_COPY"

[[ $(legacy_file_identity "$DATABASE") == "$DATABASE_IDENTITY_BEFORE" \
  && $(legacy_sha256_file "$DATABASE") == "$DATABASE_SHA_BEFORE" ]] \
  || legacy_die "legacy database changed during copy-on-migrate"
[[ $(legacy_file_identity "$RUNTIME_CONFIG") == "$CONFIG_IDENTITY_BEFORE" \
  && $(legacy_sha256_file "$RUNTIME_CONFIG") == "$CONFIG_SHA_BEFORE" ]] \
  || legacy_die "legacy runtime config changed during copy-on-migrate"
[[ $(legacy_sha256_file "$RUNTIME_CONFIG_COPY") == "$CONFIG_SHA_BEFORE" ]] \
  || legacy_die "runtime config migration copy does not match its source"
[[ $(legacy_sha256_file "$DATABASE_FORENSIC_COPY") == "$DATABASE_SHA_BEFORE" ]] \
  || legacy_die "forensic database copy does not match its immutable source"
legacy_sqlite_integrity_and_version "$DATABASE_COPY" "$EXPECTED_SCHEMA_VERSION"

legacy_file_observation_json "$DATABASE" >"$DATABASE_SOURCE_OBSERVATION"
legacy_file_observation_json "$DATABASE_COPY" >"$DATABASE_COPY_OBSERVATION"
legacy_file_observation_json \
  "$DATABASE_FORENSIC_COPY" >"$DATABASE_FORENSIC_OBSERVATION"
legacy_file_observation_json "$RUNTIME_CONFIG" >"$CONFIG_SOURCE_OBSERVATION"
legacy_file_observation_json "$RUNTIME_CONFIG_COPY" >"$CONFIG_COPY_OBSERVATION"

CREATED_AT=$(legacy_current_timestamp)
PREFLIGHT_SIGNATURE_SHA=$(legacy_sha256_file "$PREFLIGHT_SIGNATURE")
jq -S -n \
  --arg configurationFingerprint "$CONFIGURATION_FINGERPRINT" \
  --arg confirmedAction "$CONFIRM" \
  --arg copyRoot "$COPY_ROOT" \
  --arg createdAt "$CREATED_AT" \
  --arg expectedAccessOrigin "$EXPECTED_ACCESS_ORIGIN" \
  --arg expectedListenerHost "$EXPECTED_LISTENER_HOST" \
  --arg expectedListenerPort "$EXPECTED_LISTENER_PORT" \
  --arg expectedRestartPolicy "$EXPECTED_RESTART_POLICY" \
  --arg excludedDormantSecret "$EXCLUDED_DORMANT_SECRET" \
  --arg firstSuccessMarker "$FIRST_SUCCESS_MARKER" \
  --arg firstSuccessMarkerSha256 "$FIRST_SUCCESS_MARKER_SHA" \
  --arg firstSuccessSignatureSha256 "$FIRST_SUCCESS_SIGNATURE_SHA" \
  --arg legacyAdminPepperStatus "$ADMIN_PEPPER_STATUS" \
  --arg legacyAdminStateStatus "$ADMIN_STATE_STATUS" \
  --arg legacyAdminPepper "$LEGACY_ADMIN_PEPPER" \
  --arg legacyAdminState "$LEGACY_ADMIN_STATE" \
  --arg legacyBootstrap "$LEGACY_BOOTSTRAP" \
  --arg preflightReceipt "$PREFLIGHT_RECEIPT" \
  --arg preflightReceiptSha256 "$PREFLIGHT_SHA" \
  --arg preflightSignatureSha256 "$PREFLIGHT_SIGNATURE_SHA" \
  --arg quiescePhase "$PHASE" \
  --arg rollbackReceipt "$ROLLBACK_RECEIPT" \
  --arg rollbackReceiptSha256 "$ROLLBACK_SHA" \
  --arg rollbackSignatureSha256 "$ROLLBACK_SIGNATURE_SHA" \
  --slurpfile containers "$SPECIFICATIONS" \
  --slurpfile databaseCopy "$DATABASE_COPY_OBSERVATION" \
  --slurpfile databaseForensicCopy "$DATABASE_FORENSIC_OBSERVATION" \
  --slurpfile databaseSource "$DATABASE_SOURCE_OBSERVATION" \
  --slurpfile directories "$SOURCE_DIRECTORIES" \
  --slurpfile runtimeConfigCopy "$CONFIG_COPY_OBSERVATION" \
  --slurpfile runtimeConfigSource "$CONFIG_SOURCE_OBSERVATION" \
  '{
    confirmedAction: $confirmedAction,
    containers: {
      configurationFingerprint: $configurationFingerprint,
      exactIdentities: $containers[0],
      restartPolicyAfterQuiesce: "no",
      restartPolicyBeforeQuiesce: $expectedRestartPolicy,
      runningAfterQuiesce: false,
      runningBeforeQuiesce: true
    },
    contractVersion: "1",
    copy: {
      copyRoot: $copyRoot,
      database: $databaseCopy[0],
      forensicDatabase: $databaseForensicCopy[0],
      runtimeConfig: $runtimeConfigCopy[0]
    },
    createdAt: $createdAt,
    kind: "LEGACY_MIGRATION_QUIESCE_COPY",
    quiescePhase: $quiescePhase,
    legacyBoundary: {
      adminPepper: {
        path: $legacyAdminPepper,
        status: $legacyAdminPepperStatus
      },
      adminSecurityState: {
        path: $legacyAdminState,
        status: $legacyAdminStateStatus
      },
      bootstrap: {
        accessUrlDisclosed: false,
        expectedOrigin: $expectedAccessOrigin,
        path: $legacyBootstrap,
        secretCopied: false
      },
      dormantSecret: {
        contentRead: false,
        importAllowed: false,
        path: $excludedDormantSecret,
        status: "EXCLUDED"
      },
      listener: {
        host: $expectedListenerHost,
        port: ($expectedListenerPort | tonumber),
        status: "CLOSED"
      }
    },
    preflight: {
      receiptPath: $preflightReceipt,
      receiptSha256: $preflightReceiptSha256,
      signatureSha256: $preflightSignatureSha256
    },
    rollbackEvidence: {
      firstSuccessMarker: (
        if $firstSuccessMarker == "NOT_APPLICABLE_INITIAL_QUIESCE"
        then null else $firstSuccessMarker end
      ),
      firstSuccessMarkerSha256: $firstSuccessMarkerSha256,
      firstSuccessSignatureSha256: $firstSuccessSignatureSha256,
      receiptPath: (if $rollbackReceipt == "NONE" then null else $rollbackReceipt end),
      receiptSha256: $rollbackReceiptSha256,
      signatureSha256: $rollbackSignatureSha256
    },
    retention: {
      legacyContainersRemoved: false,
      originalSourcesRemoved: false,
      rollbackWindowStatus: "PENDING_SUCCESS_MARKER"
    },
    secretsExposed: false,
    source: {
      database: $databaseSource[0],
      directories: $directories[0],
      runtimeConfig: $runtimeConfigSource[0]
    },
    status: "QUIESCED_COPY_VERIFIED"
  }' >"$UNSIGNED"

legacy_publish_signed_json \
  "$UNSIGNED" "$RECEIPT" "$PRIVATE_KEY" "$PUBLIC_KEY" "$SERVICE_GID" \
  >/dev/null

SUCCESS=true
trap - EXIT
find "$WORK_DIR" -xdev -depth -delete

printf 'LEGACY_QUIESCE_RECEIPT=%s\n' "$RECEIPT"
printf 'LEGACY_QUIESCE_SIGNATURE=%s\n' "${RECEIPT}.sig"
printf 'LEGACY_MIGRATION_COPY_ROOT=%s\n' "$COPY_ROOT"
