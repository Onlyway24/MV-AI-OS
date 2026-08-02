#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=lib/legacy-migration-common.sh
source "${SOURCE_ROOT}/scripts/production/lib/legacy-migration-common.sh"

usage() {
  cat >&2 <<'EOF'
usage: rollback-legacy-migration.sh
  --phase QUIESCED|CUTOVER
  --quiesce-receipt ABS_PATH --quiesce-signature ABS_PATH
  --success-marker ABS_PATH|NONE --success-signature ABS_PATH|NONE
  --new-backup-manifest ABS_PATH|NONE --new-backup-signature ABS_PATH|NONE
  --new-backup-uid UID --new-backup-gid GID
  --new-service-unit UNIT|NONE --new-backup-timer-unit UNIT|NONE
  --new-listener 127.0.0.1:PORT
  --receipt ABS_PATH --private-key ABS_PATH --public-key ABS_PATH
  --service-gid GID --lock-file ABS_PATH
  --probe-attempts N --probe-interval SECONDS
  --confirm ROLLBACK_QUIESCED_LEGACY_V1|ROLLBACK_LEGACY_WITHIN_RETENTION_V1
EOF
  exit 2
}

PHASE=
QUIESCE_RECEIPT=
QUIESCE_SIGNATURE=
SUCCESS_MARKER=
SUCCESS_SIGNATURE=
NEW_BACKUP_MANIFEST=
NEW_BACKUP_SIGNATURE=
NEW_BACKUP_UID=
NEW_BACKUP_GID=
NEW_SERVICE_UNIT=
NEW_BACKUP_TIMER_UNIT=
NEW_LISTENER=
RECEIPT=
PRIVATE_KEY=
PUBLIC_KEY=
SERVICE_GID=
LOCK_FILE=
PROBE_ATTEMPTS=
PROBE_INTERVAL=
CONFIRM=

