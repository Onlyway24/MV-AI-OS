#!/usr/bin/env bash

set -Eeuo pipefail

SOURCE_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=lib/legacy-migration-common.sh
source "${SOURCE_ROOT}/scripts/production/lib/legacy-migration-common.sh"

usage() {
  cat >&2 <<'EOF'
usage: mark-legacy-migration-success.sh
  --quiesce-receipt ABS_PATH --quiesce-signature ABS_PATH
  --release-acceptance ABS_PATH --deployment-receipt ABS_PATH
  --expected-commit FULL_SHA --expected-image-id sha256:HEX64
  --release-root ABS_PATH --current-link ABS_PATH
  --new-compose-project NAME --expected-new-container-count N
  --new-listener 127.0.0.1:PORT
  --new-database ABS_PATH --new-database-uid UID --new-database-gid GID
  --new-database-mode 600 --new-schema-version INTEGER
  --new-admin-state ABS_PATH --new-admin-state-uid UID --new-admin-state-gid GID
  --new-admin-state-mode 600
  --new-admin-pepper ABS_PATH --new-admin-pepper-uid UID
  --new-admin-pepper-gid GID --new-admin-pepper-mode 600
  --new-founder-bootstrap ABS_PATH --new-bootstrap-uid UID
  --new-bootstrap-gid GID --new-bootstrap-mode 600
  --new-access-origin http://localhost:PORT
  --marker ABS_PATH --private-key ABS_PATH --public-key ABS_PATH
  --service-gid GID --lock-file ABS_PATH --retention-seconds INTEGER
  --confirm RETAIN_LEGACY_ROLLBACK_V1
EOF
  exit 2
}

QUIESCE_RECEIPT=
QUIESCE_SIGNATURE=
RELEASE_ACCEPTANCE=
DEPLOYMENT_RECEIPT=
EXPECTED_COMMIT=
EXPECTED_IMAGE_ID=
RELEASE_ROOT=
CURRENT_LINK=
NEW_COMPOSE_PROJECT=
EXPECTED_NEW_CONTAINER_COUNT=
NEW_LISTENER=
NEW_DATABASE=
NEW_DATABASE_UID=
NEW_DATABASE_GID=
NEW_DATABASE_MODE=
NEW_SCHEMA_VERSION=
NEW_ADMIN_STATE=
NEW_ADMIN_STATE_UID=
NEW_ADMIN_STATE_GID=
NEW_ADMIN_STATE_MODE=
NEW_ADMIN_PEPPER=
NEW_ADMIN_PEPPER_UID=
NEW_ADMIN_PEPPER_GID=
NEW_ADMIN_PEPPER_MODE=
NEW_FOUNDER_BOOTSTRAP=
NEW_BOOTSTRAP_UID=
NEW_BOOTSTRAP_GID=
NEW_BOOTSTRAP_MODE=
NEW_ACCESS_ORIGIN=
MARKER=
PRIVATE_KEY=
PUBLIC_KEY=
SERVICE_GID=
LOCK_FILE=
RETENTION_SECONDS=
CONFIRM=

