#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/production/lib/release-transaction.sh
source "${SCRIPT_DIR}/lib/release-transaction.sh"
# shellcheck source=scripts/production/lib/legacy-migration-common.sh
source "${SCRIPT_DIR}/lib/legacy-migration-common.sh"
# shellcheck source=scripts/production/lib/candidate-recovery.sh
source "${SCRIPT_DIR}/lib/candidate-recovery.sh"

REPOSITORY=
BRANCH=
COMMIT=
DEPLOY_KEY=${ONLYWAY_DEPLOY_KEY:-"${ONLYWAY_DEPLOY_SECRETS_DIR}/github-deploy-key"}
DEPLOY_KNOWN_HOSTS=${ONLYWAY_DEPLOY_KNOWN_HOSTS:-"${ONLYWAY_DEPLOY_SECRETS_DIR}/github-known-hosts"}
LEGACY_QUIESCE_RECEIPT=
LEGACY_QUIESCE_SIGNATURE=
LEGACY_ROLLBACK_RECEIPT=
DRY_RUN=false

while (($# > 0)); do
  case "$1" in
    --repo) [[ $# -ge 2 ]] || die "--repo requires a value"; REPOSITORY=$2; shift ;;
    --branch) [[ $# -ge 2 ]] || die "--branch requires a value"; BRANCH=$2; shift ;;
    --commit) [[ $# -ge 2 ]] || die "--commit requires a value"; COMMIT=$2; shift ;;
    --deploy-key) [[ $# -ge 2 ]] || die "--deploy-key requires a value"; DEPLOY_KEY=$2; shift ;;
    --known-hosts) [[ $# -ge 2 ]] || die "--known-hosts requires a value"; DEPLOY_KNOWN_HOSTS=$2; shift ;;
    --legacy-quiesce-receipt) [[ $# -ge 2 ]] || die "--legacy-quiesce-receipt requires a value"; LEGACY_QUIESCE_RECEIPT=$2; shift ;;
    --legacy-quiesce-signature) [[ $# -ge 2 ]] || die "--legacy-quiesce-signature requires a value"; LEGACY_QUIESCE_SIGNATURE=$2; shift ;;
    --legacy-rollback-receipt) [[ $# -ge 2 ]] || die "--legacy-rollback-receipt requires a value"; LEGACY_ROLLBACK_RECEIPT=$2; shift ;;
    --dry-run) DRY_RUN=true ;;
    *) die "usage: $0 --repo SSH_URL --branch main --commit FULL_SHA [--deploy-key ABS] [--known-hosts ABS] [--legacy-quiesce-receipt ABS --legacy-quiesce-signature ABS --legacy-rollback-receipt ABS] [--dry-run]" ;;
  esac
  shift
done

require_root
require_branch "$BRANCH"
require_commit "$COMMIT"
require_absolute_path "$DEPLOY_KEY" "deploy key"
require_absolute_path "$DEPLOY_KNOWN_HOSTS" "known-hosts file"
[[ $DEPLOY_KEY != *[[:space:]]* ]] || die "deploy key path must not contain whitespace"
[[ $DEPLOY_KNOWN_HOSTS != *[[:space:]]* ]] || die "known-hosts path must not contain whitespace"
[[ $DEPLOY_KEY =~ ^/[A-Za-z0-9_./-]+$ ]] \
  || die "deploy key path contains unsupported characters"
[[ $DEPLOY_KNOWN_HOSTS =~ ^/[A-Za-z0-9_./-]+$ ]] \
  || die "known-hosts path contains unsupported characters"
[[ $REPOSITORY =~ ^git@github\.com:[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ \
  || $REPOSITORY =~ ^ssh://git@github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+(\.git)?$ ]] \
  || die "repository must use a GitHub SSH deploy-key URL"
LEGACY_MIGRATION=false
if [[ -n $LEGACY_QUIESCE_RECEIPT \
  || -n $LEGACY_QUIESCE_SIGNATURE \
  || -n $LEGACY_ROLLBACK_RECEIPT ]]; then
  [[ -n $LEGACY_QUIESCE_RECEIPT \
    && -n $LEGACY_QUIESCE_SIGNATURE \
    && -n $LEGACY_ROLLBACK_RECEIPT ]] \
    || die "legacy migration requires receipt, detached signature and rollback receipt path together"
  require_absolute_path "$LEGACY_QUIESCE_RECEIPT" "legacy quiesce receipt"
  require_absolute_path "$LEGACY_QUIESCE_SIGNATURE" "legacy quiesce signature"
  require_absolute_path "$LEGACY_ROLLBACK_RECEIPT" "legacy rollback receipt"
  [[ $LEGACY_QUIESCE_SIGNATURE == "${LEGACY_QUIESCE_RECEIPT}.sig" ]] \
    || die "legacy quiesce signature must use the receipt .sig path"
  [[ ! -e $LEGACY_ROLLBACK_RECEIPT && ! -L $LEGACY_ROLLBACK_RECEIPT \
    && ! -e "${LEGACY_ROLLBACK_RECEIPT}.sig" \
    && ! -L "${LEGACY_ROLLBACK_RECEIPT}.sig" ]] \
    || die "legacy rollback receipt target must be absent"
  LEGACY_MIGRATION=true
fi

LEGACY_QUIESCE_PHASE=
LEGACY_DATABASE_COPY=
LEGACY_DATABASE_COPY_SHA=
LEGACY_RUNTIME_CONFIG_COPY=
LEGACY_RUNTIME_CONFIG_COPY_SHA=
LEGACY_CONFIGURATION_FINGERPRINT=
LEGACY_ADMIN_STATE_PATH=
LEGACY_ADMIN_PEPPER_PATH=
LEGACY_SPECIFICATIONS=
LEGACY_VALIDATION_ROOT=
LEGACY_DATABASE_TEMPORARY=
LEGACY_RUNTIME_TEMPORARY=
LIVE_ADMIN_PEPPER_TEMPORARY=
LEGACY_ROLLBACK_ARMED=false

rollback_quiesced_legacy() {
  [[ $LEGACY_MIGRATION == "true" ]] || return 0
  "${SCRIPT_DIR}/rollback-legacy-migration.sh" \
    --phase QUIESCED \
    --quiesce-receipt "$LEGACY_QUIESCE_RECEIPT" \
    --quiesce-signature "$LEGACY_QUIESCE_SIGNATURE" \
    --success-marker NONE \
    --success-signature NONE \
    --new-backup-manifest NONE \
    --new-backup-signature NONE \
    --new-backup-uid "$ONLYWAY_UID" \
    --new-backup-gid "$ONLYWAY_GID" \
    --new-service-unit NONE \
    --new-backup-timer-unit NONE \
    --new-listener 127.0.0.1:43100 \
    --receipt "$LEGACY_ROLLBACK_RECEIPT" \
    --private-key "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    --public-key "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    --service-gid "$ONLYWAY_GID" \
    --lock-file "${ONLYWAY_OPERATION_LOCK_DIR}/legacy-migration.lock" \
    --probe-attempts 24 \
    --probe-interval 5 \
    --confirm ROLLBACK_QUIESCED_LEGACY_V1
}

early_legacy_on_exit() {
  local exit_code=$?
  trap - EXIT
  set +e
  if ((exit_code != 0)) && [[ $LEGACY_ROLLBACK_ARMED == "true" ]]; then
    if rollback_quiesced_legacy; then
      LEGACY_ROLLBACK_ARMED=false
      log "signed legacy rollback restored the exact pre-cutover runtime"
    else
      log "ERROR: signed legacy rollback is incomplete"
    fi
  fi
  if [[ -n $LEGACY_VALIDATION_ROOT \
    && -d $LEGACY_VALIDATION_ROOT \
    && $LEGACY_VALIDATION_ROOT == \
      "${ONLYWAY_RUN_DIR}/legacy-deploy-validation."* ]]; then
    find "$LEGACY_VALIDATION_ROOT" -xdev -depth -delete 2>/dev/null
  fi
  exit "$exit_code"
}
trap early_legacy_on_exit EXIT

ensure_layout_exists
acquire_operation_lock deploy-release

if $DRY_RUN; then
  log "dry-run: fetch ${BRANCH} and require exact commit ${COMMIT}"
  log "dry-run: verify build/tests and OCI revision, run an isolated no-egress candidate on copied state, sign acceptance, then promote transactionally"
  if [[ $LEGACY_MIGRATION == "true" ]]; then
    log "dry-run: verify signed legacy quiesce, test its SQLite copy, import only the copy and restore the exact legacy runtime on any failure"
  fi
  exit 0
fi

for command in \
  df docker du find git jq openssl readlink sha256sum ss stat sync \
  systemctl systemd-analyze; do
  require_command "$command"
done

# A candidate is deliberately non-restarting. If an earlier deploy was killed
# without running its EXIT trap, consume only its crash-durable, root-owned
# guard and remove the exact commit/project resources before inspecting the
# ordinary live/legacy inventory.
candidate_recovery_recover_all

verify_legacy_quiesced_boundary() {
  local inspect_file
  [[ $LEGACY_MIGRATION == "true" ]] || return 0
  inspect_file=$(mktemp "${LEGACY_VALIDATION_ROOT}/legacy-inspect.XXXXXX")
  legacy_capture_exact_inventory "$inspect_file" "$LEGACY_SPECIFICATIONS"
  legacy_assert_configuration_fingerprint_with_policy \
    "$inspect_file" "$LEGACY_CONFIGURATION_FINGERPRINT" "unless-stopped"
  legacy_assert_container_state "$inspect_file" false no
  unlink "$inspect_file"
}

render_migrated_runtime_configuration() {
  local target=$1
  local temporary
  temporary=$(mktemp "$(dirname -- "$target")/.runtime-migration.XXXXXX")
  jq -S -e -f "${SCRIPT_DIR}/lib/render-legacy-runtime.jq" \
    "$LEGACY_RUNTIME_CONFIG_COPY" >"$temporary" \
    || die "legacy runtime configuration cannot be rendered into the offline production contract"
  chown "$ONLYWAY_SERVICE_USER:$ONLYWAY_SERVICE_GROUP" "$temporary"
  chmod 0600 "$temporary"
  mv -T -- "$temporary" "$target"
}

install_migrated_live_state() {
  local sidecar
  [[ $LEGACY_MIGRATION == "true" ]] \
    || die "migrated live-state installation was called outside migration"
  for sidecar in \
    "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-wal" \
    "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-shm" \
    "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-journal"; do
    [[ ! -e $sidecar && ! -L $sidecar ]] \
      || die "new-runtime SQLite sidecar remains at the migration cutover boundary"
  done
  LEGACY_DATABASE_TEMPORARY=$(mktemp \
    "${ONLYWAY_DATA_DIR}/.mv-ai-os.sqlite.migration.XXXXXX")
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "$LEGACY_DATABASE_COPY" "$LEGACY_DATABASE_TEMPORARY"
  [[ $(legacy_sha256_file "$LEGACY_DATABASE_TEMPORARY") == \
    "$LEGACY_DATABASE_COPY_SHA" ]] \
    || die "migrated live database staging fingerprint is invalid"
  legacy_sqlite_integrity_and_version "$LEGACY_DATABASE_TEMPORARY" 32
  LEGACY_RUNTIME_TEMPORARY=$(mktemp \
    "${ONLYWAY_CONFIG_DIR}/.runtime.json.migration.XXXXXX")
  unlink "$LEGACY_RUNTIME_TEMPORARY"
  render_migrated_runtime_configuration "$LEGACY_RUNTIME_TEMPORARY"
  MIGRATED_LIVE_STATE_MUTATED=true
  mv -fT -- "$LEGACY_DATABASE_TEMPORARY" \
    "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite"
  LEGACY_DATABASE_TEMPORARY=
  sync -f "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite"
  sync -f "$ONLYWAY_DATA_DIR"
  mv -fT -- "$LEGACY_RUNTIME_TEMPORARY" \
    "${ONLYWAY_CONFIG_DIR}/runtime.json"
  LEGACY_RUNTIME_TEMPORARY=
  sync -f "${ONLYWAY_CONFIG_DIR}/runtime.json"
  sync -f "$ONLYWAY_CONFIG_DIR"
}

ensure_live_admin_pepper() {
  local size=
  if [[ ! -e $ONLYWAY_ADMIN_PEPPER_FILE \
    && ! -L $ONLYWAY_ADMIN_PEPPER_FILE ]]; then
    LIVE_ADMIN_PEPPER_TEMPORARY=$(mktemp \
      "${ONLYWAY_ADMIN_SECRETS_DIR}/.admin-source-key-pepper.XXXXXX")
    openssl rand -out "$LIVE_ADMIN_PEPPER_TEMPORARY" 48
    chown "$ONLYWAY_SERVICE_USER:$ONLYWAY_SERVICE_GROUP" \
      "$LIVE_ADMIN_PEPPER_TEMPORARY"
    chmod 0600 "$LIVE_ADMIN_PEPPER_TEMPORARY"
    sync -f "$LIVE_ADMIN_PEPPER_TEMPORARY"
    LIVE_ADMIN_PEPPER_CREATED=true
    mv -T -- "$LIVE_ADMIN_PEPPER_TEMPORARY" "$ONLYWAY_ADMIN_PEPPER_FILE"
    LIVE_ADMIN_PEPPER_TEMPORARY=
    sync -f "$ONLYWAY_ADMIN_SECRETS_DIR"
  fi
  [[ -f $ONLYWAY_ADMIN_PEPPER_FILE && ! -L $ONLYWAY_ADMIN_PEPPER_FILE ]] \
    || die "Admin Security pepper is unavailable or unsafe"
  [[ $(stat -c '%u:%g' "$ONLYWAY_ADMIN_PEPPER_FILE") == \
    "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
    || die "Admin Security pepper ownership is invalid"
  [[ $(stat -c '%a' "$ONLYWAY_ADMIN_PEPPER_FILE") == "600" ]] \
    || die "Admin Security pepper mode must be 0600"
  size=$(stat -c '%s' "$ONLYWAY_ADMIN_PEPPER_FILE")
  [[ $size =~ ^[0-9]+$ && $size -ge 32 && $size -le 4096 ]] \
    || die "Admin Security pepper size is invalid"
}

if [[ $LEGACY_MIGRATION == "true" ]]; then
  for command in curl dd find flock install readlink sqlite3; do
    require_command "$command"
  done
  LEGACY_VALIDATION_ROOT=$(mktemp -d \
    "${ONLYWAY_RUN_DIR}/legacy-deploy-validation.XXXXXX")
  chmod 0700 "$LEGACY_VALIDATION_ROOT"
  LEGACY_SPECIFICATIONS="${LEGACY_VALIDATION_ROOT}/container-specifications.json"
  legacy_verify_signed_json \
    "$LEGACY_QUIESCE_RECEIPT" \
    "$LEGACY_QUIESCE_SIGNATURE" \
    "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    "$ONLYWAY_GID" >/dev/null
  jq -e '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_QUIESCE_COPY" and
    .status == "QUIESCED_COPY_VERIFIED" and
    (
      (.quiescePhase == "INITIAL" and
        .confirmedAction == "QUIESCE_AND_COPY_LEGACY_V1") or
      (.quiescePhase == "FORWARD_AFTER_ROLLBACK" and
        .confirmedAction == "REQUIESCE_FOR_FORWARD_DEPLOY_V1")
    )
  ' "$LEGACY_QUIESCE_RECEIPT" >/dev/null \
    || die "signed legacy quiesce receipt cannot arm automatic rollback"
  LEGACY_ROLLBACK_ARMED=true
  jq -e -f "${SCRIPT_DIR}/lib/legacy-deploy-quiesce-contract.jq" \
    "$LEGACY_QUIESCE_RECEIPT" >/dev/null \
    || die "signed legacy quiesce receipt contract is invalid"
  LEGACY_QUIESCE_PHASE=$(jq -er '.quiescePhase' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_DATABASE_COPY=$(jq -er '.copy.database.path' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_DATABASE_COPY_SHA=$(jq -er '.copy.database.sha256' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_RUNTIME_CONFIG_COPY=$(jq -er '.copy.runtimeConfig.path' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_RUNTIME_CONFIG_COPY_SHA=$(jq -er '.copy.runtimeConfig.sha256' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_CONFIGURATION_FINGERPRINT=$(jq -er \
    '.containers.configurationFingerprint' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_ADMIN_STATE_PATH=$(jq -er \
    '.legacyBoundary.adminSecurityState.path' \
    "$LEGACY_QUIESCE_RECEIPT")
  LEGACY_ADMIN_PEPPER_PATH=$(jq -er \
    '.legacyBoundary.adminPepper.path' \
    "$LEGACY_QUIESCE_RECEIPT")
  [[ $LEGACY_ADMIN_STATE_PATH == "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" \
    && $LEGACY_ADMIN_PEPPER_PATH == "$ONLYWAY_ADMIN_PEPPER_FILE" ]] \
    || die "signed legacy Admin Security paths do not match the production boundary"
  if [[ $LEGACY_QUIESCE_PHASE == "INITIAL" ]]; then
    legacy_assert_path_absent \
      "$LEGACY_ADMIN_STATE_PATH" "initial Admin Security state"
    legacy_assert_path_absent \
      "$LEGACY_ADMIN_PEPPER_PATH" "initial Admin Security pepper"
  fi
  jq -S '.containers.exactIdentities' \
    "$LEGACY_QUIESCE_RECEIPT" >"$LEGACY_SPECIFICATIONS"
  for legacy_copy_and_sha in \
    "$LEGACY_DATABASE_COPY:$LEGACY_DATABASE_COPY_SHA" \
    "$LEGACY_RUNTIME_CONFIG_COPY:$LEGACY_RUNTIME_CONFIG_COPY_SHA"; do
    legacy_copy=${legacy_copy_and_sha%:*}
    legacy_sha=${legacy_copy_and_sha##*:}
    legacy_require_canonical_existing_file \
      "$legacy_copy" "signed legacy migration copy"
    legacy_require_sha256 "$legacy_sha" "signed legacy migration copy"
    [[ $(legacy_sha256_file "$legacy_copy") == "$legacy_sha" ]] \
      || die "signed legacy migration copy fingerprint changed"
  done
  legacy_sqlite_integrity_and_version "$LEGACY_DATABASE_COPY" 32
  verify_legacy_quiesced_boundary
fi

[[ -f $DEPLOY_KEY && ! -L $DEPLOY_KEY ]] \
  || die "deploy key is unavailable or is a symlink"
[[ $(stat -c '%a' "$DEPLOY_KEY") == "600" ]] \
  || die "deploy key mode must be 0600"
[[ $(stat -c '%u' "$DEPLOY_KEY") == "0" ]] \
  || die "deploy key must be owned by root"
[[ -f $DEPLOY_KNOWN_HOSTS && ! -L $DEPLOY_KNOWN_HOSTS ]] \
  || die "GitHub known-hosts file is unavailable or is a symlink"
[[ $(stat -c '%u' "$DEPLOY_KNOWN_HOSTS") == "0" ]] \
  || die "GitHub known-hosts file must be owned by root"
[[ $(stat -c '%a' "$DEPLOY_KNOWN_HOSTS") == "600" \
  || $(stat -c '%a' "$DEPLOY_KNOWN_HOSTS") == "644" ]] \
  || die "GitHub known-hosts mode must be 0600 or 0644"
grep -Eq '^github\.com (ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) ' \
  "$DEPLOY_KNOWN_HOSTS" || die "GitHub known-hosts file is invalid"
require_ssh_hardening_confirmed

if [[ $LEGACY_MIGRATION == "false" ]]; then
  PREEXISTING_CONTAINER_COUNT=0
  PREEXISTING_CURRENT_RELEASE=false
  declare -A RETAINED_LEGACY_CONTAINER_IDS=()
  if current_release >/dev/null 2>&1; then
    PREEXISTING_CURRENT_RELEASE=true
  fi
  if [[ $PREEXISTING_CURRENT_RELEASE == "true" ]]; then
    mapfile -t LEGACY_SUCCESS_MARKERS < <(
      find "${ONLYWAY_RUN_DIR}/legacy-migration" -maxdepth 1 -type f \
        -name 'legacy-final-success-*.json' -print 2>/dev/null | sort
    )
    if ((${#LEGACY_SUCCESS_MARKERS[@]} == 1)); then
      LEGACY_SUCCESS_MARKER=${LEGACY_SUCCESS_MARKERS[0]}
      legacy_verify_signed_json \
        "$LEGACY_SUCCESS_MARKER" "${LEGACY_SUCCESS_MARKER}.sig" \
        "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" "$ONLYWAY_GID" >/dev/null
      jq -e \
        --arg project "$ONLYWAY_COMPOSE_PROJECT" '
          .contractVersion == "1" and
          .kind == "LEGACY_MIGRATION_SUCCESS" and
          .status == "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED" and
          .confirmedAction == "RETAIN_LEGACY_ROLLBACK_V1" and
          .secretsExposed == false and
          .newStack.composeProject == $project and
          .newStack.status == "PRIVATE_READINESS_VERIFIED" and
          .legacyRollbackBoundary.legacyContainersRemoved == false and
          .legacyRollbackBoundary.legacyContainersRunning == false and
          .legacyRollbackBoundary.legacyContainersRestartPolicy == "no" and
          .legacyRollbackBoundary.originalSourcesRemoved == false
        ' "$LEGACY_SUCCESS_MARKER" >/dev/null \
        || die "retained legacy success marker is invalid"
      RETAINED_QUIESCE_RECEIPT=$(jq -er \
        '.legacyRollbackBoundary.quiesceReceipt' "$LEGACY_SUCCESS_MARKER")
      legacy_verify_signed_json \
        "$RETAINED_QUIESCE_RECEIPT" "${RETAINED_QUIESCE_RECEIPT}.sig" \
        "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" "$ONLYWAY_GID" >/dev/null
      [[ $(legacy_sha256_file "$RETAINED_QUIESCE_RECEIPT") == \
        "$(jq -er '.legacyRollbackBoundary.quiesceReceiptSha256' \
          "$LEGACY_SUCCESS_MARKER")" \
        && $(legacy_sha256_file "${RETAINED_QUIESCE_RECEIPT}.sig") == \
        "$(jq -er '.legacyRollbackBoundary.quiesceSignatureSha256' \
          "$LEGACY_SUCCESS_MARKER")" ]] \
        || die "retained legacy receipt binding is invalid"
      while IFS= read -r retained_id; do
        [[ $retained_id =~ ^[0-9a-f]{64}$ ]] \
          || die "retained legacy container identity is invalid"
        [[ $(docker inspect --format \
          '{{.State.Running}}|{{.HostConfig.RestartPolicy.Name}}' \
          "$retained_id") == "false|no" ]] \
          || die "retained legacy container is not dormant"
        RETAINED_LEGACY_CONTAINER_IDS[$retained_id]=1
      done < <(jq -er '.containers.exactIdentities[].id' \
        "$RETAINED_QUIESCE_RECEIPT")
      ((${#RETAINED_LEGACY_CONTAINER_IDS[@]} > 0)) \
        || die "retained legacy container inventory is empty"
    elif ((${#LEGACY_SUCCESS_MARKERS[@]} > 1)); then
      die "multiple retained legacy success markers require operator review"
    fi
  fi
  PREEXISTING_INVENTORY=$(docker ps --all --no-trunc \
    --format '{{.ID}}|{{.Label "com.docker.compose.project"}}') \
    || die "pre-existing Docker inventory could not be inspected"
  while IFS='|' read -r preexisting_id preexisting_project; do
    [[ -z $preexisting_id ]] && continue
    [[ $preexisting_id =~ ^[0-9a-f]{64}$ ]] \
      || die "pre-existing Docker container identity is invalid"
    ((PREEXISTING_CONTAINER_COUNT += 1))
    [[ ($PREEXISTING_CURRENT_RELEASE == "true" \
      && $preexisting_project == "$ONLYWAY_COMPOSE_PROJECT") \
      || -n ${RETAINED_LEGACY_CONTAINER_IDS[$preexisting_id]+present} ]] \
      || die "pre-existing containers require the signed legacy migration boundary"
  done <<<"$PREEXISTING_INVENTORY"
  if [[ $PREEXISTING_CURRENT_RELEASE == "false" \
    && $PREEXISTING_CONTAINER_COUNT -ne 0 ]]; then
    die "first deployment refuses pre-existing Docker containers without signed legacy evidence"
  fi
fi

DEPLOY_DATABASE_KIB=0
DEPLOY_ADMIN_STATE_KIB=0
if [[ -e "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
  || -L "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" ]]; then
  [[ -f "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
    && ! -L "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" ]] \
    || die "deployment disk guard found an unsafe live database"
  DEPLOY_DATABASE_KIB=$(du -k --apparent-size \
    "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" | awk '{print $1}')
fi
if [[ -e $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
  || -L $ONLYWAY_ADMIN_SECURITY_STATE_FILE ]]; then
  [[ -f $ONLYWAY_ADMIN_SECURITY_STATE_FILE \
    && ! -L $ONLYWAY_ADMIN_SECURITY_STATE_FILE ]] \
    || die "deployment disk guard found unsafe Admin Security state"
  DEPLOY_ADMIN_STATE_KIB=$(du -k --apparent-size \
    "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" | awk '{print $1}')
fi
DEPLOY_AVAILABLE_KIB=$(df -Pk "$ONLYWAY_ROOT" | awk 'NR == 2 {print $4}')
[[ $DEPLOY_DATABASE_KIB =~ ^[0-9]{1,13}$ \
  && $DEPLOY_ADMIN_STATE_KIB =~ ^[0-9]{1,13}$ \
  && $DEPLOY_AVAILABLE_KIB =~ ^[0-9]{1,13}$ ]] \
  || die "deployment disk-space check is invalid"
DEPLOY_REQUIRED_KIB=$((2097152 \
  + DEPLOY_DATABASE_KIB * 6 \
  + DEPLOY_ADMIN_STATE_KIB * 4))
((DEPLOY_AVAILABLE_KIB >= DEPLOY_REQUIRED_KIB)) \
  || die "insufficient free space for verified build, candidate and rollback"

readonly RELEASE="${ONLYWAY_RELEASES_DIR}/${COMMIT}"
STAGING=
SOURCE=
REUSING_ACCEPTED_RELEASE=false
IMAGE_ID=
MARKER=
RELEASE_CREATED=false
CANDIDATE_ROOT=
CANDIDATE_STARTED=false
CANDIDATE_START_ATTEMPTED=false
CANDIDATE_PROJECT="onlyway-candidate-${COMMIT:0:12}"
CANDIDATE_PORT=$((44000 + (16#${COMMIT:0:4} % 1000)))
CANDIDATE_PROXY_PID=
CANDIDATE_GUARD_ARMED=false
PROMOTION_STEP=preflight
FAILURE_RECEIPT_WRITTEN=false
SUCCESS_RECEIPT=
PREPROMOTION_BACKUP_FINGERPRINT=NOT_APPLICABLE_FIRST_DEPLOY
PREPROMOTION_BACKUP=
PROMOTION_START_ATTEMPTED=false
MIGRATED_LIVE_STATE_MUTATED=false
LIVE_ADMIN_PEPPER_CREATED=false

candidate_compose() {
  env \
  COMPOSE_PROJECT_NAME="$CANDIDATE_PROJECT" \
  ONLYWAY_RELEASE_COMMIT="$COMMIT" \
  ONLYWAY_DATA_DIR="${CANDIDATE_ROOT}/data" \
  ONLYWAY_BACKUP_DIR="${CANDIDATE_ROOT}/backups" \
  ONLYWAY_CONFIG_DIR="${CANDIDATE_ROOT}/config" \
  ONLYWAY_ADMIN_STATE_DIR="${CANDIDATE_ROOT}/admin-state" \
  ONLYWAY_SECRETS_DIR="${CANDIDATE_ROOT}/runtime-secrets" \
  ONLYWAY_ADMIN_SECRETS_DIR="${CANDIDATE_ROOT}/admin-secrets" \
  ONLYWAY_ADMIN_BOOTSTRAP_DIR="${CANDIDATE_ROOT}/bootstrap" \
  ONLYWAY_ADMIN_PEPPER_FILE="${CANDIDATE_ROOT}/admin-secrets/admin-source-key-pepper" \
  ONLYWAY_EXTERNAL_ORIGIN="http://localhost:${CANDIDATE_PORT}" \
  ONLYWAY_RESTART_POLICY=no \
  ONLYWAY_TUNNEL_PORT="$CANDIDATE_PORT" \
    docker compose \
      --project-directory "$SOURCE" \
      --file "${SOURCE}/compose.production.yml" \
      "$@"
}

remove_candidate() {
  local result=0
  local remaining_containers=
  local remaining_networks=
  stop_candidate_proxy || result=1
  if [[ $CANDIDATE_START_ATTEMPTED == "true" \
    && -n $CANDIDATE_ROOT && -n $SOURCE ]]; then
    candidate_compose down --remove-orphans --volumes >/dev/null 2>&1 \
      || result=1
    remaining_containers=$(docker ps --all --quiet \
      --filter "label=com.docker.compose.project=${CANDIDATE_PROJECT}" \
      2>/dev/null) || result=1
    remaining_networks=$(docker network ls --quiet \
      --filter "label=com.docker.compose.project=${CANDIDATE_PROJECT}" \
      2>/dev/null) || result=1
    [[ -z $remaining_containers && -z $remaining_networks ]] || result=1
    if ((result == 0)); then
      CANDIDATE_START_ATTEMPTED=false
      CANDIDATE_STARTED=false
    fi
  fi
  if ((result == 0)) && [[ -n $CANDIDATE_ROOT && -d $CANDIDATE_ROOT \
    && $CANDIDATE_ROOT == "${ONLYWAY_RUN_DIR}/candidate.${COMMIT:0:12}."* ]]; then
    rm -rf --one-file-system -- "$CANDIDATE_ROOT" || result=1
  fi
  if ((result == 0)) && [[ $CANDIDATE_GUARD_ARMED == "true" ]]; then
    candidate_recovery_disarm_guard \
      "$COMMIT" \
      "$CANDIDATE_PROJECT" \
      "$CANDIDATE_ROOT" \
      "$SOURCE" \
      "$IMAGE_ID" \
      "$CANDIDATE_PORT" \
      || result=1
    if ((result == 0)); then
      CANDIDATE_GUARD_ARMED=false
    fi
  fi
  if ((result == 0)); then
    CANDIDATE_ROOT=
  fi
  return "$result"
}

stop_candidate_proxy() {
  local result=0
  if [[ -n $CANDIDATE_PROXY_PID ]]; then
    if kill -0 "$CANDIDATE_PROXY_PID" 2>/dev/null; then
      kill -TERM "$CANDIDATE_PROXY_PID" 2>/dev/null || result=1
      wait "$CANDIDATE_PROXY_PID" 2>/dev/null || true
    fi
    CANDIDATE_PROXY_PID=
  fi
  return "$result"
}

cleanup_staging() {
  local result=0
  if [[ -n $STAGING && -d $STAGING \
    && $STAGING == "${ONLYWAY_RELEASES_DIR}/.staging.${COMMIT}."* ]]; then
    rm -rf --one-file-system -- "$STAGING" || result=1
  elif [[ -n $STAGING && (-e $STAGING || -L $STAGING) ]]; then
    result=1
  fi
  if ((result == 0)); then
    STAGING=
  fi
  return "$result"
}

cleanup_legacy_validation() {
  if [[ -n $LIVE_ADMIN_PEPPER_TEMPORARY \
    && -f $LIVE_ADMIN_PEPPER_TEMPORARY \
    && ! -L $LIVE_ADMIN_PEPPER_TEMPORARY \
    && $LIVE_ADMIN_PEPPER_TEMPORARY == \
      "${ONLYWAY_ADMIN_SECRETS_DIR}/.admin-source-key-pepper."* ]]; then
    unlink "$LIVE_ADMIN_PEPPER_TEMPORARY"
  fi
  LIVE_ADMIN_PEPPER_TEMPORARY=
  if [[ -n $LEGACY_DATABASE_TEMPORARY \
    && -f $LEGACY_DATABASE_TEMPORARY \
    && ! -L $LEGACY_DATABASE_TEMPORARY \
    && $LEGACY_DATABASE_TEMPORARY == \
      "${ONLYWAY_DATA_DIR}/.mv-ai-os.sqlite.migration."* ]]; then
    unlink "$LEGACY_DATABASE_TEMPORARY"
  fi
  LEGACY_DATABASE_TEMPORARY=
  if [[ -n $LEGACY_RUNTIME_TEMPORARY \
    && -f $LEGACY_RUNTIME_TEMPORARY \
    && ! -L $LEGACY_RUNTIME_TEMPORARY \
    && $LEGACY_RUNTIME_TEMPORARY == \
      "${ONLYWAY_CONFIG_DIR}/.runtime.json.migration."* ]]; then
    unlink "$LEGACY_RUNTIME_TEMPORARY"
  fi
  LEGACY_RUNTIME_TEMPORARY=
  if [[ -n $LEGACY_VALIDATION_ROOT \
    && -d $LEGACY_VALIDATION_ROOT \
    && $LEGACY_VALIDATION_ROOT == \
      "${ONLYWAY_RUN_DIR}/legacy-deploy-validation."* ]]; then
    find "$LEGACY_VALIDATION_ROOT" -xdev -depth -delete
  fi
  LEGACY_VALIDATION_ROOT=
}

record_failure() {
  local status=$1
  local detail=$2
  if [[ $FAILURE_RECEIPT_WRITTEN == "false" ]]; then
    write_receipt "deploy-release" "$status" "$COMMIT" "$detail" >/dev/null \
      && FAILURE_RECEIPT_WRITTEN=true \
      || log "ERROR: unable to persist the failed deployment receipt"
  fi
}

remove_first_deploy_application_state() {
  local result=0
  local remaining_containers=
  local remaining_networks=
  local artifact
  if [[ $PROMOTION_START_ATTEMPTED == "true" ]]; then
    if [[ -d $RELEASE && -f "${RELEASE}/compose.production.yml" ]]; then
      env \
      COMPOSE_PROJECT_NAME="$ONLYWAY_COMPOSE_PROJECT" \
      ONLYWAY_RELEASE_COMMIT="$COMMIT" \
      ONLYWAY_DATA_DIR="$ONLYWAY_DATA_DIR" \
      ONLYWAY_BACKUP_DIR="$ONLYWAY_BACKUP_DIR" \
      ONLYWAY_CONFIG_DIR="$ONLYWAY_CONFIG_DIR" \
      ONLYWAY_ADMIN_STATE_DIR="$ONLYWAY_ADMIN_STATE_DIR" \
      ONLYWAY_SECRETS_DIR="$ONLYWAY_SECRETS_DIR" \
      ONLYWAY_ADMIN_SECRETS_DIR="$ONLYWAY_ADMIN_SECRETS_DIR" \
      ONLYWAY_ADMIN_BOOTSTRAP_DIR="$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
      ONLYWAY_ADMIN_PEPPER_FILE="$ONLYWAY_ADMIN_PEPPER_FILE" \
        docker compose \
          --project-directory "$RELEASE" \
          --file "${RELEASE}/compose.production.yml" \
          down --remove-orphans --volumes >/dev/null 2>&1 \
        || result=1
    else
      result=1
    fi
    remaining_containers=$(docker ps --all --quiet \
      --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
      2>/dev/null) || result=1
    remaining_networks=$(docker network ls --quiet \
      --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
      2>/dev/null) || result=1
    [[ -z $remaining_containers && -z $remaining_networks ]] || result=1
  fi
  if ((result == 0)); then
    for artifact in \
      "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
      "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-journal" \
      "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-wal" \
      "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite-shm" \
      "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite.command-center.lock" \
      "${ONLYWAY_ADMIN_STATE_DIR}/admin-security.json" \
      "${ONLYWAY_ADMIN_STATE_DIR}/admin-security.json.lock" \
      "${ONLYWAY_ADMIN_BOOTSTRAP_DIR}/founder-bootstrap.json"; do
      if [[ -f $artifact && ! -L $artifact ]]; then
        unlink "$artifact" || result=1
      elif [[ -e $artifact || -L $artifact ]]; then
        result=1
      fi
    done
    if [[ $LIVE_ADMIN_PEPPER_CREATED == "true" ]]; then
      if [[ -f $ONLYWAY_ADMIN_PEPPER_FILE \
        && ! -L $ONLYWAY_ADMIN_PEPPER_FILE ]]; then
        unlink "$ONLYWAY_ADMIN_PEPPER_FILE" || result=1
      elif [[ -e $ONLYWAY_ADMIN_PEPPER_FILE \
        || -L $ONLYWAY_ADMIN_PEPPER_FILE ]]; then
        result=1
      fi
    fi
    sync -f "$ONLYWAY_DATA_DIR" || result=1
    sync -f "$ONLYWAY_ADMIN_STATE_DIR" || result=1
    sync -f "$ONLYWAY_ADMIN_BOOTSTRAP_DIR" || result=1
    sync -f "$ONLYWAY_ADMIN_SECRETS_DIR" || result=1
  fi
  return "$result"
}

on_exit() {
  local exit_code=$?
  local restored=true
  local transaction_failed=false
  trap - EXIT
  set +e
  if ((exit_code != 0)); then
    remove_candidate || remove_candidate || restored=false
    if [[ $RELEASE_TRANSACTION_ACTIVE == "true" \
      && $RELEASE_TRANSACTION_COMMITTED == "false" ]]; then
      transaction_failed=true
      if [[ $LIVE_PRESENT == "true" \
        && ($PROMOTION_START_ATTEMPTED == "true" \
          || $MIGRATED_LIVE_STATE_MUTATED == "true") ]]; then
        restore_release_transaction false || restored=false
        if [[ -n $PREPROMOTION_BACKUP \
          && -x "${RELEASE}/scripts/production/restore.sh" ]]; then
          "${RELEASE}/scripts/production/restore.sh" \
            --backup "$PREPROMOTION_BACKUP" \
            --confirm RESTORE \
            || restored=false
        else
          restored=false
        fi
        if [[ $RELEASE_TRANSACTION_WAS_ACTIVE == "false" ]]; then
          systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || restored=false
          ! systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
            || restored=false
        fi
      elif [[ $LIVE_PRESENT == "false" \
        && ($PROMOTION_START_ATTEMPTED == "true" \
          || $MIGRATED_LIVE_STATE_MUTATED == "true" \
          || $LIVE_ADMIN_PEPPER_CREATED == "true") ]]; then
        restore_release_transaction false || restored=false
        remove_first_deploy_application_state || restored=false
      else
        restore_release_transaction || restored=false
      fi
      if [[ -n $SUCCESS_RECEIPT ]]; then
        if invalidate_host_receipt \
          "$SUCCESS_RECEIPT" \
          "deploy-release" \
          "DEPLOYED_PRIVATE_ACCEPTED" \
          "$COMMIT"; then
          SUCCESS_RECEIPT=
        else
          restored=false
        fi
      fi
    fi
    cleanup_staging || restored=false
    if [[ $LEGACY_ROLLBACK_ARMED == "true" ]]; then
      if rollback_quiesced_legacy; then
        LEGACY_ROLLBACK_ARMED=false
        log "signed legacy rollback restored the exact pre-cutover runtime"
      else
        restored=false
        log "ERROR: signed legacy rollback is incomplete"
      fi
    fi
    if [[ $transaction_failed == "true" ]]; then
      if [[ $restored == "true" ]]; then
        if [[ $REUSING_ACCEPTED_RELEASE == "false" && -n $MARKER \
          && -f $MARKER && ! -L $MARKER ]]; then
          unlink "$MARKER" || restored=false
        fi
        if [[ $RELEASE_CREATED == "true" && -d $RELEASE \
          && $RELEASE == "${ONLYWAY_RELEASES_DIR}/${COMMIT}" ]]; then
          if verify_release_checkout "$RELEASE" "$COMMIT" >/dev/null 2>&1; then
            rm -rf --one-file-system -- "$RELEASE" || restored=false
          else
            restored=false
          fi
        fi
      fi
      if [[ $restored == "true" ]]; then
        discard_release_transaction_snapshot || restored=false
      fi
      if [[ $restored == "false" ]]; then
        log "ERROR: preserving release transaction snapshot and release artifacts for recovery"
      fi
    fi
    if [[ $restored == "false" ]]; then
      record_failure "FAILED_ROLLBACK_INCOMPLETE" \
        "deployment failed at ${PROMOTION_STEP}; automatic restoration is incomplete and the service is fail-closed"
    elif [[ $transaction_failed == "true" ]]; then
      record_failure "FAILED_PREVIOUS_STATE_RESTORED" \
        "promotion failed at ${PROMOTION_STEP}; previous release, data and legacy boundary restored fail-closed"
    else
      record_failure "CANDIDATE_REJECTED_NO_PROMOTION" \
        "candidate pipeline failed at ${PROMOTION_STEP}; live release was not promoted and the legacy boundary was restored"
    fi
  fi
  cleanup_staging || true
  if [[ -n $CANDIDATE_ROOT ]]; then
    remove_candidate || true
  fi
  if [[ $restored == "true" ]]; then
    cleanup_legacy_validation || true
  else
    log "ERROR: preserving legacy validation artifacts for manual recovery"
  fi
  exit "$exit_code"
}
trap on_exit EXIT

ssh_git() {
  GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${DEPLOY_KNOWN_HOSTS} -o GlobalKnownHostsFile=/dev/null" \
    "$@"
}

create_verified_live_backup() {
  local output
  local backup
  local manifest
  local canonical_backup_dir
  local canonical_backup
  output=$(mktemp "${ONLYWAY_RUN_DIR}/.deploy-backup-output.XXXXXX")
  "${SOURCE}/scripts/production/backup.sh" >"$output"
  backup=$(awk -F= '$1 == "BACKUP_FILE" {print substr($0, index($0, "=") + 1)}' "$output")
  manifest=$(awk -F= '$1 == "BACKUP_MANIFEST" {print substr($0, index($0, "=") + 1)}' "$output")
  unlink "$output"
  [[ -n $backup && -n $manifest && -f $backup && ! -L $backup \
    && -f $manifest && ! -L $manifest ]] \
    || die "verified backup command did not return regular backup artifacts"
  canonical_backup_dir=$(readlink -f -- "$ONLYWAY_BACKUP_DIR")
  canonical_backup=$(readlink -f -- "$backup")
  [[ $canonical_backup == "${canonical_backup_dir}/"* \
    && $(readlink -f -- "$manifest") == "${canonical_backup}.manifest.json" ]] \
    || die "verified backup artifacts escape the backup directory"
  VERIFIED_LIVE_BACKUP=$canonical_backup
  VERIFIED_LIVE_BACKUP_MANIFEST=$(readlink -f -- "$manifest")
  VERIFIED_LIVE_BACKUP_FINGERPRINT=$(jq -er \
    '.manifestFingerprint' "$VERIFIED_LIVE_BACKUP_MANIFEST")
  [[ $VERIFIED_LIVE_BACKUP_FINGERPRINT =~ ^[0-9a-f]{64}$ ]] \
    || die "verified backup manifest fingerprint is invalid"
}

PROMOTION_STEP=remote-identity
if [[ -d $RELEASE ]]; then
  verify_release_checkout "$RELEASE" "$COMMIT"
  MARKER=$(acceptance_marker_path "$COMMIT")
  IMAGE_ID=$(jq -r '.imageId // empty' "$MARKER")
  verify_release_acceptance_marker "$COMMIT" "$IMAGE_ID" >/dev/null
  [[ $(git -C "$RELEASE" rev-parse 'HEAD^{tree}') == "$(jq -r '.gitTree' "$MARKER")" ]] \
    || die "installed release Git tree does not match signed acceptance"
  verify_release_image "$COMMIT" "$IMAGE_ID" >/dev/null
  REMOTE_COMMIT=$(ssh_git git ls-remote --exit-code "$REPOSITORY" "refs/heads/${BRANCH}" \
    | awk 'NR == 1 {print $1}')
  [[ $REMOTE_COMMIT == "$COMMIT" ]] \
    || die "remote feature branch does not point to the accepted commit"
  SOURCE=$RELEASE
  REUSING_ACCEPTED_RELEASE=true
else
  [[ ! -e $RELEASE && ! -L $RELEASE ]] || die "release path is not an ordinary absent path"
  MARKER=$(acceptance_marker_path "$COMMIT")
  [[ ! -e $MARKER && ! -L $MARKER ]] \
    || die "an acceptance marker exists without an installed release"
  STAGING=$(mktemp -d "${ONLYWAY_RELEASES_DIR}/.staging.${COMMIT}.XXXXXX")
  chmod 0750 "$STAGING"
  git -C "$STAGING" init --quiet
  git -C "$STAGING" remote add origin "$REPOSITORY"
  ssh_git git -C "$STAGING" fetch --quiet --depth=1 origin "refs/heads/${BRANCH}"
  [[ $(git -C "$STAGING" rev-parse FETCH_HEAD) == "$COMMIT" ]] \
    || die "remote feature branch does not point to the verified commit"
  git -C "$STAGING" checkout --quiet --detach "$COMMIT"
  [[ -z $(git -C "$STAGING" status --porcelain=v1 -uall) ]] \
    || die "staged release working tree is dirty"
  [[ -f "${STAGING}/Dockerfile" && -f "${STAGING}/compose.production.yml" ]] \
    || die "verified commit lacks production deployment assets"
  SOURCE=$STAGING
fi

PROMOTION_STEP=compose-and-unit-validation
ensure_acceptance_signing_identity
"${SOURCE}/scripts/production/tests/release-pipeline-static.sh" "$SOURCE"
env \
ONLYWAY_RELEASE_COMMIT="$COMMIT" \
ONLYWAY_DATA_DIR="$ONLYWAY_DATA_DIR" \
ONLYWAY_BACKUP_DIR="$ONLYWAY_BACKUP_DIR" \
ONLYWAY_CONFIG_DIR="$ONLYWAY_CONFIG_DIR" \
ONLYWAY_ADMIN_STATE_DIR="$ONLYWAY_ADMIN_STATE_DIR" \
ONLYWAY_SECRETS_DIR="$ONLYWAY_SECRETS_DIR" \
ONLYWAY_ADMIN_SECRETS_DIR="$ONLYWAY_ADMIN_SECRETS_DIR" \
ONLYWAY_ADMIN_BOOTSTRAP_DIR="$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
ONLYWAY_ADMIN_PEPPER_FILE="$ONLYWAY_ADMIN_PEPPER_FILE" \
  docker compose \
    --project-directory "$SOURCE" \
    --file "${SOURCE}/compose.production.yml" \
    config --quiet
docker pull --quiet "$ONLYWAY_CADDY_IMAGE" >/dev/null
docker run --rm --network none --read-only \
  --cap-drop ALL --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges:true \
  --tmpfs /config:rw,noexec,nosuid,nodev \
  --tmpfs /data:rw,noexec,nosuid,nodev \
  --mount "type=bind,src=${SOURCE}/ops/production/Caddyfile,dst=/etc/caddy/Caddyfile,readonly" \
  "$ONLYWAY_CADDY_IMAGE" caddy validate --config /etc/caddy/Caddyfile
validate_release_systemd_units "$SOURCE" \
  || die "release systemd units failed validation"

PROMOTION_STEP=verification-build
docker build --target verification "$SOURCE"
if [[ $REUSING_ACCEPTED_RELEASE == "false" ]]; then
  PROMOTION_STEP=runtime-image-build
  docker build \
    --label "org.opencontainers.image.revision=${COMMIT}" \
    --tag "mv-ai-os:${COMMIT}" \
    --target runtime \
    "$SOURCE"
  IMAGE_ID=$(verify_release_image "$COMMIT")
fi
verify_release_image "$COMMIT" "$IMAGE_ID" >/dev/null

LIVE_PRESENT=false
if LIVE_RELEASE=$(current_release 2>/dev/null); then
  LIVE_RELEASE=$(validate_release_path "$LIVE_RELEASE")
  [[ -f "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
    && ! -L "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" ]] \
    || die "current release exists without a regular live SQLite database"
  LIVE_PRESENT=true
elif [[ -e "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
  || -L "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" ]]; then
  die "live SQLite database exists without an installed current release"
fi
if [[ $LIVE_PRESENT == "false" ]]; then
  for artifact in \
    "${ONLYWAY_ADMIN_STATE_DIR}/admin-security.json" \
    "${ONLYWAY_ADMIN_BOOTSTRAP_DIR}/founder-bootstrap.json"; do
    [[ ! -e $artifact && ! -L $artifact ]] \
      || die "first deployment found pre-existing application state"
  done
fi
if [[ $LEGACY_MIGRATION == "true" ]]; then
  case "$LEGACY_QUIESCE_PHASE" in
    INITIAL)
      [[ $LIVE_PRESENT == "false" ]] \
        || die "initial legacy cutover requires no installed current release"
      ;;
    FORWARD_AFTER_ROLLBACK)
      [[ $LIVE_PRESENT == "true" ]] \
        || die "forward legacy cutover requires the retained accepted release"
      [[ $(basename -- "$LIVE_RELEASE") == "$COMMIT" ]] \
        || die "forward legacy cutover must resume the same accepted commit"
      ! systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
        || die "forward legacy cutover requires the new service to remain stopped"
      ! systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
        || die "forward legacy cutover requires the new backup timer to remain stopped"
      ;;
    *)
      die "legacy quiesce phase is unsupported"
      ;;
  esac
fi

PROMOTION_STEP=candidate-state-snapshot
if [[ $LEGACY_MIGRATION == "true" ]]; then
  CANDIDATE_DATABASE=$LEGACY_DATABASE_COPY
elif [[ $LIVE_PRESENT == "true" ]]; then
  create_verified_live_backup
  CANDIDATE_DATABASE=$VERIFIED_LIVE_BACKUP
fi

PROMOTION_STEP=candidate-layout
if ss -H -lnt "sport = :${CANDIDATE_PORT}" | grep -q .; then
  die "derived candidate loopback port is already in use"
fi
CANDIDATE_ROOT=$(mktemp -d "${ONLYWAY_RUN_DIR}/candidate.${COMMIT:0:12}.XXXXXX")
chmod 0750 "$CANDIDATE_ROOT"
candidate_recovery_arm_guard \
  "$COMMIT" \
  "$CANDIDATE_PROJECT" \
  "$CANDIDATE_ROOT" \
  "$SOURCE" \
  "$IMAGE_ID" \
  "$CANDIDATE_PORT"
CANDIDATE_GUARD_ARMED=true
for directory in \
  data backups config admin-state bootstrap runtime-secrets admin-secrets; do
  install -d -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0700 \
    "${CANDIDATE_ROOT}/${directory}"
done
CANDIDATE_PEPPER_TEMP=$(mktemp \
  "${CANDIDATE_ROOT}/admin-secrets/.admin-source-key-pepper.XXXXXX")
openssl rand -hex 32 >"$CANDIDATE_PEPPER_TEMP"
chown "$ONLYWAY_SERVICE_USER:$ONLYWAY_SERVICE_GROUP" "$CANDIDATE_PEPPER_TEMP"
chmod 0600 "$CANDIDATE_PEPPER_TEMP"
mv -T -- "$CANDIDATE_PEPPER_TEMP" \
  "${CANDIDATE_ROOT}/admin-secrets/admin-source-key-pepper"
if [[ $LEGACY_MIGRATION == "true" ]]; then
  render_migrated_runtime_configuration \
    "${CANDIDATE_ROOT}/config/runtime.json"
elif [[ -f "${ONLYWAY_CONFIG_DIR}/runtime.json" \
  && ! -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]]; then
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "${ONLYWAY_CONFIG_DIR}/runtime.json" "${CANDIDATE_ROOT}/config/runtime.json"
else
  [[ ! -e "${ONLYWAY_CONFIG_DIR}/runtime.json" \
    && ! -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]] \
    || die "runtime configuration is not a regular file"
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "${SOURCE}/ops/production/runtime.offline.json.example" \
    "${CANDIDATE_ROOT}/config/runtime.json"
fi
if [[ -f "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
  && ! -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
  install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
    "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
    "${CANDIDATE_ROOT}/config/security-attestation.json"
elif [[ -e "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
  || -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
  die "security attestation is not a regular file"
fi
if [[ $LEGACY_MIGRATION == "true" || $LIVE_PRESENT == "true" ]]; then
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "$CANDIDATE_DATABASE" "${CANDIDATE_ROOT}/data/mv-ai-os.sqlite"
fi

PROMOTION_STEP=candidate-compose-validation
candidate_compose config --quiet
PROMOTION_STEP=candidate-start
CANDIDATE_START_ATTEMPTED=true
candidate_compose up --detach --remove-orphans
CANDIDATE_STARTED=true
"${SOURCE}/scripts/production/loopback-proxy.sh" \
  --compose-project "$CANDIDATE_PROJECT" \
  --listen-port "$CANDIDATE_PORT" &
CANDIDATE_PROXY_PID=$!
CANDIDATE_CONTAINER=$(candidate_compose ps --quiet command-center)
[[ $CANDIDATE_CONTAINER =~ ^[0-9a-f]{64}$ ]] \
  || die "candidate Command Center container identity is invalid"
PROMOTION_STEP=candidate-readiness
CANDIDATE_READINESS="${CANDIDATE_ROOT}/readiness.json"
"${SOURCE}/scripts/production/readiness.sh" \
  --url "http://localhost:${CANDIDATE_PORT}" \
  --attempts 24 \
  --interval 5 \
  --expected-commit "$COMMIT" \
  --expected-image-id "$IMAGE_ID" \
  --expected-kind READINESS \
  --expected-provider-mode OFFLINE_REHEARSAL \
  --compose-project "$CANDIDATE_PROJECT" \
  --container-id "$CANDIDATE_CONTAINER" >"$CANDIDATE_READINESS"
assert_private_running_stack \
  "$CANDIDATE_PROJECT" "$COMMIT" "$IMAGE_ID" "$CANDIDATE_PORT"
candidate_recovery_assert_no_restart "$CANDIDATE_PROJECT"

PROMOTION_STEP=candidate-offline-rehearsal
CANDIDATE_RUN_ID="candidate-${COMMIT:0:12}-$(date -u +%Y%m%d%H%M%S)"
install -d -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0700 \
  "${CANDIDATE_ROOT}/data/rehearsals/${CANDIDATE_RUN_ID}"
candidate_compose --profile operations run --rm --no-deps backup-verifier \
  npm run --silent production-rehearsal -- \
  --database "/var/lib/onlyway/rehearsals/${CANDIDATE_RUN_ID}/source.sqlite" \
  --backup "/var/lib/onlyway/rehearsals/${CANDIDATE_RUN_ID}/backup.sqlite" \
  --restore "/var/lib/onlyway/rehearsals/${CANDIDATE_RUN_ID}/restored.sqlite" \
  --receipt "/var/lib/onlyway/rehearsals/${CANDIDATE_RUN_ID}/receipt.json" \
  --run-id "$CANDIDATE_RUN_ID" \
  --started-at "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
  >"${CANDIDATE_ROOT}/rehearsal-result.json"
jq -e \
  '
    .contractVersion == "1" and
    .kind == "PRODUCTION_REHEARSAL" and
    .status == "READY" and
    .providerMode == "OFFLINE_REHEARSAL" and
    .recoveryVerified == true and
    .unauthorizedExternalEffectOccurred == false
  ' "${CANDIDATE_ROOT}/rehearsal-result.json" >/dev/null \
  || die "candidate offline rehearsal did not prove recovery and zero external effects"
CANDIDATE_READINESS_FINGERPRINT=$(sha256sum "$CANDIDATE_READINESS" | awk '{print $1}')
[[ $CANDIDATE_READINESS_FINGERPRINT =~ ^[0-9a-f]{64}$ ]] \
  || die "candidate readiness fingerprint is invalid"
PROMOTION_STEP=candidate-cleanup
stop_candidate_proxy
candidate_compose down --remove-orphans --volumes
CANDIDATE_REMAINING_CONTAINERS=$(docker ps --all --quiet \
  --filter "label=com.docker.compose.project=${CANDIDATE_PROJECT}") \
  || die "candidate container teardown could not be inspected"
CANDIDATE_REMAINING_NETWORKS=$(docker network ls --quiet \
  --filter "label=com.docker.compose.project=${CANDIDATE_PROJECT}") \
  || die "candidate network teardown could not be inspected"
[[ -z $CANDIDATE_REMAINING_CONTAINERS \
  && -z $CANDIDATE_REMAINING_NETWORKS ]] \
  || die "candidate teardown left project containers or networks behind"
CANDIDATE_START_ATTEMPTED=false
CANDIDATE_STARTED=false

PROMOTION_STEP=promotion-transaction-snapshot
begin_release_transaction

PROMOTION_STEP=stop-backup-schedule
if [[ $RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT == "true" \
  || $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE == "true" ]]; then
  systemctl stop "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
fi
PROMOTION_STEP=stop-live-for-coherent-backup
if [[ $RELEASE_TRANSACTION_HAD_UNIT == "true" \
  || $RELEASE_TRANSACTION_WAS_ACTIVE == "true" ]]; then
  systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
fi
if [[ $LIVE_PRESENT == "true" ]]; then
  PROMOTION_STEP=prepromotion-backup
  create_verified_live_backup
  PREPROMOTION_BACKUP_FINGERPRINT=$VERIFIED_LIVE_BACKUP_FINGERPRINT
  PREPROMOTION_BACKUP=$VERIFIED_LIVE_BACKUP
elif [[ $LEGACY_MIGRATION == "true" ]]; then
  PREPROMOTION_BACKUP_FINGERPRINT=$LEGACY_DATABASE_COPY_SHA
fi
if [[ $LEGACY_MIGRATION == "true" ]]; then
  PROMOTION_STEP=legacy-quiesce-revalidation
  verify_legacy_quiesced_boundary
fi

PROMOTION_STEP=acceptance
if [[ $REUSING_ACCEPTED_RELEASE == "false" ]]; then
  chown -R root:"$ONLYWAY_SERVICE_GROUP" "$STAGING"
  chmod -R u=rwX,g=rX,o= "$STAGING"
  [[ -z $(git -C "$STAGING" status --porcelain=v1 -uall) ]] \
    || die "staged release became dirty before acceptance"
  GIT_TREE=$(git -C "$STAGING" rev-parse 'HEAD^{tree}')
  MARKER=$(write_release_acceptance_marker \
    "$COMMIT" \
    "$IMAGE_ID" \
    "$GIT_TREE" \
    "$CANDIDATE_READINESS_FINGERPRINT" \
    "$PREPROMOTION_BACKUP_FINGERPRINT")
  PROMOTION_STEP=materialize-release
  RELEASE_CREATED=true
  mv -T -- "$STAGING" "$RELEASE"
  STAGING=
else
  verify_release_acceptance_marker "$COMMIT" "$IMAGE_ID" >/dev/null
fi
verify_release_checkout "$RELEASE" "$COMMIT"
[[ $(git -C "$RELEASE" rev-parse 'HEAD^{tree}') == "$(jq -r '.gitTree' "$MARKER")" ]] \
  || die "materialized Git tree does not match signed acceptance"

PROMOTION_STEP=install-runtime-configuration
if [[ $LEGACY_MIGRATION == "true" ]]; then
  install_migrated_live_state
elif [[ ! -e "${ONLYWAY_CONFIG_DIR}/runtime.json" \
  && ! -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]]; then
  install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
    "${RELEASE}/ops/production/runtime.offline.json.example" \
    "${ONLYWAY_CONFIG_DIR}/runtime.json"
fi
[[ -f "${ONLYWAY_CONFIG_DIR}/runtime.json" \
  && ! -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]] \
  || die "runtime configuration is invalid"
if [[ ! -e "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
  && ! -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
  install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
    "${RELEASE}/ops/production/security-attestation.example.json" \
    "${ONLYWAY_CONFIG_DIR}/security-attestation.json"
fi

PROMOTION_STEP=install-admin-security-pepper
ensure_live_admin_pepper

PROMOTION_STEP=install-systemd-unit
install -o root -g root -m 0644 \
  "${RELEASE}/ops/systemd/mv-ai-os.service" \
  "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}"
install -o root -g root -m 0644 \
  "${RELEASE}/ops/systemd/mv-ai-os-backup.service" \
  "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}"
install -o root -g root -m 0644 \
  "${RELEASE}/ops/systemd/mv-ai-os-backup.timer" \
  "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}"
PROMOTION_STEP=write-compose-environment
write_compose_environment "$COMMIT"
PROMOTION_STEP=switch-current
atomic_switch_current "$RELEASE"
PROMOTION_STEP=systemd-daemon-reload
systemctl daemon-reload
PROMOTION_STEP=systemd-enable
systemctl enable "$ONLYWAY_SYSTEMD_UNIT" "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
PROMOTION_STEP=systemd-backup-timer-start
systemctl start "$ONLYWAY_BACKUP_SYSTEMD_TIMER"
systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
  || die "recovery-grade backup timer did not become active"
PROMOTION_STEP=systemd-restart
PROMOTION_START_ATTEMPTED=true
systemctl restart "$ONLYWAY_SYSTEMD_UNIT"

PROMOTION_STEP=live-identity-and-readiness
LIVE_CONTAINER=$(docker ps --no-trunc \
  --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
  --filter "label=com.docker.compose.service=command-center" \
  --format '{{.ID}}')
[[ $LIVE_CONTAINER =~ ^[0-9a-f]{64}$ ]] \
  || die "live Command Center container identity is invalid"
LIVE_READINESS=$(mktemp "${ONLYWAY_RUN_DIR}/.live-readiness.XXXXXX")
"${RELEASE}/scripts/production/readiness.sh" \
  --attempts 24 \
  --interval 5 \
  --expected-commit "$COMMIT" \
  --expected-image-id "$IMAGE_ID" \
  --expected-kind READINESS \
  --expected-provider-mode OFFLINE_REHEARSAL \
  --compose-project "$ONLYWAY_COMPOSE_PROJECT" \
  --container-id "$LIVE_CONTAINER" >"$LIVE_READINESS"
assert_private_running_stack \
  "$ONLYWAY_COMPOSE_PROJECT" "$COMMIT" "$IMAGE_ID" "43100"
unlink "$LIVE_READINESS"

PROMOTION_STEP=previous-release-record
if [[ $RELEASE_TRANSACTION_HAD_CURRENT == "true" \
  && $RELEASE_TRANSACTION_CURRENT != "$RELEASE" ]]; then
  PREVIOUS_TEMPORARY=$(mktemp "${ONLYWAY_RUN_DIR}/.previous-release.XXXXXX")
  printf '%s\n' "$RELEASE_TRANSACTION_CURRENT" >"$PREVIOUS_TEMPORARY"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$PREVIOUS_TEMPORARY"
  chmod 0640 "$PREVIOUS_TEMPORARY"
  mv -T -- "$PREVIOUS_TEMPORARY" "${ONLYWAY_RUN_DIR}/previous-release"
fi

PROMOTION_STEP=finalize-temporary-artifacts
remove_candidate
cleanup_staging
cleanup_legacy_validation

PROMOTION_STEP=success-receipt
SUCCESS_RECEIPT=$(write_receipt \
  "deploy-release" \
  "DEPLOYED_PRIVATE_ACCEPTED" \
  "$COMMIT" \
  "${IMAGE_ID}; signed candidate acceptance and private live readiness passed")
PROMOTION_STEP=commit-release-transaction
commit_release_transaction
SUCCESS_RECEIPT=
trap - EXIT
prune_release_artifacts 3 \
  || log "bounded release/image retention requires operator review"
log "release ${COMMIT} is active with signed candidate acceptance and private readiness"