while (($# > 0)); do
  case "$1" in
    --phase) [[ $# -ge 2 ]] || usage; PHASE=$2; shift ;;
    --quiesce-receipt) [[ $# -ge 2 ]] || usage; QUIESCE_RECEIPT=$2; shift ;;
    --quiesce-signature) [[ $# -ge 2 ]] || usage; QUIESCE_SIGNATURE=$2; shift ;;
    --success-marker) [[ $# -ge 2 ]] || usage; SUCCESS_MARKER=$2; shift ;;
    --success-signature) [[ $# -ge 2 ]] || usage; SUCCESS_SIGNATURE=$2; shift ;;
    --new-backup-manifest) [[ $# -ge 2 ]] || usage; NEW_BACKUP_MANIFEST=$2; shift ;;
    --new-backup-signature) [[ $# -ge 2 ]] || usage; NEW_BACKUP_SIGNATURE=$2; shift ;;
    --new-backup-uid) [[ $# -ge 2 ]] || usage; NEW_BACKUP_UID=$2; shift ;;
    --new-backup-gid) [[ $# -ge 2 ]] || usage; NEW_BACKUP_GID=$2; shift ;;
    --new-service-unit) [[ $# -ge 2 ]] || usage; NEW_SERVICE_UNIT=$2; shift ;;
    --new-backup-timer-unit) [[ $# -ge 2 ]] || usage; NEW_BACKUP_TIMER_UNIT=$2; shift ;;
    --new-listener) [[ $# -ge 2 ]] || usage; NEW_LISTENER=$2; shift ;;
    --receipt) [[ $# -ge 2 ]] || usage; RECEIPT=$2; shift ;;
    --private-key) [[ $# -ge 2 ]] || usage; PRIVATE_KEY=$2; shift ;;
    --public-key) [[ $# -ge 2 ]] || usage; PUBLIC_KEY=$2; shift ;;
    --service-gid) [[ $# -ge 2 ]] || usage; SERVICE_GID=$2; shift ;;
    --lock-file) [[ $# -ge 2 ]] || usage; LOCK_FILE=$2; shift ;;
    --probe-attempts) [[ $# -ge 2 ]] || usage; PROBE_ATTEMPTS=$2; shift ;;
    --probe-interval) [[ $# -ge 2 ]] || usage; PROBE_INTERVAL=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || usage; CONFIRM=$2; shift ;;
    *) usage ;;
  esac
  shift
done

for required in \
  "$PHASE" "$QUIESCE_RECEIPT" "$QUIESCE_SIGNATURE" "$SUCCESS_MARKER" \
  "$SUCCESS_SIGNATURE" "$NEW_BACKUP_MANIFEST" "$NEW_BACKUP_SIGNATURE" \
  "$NEW_BACKUP_UID" "$NEW_BACKUP_GID" "$NEW_SERVICE_UNIT" \
  "$NEW_BACKUP_TIMER_UNIT" "$NEW_LISTENER" "$RECEIPT" "$PRIVATE_KEY" \
  "$PUBLIC_KEY" "$SERVICE_GID" "$LOCK_FILE" "$PROBE_ATTEMPTS" \
  "$PROBE_INTERVAL" "$CONFIRM"; do
  [[ -n $required ]] || usage
done

case "$PHASE" in
  QUIESCED)
    [[ $CONFIRM == "ROLLBACK_QUIESCED_LEGACY_V1" ]] \
      || legacy_die "literal confirmation ROLLBACK_QUIESCED_LEGACY_V1 is required"
    [[ $SUCCESS_MARKER == "NONE" && $SUCCESS_SIGNATURE == "NONE" \
      && $NEW_BACKUP_MANIFEST == "NONE" && $NEW_BACKUP_SIGNATURE == "NONE" \
      && $NEW_SERVICE_UNIT == "NONE" \
      && $NEW_BACKUP_TIMER_UNIT == "NONE" ]] \
      || legacy_die "QUIESCED rollback must not claim cutover artifacts or units"
    ;;
  CUTOVER)
    [[ $CONFIRM == "ROLLBACK_LEGACY_WITHIN_RETENTION_V1" ]] \
      || legacy_die "literal confirmation ROLLBACK_LEGACY_WITHIN_RETENTION_V1 is required"
    for cutover_value in \
      "$SUCCESS_MARKER" "$SUCCESS_SIGNATURE" "$NEW_BACKUP_MANIFEST" \
      "$NEW_BACKUP_SIGNATURE" "$NEW_SERVICE_UNIT" "$NEW_BACKUP_TIMER_UNIT"; do
      [[ $cutover_value != "NONE" ]] \
        || legacy_die "CUTOVER rollback requires success, backup and unit inputs"
    done
    ;;
  *)
    legacy_die "rollback phase must be QUIESCED or CUTOVER"
    ;;
esac

[[ $NEW_LISTENER =~ ^(127\.0\.0\.1):([1-9][0-9]{0,4})$ ]] \
  || legacy_die "new listener must be an explicit IPv4 loopback endpoint"
NEW_LISTENER_HOST=${BASH_REMATCH[1]}
NEW_LISTENER_PORT=${BASH_REMATCH[2]}
((NEW_LISTENER_PORT <= 65535)) || legacy_die "new listener port is invalid"
legacy_require_root
for command in \
  curl dd docker find flock install jq mv openssl readlink sqlite3 ss stat \
  systemctl; do
  legacy_require_command "$command"
done
legacy_require_integer "$SERVICE_GID" "service GID"
legacy_require_integer "$NEW_BACKUP_UID" "new backup UID"
legacy_require_integer "$NEW_BACKUP_GID" "new backup GID"
legacy_require_positive_integer "$PROBE_ATTEMPTS" "legacy recovery attempts"
legacy_require_positive_integer "$PROBE_INTERVAL" "legacy recovery interval"
((PROBE_ATTEMPTS <= 120)) || legacy_die "legacy recovery attempts are too large"
((PROBE_INTERVAL <= 30)) || legacy_die "legacy recovery interval is too large"
if [[ $PHASE == "CUTOVER" ]]; then
  [[ $NEW_SERVICE_UNIT =~ ^[A-Za-z0-9_.@-]+\.service$ \
    && $NEW_BACKUP_TIMER_UNIT =~ ^[A-Za-z0-9_.@-]+\.timer$ ]] \
    || legacy_die "new systemd unit names are invalid"
fi

legacy_require_absolute_safe_path "$RECEIPT" "legacy rollback receipt"
legacy_prepare_secure_directory "$(dirname -- "$RECEIPT")" "$SERVICE_GID" 0750
legacy_require_absent_path "$RECEIPT" "legacy rollback receipt"
legacy_require_absent_path "${RECEIPT}.sig" "legacy rollback receipt signature"
legacy_acquire_lock "$LOCK_FILE" "$SERVICE_GID"
legacy_require_existing_trust_anchor \
  "$PRIVATE_KEY" "$PUBLIC_KEY" "$(dirname -- "$RECEIPT")"

QUIESCE_SHA=$(legacy_verify_signed_json \
  "$QUIESCE_RECEIPT" "$QUIESCE_SIGNATURE" "$PUBLIC_KEY" "$SERVICE_GID")
jq -e '
  .contractVersion == "1" and
  .kind == "LEGACY_MIGRATION_QUIESCE_COPY" and
  .status == "QUIESCED_COPY_VERIFIED" and
  (
    (.quiescePhase == "INITIAL" and
      .confirmedAction == "QUIESCE_AND_COPY_LEGACY_V1") or
    (.quiescePhase == "FORWARD_AFTER_ROLLBACK" and
      .confirmedAction == "REQUIESCE_FOR_FORWARD_DEPLOY_V1")
  ) and
  .secretsExposed == false and
  .containers.runningAfterQuiesce == false and
  .containers.restartPolicyAfterQuiesce == "no" and
  .containers.restartPolicyBeforeQuiesce == "unless-stopped" and
  (.containers.exactIdentities | length == 4) and
  .copy.forensicDatabase.sha256 == .source.database.sha256 and
  (.source.directories | type == "array" and length >= 3 and length <= 16) and
  .retention.legacyContainersRemoved == false and
  .retention.originalSourcesRemoved == false
' "$QUIESCE_RECEIPT" >/dev/null \
  || legacy_die "signed quiesce receipt contract is invalid"

SUCCESS_SHA="NOT_APPLICABLE_PRE_CUTOVER"
NEW_BACKUP_SHA="NOT_APPLICABLE_PRE_CUTOVER"
EXPECTED_COMMIT=
NEW_COMPOSE_PROJECT=
if [[ $PHASE == "CUTOVER" ]]; then
  SUCCESS_SHA=$(legacy_verify_signed_json \
    "$SUCCESS_MARKER" "$SUCCESS_SIGNATURE" "$PUBLIC_KEY" "$SERVICE_GID")
  jq -e \
    --arg quiesceSha "$QUIESCE_SHA" \
    '
      .contractVersion == "1" and
      .kind == "LEGACY_MIGRATION_SUCCESS" and
      .status == "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED" and
      .confirmedAction == "RETAIN_LEGACY_ROLLBACK_V1" and
      .secretsExposed == false and
      .legacyRollbackBoundary.quiesceReceiptSha256 == $quiesceSha and
      .legacyRollbackBoundary.legacyContainersRemoved == false and
      .legacyRollbackBoundary.originalSourcesRemoved == false and
      .legacyRollbackBoundary.legacyContainersRunning == false and
      .legacyRollbackBoundary.legacyContainersRestartPolicy == "no" and
      .newStack.status == "PRIVATE_READINESS_VERIFIED"
    ' "$SUCCESS_MARKER" >/dev/null \
    || legacy_die "signed legacy success marker contract is invalid"
  legacy_assert_not_expired \
    "$(jq -er '.legacyRollbackBoundary.retainUntil' "$SUCCESS_MARKER")" \
    "legacy rollback retention"
  EXPECTED_COMMIT=$(jq -er '.acceptedRelease.commit' "$SUCCESS_MARKER")
  NEW_COMPOSE_PROJECT=$(jq -er '.newStack.composeProject' "$SUCCESS_MARKER")
  legacy_require_safe_name "$NEW_COMPOSE_PROJECT" "new Compose project"
  [[ $(jq -er '.newStack.listener.host' "$SUCCESS_MARKER") == \
      "$NEW_LISTENER_HOST" \
    && $(jq -er '.newStack.listener.port' "$SUCCESS_MARKER") == \
      "$NEW_LISTENER_PORT" ]] \
    || legacy_die "new listener does not match the signed success marker"
  NEW_BACKUP_SHA=$(legacy_verify_backup_bundle_manifest \
    "$NEW_BACKUP_MANIFEST" "$NEW_BACKUP_SIGNATURE" "$PUBLIC_KEY" \
    "$SERVICE_GID" "$NEW_BACKUP_UID" "$NEW_BACKUP_GID" "$EXPECTED_COMMIT")
fi

COPY_ROOT=$(jq -er '.copy.copyRoot' "$QUIESCE_RECEIPT")
DATABASE_COPY=$(jq -er '.copy.database.path' "$QUIESCE_RECEIPT")
DATABASE_COPY_SHA=$(jq -er '.copy.database.sha256' "$QUIESCE_RECEIPT")
DATABASE_FORENSIC_COPY=$(jq -er \
  '.copy.forensicDatabase.path' "$QUIESCE_RECEIPT")
DATABASE_FORENSIC_COPY_SHA=$(jq -er \
  '.copy.forensicDatabase.sha256' "$QUIESCE_RECEIPT")
RUNTIME_CONFIG_COPY=$(jq -er '.copy.runtimeConfig.path' "$QUIESCE_RECEIPT")
RUNTIME_CONFIG_COPY_SHA=$(jq -er '.copy.runtimeConfig.sha256' "$QUIESCE_RECEIPT")
DATABASE_SOURCE=$(jq -er '.source.database.path' "$QUIESCE_RECEIPT")
DATABASE_SOURCE_SHA=$(jq -er '.source.database.sha256' "$QUIESCE_RECEIPT")
RUNTIME_CONFIG_SOURCE=$(jq -er '.source.runtimeConfig.path' "$QUIESCE_RECEIPT")
RUNTIME_CONFIG_SOURCE_SHA=$(jq -er '.source.runtimeConfig.sha256' "$QUIESCE_RECEIPT")
LEGACY_BOOTSTRAP=$(jq -er \
  '.legacyBoundary.bootstrap.path' "$QUIESCE_RECEIPT")
EXPECTED_ACCESS_ORIGIN=$(jq -er \
  '.legacyBoundary.bootstrap.expectedOrigin' "$QUIESCE_RECEIPT")
EXPECTED_LISTENER_HOST=$(jq -er \
  '.legacyBoundary.listener.host' "$QUIESCE_RECEIPT")
EXPECTED_LISTENER_PORT=$(jq -er \
  '.legacyBoundary.listener.port' "$QUIESCE_RECEIPT")
EXPECTED_RESTART_POLICY=$(jq -er \
  '.containers.restartPolicyBeforeQuiesce' "$QUIESCE_RECEIPT")
CONFIGURATION_FINGERPRINT=$(jq -er \
  '.containers.configurationFingerprint' "$QUIESCE_RECEIPT")

legacy_require_canonical_directory "$COPY_ROOT" "migration copy root"
[[ $(stat -c '%u:%g:%a' "$COPY_ROOT") == "0:${SERVICE_GID}:700" ]] \
  || legacy_die "migration copy root permissions changed"
for retained_file_and_sha in \
  "$DATABASE_COPY:$DATABASE_COPY_SHA" \
  "$DATABASE_FORENSIC_COPY:$DATABASE_FORENSIC_COPY_SHA" \
  "$RUNTIME_CONFIG_COPY:$RUNTIME_CONFIG_COPY_SHA" \
  "$DATABASE_SOURCE:$DATABASE_SOURCE_SHA" \
  "$RUNTIME_CONFIG_SOURCE:$RUNTIME_CONFIG_SOURCE_SHA"; do
  retained_file=${retained_file_and_sha%:*}
  retained_sha=${retained_file_and_sha##*:}
  legacy_require_canonical_existing_file "$retained_file" "retained migration file"
  legacy_require_sha256 "$retained_sha" "retained migration fingerprint"
  [[ $(legacy_sha256_file "$retained_file") == "$retained_sha" ]] \
    || legacy_die "retained migration source or copy changed"
done

WORK_DIR=$(mktemp -d "$(dirname -- "$RECEIPT")/.legacy-rollback.XXXXXX")
chmod 0700 "$WORK_DIR"
SPECIFICATIONS="${WORK_DIR}/container-specifications.json"
LEGACY_INSPECT="${WORK_DIR}/legacy-container-inspect.json"
RESTORED_INSPECT="${WORK_DIR}/legacy-restored-inspect.json"
SOURCE_DIRECTORIES="${WORK_DIR}/source-directories.json"
CURRENT_DIRECTORIES="${WORK_DIR}/current-directories.json"
DATABASE_SOURCE_OBSERVATION="${WORK_DIR}/database-source-observation.json"
RUNTIME_CONFIG_SOURCE_OBSERVATION="${WORK_DIR}/runtime-config-source-observation.json"
CURRENT_DATABASE_OBSERVATION="${WORK_DIR}/current-database-observation.json"
CURRENT_RUNTIME_CONFIG_OBSERVATION="${WORK_DIR}/current-runtime-config-observation.json"
DATABASE_COPY_OBSERVATION="${WORK_DIR}/database-copy-observation.json"
DATABASE_FORENSIC_OBSERVATION="${WORK_DIR}/database-forensic-observation.json"
RUNTIME_CONFIG_COPY_OBSERVATION="${WORK_DIR}/runtime-config-copy-observation.json"
UNSIGNED="${WORK_DIR}/rollback-receipt.json"
jq -S '.containers.exactIdentities' "$QUIESCE_RECEIPT" >"$SPECIFICATIONS"
jq -S '.source.directories' "$QUIESCE_RECEIPT" >"$SOURCE_DIRECTORIES"
jq -S '.source.database' \
  "$QUIESCE_RECEIPT" >"$DATABASE_SOURCE_OBSERVATION"
jq -S '.source.runtimeConfig' \
  "$QUIESCE_RECEIPT" >"$RUNTIME_CONFIG_SOURCE_OBSERVATION"
jq -S '.copy.database' "$QUIESCE_RECEIPT" >"$DATABASE_COPY_OBSERVATION"
jq -S '.copy.forensicDatabase' \
  "$QUIESCE_RECEIPT" >"$DATABASE_FORENSIC_OBSERVATION"
jq -S '.copy.runtimeConfig' \
  "$QUIESCE_RECEIPT" >"$RUNTIME_CONFIG_COPY_OBSERVATION"
legacy_verify_directory_identities "$SOURCE_DIRECTORIES"
legacy_verify_file_observation "$DATABASE_COPY_OBSERVATION"
legacy_verify_file_observation "$DATABASE_FORENSIC_OBSERVATION"
legacy_verify_file_observation "$RUNTIME_CONFIG_COPY_OBSERVATION"
legacy_file_observation_json \
  "$DATABASE_SOURCE" >"$CURRENT_DATABASE_OBSERVATION"
legacy_file_observation_json \
  "$RUNTIME_CONFIG_SOURCE" >"$CURRENT_RUNTIME_CONFIG_OBSERVATION"
printf '[]\n' >"$CURRENT_DIRECTORIES"
DIRECTORY_COUNT=$(jq -er 'length' "$SOURCE_DIRECTORIES")
for ((directory_index = 0; directory_index < DIRECTORY_COUNT; directory_index += 1)); do
  source_directory=$(jq -er --argjson index "$directory_index" \
    '.[$index].path' "$SOURCE_DIRECTORIES")
  legacy_directory_observation_json \
    "$source_directory" >"${WORK_DIR}/current-directory-observation.json"
  jq --slurpfile observation "${WORK_DIR}/current-directory-observation.json" \
    '. + $observation' "$CURRENT_DIRECTORIES" >"${CURRENT_DIRECTORIES}.next"
  mv -fT -- "${CURRENT_DIRECTORIES}.next" "$CURRENT_DIRECTORIES"
done
mapfile -t CONTAINER_IDS < <(jq -er '.[].id' "$SPECIFICATIONS")
legacy_capture_selected_containers "$LEGACY_INSPECT" "$SPECIFICATIONS"
legacy_assert_configuration_fingerprint_with_policy \
  "$LEGACY_INSPECT" "$CONFIGURATION_FINGERPRINT" "$EXPECTED_RESTART_POLICY"
legacy_assert_container_state "$LEGACY_INSPECT" false no

SERVICE_WAS_ACTIVE=false
SERVICE_WAS_ENABLED=false
TIMER_WAS_ACTIVE=false
TIMER_WAS_ENABLED=false
MUTATION_STARTED=false
LEGACY_STARTED=false
LEGACY_START_ATTEMPTED=false
METADATA_CHANGED=false
SUCCESS=false

restore_new_stack_after_failure() {
  local restored=true
  local sidecar
  local sidecar_suffix
  set +e
  if [[ $MUTATION_STARTED == "true" ]]; then
    docker stop --time 30 "${CONTAINER_IDS[@]}" >/dev/null 2>&1 || true
    docker update --restart=no "${CONTAINER_IDS[@]}" >/dev/null 2>&1 \
      || restored=false
    if [[ $LEGACY_START_ATTEMPTED == "true" ]]; then
      install -d -o root -g root -m 0700 "${WORK_DIR}/sqlite-sidecars" \
        >/dev/null 2>&1 || restored=false
      for sidecar_suffix in -wal -shm -journal; do
        sidecar="${DATABASE_SOURCE}${sidecar_suffix}"
        if [[ -e $sidecar || -L $sidecar ]]; then
          if [[ -f $sidecar && ! -L $sidecar \
            && $(readlink -f -- "$sidecar") == "$sidecar" ]]; then
            mv -T -- "$sidecar" \
              "${WORK_DIR}/sqlite-sidecars/$(basename -- "$sidecar")" \
              >/dev/null 2>&1 || restored=false
          else
            restored=false
          fi
        fi
      done
      (
        legacy_restore_regular_file_exact \
          "$DATABASE_FORENSIC_COPY" "$DATABASE_SOURCE" \
          "$DATABASE_SOURCE_SHA" \
          "$(jq -er '.stat.uid' "$DATABASE_SOURCE_OBSERVATION")" \
          "$(jq -er '.stat.gid' "$DATABASE_SOURCE_OBSERVATION")" \
          "$(jq -er '.stat.mode' "$DATABASE_SOURCE_OBSERVATION")"
      ) >/dev/null 2>&1 || restored=false
    fi
    if [[ $METADATA_CHANGED == "true" ]]; then
      (
        legacy_restore_file_metadata_from_observation \
          "$CURRENT_DATABASE_OBSERVATION"
        legacy_restore_file_metadata_from_observation \
          "$CURRENT_RUNTIME_CONFIG_OBSERVATION"
        legacy_restore_directory_metadata "$CURRENT_DIRECTORIES"
      ) >/dev/null 2>&1 || restored=false
    fi
    if [[ $PHASE == "CUTOVER" ]]; then
      if [[ $SERVICE_WAS_ENABLED == "true" ]]; then
        systemctl enable "$NEW_SERVICE_UNIT" >/dev/null 2>&1 || restored=false
      fi
      if [[ $TIMER_WAS_ENABLED == "true" ]]; then
        systemctl enable "$NEW_BACKUP_TIMER_UNIT" >/dev/null 2>&1 \
          || restored=false
      fi
      if [[ $SERVICE_WAS_ACTIVE == "true" ]]; then
        systemctl start "$NEW_SERVICE_UNIT" >/dev/null 2>&1 || restored=false
      fi
      if [[ $TIMER_WAS_ACTIVE == "true" ]]; then
        systemctl start "$NEW_BACKUP_TIMER_UNIT" >/dev/null 2>&1 \
          || restored=false
      fi
    fi
  fi
  find "$WORK_DIR" -xdev -depth -delete >/dev/null 2>&1 || restored=false
  if [[ $restored == "true" ]]; then
    legacy_log "failed legacy rollback restored the accepted new stack boundary"
  else
    legacy_log "ERROR: failed legacy rollback could not fully restore the new stack"
  fi
  set -e
}

on_exit() {
  local exit_code=$?
  if [[ $SUCCESS != "true" ]]; then
    restore_new_stack_after_failure
  fi
  exit "$exit_code"
}
trap on_exit EXIT

if [[ $PHASE == "CUTOVER" ]]; then
  systemctl cat "$NEW_SERVICE_UNIT" >/dev/null \
    || legacy_die "new service unit is unavailable"
  systemctl cat "$NEW_BACKUP_TIMER_UNIT" >/dev/null \
    || legacy_die "new backup timer unit is unavailable"
  systemctl is-active --quiet "$NEW_SERVICE_UNIT" && SERVICE_WAS_ACTIVE=true
  systemctl is-enabled --quiet "$NEW_SERVICE_UNIT" && SERVICE_WAS_ENABLED=true
  systemctl is-active --quiet "$NEW_BACKUP_TIMER_UNIT" && TIMER_WAS_ACTIVE=true
  systemctl is-enabled --quiet "$NEW_BACKUP_TIMER_UNIT" && TIMER_WAS_ENABLED=true
fi
MUTATION_STARTED=true

if [[ $PHASE == "CUTOVER" ]]; then
  systemctl disable --now "$NEW_BACKUP_TIMER_UNIT"
  systemctl stop "$NEW_SERVICE_UNIT"
  systemctl disable "$NEW_SERVICE_UNIT"
fi
legacy_assert_listener_closed "$NEW_LISTENER_HOST" "$NEW_LISTENER_PORT"
if [[ $PHASE == "CUTOVER" ]]; then
  [[ -z $(docker ps --quiet \
    --filter "label=com.docker.compose.project=${NEW_COMPOSE_PROJECT}") ]] \
    || legacy_die "new Compose project is still running after service stop"
  NEW_BACKUP_SHA_AFTER_STOP=$(legacy_verify_backup_bundle_manifest \
    "$NEW_BACKUP_MANIFEST" "$NEW_BACKUP_SIGNATURE" "$PUBLIC_KEY" \
    "$SERVICE_GID" "$NEW_BACKUP_UID" "$NEW_BACKUP_GID" "$EXPECTED_COMMIT")
  [[ $NEW_BACKUP_SHA_AFTER_STOP == "$NEW_BACKUP_SHA" ]] \
    || legacy_die "new-state backup changed across stack quiesce"
fi
[[ -z $(docker ps --quiet) ]] \
  || legacy_die "a non-legacy container remains running before legacy restore"

legacy_assert_listener_closed "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"
METADATA_CHANGED=true
legacy_restore_directory_metadata "$SOURCE_DIRECTORIES"
legacy_restore_file_metadata_from_observation "$DATABASE_SOURCE_OBSERVATION"
legacy_restore_file_metadata_from_observation \
  "$RUNTIME_CONFIG_SOURCE_OBSERVATION"
[[ $(legacy_sha256_file "$DATABASE_SOURCE") == "$DATABASE_SOURCE_SHA" \
  && $(legacy_sha256_file "$RUNTIME_CONFIG_SOURCE") == \
    "$RUNTIME_CONFIG_SOURCE_SHA" ]] \
  || legacy_die "legacy source fingerprint changed during metadata restoration"
docker update --restart="$EXPECTED_RESTART_POLICY" \
  "${CONTAINER_IDS[@]}" >/dev/null
LEGACY_START_ATTEMPTED=true
docker start "${CONTAINER_IDS[@]}" >/dev/null
LEGACY_STARTED=true
legacy_wait_for_legacy_bootstrap \
  "$LEGACY_BOOTSTRAP" "$EXPECTED_ACCESS_ORIGIN" \
  "$PROBE_ATTEMPTS" "$PROBE_INTERVAL"
legacy_assert_listener_open "$EXPECTED_LISTENER_HOST" "$EXPECTED_LISTENER_PORT"
legacy_assert_listener_closed "$NEW_LISTENER_HOST" "$NEW_LISTENER_PORT"
legacy_capture_selected_containers "$RESTORED_INSPECT" "$SPECIFICATIONS"
legacy_assert_configuration_fingerprint \
  "$RESTORED_INSPECT" "$CONFIGURATION_FINGERPRINT"
legacy_assert_container_state \
  "$RESTORED_INSPECT" true "$EXPECTED_RESTART_POLICY"

CREATED_AT=$(legacy_current_timestamp)
QUIESCE_SIGNATURE_SHA=$(legacy_sha256_file "$QUIESCE_SIGNATURE")
SUCCESS_SIGNATURE_SHA="NOT_APPLICABLE_PRE_CUTOVER"
if [[ $PHASE == "CUTOVER" ]]; then
  SUCCESS_SIGNATURE_SHA=$(legacy_sha256_file "$SUCCESS_SIGNATURE")
fi
jq -S -n \
  --arg confirmedAction "$CONFIRM" \
  --arg createdAt "$CREATED_AT" \
  --arg legacyListenerHost "$EXPECTED_LISTENER_HOST" \
  --arg legacyListenerPort "$EXPECTED_LISTENER_PORT" \
  --arg newBackupManifest "$NEW_BACKUP_MANIFEST" \
  --arg newBackupManifestSha256 "$NEW_BACKUP_SHA" \
  --arg phase "$PHASE" \
  --arg quiesceReceipt "$QUIESCE_RECEIPT" \
  --arg quiesceReceiptSha256 "$QUIESCE_SHA" \
  --arg quiesceSignatureSha256 "$QUIESCE_SIGNATURE_SHA" \
  --arg successMarker "$SUCCESS_MARKER" \
  --arg successMarkerSha256 "$SUCCESS_SHA" \
  --arg successSignatureSha256 "$SUCCESS_SIGNATURE_SHA" \
  --slurpfile containers "$SPECIFICATIONS" \
  '{
    confirmedAction: $confirmedAction,
    contractVersion: "1",
    createdAt: $createdAt,
    evidence: {
      newStateBackup: {
        manifest: (if $newBackupManifest == "NONE" then null else $newBackupManifest end),
        manifestSha256: $newBackupManifestSha256
      },
      quiesceReceipt: $quiesceReceipt,
      quiesceReceiptSha256: $quiesceReceiptSha256,
      quiesceSignatureSha256: $quiesceSignatureSha256,
      successMarker: (if $successMarker == "NONE" then null else $successMarker end),
      successMarkerSha256: $successMarkerSha256,
      successSignatureSha256: $successSignatureSha256
    },
    kind: "LEGACY_MIGRATION_ROLLBACK",
    legacyRuntime: {
      exactIdentities: $containers[0],
      health: "AUTHENTICATED_OK",
      listener: {
        host: $legacyListenerHost,
        port: ($legacyListenerPort | tonumber),
        status: "OPEN_LOOPBACK_ONLY"
      },
      restartPolicy: "unless-stopped",
      running: true,
      sourceMetadataRestored: true
    },
    phase: $phase,
    retainedForensics: {
      migrationCopiesRemoved: false,
      newStateBackupRemoved: false,
      postCutoverWritesAppliedToLegacy: false
    },
    secretsExposed: false,
    status: "ROLLED_BACK_TO_EXACT_LEGACY_RUNTIME"
  }' >"$UNSIGNED"

legacy_publish_signed_json \
  "$UNSIGNED" "$RECEIPT" "$PRIVATE_KEY" "$PUBLIC_KEY" "$SERVICE_GID" \
  >/dev/null

SUCCESS=true
trap - EXIT
find "$WORK_DIR" -xdev -depth -delete

printf 'LEGACY_ROLLBACK_RECEIPT=%s\n' "$RECEIPT"
printf 'LEGACY_ROLLBACK_SIGNATURE=%s\n' "${RECEIPT}.sig"
printf '%s\n' \
  "Legacy runtime restored; post-cutover writes remain only in the signed new-state backup."