while (($# > 0)); do
  case "$1" in
    --quiesce-receipt) [[ $# -ge 2 ]] || usage; QUIESCE_RECEIPT=$2; shift ;;
    --quiesce-signature) [[ $# -ge 2 ]] || usage; QUIESCE_SIGNATURE=$2; shift ;;
    --release-acceptance) [[ $# -ge 2 ]] || usage; RELEASE_ACCEPTANCE=$2; shift ;;
    --deployment-receipt) [[ $# -ge 2 ]] || usage; DEPLOYMENT_RECEIPT=$2; shift ;;
    --expected-commit) [[ $# -ge 2 ]] || usage; EXPECTED_COMMIT=$2; shift ;;
    --expected-image-id) [[ $# -ge 2 ]] || usage; EXPECTED_IMAGE_ID=$2; shift ;;
    --release-root) [[ $# -ge 2 ]] || usage; RELEASE_ROOT=$2; shift ;;
    --current-link) [[ $# -ge 2 ]] || usage; CURRENT_LINK=$2; shift ;;
    --new-compose-project) [[ $# -ge 2 ]] || usage; NEW_COMPOSE_PROJECT=$2; shift ;;
    --expected-new-container-count) [[ $# -ge 2 ]] || usage; EXPECTED_NEW_CONTAINER_COUNT=$2; shift ;;
    --new-listener) [[ $# -ge 2 ]] || usage; NEW_LISTENER=$2; shift ;;
    --new-database) [[ $# -ge 2 ]] || usage; NEW_DATABASE=$2; shift ;;
    --new-database-uid) [[ $# -ge 2 ]] || usage; NEW_DATABASE_UID=$2; shift ;;
    --new-database-gid) [[ $# -ge 2 ]] || usage; NEW_DATABASE_GID=$2; shift ;;
    --new-database-mode) [[ $# -ge 2 ]] || usage; NEW_DATABASE_MODE=$2; shift ;;
    --new-schema-version) [[ $# -ge 2 ]] || usage; NEW_SCHEMA_VERSION=$2; shift ;;
    --new-admin-state) [[ $# -ge 2 ]] || usage; NEW_ADMIN_STATE=$2; shift ;;
    --new-admin-state-uid) [[ $# -ge 2 ]] || usage; NEW_ADMIN_STATE_UID=$2; shift ;;
    --new-admin-state-gid) [[ $# -ge 2 ]] || usage; NEW_ADMIN_STATE_GID=$2; shift ;;
    --new-admin-state-mode) [[ $# -ge 2 ]] || usage; NEW_ADMIN_STATE_MODE=$2; shift ;;
    --new-admin-pepper) [[ $# -ge 2 ]] || usage; NEW_ADMIN_PEPPER=$2; shift ;;
    --new-admin-pepper-uid) [[ $# -ge 2 ]] || usage; NEW_ADMIN_PEPPER_UID=$2; shift ;;
    --new-admin-pepper-gid) [[ $# -ge 2 ]] || usage; NEW_ADMIN_PEPPER_GID=$2; shift ;;
    --new-admin-pepper-mode) [[ $# -ge 2 ]] || usage; NEW_ADMIN_PEPPER_MODE=$2; shift ;;
    --new-founder-bootstrap) [[ $# -ge 2 ]] || usage; NEW_FOUNDER_BOOTSTRAP=$2; shift ;;
    --new-bootstrap-uid) [[ $# -ge 2 ]] || usage; NEW_BOOTSTRAP_UID=$2; shift ;;
    --new-bootstrap-gid) [[ $# -ge 2 ]] || usage; NEW_BOOTSTRAP_GID=$2; shift ;;
    --new-bootstrap-mode) [[ $# -ge 2 ]] || usage; NEW_BOOTSTRAP_MODE=$2; shift ;;
    --new-access-origin) [[ $# -ge 2 ]] || usage; NEW_ACCESS_ORIGIN=$2; shift ;;
    --marker) [[ $# -ge 2 ]] || usage; MARKER=$2; shift ;;
    --private-key) [[ $# -ge 2 ]] || usage; PRIVATE_KEY=$2; shift ;;
    --public-key) [[ $# -ge 2 ]] || usage; PUBLIC_KEY=$2; shift ;;
    --service-gid) [[ $# -ge 2 ]] || usage; SERVICE_GID=$2; shift ;;
    --lock-file) [[ $# -ge 2 ]] || usage; LOCK_FILE=$2; shift ;;
    --retention-seconds) [[ $# -ge 2 ]] || usage; RETENTION_SECONDS=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || usage; CONFIRM=$2; shift ;;
    *) usage ;;
  esac
  shift
done

for required in \
  "$QUIESCE_RECEIPT" "$QUIESCE_SIGNATURE" "$RELEASE_ACCEPTANCE" \
  "$DEPLOYMENT_RECEIPT" "$EXPECTED_COMMIT" "$EXPECTED_IMAGE_ID" \
  "$RELEASE_ROOT" "$CURRENT_LINK" "$NEW_COMPOSE_PROJECT" \
  "$EXPECTED_NEW_CONTAINER_COUNT" "$NEW_LISTENER" "$NEW_DATABASE" \
  "$NEW_DATABASE_UID" "$NEW_DATABASE_GID" "$NEW_DATABASE_MODE" \
  "$NEW_SCHEMA_VERSION" "$NEW_ADMIN_STATE" "$NEW_ADMIN_STATE_UID" \
  "$NEW_ADMIN_STATE_GID" "$NEW_ADMIN_STATE_MODE" "$NEW_ADMIN_PEPPER" \
  "$NEW_ADMIN_PEPPER_UID" "$NEW_ADMIN_PEPPER_GID" "$NEW_ADMIN_PEPPER_MODE" \
  "$NEW_FOUNDER_BOOTSTRAP" "$NEW_BOOTSTRAP_UID" "$NEW_BOOTSTRAP_GID" \
  "$NEW_BOOTSTRAP_MODE" "$NEW_ACCESS_ORIGIN" "$MARKER" "$PRIVATE_KEY" \
  "$PUBLIC_KEY" "$SERVICE_GID" "$LOCK_FILE" "$RETENTION_SECONDS" "$CONFIRM"; do
  [[ -n $required ]] || usage
done

[[ $CONFIRM == "RETAIN_LEGACY_ROLLBACK_V1" ]] \
  || legacy_die "literal confirmation RETAIN_LEGACY_ROLLBACK_V1 is required"
[[ $EXPECTED_COMMIT =~ ^[0-9a-f]{40}$ ]] \
  || legacy_die "expected commit must be a full lowercase SHA"
legacy_require_image_id "$EXPECTED_IMAGE_ID"
legacy_require_safe_name "$NEW_COMPOSE_PROJECT" "new Compose project"
legacy_require_positive_integer \
  "$EXPECTED_NEW_CONTAINER_COUNT" "new container count"
[[ $NEW_LISTENER =~ ^(127\.0\.0\.1):([1-9][0-9]{0,4})$ ]] \
  || legacy_die "new listener must be an explicit IPv4 loopback endpoint"
NEW_LISTENER_HOST=${BASH_REMATCH[1]}
NEW_LISTENER_PORT=${BASH_REMATCH[2]}
((NEW_LISTENER_PORT <= 65535)) || legacy_die "new listener port is invalid"
[[ $NEW_ACCESS_ORIGIN =~ ^http://(localhost|127\.0\.0\.1):${NEW_LISTENER_PORT}$ ]] \
  || legacy_die "new Admin Security origin must match the loopback listener"

legacy_require_root
for command in docker flock jq openssl readlink sqlite3 ss stat; do
  legacy_require_command "$command"
done
for integer_and_label in \
  "$NEW_DATABASE_UID:new database UID" \
  "$NEW_DATABASE_GID:new database GID" \
  "$NEW_SCHEMA_VERSION:new schema version" \
  "$NEW_ADMIN_STATE_UID:new Admin Security state UID" \
  "$NEW_ADMIN_STATE_GID:new Admin Security state GID" \
  "$NEW_ADMIN_PEPPER_UID:new Admin Security pepper UID" \
  "$NEW_ADMIN_PEPPER_GID:new Admin Security pepper GID" \
  "$NEW_BOOTSTRAP_UID:new Founder bootstrap UID" \
  "$NEW_BOOTSTRAP_GID:new Founder bootstrap GID" \
  "$SERVICE_GID:service GID"; do
  legacy_require_integer \
    "${integer_and_label%%:*}" "${integer_and_label#*:}"
done
for owner_only_mode in \
  "$NEW_DATABASE_MODE" "$NEW_ADMIN_STATE_MODE" \
  "$NEW_ADMIN_PEPPER_MODE" "$NEW_BOOTSTRAP_MODE"; do
  [[ $owner_only_mode == "600" ]] \
    || legacy_die "new database and Admin Security artifacts must be owner-only mode 600"
done
legacy_require_positive_integer "$RETENTION_SECONDS" "rollback retention"
((RETENTION_SECONDS >= 3600 && RETENTION_SECONDS <= 2592000)) \
  || legacy_die "rollback retention must be between one hour and thirty days"

legacy_require_absolute_safe_path "$MARKER" "migration success marker"
legacy_prepare_secure_directory "$(dirname -- "$MARKER")" "$SERVICE_GID" 0750
legacy_require_absent_path "$MARKER" "migration success marker"
legacy_require_absent_path "${MARKER}.sig" "migration success marker signature"
legacy_acquire_lock "$LOCK_FILE" "$SERVICE_GID"

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
  (.containers.configurationFingerprint | test("^[0-9a-f]{64}$")) and
  (.containers.exactIdentities | length == 4) and
  (.source.directories | type == "array" and length >= 3 and length <= 16) and
  .copy.forensicDatabase.sha256 == .source.database.sha256 and
  .retention.legacyContainersRemoved == false and
  .retention.originalSourcesRemoved == false and
  (
    (.quiescePhase == "INITIAL" and
      .legacyBoundary.adminSecurityState.status == "ABSENT" and
      .legacyBoundary.adminPepper.status == "ABSENT") or
    (.quiescePhase == "FORWARD_AFTER_ROLLBACK" and
      .legacyBoundary.adminSecurityState.status ==
        "RETAINED_NEW_STACK_STATE" and
      .legacyBoundary.adminPepper.status ==
        "RETAINED_NEW_STACK_PEPPER" and
      (.rollbackEvidence.receiptSha256 | test("^[0-9a-f]{64}$")) and
      (.rollbackEvidence.firstSuccessMarkerSha256 |
        test("^[0-9a-f]{64}$")))
  ) and
  .legacyBoundary.bootstrap.secretCopied == false and
  .legacyBoundary.dormantSecret.contentRead == false and
  .legacyBoundary.dormantSecret.importAllowed == false
' "$QUIESCE_RECEIPT" >/dev/null \
  || legacy_die "signed quiesce receipt contract is invalid"

legacy_require_canonical_directory "$RELEASE_ROOT" "release root"
legacy_require_absolute_safe_path "$CURRENT_LINK" "current release link"
[[ -L $CURRENT_LINK ]] || legacy_die "current release link is unavailable"
CURRENT_RELEASE=$(readlink -f -- "$CURRENT_LINK")
[[ $CURRENT_RELEASE == "${RELEASE_ROOT}/"* \
  && $(basename -- "$CURRENT_RELEASE") == "$EXPECTED_COMMIT" ]] \
  || legacy_die "current release is not the explicitly accepted commit"

ACCEPTANCE_SHA=$(legacy_verify_release_acceptance \
  "$RELEASE_ACCEPTANCE" "$PUBLIC_KEY" "$SERVICE_GID" \
  "$EXPECTED_COMMIT" "$EXPECTED_IMAGE_ID")
legacy_require_file_metadata \
  "$DEPLOYMENT_RECEIPT" 0 "$SERVICE_GID" 640 $((1024 * 1024)) \
  "deployment receipt"
jq -e \
  --arg commit "$EXPECTED_COMMIT" \
  --arg imageId "$EXPECTED_IMAGE_ID" \
  '
    .contractVersion == "1" and
    .action == "deploy-release" and
    .status == "DEPLOYED_PRIVATE_ACCEPTED" and
    .commit == $commit and
    .secretsExposed == false and
    (.detail | type == "string" and startswith($imageId + ";"))
  ' "$DEPLOYMENT_RECEIPT" >/dev/null \
  || legacy_die "deployment receipt does not prove the accepted private release"
DEPLOYMENT_SHA=$(legacy_sha256_file "$DEPLOYMENT_RECEIPT")

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
LEGACY_ADMIN_STATE=$(jq -er \
  '.legacyBoundary.adminSecurityState.path' "$QUIESCE_RECEIPT")
LEGACY_ADMIN_PEPPER=$(jq -er \
  '.legacyBoundary.adminPepper.path' "$QUIESCE_RECEIPT")
EXCLUDED_DORMANT_SECRET=$(jq -er \
  '.legacyBoundary.dormantSecret.path' "$QUIESCE_RECEIPT")
legacy_require_canonical_existing_file \
  "$EXCLUDED_DORMANT_SECRET" "excluded dormant secret"

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

[[ $NEW_ADMIN_STATE == "$LEGACY_ADMIN_STATE" \
  && $NEW_ADMIN_PEPPER == "$LEGACY_ADMIN_PEPPER" ]] \
  || legacy_die "new Admin Security paths must match the preflight ABSENT paths"
[[ $NEW_DATABASE != "$DATABASE_SOURCE" \
  && $NEW_DATABASE != "$DATABASE_COPY" \
  && $NEW_DATABASE != "$DATABASE_FORENSIC_COPY" \
  && $NEW_ADMIN_STATE != "$EXCLUDED_DORMANT_SECRET" \
  && $NEW_ADMIN_PEPPER != "$EXCLUDED_DORMANT_SECRET" \
  && $NEW_FOUNDER_BOOTSTRAP != "$EXCLUDED_DORMANT_SECRET" ]] \
  || legacy_die "new live paths overlap retained legacy or excluded secret paths"
legacy_require_file_metadata \
  "$NEW_DATABASE" "$NEW_DATABASE_UID" "$NEW_DATABASE_GID" \
  "$NEW_DATABASE_MODE" $((128 * 1024 * 1024 * 1024)) "new live database"
legacy_sqlite_integrity_and_version "$NEW_DATABASE" "$NEW_SCHEMA_VERSION"
legacy_require_file_metadata \
  "$NEW_ADMIN_STATE" "$NEW_ADMIN_STATE_UID" "$NEW_ADMIN_STATE_GID" \
  "$NEW_ADMIN_STATE_MODE" $((5 * 1024 * 1024)) "new Admin Security state"
legacy_validate_new_admin_state "$NEW_ADMIN_STATE"
legacy_require_file_metadata \
  "$NEW_ADMIN_PEPPER" "$NEW_ADMIN_PEPPER_UID" "$NEW_ADMIN_PEPPER_GID" \
  "$NEW_ADMIN_PEPPER_MODE" 4096 "new Admin Security pepper"
[[ $(stat -c '%s' "$NEW_ADMIN_PEPPER") -ge 32 ]] \
  || legacy_die "new Admin Security pepper is too short"
legacy_require_file_metadata \
  "$NEW_FOUNDER_BOOTSTRAP" "$NEW_BOOTSTRAP_UID" "$NEW_BOOTSTRAP_GID" \
  "$NEW_BOOTSTRAP_MODE" 16384 "new Founder bootstrap"
legacy_validate_new_admin_bootstrap "$NEW_FOUNDER_BOOTSTRAP" "$NEW_ACCESS_ORIGIN"

WORK_DIR=$(mktemp -d "$(dirname -- "$MARKER")/.legacy-success.XXXXXX")
chmod 0700 "$WORK_DIR"
SPECIFICATIONS="${WORK_DIR}/container-specifications.json"
LEGACY_INSPECT="${WORK_DIR}/legacy-container-inspect.json"
NEW_INSPECT="${WORK_DIR}/new-container-inspect.json"
SOURCE_DIRECTORIES="${WORK_DIR}/source-directories.json"
DATABASE_COPY_OBSERVATION="${WORK_DIR}/database-copy-observation.json"
DATABASE_FORENSIC_OBSERVATION="${WORK_DIR}/database-forensic-observation.json"
RUNTIME_CONFIG_COPY_OBSERVATION="${WORK_DIR}/runtime-config-copy-observation.json"
UNSIGNED="${WORK_DIR}/success-marker.json"
cleanup() {
  find "$WORK_DIR" -xdev -depth -delete 2>/dev/null || true
}
trap cleanup EXIT

jq -S '.containers.exactIdentities' "$QUIESCE_RECEIPT" >"$SPECIFICATIONS"
jq -S '.source.directories' "$QUIESCE_RECEIPT" >"$SOURCE_DIRECTORIES"
jq -S '.copy.database' "$QUIESCE_RECEIPT" >"$DATABASE_COPY_OBSERVATION"
jq -S '.copy.forensicDatabase' \
  "$QUIESCE_RECEIPT" >"$DATABASE_FORENSIC_OBSERVATION"
jq -S '.copy.runtimeConfig' \
  "$QUIESCE_RECEIPT" >"$RUNTIME_CONFIG_COPY_OBSERVATION"
legacy_verify_directory_identities "$SOURCE_DIRECTORIES"
legacy_verify_file_observation "$DATABASE_COPY_OBSERVATION"
legacy_verify_file_observation "$DATABASE_FORENSIC_OBSERVATION"
legacy_verify_file_observation "$RUNTIME_CONFIG_COPY_OBSERVATION"
legacy_capture_selected_containers "$LEGACY_INSPECT" "$SPECIFICATIONS"
legacy_assert_configuration_fingerprint_with_policy \
  "$LEGACY_INSPECT" \
  "$(jq -er '.containers.configurationFingerprint' "$QUIESCE_RECEIPT")" \
  "$(jq -er '.containers.restartPolicyBeforeQuiesce' "$QUIESCE_RECEIPT")"
legacy_assert_container_state "$LEGACY_INSPECT" false no

mapfile -t NEW_CONTAINER_IDS < <(
  docker ps --no-trunc \
    --filter "label=com.docker.compose.project=${NEW_COMPOSE_PROJECT}" \
    --format '{{.ID}}'
)
[[ ${#NEW_CONTAINER_IDS[@]} -eq "$EXPECTED_NEW_CONTAINER_COUNT" ]] \
  || legacy_die "new private stack container count is invalid"
docker inspect "${NEW_CONTAINER_IDS[@]}" >"$NEW_INSPECT"
jq -e \
  --arg excludedSecret "$EXCLUDED_DORMANT_SECRET" \
  '
    def covers($mount; $path):
      $mount.Source == $path or ($path | startswith($mount.Source + "/"));
    length >= 1 and
    all(.[];
      .State.Running == true and
      all(.Mounts[]?;
        ((.Source | type == "string" and startswith("/")) | not) or
        (covers(.; $excludedSecret) | not)
      )
    )
  ' "$NEW_INSPECT" >/dev/null \
  || legacy_die "new stack mounted the excluded dormant legacy secret"
legacy_assert_listener_open "$NEW_LISTENER_HOST" "$NEW_LISTENER_PORT"

CREATED_AT=$(legacy_current_timestamp)
RETAIN_UNTIL=$(legacy_future_timestamp "$RETENTION_SECONDS")
QUIESCE_SIGNATURE_SHA=$(legacy_sha256_file "$QUIESCE_SIGNATURE")
QUIESCE_PHASE=$(jq -er '.quiescePhase' "$QUIESCE_RECEIPT")
if [[ $QUIESCE_PHASE == "INITIAL" ]]; then
  ADMIN_STATE_STATUS="NEW_PRE_ADMIN_MIGRATION"
  ADMIN_PEPPER_STATUS="NEW_OWNER_ONLY"
else
  ADMIN_STATE_STATUS="RETAINED_NEW_STACK_STATE"
  ADMIN_PEPPER_STATUS="RETAINED_NEW_STACK_PEPPER"
fi
jq -S -n \
  --arg acceptanceMarker "$RELEASE_ACCEPTANCE" \
  --arg acceptanceMarkerSha256 "$ACCEPTANCE_SHA" \
  --arg commit "$EXPECTED_COMMIT" \
  --arg confirmedAction "$CONFIRM" \
  --arg copyRoot "$COPY_ROOT" \
  --arg createdAt "$CREATED_AT" \
  --arg deploymentReceipt "$DEPLOYMENT_RECEIPT" \
  --arg deploymentReceiptSha256 "$DEPLOYMENT_SHA" \
  --arg imageId "$EXPECTED_IMAGE_ID" \
  --arg newAdminPepper "$NEW_ADMIN_PEPPER" \
  --arg newAdminPepperGid "$NEW_ADMIN_PEPPER_GID" \
  --arg newAdminPepperMode "$NEW_ADMIN_PEPPER_MODE" \
  --arg newAdminPepperStatus "$ADMIN_PEPPER_STATUS" \
  --arg newAdminPepperUid "$NEW_ADMIN_PEPPER_UID" \
  --arg newAdminState "$NEW_ADMIN_STATE" \
  --arg newAdminStateGid "$NEW_ADMIN_STATE_GID" \
  --arg newAdminStateMode "$NEW_ADMIN_STATE_MODE" \
  --arg newAdminStateStatus "$ADMIN_STATE_STATUS" \
  --arg newAdminStateUid "$NEW_ADMIN_STATE_UID" \
  --arg newDatabase "$NEW_DATABASE" \
  --arg newFounderBootstrap "$NEW_FOUNDER_BOOTSTRAP" \
  --arg newListenerHost "$NEW_LISTENER_HOST" \
  --arg newListenerPort "$NEW_LISTENER_PORT" \
  --arg newComposeProject "$NEW_COMPOSE_PROJECT" \
  --arg newContainerCount "$EXPECTED_NEW_CONTAINER_COUNT" \
  --arg quiesceReceipt "$QUIESCE_RECEIPT" \
  --arg quiesceReceiptSha256 "$QUIESCE_SHA" \
  --arg quiesceSignatureSha256 "$QUIESCE_SIGNATURE_SHA" \
  --arg quiescePhase "$QUIESCE_PHASE" \
  --arg retainUntil "$RETAIN_UNTIL" \
  '{
    acceptedRelease: {
      acceptanceMarker: $acceptanceMarker,
      acceptanceMarkerSha256: $acceptanceMarkerSha256,
      commit: $commit,
      deploymentReceipt: $deploymentReceipt,
      deploymentReceiptSha256: $deploymentReceiptSha256,
      imageId: $imageId
    },
    confirmedAction: $confirmedAction,
    contractVersion: "1",
    createdAt: $createdAt,
    kind: "LEGACY_MIGRATION_SUCCESS",
    legacyRollbackBoundary: {
      copyRoot: $copyRoot,
      legacyContainersRemoved: false,
      legacyContainersRestartPolicy: "no",
      legacyContainersRunning: false,
      originalSourcesRemoved: false,
      quiesceReceipt: $quiesceReceipt,
      quiesceReceiptSha256: $quiesceReceiptSha256,
      quiesceSignatureSha256: $quiesceSignatureSha256,
      quiescePhase: $quiescePhase,
      retainUntil: $retainUntil
    },
    newAdminSecurity: {
      bootstrapSecretDisclosed: false,
      founderBootstrap: {path: $newFounderBootstrap, status: "OWNER_ONLY_FRESH"},
      legacyCredentialContinuityClaimed: false,
      pepper: {
        gid: ($newAdminPepperGid | tonumber),
        mode: $newAdminPepperMode,
        path: $newAdminPepper,
        status: $newAdminPepperStatus,
        uid: ($newAdminPepperUid | tonumber)
      },
      state: {
        gid: ($newAdminStateGid | tonumber),
        mode: $newAdminStateMode,
        path: $newAdminState,
        status: $newAdminStateStatus,
        uid: ($newAdminStateUid | tonumber)
      }
    },
    newData: {
      database: $newDatabase,
      integrity: "ok"
    },
    newStack: {
      composeProject: $newComposeProject,
      containerCount: ($newContainerCount | tonumber),
      listener: {
        host: $newListenerHost,
        port: ($newListenerPort | tonumber)
      },
      status: "PRIVATE_READINESS_VERIFIED"
    },
    secretsExposed: false,
    status: "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED"
  }' >"$UNSIGNED"

legacy_publish_signed_json \
  "$UNSIGNED" "$MARKER" "$PRIVATE_KEY" "$PUBLIC_KEY" "$SERVICE_GID" \
  >/dev/null
trap - EXIT
cleanup

printf 'LEGACY_MIGRATION_SUCCESS_MARKER=%s\n' "$MARKER"
printf 'LEGACY_MIGRATION_SUCCESS_SIGNATURE=%s\n' "${MARKER}.sig"
printf 'LEGACY_ROLLBACK_RETAIN_UNTIL=%s\n' "$RETAIN_UNTIL"
