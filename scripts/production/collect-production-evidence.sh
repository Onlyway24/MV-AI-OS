#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/production/lib/legacy-migration-common.sh
source "${SCRIPT_DIR}/lib/legacy-migration-common.sh"

COMMIT=
SCAN_RESULT=
SCAN_ARTIFACT=
PRE_SCAN_RECEIPT=
PRE_SCAN_SIGNATURE=
PRE_SCAN_TRUST_KEY=
TUNNEL_RECEIPT=
TUNNEL_TRUST_KEY=
BACKUP_RECEIPT=
BACKUP_MANIFEST=
REBOOT_RECEIPT=
DEPLOYMENT_RECEIPT=
LEGACY_CUTOVER_ROLLBACK_RECEIPT=
LEGACY_CUTOVER_ROLLBACK_SIGNATURE=
LEGACY_FORWARD_QUIESCE_RECEIPT=
LEGACY_FORWARD_QUIESCE_SIGNATURE=
LEGACY_FORWARD_DEPLOY_RECEIPT=
LEGACY_FINAL_SUCCESS_MARKER=
LEGACY_FINAL_SUCCESS_SIGNATURE=
REHEARSAL_POINTER="${ONLYWAY_RUN_DIR}/receipts/latest-production-rehearsal.json"
ATTESTATION_OUTPUT="${ONLYWAY_CONFIG_DIR}/security-attestation.json"
ATTESTATION_SIGNATURE_OUTPUT="${ONLYWAY_CONFIG_DIR}/security-attestation.json.sig"
DEPLOYMENT_OUTPUT="${ONLYWAY_CONFIG_DIR}/deployment-attestation.json"
DEPLOYMENT_SIGNATURE_OUTPUT="${ONLYWAY_CONFIG_DIR}/deployment-attestation.json.sig"

usage() {
  printf '%s\n' \
    "usage: $0 --commit FULL_SHA --pre-scan-receipt ABS --pre-scan-signature ABS --pre-scan-trust-key ABS --scan-result ABS --scan-artifact ABS --tunnel-receipt ABS --tunnel-trust-key ABS --backup-receipt ABS --backup-manifest ABS --legacy-cutover-rollback-receipt ABS --legacy-cutover-rollback-signature ABS --legacy-forward-quiesce-receipt ABS --legacy-forward-quiesce-signature ABS --legacy-forward-deploy-receipt ABS --legacy-final-success-marker ABS --legacy-final-success-signature ABS --reboot-receipt ABS --deployment-receipt ABS [--rehearsal-pointer ABS] [--attestation-output ABS] [--deployment-output ABS]" >&2
  exit 2
}

while (($# > 0)); do
  case "$1" in
    --commit) [[ $# -ge 2 ]] || usage; COMMIT=$2; shift ;;
    --pre-scan-receipt) [[ $# -ge 2 ]] || usage; PRE_SCAN_RECEIPT=$2; shift ;;
    --pre-scan-signature) [[ $# -ge 2 ]] || usage; PRE_SCAN_SIGNATURE=$2; shift ;;
    --pre-scan-trust-key) [[ $# -ge 2 ]] || usage; PRE_SCAN_TRUST_KEY=$2; shift ;;
    --scan-result) [[ $# -ge 2 ]] || usage; SCAN_RESULT=$2; shift ;;
    --scan-artifact) [[ $# -ge 2 ]] || usage; SCAN_ARTIFACT=$2; shift ;;
    --tunnel-receipt) [[ $# -ge 2 ]] || usage; TUNNEL_RECEIPT=$2; shift ;;
    --tunnel-trust-key) [[ $# -ge 2 ]] || usage; TUNNEL_TRUST_KEY=$2; shift ;;
    --backup-receipt) [[ $# -ge 2 ]] || usage; BACKUP_RECEIPT=$2; shift ;;
    --backup-manifest) [[ $# -ge 2 ]] || usage; BACKUP_MANIFEST=$2; shift ;;
    --reboot-receipt) [[ $# -ge 2 ]] || usage; REBOOT_RECEIPT=$2; shift ;;
    --deployment-receipt) [[ $# -ge 2 ]] || usage; DEPLOYMENT_RECEIPT=$2; shift ;;
    --legacy-cutover-rollback-receipt) [[ $# -ge 2 ]] || usage; LEGACY_CUTOVER_ROLLBACK_RECEIPT=$2; shift ;;
    --legacy-cutover-rollback-signature) [[ $# -ge 2 ]] || usage; LEGACY_CUTOVER_ROLLBACK_SIGNATURE=$2; shift ;;
    --legacy-forward-quiesce-receipt) [[ $# -ge 2 ]] || usage; LEGACY_FORWARD_QUIESCE_RECEIPT=$2; shift ;;
    --legacy-forward-quiesce-signature) [[ $# -ge 2 ]] || usage; LEGACY_FORWARD_QUIESCE_SIGNATURE=$2; shift ;;
    --legacy-forward-deploy-receipt) [[ $# -ge 2 ]] || usage; LEGACY_FORWARD_DEPLOY_RECEIPT=$2; shift ;;
    --legacy-final-success-marker) [[ $# -ge 2 ]] || usage; LEGACY_FINAL_SUCCESS_MARKER=$2; shift ;;
    --legacy-final-success-signature) [[ $# -ge 2 ]] || usage; LEGACY_FINAL_SUCCESS_SIGNATURE=$2; shift ;;
    --rehearsal-pointer) [[ $# -ge 2 ]] || usage; REHEARSAL_POINTER=$2; shift ;;
    --attestation-output) [[ $# -ge 2 ]] || usage; ATTESTATION_OUTPUT=$2; shift ;;
    --deployment-output) [[ $# -ge 2 ]] || usage; DEPLOYMENT_OUTPUT=$2; shift ;;
    *) usage ;;
  esac
  shift
done

require_root
require_commit "$COMMIT"
for value in \
  "$PRE_SCAN_RECEIPT" "$PRE_SCAN_SIGNATURE" "$PRE_SCAN_TRUST_KEY" \
  "$SCAN_RESULT" "$SCAN_ARTIFACT" "$TUNNEL_RECEIPT" "$TUNNEL_TRUST_KEY" \
  "$BACKUP_RECEIPT" "$BACKUP_MANIFEST" \
  "$REBOOT_RECEIPT" "$DEPLOYMENT_RECEIPT" \
  "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE" \
  "$LEGACY_FORWARD_QUIESCE_RECEIPT" \
  "$LEGACY_FORWARD_QUIESCE_SIGNATURE" \
  "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  "$LEGACY_FINAL_SUCCESS_MARKER" \
  "$LEGACY_FINAL_SUCCESS_SIGNATURE" \
  "$REHEARSAL_POINTER" "$ATTESTATION_OUTPUT" \
  "$ATTESTATION_SIGNATURE_OUTPUT" "$DEPLOYMENT_OUTPUT" \
  "$DEPLOYMENT_SIGNATURE_OUTPUT"; do
  [[ -n $value ]] || usage
  require_absolute_path "$value" "evidence path"
done
ensure_layout_exists
[[ $ATTESTATION_OUTPUT == \
  "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]] \
  || die "security attestation output must use its fixed config path"
[[ $ATTESTATION_SIGNATURE_OUTPUT == \
  "${ONLYWAY_CONFIG_DIR}/security-attestation.json.sig" ]] \
  || die "security attestation signature must use its fixed config path"
[[ $DEPLOYMENT_OUTPUT == \
  "${ONLYWAY_CONFIG_DIR}/deployment-attestation.json" ]] \
  || die "deployment attestation output must use its fixed config path"
[[ $DEPLOYMENT_SIGNATURE_OUTPUT == \
  "${ONLYWAY_CONFIG_DIR}/deployment-attestation.json.sig" ]] \
  || die "deployment attestation signature must use its fixed config path"
acquire_operation_lock collect-production-evidence
source_compose_environment
for command in \
  apt-config base64 curl dd docker fail2ban-client git jq openssl sha256sum sshd \
  ssh-keygen sqlite3 ss stat sync systemctl tr ufw; do
  require_command "$command"
done
ensure_acceptance_signing_identity
[[ ${ONLYWAY_RELEASE_COMMIT:-} == "$COMMIT" ]] \
  || die "Compose environment is not bound to the requested final commit"

RELEASE=$(current_release) || die "current release is unavailable"
RELEASE=$(validate_release_path "$RELEASE")
[[ $(basename -- "$RELEASE") == "$COMMIT" ]] \
  || die "current release is not the requested final commit"
verify_release_checkout "$RELEASE" "$COMMIT"
MARKER=$(acceptance_marker_path "$COMMIT")
IMAGE_ID=$(jq -r '.imageId // empty' "$MARKER")
verify_release_acceptance_marker "$COMMIT" "$IMAGE_ID" >/dev/null
verify_release_image "$COMMIT" "$IMAGE_ID" >/dev/null
[[ $(git -C "$RELEASE" rev-parse 'HEAD^{tree}') == \
  "$(jq -r '.gitTree' "$MARKER")" ]] \
  || die "release tree is not bound to signed acceptance"

WORK_DIR=$(mktemp -d "${ONLYWAY_RUN_DIR}/security-evidence.${COMMIT:0:12}.XXXXXX")
cleanup() {
  if [[ -n ${ATTESTATION_TEMPORARY:-} \
    && -f $ATTESTATION_TEMPORARY \
    && ! -L $ATTESTATION_TEMPORARY \
    && $ATTESTATION_TEMPORARY == \
      "${ONLYWAY_CONFIG_DIR}/.attestation."* ]]; then
    unlink "$ATTESTATION_TEMPORARY"
  fi
  if [[ -n ${BUNDLE_TEMPORARY:-} \
    && -f $BUNDLE_TEMPORARY \
    && ! -L $BUNDLE_TEMPORARY \
    && $BUNDLE_TEMPORARY == \
      "${ONLYWAY_RUN_DIR}/evidence/.security-evidence."* ]]; then
    unlink "$BUNDLE_TEMPORARY"
  fi
  if [[ -n ${SIGNATURE_TEMPORARY:-} \
    && -f $SIGNATURE_TEMPORARY \
    && ! -L $SIGNATURE_TEMPORARY \
    && $SIGNATURE_TEMPORARY == \
      "${ONLYWAY_CONFIG_DIR}/.attestation-signature."* ]]; then
    unlink "$SIGNATURE_TEMPORARY"
  fi
  if [[ -d $WORK_DIR \
    && $WORK_DIR == "${ONLYWAY_RUN_DIR}/security-evidence.${COMMIT:0:12}."* ]]; then
    rm -rf --one-file-system -- "$WORK_DIR"
  fi
}
trap cleanup EXIT
chmod 0700 "$WORK_DIR"
OBSERVED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

canonical_fingerprint() {
  local file=$1
  local filter=${2:-.}
  local canonical
  canonical=$(jq -Sc "$filter" "$file")
  printf '%s' "$canonical" | sha256sum | awk '{print $1}'
}

file_fingerprint() {
  local file=$1
  sha256sum "$file" | awk '{print $1}'
}

sign_release_attestation() {
  local attestation=$1
  local signature=$2
  [[ -f $attestation && ! -L $attestation ]] \
    || die "release attestation is unavailable for signing"
  [[ ! -e $signature && ! -L $signature ]] \
    || die "release attestation signature target already exists"
  openssl pkeyutl -sign -rawin \
    -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    -in "$attestation" \
    -out "$signature"
  [[ $(stat -c '%s' "$signature") == "64" ]] \
    || die "release attestation signature is not detached Ed25519"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$attestation" \
    -sigfile "$signature" >/dev/null \
    || die "release attestation signature verification failed"
}

validate_regular_file() {
  local file=$1
  local expected_owner=$2
  local allowed_modes=$3
  local maximum_bytes=$4
  local canonical
  [[ -f $file && ! -L $file ]] || die "evidence is not a regular file: ${file}"
  canonical=$(readlink -f -- "$file")
  [[ $canonical == "$file" ]] || die "evidence path is not canonical: ${file}"
  [[ $(stat -c '%u:%g' "$file") == "$expected_owner" ]] \
    || die "evidence ownership is invalid: ${file}"
  [[ ",${allowed_modes}," == *",$(stat -c '%a' "$file"),"* ]] \
    || die "evidence mode is invalid: ${file}"
  local size
  size=$(stat -c '%s' "$file")
  [[ $size =~ ^[1-9][0-9]*$ && $size -le $maximum_bytes ]] \
    || die "evidence size is invalid: ${file}"
}

snapshot_nofollow() {
  local source=$1
  local target=$2
  local owner=$3
  local mode=$4
  local identity_before
  local identity_after
  [[ ! -e $target && ! -L $target ]] \
    || die "evidence snapshot target already exists"
  identity_before=$(stat -c '%d:%i:%u:%g:%a:%s' "$source")
  dd \
    if="$source" \
    of="$target" \
    iflag=nofollow,fullblock \
    oflag=excl \
    status=none \
    || die "evidence snapshot could not be read without following links"
  identity_after=$(stat -c '%d:%i:%u:%g:%a:%s' "$source")
  [[ $identity_after == "$identity_before" ]] \
    || die "evidence source identity changed during snapshot"
  chown "$owner" "$target"
  chmod "$mode" "$target"
}

require_control_plane_directory() {
  local directory=$1
  local owner=$2
  local mode=$3
  [[ -d $directory && ! -L $directory ]] \
    || die "control-plane directory is unavailable"
  [[ $(stat -c '%u:%g' "$directory") == "$owner" \
    && $(stat -c '%a' "$directory") == "$mode" ]] \
    || die "control-plane directory metadata is invalid"
}

require_path_below() {
  local path=$1
  local root=$2
  local canonical_path
  local canonical_root
  canonical_path=$(readlink -f -- "$path")
  canonical_root=$(readlink -f -- "$root")
  [[ $canonical_path == "${canonical_root}/"* ]] \
    || die "evidence path is outside its root-controlled directory"
}

require_control_plane_directory \
  "$ONLYWAY_RUN_DIR" "0:${ONLYWAY_GID}" 750
require_control_plane_directory \
  "$ONLYWAY_CONFIG_DIR" "0:${ONLYWAY_GID}" 750
require_control_plane_directory \
  "$ONLYWAY_DEPLOY_SECRETS_DIR" "0:0" 700
for receipt in \
  "$DEPLOYMENT_RECEIPT" "$REBOOT_RECEIPT" \
  "$BACKUP_RECEIPT" "$REHEARSAL_POINTER" \
  "$PRE_SCAN_RECEIPT" "$PRE_SCAN_SIGNATURE" \
  "$SCAN_RESULT" "$SCAN_ARTIFACT" "$TUNNEL_RECEIPT" \
  "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE" \
  "$LEGACY_FORWARD_QUIESCE_RECEIPT" \
  "$LEGACY_FORWARD_QUIESCE_SIGNATURE" \
  "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  "$LEGACY_FINAL_SUCCESS_MARKER" \
  "$LEGACY_FINAL_SUCCESS_SIGNATURE"; do
  require_path_below "$receipt" "$ONLYWAY_RUN_DIR"
done
require_path_below "$TUNNEL_TRUST_KEY" "$ONLYWAY_DEPLOY_SECRETS_DIR"
require_path_below "$PRE_SCAN_TRUST_KEY" "$ONLYWAY_DEPLOY_SECRETS_DIR"

validate_host_receipt() {
  local file=$1
  local action=$2
  local status=$3
  local expected_commit=$4
  verify_host_receipt_signature "$file" >/dev/null
  validate_regular_file "$file" "0:${ONLYWAY_GID}" "640" 65536
  jq -e \
    --arg action "$action" \
    --arg commit "$expected_commit" \
    --arg status "$status" \
    '
      .contractVersion == "1" and
      .action == $action and
      .status == $status and
      .commit == $commit and
      .secretsExposed == false and
      (.recordedAt | type == "string" and
        test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
    ' "$file" >/dev/null \
    || die "host receipt contract is invalid: ${file}"
}

PROMOTION_STATUS=DEPLOYED_PRIVATE_ACCEPTED
validate_host_receipt \
  "$DEPLOYMENT_RECEIPT" "deploy-release" "$PROMOTION_STATUS" "$COMMIT"
validate_host_receipt \
  "$REBOOT_RECEIPT" "reboot-recovery" "REBOOT_RECOVERY_VERIFIED" "$COMMIT"
validate_host_receipt \
  "$BACKUP_RECEIPT" "backup" "VERIFIED_RESTORE_PROBE_PASSED" "$COMMIT"

validate_legacy_signed_json_pair() {
  local receipt=$1
  local signature=$2
  local label=$3
  [[ $signature == "${receipt}.sig" ]] \
    || die "${label} signature path must be the receipt .sig companion"
  require_path_below "$receipt" "$ONLYWAY_RUN_DIR"
  require_path_below "$signature" "$ONLYWAY_RUN_DIR"
  legacy_verify_signed_json \
    "$receipt" "$signature" "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    "$ONLYWAY_GID" >/dev/null \
    || die "${label} detached signature is invalid"
}

validate_legacy_signed_json_pair \
  "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE" \
  "legacy cutover rollback receipt"
jq -e '
  .contractVersion == "1" and
  .kind == "LEGACY_MIGRATION_ROLLBACK" and
  .phase == "CUTOVER" and
  .confirmedAction == "ROLLBACK_LEGACY_WITHIN_RETENTION_V1" and
  .status == "ROLLED_BACK_TO_EXACT_LEGACY_RUNTIME" and
  .secretsExposed == false and
  .legacyRuntime.running == true and
  .legacyRuntime.restartPolicy == "unless-stopped" and
  .legacyRuntime.health == "AUTHENTICATED_OK" and
  .legacyRuntime.sourceMetadataRestored == true and
  .legacyRuntime.listener.host == "127.0.0.1" and
  .legacyRuntime.listener.port == 41479 and
  .legacyRuntime.listener.status == "OPEN_LOOPBACK_ONLY" and
  (.legacyRuntime.exactIdentities | length == 4) and
  ([.legacyRuntime.exactIdentities[].name] | unique | length == 4) and
  ([.legacyRuntime.exactIdentities[].id] | unique | length == 4) and
  all(.legacyRuntime.exactIdentities[];
    (.name | test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")) and
    (.id | test("^[a-f0-9]{64}$"))) and
  .retainedForensics.migrationCopiesRemoved == false and
  .retainedForensics.newStateBackupRemoved == false and
  .retainedForensics.postCutoverWritesAppliedToLegacy == false and
  (.createdAt | type == "string" and
    test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
  (.evidence.quiesceReceipt | type == "string" and startswith("/")) and
  (.evidence.quiesceReceiptSha256 | test("^[a-f0-9]{64}$")) and
  (.evidence.quiesceSignatureSha256 | test("^[a-f0-9]{64}$")) and
  (.evidence.successMarker | type == "string" and startswith("/")) and
  (.evidence.successMarkerSha256 | test("^[a-f0-9]{64}$")) and
  (.evidence.successSignatureSha256 | test("^[a-f0-9]{64}$")) and
  (.evidence.newStateBackup.manifest |
    type == "string" and startswith("/")) and
  (.evidence.newStateBackup.manifestSha256 | test("^[a-f0-9]{64}$"))
' "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" >/dev/null \
  || die "legacy cutover rollback receipt contract is invalid"

LEGACY_FIRST_QUIESCE_RECEIPT=$(jq -er \
  '.evidence.quiesceReceipt' "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")
LEGACY_FIRST_QUIESCE_SIGNATURE="${LEGACY_FIRST_QUIESCE_RECEIPT}.sig"
LEGACY_FIRST_SUCCESS_MARKER=$(jq -er \
  '.evidence.successMarker' "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")
LEGACY_FIRST_SUCCESS_SIGNATURE="${LEGACY_FIRST_SUCCESS_MARKER}.sig"
LEGACY_FIRST_BACKUP_MANIFEST=$(jq -er \
  '.evidence.newStateBackup.manifest' "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")
LEGACY_FIRST_BACKUP_SIGNATURE="${LEGACY_FIRST_BACKUP_MANIFEST}.sig"

validate_legacy_signed_json_pair \
  "$LEGACY_FIRST_QUIESCE_RECEIPT" \
  "$LEGACY_FIRST_QUIESCE_SIGNATURE" \
  "initial legacy quiesce receipt"
validate_legacy_signed_json_pair \
  "$LEGACY_FIRST_SUCCESS_MARKER" \
  "$LEGACY_FIRST_SUCCESS_SIGNATURE" \
  "first legacy success marker"
require_path_below "$LEGACY_FIRST_BACKUP_MANIFEST" "$ONLYWAY_BACKUP_DIR"
require_path_below "$LEGACY_FIRST_BACKUP_SIGNATURE" "$ONLYWAY_BACKUP_DIR"
LEGACY_FIRST_BACKUP_SHA=$(legacy_verify_backup_bundle_manifest \
  "$LEGACY_FIRST_BACKUP_MANIFEST" \
  "$LEGACY_FIRST_BACKUP_SIGNATURE" \
  "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
  "$ONLYWAY_GID" "$ONLYWAY_UID" "$ONLYWAY_GID" "$COMMIT")

[[ $(file_fingerprint "$LEGACY_FIRST_QUIESCE_RECEIPT") == \
  "$(jq -er '.evidence.quiesceReceiptSha256' \
    "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  && $(file_fingerprint "$LEGACY_FIRST_QUIESCE_SIGNATURE") == \
  "$(jq -er '.evidence.quiesceSignatureSha256' \
    "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  && $(file_fingerprint "$LEGACY_FIRST_SUCCESS_MARKER") == \
  "$(jq -er '.evidence.successMarkerSha256' \
    "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  && $(file_fingerprint "$LEGACY_FIRST_SUCCESS_SIGNATURE") == \
  "$(jq -er '.evidence.successSignatureSha256' \
    "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  && $LEGACY_FIRST_BACKUP_SHA == \
  "$(jq -er '.evidence.newStateBackup.manifestSha256' \
    "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" ]] \
  || die "legacy cutover rollback evidence hash chain is invalid"

validate_legacy_signed_json_pair \
  "$LEGACY_FORWARD_QUIESCE_RECEIPT" \
  "$LEGACY_FORWARD_QUIESCE_SIGNATURE" \
  "legacy forward quiesce receipt"
jq -e \
  --arg rollbackReceipt "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  --arg rollbackSha \
    "$(file_fingerprint "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  --arg rollbackSignatureSha \
    "$(file_fingerprint "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE")" \
  --arg successMarker "$LEGACY_FIRST_SUCCESS_MARKER" \
  --arg successMarkerSha \
    "$(file_fingerprint "$LEGACY_FIRST_SUCCESS_MARKER")" \
  --arg successSignatureSha \
    "$(file_fingerprint "$LEGACY_FIRST_SUCCESS_SIGNATURE")" \
  --slurpfile rollback "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_QUIESCE_COPY" and
    .quiescePhase == "FORWARD_AFTER_ROLLBACK" and
    .confirmedAction == "REQUIESCE_FOR_FORWARD_DEPLOY_V1" and
    .status == "QUIESCED_COPY_VERIFIED" and
    .secretsExposed == false and
    .containers.runningBeforeQuiesce == true and
    .containers.runningAfterQuiesce == false and
    .containers.restartPolicyBeforeQuiesce == "unless-stopped" and
    .containers.restartPolicyAfterQuiesce == "no" and
    .legacyBoundary.adminSecurityState.status ==
      "RETAINED_NEW_STACK_STATE" and
    .legacyBoundary.adminPepper.status == "RETAINED_NEW_STACK_PEPPER" and
    .legacyBoundary.bootstrap.secretCopied == false and
    .legacyBoundary.bootstrap.accessUrlDisclosed == false and
    .legacyBoundary.dormantSecret.contentRead == false and
    .legacyBoundary.dormantSecret.importAllowed == false and
    .retention.legacyContainersRemoved == false and
    .retention.originalSourcesRemoved == false and
    .rollbackEvidence.receiptPath == $rollbackReceipt and
    .rollbackEvidence.receiptSha256 == $rollbackSha and
    .rollbackEvidence.signatureSha256 == $rollbackSignatureSha and
    .rollbackEvidence.firstSuccessMarker == $successMarker and
    .rollbackEvidence.firstSuccessMarkerSha256 == $successMarkerSha and
    .rollbackEvidence.firstSuccessSignatureSha256 == $successSignatureSha and
    ([.containers.exactIdentities[] | {id, name}] | sort_by(.name)) ==
      ([$rollback[0].legacyRuntime.exactIdentities[] | {id, name}] |
        sort_by(.name)) and
    (.createdAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
  ' "$LEGACY_FORWARD_QUIESCE_RECEIPT" >/dev/null \
  || die "legacy forward quiesce receipt contract or rollback chain is invalid"

jq -e \
  --arg commit "$COMMIT" \
  --arg database "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
  --arg deploymentReceipt "$DEPLOYMENT_RECEIPT" \
  --arg deploymentSha "$(file_fingerprint "$DEPLOYMENT_RECEIPT")" \
  --arg founderBootstrap \
    "${ONLYWAY_ADMIN_BOOTSTRAP_DIR}/founder-bootstrap.json" \
  --arg imageId "$IMAGE_ID" \
  --arg marker "$MARKER" \
  --arg markerSha "$(file_fingerprint "$MARKER")" \
  --arg pepper "$ONLYWAY_ADMIN_PEPPER_FILE" \
  --arg project "$ONLYWAY_COMPOSE_PROJECT" \
  --arg quiesce "$LEGACY_FIRST_QUIESCE_RECEIPT" \
  --arg quiesceSha "$(file_fingerprint "$LEGACY_FIRST_QUIESCE_RECEIPT")" \
  --arg quiesceSignatureSha \
    "$(file_fingerprint "$LEGACY_FIRST_QUIESCE_SIGNATURE")" \
  --arg state "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" \
  --argjson gid "$ONLYWAY_GID" \
  --argjson uid "$ONLYWAY_UID" \
  '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_SUCCESS" and
    .confirmedAction == "RETAIN_LEGACY_ROLLBACK_V1" and
    .status == "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED" and
    .secretsExposed == false and
    .acceptedRelease.commit == $commit and
    .acceptedRelease.imageId == $imageId and
    .acceptedRelease.acceptanceMarker == $marker and
    .acceptedRelease.acceptanceMarkerSha256 == $markerSha and
    .acceptedRelease.deploymentReceipt == $deploymentReceipt and
    .acceptedRelease.deploymentReceiptSha256 == $deploymentSha and
    .legacyRollbackBoundary.quiescePhase == "INITIAL" and
    .legacyRollbackBoundary.quiesceReceipt == $quiesce and
    .legacyRollbackBoundary.quiesceReceiptSha256 == $quiesceSha and
    .legacyRollbackBoundary.quiesceSignatureSha256 ==
      $quiesceSignatureSha and
    .legacyRollbackBoundary.legacyContainersRemoved == false and
    .legacyRollbackBoundary.originalSourcesRemoved == false and
    .newAdminSecurity.bootstrapSecretDisclosed == false and
    .newAdminSecurity.legacyCredentialContinuityClaimed == false and
    .newAdminSecurity.founderBootstrap.path == $founderBootstrap and
    .newAdminSecurity.founderBootstrap.status == "OWNER_ONLY_FRESH" and
    .newAdminSecurity.state.path == $state and
    .newAdminSecurity.state.uid == $uid and
    .newAdminSecurity.state.gid == $gid and
    .newAdminSecurity.state.mode == "600" and
    .newAdminSecurity.state.status == "NEW_PRE_ADMIN_MIGRATION" and
    .newAdminSecurity.pepper.path == $pepper and
    .newAdminSecurity.pepper.uid == $uid and
    .newAdminSecurity.pepper.gid == $gid and
    .newAdminSecurity.pepper.mode == "600" and
    .newAdminSecurity.pepper.status == "NEW_OWNER_ONLY" and
    .newData.database == $database and
    .newData.integrity == "ok" and
    .newStack.composeProject == $project and
    .newStack.containerCount == 5 and
    .newStack.status == "PRIVATE_READINESS_VERIFIED" and
    .newStack.listener.host == "127.0.0.1" and
    .newStack.listener.port == 43100 and
    (.createdAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
  ' "$LEGACY_FIRST_SUCCESS_MARKER" >/dev/null \
  || die "first legacy migration success marker is invalid"

jq -e \
  --slurpfile rollback "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_QUIESCE_COPY" and
    .quiescePhase == "INITIAL" and
    .confirmedAction == "QUIESCE_AND_COPY_LEGACY_V1" and
    .status == "QUIESCED_COPY_VERIFIED" and
    .secretsExposed == false and
    .containers.runningBeforeQuiesce == true and
    .containers.runningAfterQuiesce == false and
    .containers.restartPolicyAfterQuiesce == "no" and
    .legacyBoundary.bootstrap.secretCopied == false and
    .legacyBoundary.bootstrap.accessUrlDisclosed == false and
    .legacyBoundary.dormantSecret.contentRead == false and
    .legacyBoundary.dormantSecret.importAllowed == false and
    .rollbackEvidence.receiptPath == null and
    .rollbackEvidence.firstSuccessMarker == null and
    ([.containers.exactIdentities[] | {id, name}] | sort_by(.name)) ==
      ([$rollback[0].legacyRuntime.exactIdentities[] | {id, name}] |
        sort_by(.name))
  ' "$LEGACY_FIRST_QUIESCE_RECEIPT" >/dev/null \
  || die "initial legacy quiesce receipt is invalid"

validate_host_receipt \
  "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  "deploy-release" "$PROMOTION_STATUS" "$COMMIT"
validate_legacy_signed_json_pair \
  "$LEGACY_FINAL_SUCCESS_MARKER" \
  "$LEGACY_FINAL_SUCCESS_SIGNATURE" \
  "final legacy success marker"
jq -e \
  --arg commit "$COMMIT" \
  --arg database "${ONLYWAY_DATA_DIR}/mv-ai-os.sqlite" \
  --arg deploymentReceipt "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  --arg deploymentSha "$(file_fingerprint "$LEGACY_FORWARD_DEPLOY_RECEIPT")" \
  --arg founderBootstrap \
    "${ONLYWAY_ADMIN_BOOTSTRAP_DIR}/founder-bootstrap.json" \
  --arg imageId "$IMAGE_ID" \
  --arg marker "$MARKER" \
  --arg markerSha "$(file_fingerprint "$MARKER")" \
  --arg pepper "$ONLYWAY_ADMIN_PEPPER_FILE" \
  --arg project "$ONLYWAY_COMPOSE_PROJECT" \
  --arg quiesce "$LEGACY_FORWARD_QUIESCE_RECEIPT" \
  --arg quiesceSha "$(file_fingerprint "$LEGACY_FORWARD_QUIESCE_RECEIPT")" \
  --arg quiesceSignatureSha \
    "$(file_fingerprint "$LEGACY_FORWARD_QUIESCE_SIGNATURE")" \
  --arg state "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" \
  --argjson gid "$ONLYWAY_GID" \
  --argjson uid "$ONLYWAY_UID" \
  '
    .contractVersion == "1" and
    .kind == "LEGACY_MIGRATION_SUCCESS" and
    .confirmedAction == "RETAIN_LEGACY_ROLLBACK_V1" and
    .status == "CUTOVER_ACCEPTED_LEGACY_ROLLBACK_RETAINED" and
    .secretsExposed == false and
    .acceptedRelease.commit == $commit and
    .acceptedRelease.imageId == $imageId and
    .acceptedRelease.acceptanceMarker == $marker and
    .acceptedRelease.acceptanceMarkerSha256 == $markerSha and
    .acceptedRelease.deploymentReceipt == $deploymentReceipt and
    .acceptedRelease.deploymentReceiptSha256 == $deploymentSha and
    .legacyRollbackBoundary.quiescePhase == "FORWARD_AFTER_ROLLBACK" and
    .legacyRollbackBoundary.quiesceReceipt == $quiesce and
    .legacyRollbackBoundary.quiesceReceiptSha256 == $quiesceSha and
    .legacyRollbackBoundary.quiesceSignatureSha256 ==
      $quiesceSignatureSha and
    .legacyRollbackBoundary.legacyContainersRemoved == false and
    .legacyRollbackBoundary.originalSourcesRemoved == false and
    .newAdminSecurity.bootstrapSecretDisclosed == false and
    .newAdminSecurity.legacyCredentialContinuityClaimed == false and
    .newAdminSecurity.founderBootstrap.path == $founderBootstrap and
    .newAdminSecurity.founderBootstrap.status == "OWNER_ONLY_FRESH" and
    .newAdminSecurity.state.path == $state and
    .newAdminSecurity.state.uid == $uid and
    .newAdminSecurity.state.gid == $gid and
    .newAdminSecurity.state.mode == "600" and
    .newAdminSecurity.state.status == "RETAINED_NEW_STACK_STATE" and
    .newAdminSecurity.pepper.path == $pepper and
    .newAdminSecurity.pepper.uid == $uid and
    .newAdminSecurity.pepper.gid == $gid and
    .newAdminSecurity.pepper.mode == "600" and
    .newAdminSecurity.pepper.status == "RETAINED_NEW_STACK_PEPPER" and
    .newData.database == $database and
    .newData.integrity == "ok" and
    .newStack.composeProject == $project and
    .newStack.containerCount == 5 and
    .newStack.status == "PRIVATE_READINESS_VERIFIED" and
    .newStack.listener.host == "127.0.0.1" and
    .newStack.listener.port == 43100 and
    (.createdAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
  ' "$LEGACY_FINAL_SUCCESS_MARKER" >/dev/null \
  || die "final legacy migration success marker is invalid"

assert_distinct_evidence_files() {
  local -a paths=("$@")
  local left
  local right
  local left_identity
  local right_identity
  for ((left = 0; left < ${#paths[@]}; left += 1)); do
    for ((right = left + 1; right < ${#paths[@]}; right += 1)); do
      [[ ${paths[$left]} != "${paths[$right]}" ]] \
        || die "operation receipts must use distinct paths"
      left_identity=$(stat -c '%d:%i' "${paths[$left]}")
      right_identity=$(stat -c '%d:%i' "${paths[$right]}")
      [[ $left_identity != "$right_identity" ]] \
        || die "operation receipts must be distinct files"
    done
  done
}

assert_distinct_evidence_files \
  "$DEPLOYMENT_RECEIPT" \
  "$LEGACY_FIRST_QUIESCE_RECEIPT" \
  "$LEGACY_FIRST_SUCCESS_MARKER" \
  "$LEGACY_FIRST_BACKUP_MANIFEST" \
  "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" \
  "$LEGACY_FORWARD_QUIESCE_RECEIPT" \
  "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  "$LEGACY_FINAL_SUCCESS_MARKER" \
  "$REBOOT_RECEIPT"
assert_distinct_evidence_files \
  "$LEGACY_FIRST_QUIESCE_SIGNATURE" \
  "$LEGACY_FIRST_SUCCESS_SIGNATURE" \
  "$LEGACY_FIRST_BACKUP_SIGNATURE" \
  "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE" \
  "$LEGACY_FORWARD_QUIESCE_SIGNATURE" \
  "${LEGACY_FORWARD_DEPLOY_RECEIPT}.sig" \
  "$LEGACY_FINAL_SUCCESS_SIGNATURE"

POST_REBOOT_BACKUP_RECEIPT_NAME=$(jq -er '
  .detail |
  capture("(^|;)postRebootBackupReceipt=(?<receipt>[0-9]{8}T[0-9]{6}Z-backup-[0-9]+[.]json)(;|$)")
  | .receipt
' "$REBOOT_RECEIPT") \
  || die "reboot receipt does not identify its post-reboot backup receipt"
POST_REBOOT_BACKUP_RECEIPT="${ONLYWAY_RUN_DIR}/receipts/${POST_REBOOT_BACKUP_RECEIPT_NAME}"
[[ $(readlink -f -- "$POST_REBOOT_BACKUP_RECEIPT") == \
  "$(readlink -f -- "${ONLYWAY_RUN_DIR}/receipts")/${POST_REBOOT_BACKUP_RECEIPT_NAME}" ]] \
  || die "reboot-bound backup receipt escapes the receipt directory"
validate_host_receipt \
  "$POST_REBOOT_BACKUP_RECEIPT" \
  "backup" \
  "VERIFIED_RESTORE_PROBE_PASSED" \
  "$COMMIT"
REBOOT_BACKUP_RECEIPT_FINGERPRINT=$(jq -er '
  .detail |
  capture("(^|;)postRebootBackupReceiptFingerprint=(?<fingerprint>[a-f0-9]{64})(;|$)")
  | .fingerprint
' "$REBOOT_RECEIPT") \
  || die "reboot receipt does not bind a post-reboot backup receipt"
[[ $REBOOT_BACKUP_RECEIPT_FINGERPRINT == \
  "$(file_fingerprint "$POST_REBOOT_BACKUP_RECEIPT")" ]] \
  || die "reboot receipt does not bind its signed post-reboot backup receipt"
REBOOT_BACKUP_RECEIPT_SIGNATURE_FINGERPRINT=$(jq -er '
  .detail |
  capture("(^|;)postRebootBackupReceiptSignatureFingerprint=(?<fingerprint>[a-f0-9]{64})(;|$)")
  | .fingerprint
' "$REBOOT_RECEIPT") \
  || die "reboot receipt does not bind its backup receipt signature"
[[ $REBOOT_BACKUP_RECEIPT_SIGNATURE_FINGERPRINT == \
  "$(file_fingerprint "${POST_REBOOT_BACKUP_RECEIPT}.sig")" ]] \
  || die "reboot receipt does not bind the backup receipt signature"
assert_distinct_evidence_files \
  "$POST_REBOOT_BACKUP_RECEIPT" \
  "$BACKUP_RECEIPT" \
  "$DEPLOYMENT_RECEIPT" \
  "$LEGACY_FORWARD_DEPLOY_RECEIPT" \
  "$REBOOT_RECEIPT"

DEPLOYED_AT=$(jq -er '.recordedAt' "$DEPLOYMENT_RECEIPT")
LEGACY_FIRST_QUIESCED_AT=$(jq -er \
  '.createdAt' "$LEGACY_FIRST_QUIESCE_RECEIPT")
LEGACY_FIRST_ACCEPTED_AT=$(jq -er \
  '.createdAt' "$LEGACY_FIRST_SUCCESS_MARKER")
LEGACY_FIRST_BACKUP_AT=$(jq -er \
  '.createdAt' "$LEGACY_FIRST_BACKUP_MANIFEST")
LEGACY_ROLLED_BACK_AT=$(jq -er \
  '.createdAt' "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")
LEGACY_FORWARD_QUIESCED_AT=$(jq -er \
  '.createdAt' "$LEGACY_FORWARD_QUIESCE_RECEIPT")
LEGACY_FORWARDED_AT=$(jq -er \
  '.recordedAt' "$LEGACY_FORWARD_DEPLOY_RECEIPT")
LEGACY_FINAL_ACCEPTED_AT=$(jq -er \
  '.createdAt' "$LEGACY_FINAL_SUCCESS_MARKER")
REBOOTED_AT=$(jq -er '.recordedAt' "$REBOOT_RECEIPT")
POST_REBOOT_BACKUP_AT=$(jq -er '.recordedAt' \
  "$POST_REBOOT_BACKUP_RECEIPT")
jq -e -n \
  --arg deployedAt "$DEPLOYED_AT" \
  --arg legacyFinalAcceptedAt "$LEGACY_FINAL_ACCEPTED_AT" \
  --arg postRebootBackupAt "$POST_REBOOT_BACKUP_AT" \
  --arg rebootedAt "$REBOOTED_AT" \
  '
    ($deployedAt | fromdateiso8601) <=
      ($legacyFinalAcceptedAt | fromdateiso8601) and
    ($legacyFinalAcceptedAt | fromdateiso8601) <=
      ($postRebootBackupAt | fromdateiso8601) and
    ($postRebootBackupAt | fromdateiso8601) <=
      ($rebootedAt | fromdateiso8601)
  ' >/dev/null \
  || die "receipt order must be final legacy-forward acceptance, post-reboot backup, then reboot recovery"

jq -e -n \
  --arg deployedAt "$DEPLOYED_AT" \
  --arg firstAcceptedAt "$LEGACY_FIRST_ACCEPTED_AT" \
  --arg firstBackupAt "$LEGACY_FIRST_BACKUP_AT" \
  --arg firstQuiescedAt "$LEGACY_FIRST_QUIESCED_AT" \
  --arg finalAcceptedAt "$LEGACY_FINAL_ACCEPTED_AT" \
  --arg forwardQuiescedAt "$LEGACY_FORWARD_QUIESCED_AT" \
  --arg forwardedAt "$LEGACY_FORWARDED_AT" \
  --arg rolledBackAt "$LEGACY_ROLLED_BACK_AT" \
  '
    def seconds:
      sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    ($firstQuiescedAt | seconds) <= ($deployedAt | seconds) and
    ($deployedAt | seconds) <= ($firstAcceptedAt | seconds) and
    ($firstAcceptedAt | seconds) <= ($firstBackupAt | seconds) and
    ($firstBackupAt | seconds) <= ($rolledBackAt | seconds) and
    ($rolledBackAt | seconds) <= ($forwardQuiescedAt | seconds) and
    ($forwardQuiescedAt | seconds) <= ($forwardedAt | seconds) and
    ($forwardedAt | seconds) <= ($finalAcceptedAt | seconds)
  ' >/dev/null \
  || die "legacy evidence order must prove initial quiesce/deploy, cutover rollback, re-quiesce, forward deploy, and final acceptance"

validate_regular_file "$BACKUP_MANIFEST" \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" "600" 1048576
BACKUP_MANIFEST_SOURCE=$BACKUP_MANIFEST
BACKUP_SIGNATURE_SOURCE="${BACKUP_MANIFEST_SOURCE}.sig"
validate_regular_file \
  "$BACKUP_SIGNATURE_SOURCE" "0:${ONLYWAY_GID}" "640" 16384
BACKUP_MANIFEST="${WORK_DIR}/$(basename -- "$BACKUP_MANIFEST_SOURCE")"
snapshot_nofollow \
  "$BACKUP_MANIFEST_SOURCE" \
  "$BACKUP_MANIFEST" \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" \
  600
snapshot_nofollow \
  "$BACKUP_SIGNATURE_SOURCE" \
  "${BACKUP_MANIFEST}.sig" \
  "0:${ONLYWAY_GID}" \
  640
BACKUP_SIGNATURE=$(verify_backup_manifest_signature "$BACKUP_MANIFEST")
jq -e \
  --arg commit "$COMMIT" \
  '
    (keys == [
      "artifactFingerprint", "branch", "completedAt", "contractVersion",
      "executed", "fingerprint", "kind", "openCriticalFindings",
      "openHighFindings", "openMaterialP2Findings", "scanId",
      "scannedCommit", "source", "startedAt", "status", "targetKind",
      "targetRef"
    ]) and
    .contractVersion == "1" and
    .releaseCommit == $commit and
    .integrityCheck == "ok" and
    .restoreProbe == "PASSED" and
    .secretsIncluded == false and
    .rawBootstrapIncluded == false and
    (.sha256 | test("^[a-f0-9]{64}$")) and
    (.manifestFingerprint | test("^[a-f0-9]{64}$"))
  ' "$BACKUP_MANIFEST" >/dev/null \
  || die "backup manifest is not a verified final-commit restore probe"
BACKUP_MANIFEST_BODY=$(jq -c 'del(.manifestFingerprint)' "$BACKUP_MANIFEST")
[[ $(printf '%s' "$BACKUP_MANIFEST_BODY" | sha256sum | awk '{print $1}') == \
  "$(jq -r '.manifestFingerprint' "$BACKUP_MANIFEST")" ]] \
  || die "backup manifest self-fingerprint is invalid"
[[ $(jq -r '.detail' "$BACKUP_RECEIPT") == \
  "$(basename -- "$BACKUP_MANIFEST_SOURCE")" ]] \
  || die "backup receipt does not bind the supplied manifest"

validate_regular_file "$REHEARSAL_POINTER" "0:${ONLYWAY_GID}" "640" 65536
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "PRODUCTION_REHEARSAL_POINTER" and
    .commit == $commit and
    (.receiptPath | type == "string" and startswith("/")) and
    (.receiptFingerprint | test("^[a-f0-9]{64}$")) and
    (.fileFingerprint | test("^[a-f0-9]{64}$")) and
    (.pointerFingerprint | test("^[a-f0-9]{64}$")) and
    (.recordedAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"))
  ' "$REHEARSAL_POINTER" >/dev/null \
  || die "latest production rehearsal pointer is invalid"
[[ $(canonical_fingerprint "$REHEARSAL_POINTER" \
  'del(.pointerFingerprint)') == \
  "$(jq -r '.pointerFingerprint' "$REHEARSAL_POINTER")" ]] \
  || die "latest production rehearsal pointer fingerprint is invalid"
REHEARSAL_RECEIPT=$(jq -r '.receiptPath' "$REHEARSAL_POINTER")
CANONICAL_DATA=$(readlink -f -- "$ONLYWAY_DATA_DIR")
validate_regular_file \
  "$REHEARSAL_RECEIPT" "${ONLYWAY_UID}:${ONLYWAY_GID}" "600" 1048576
[[ $(readlink -f -- "$REHEARSAL_RECEIPT") == \
  "${CANONICAL_DATA}/rehearsals/"*"/receipt.json" ]] \
  || die "production rehearsal receipt escapes its mounted data root"
REHEARSAL_RECEIPT_SOURCE=$REHEARSAL_RECEIPT
REHEARSAL_RECEIPT="${WORK_DIR}/production-rehearsal-receipt.json"
snapshot_nofollow \
  "$REHEARSAL_RECEIPT_SOURCE" \
  "$REHEARSAL_RECEIPT" \
  "0:0" \
  600
[[ $(file_fingerprint "$REHEARSAL_RECEIPT") == \
  "$(jq -r '.fileFingerprint' "$REHEARSAL_POINTER")" ]] \
  || die "production rehearsal file fingerprint is invalid"
jq -e \
  --arg fingerprint "$(jq -r '.receiptFingerprint' "$REHEARSAL_POINTER")" \
  '
    .contractVersion == "1" and
    .status == "PASSED" and
    .providerMode == "OFFLINE_REHEARSAL" and
    .externalEffectsExecuted == false and
    .paidProviderCalls == 0 and
    .costCents == 0 and
    .receiptFingerprint == $fingerprint and
    .authorization.publicationKillSwitch.finalLocked == true and
    .recovery.fullDatabaseReopenVerified == true
  ' "$REHEARSAL_RECEIPT" >/dev/null \
  || die "production rehearsal receipt is not a zero-effect recovery proof"
BACKUP_RECORDED_AT=$(jq -er '.recordedAt' "$BACKUP_RECEIPT")
REHEARSAL_RECORDED_AT=$(jq -er '.recordedAt' "$REHEARSAL_POINTER")
jq -e -n \
  --arg backupRecordedAt "$BACKUP_RECORDED_AT" \
  --arg finalAcceptedAt "$LEGACY_FINAL_ACCEPTED_AT" \
  --arg rebootedAt "$REBOOTED_AT" \
  --arg rehearsalRecordedAt "$REHEARSAL_RECORDED_AT" \
  '
    ($finalAcceptedAt | fromdateiso8601) <=
      ($backupRecordedAt | fromdateiso8601) and
    ($finalAcceptedAt | fromdateiso8601) <=
      ($rehearsalRecordedAt | fromdateiso8601) and
    ($backupRecordedAt | fromdateiso8601) <=
      ($rebootedAt | fromdateiso8601) and
    ($rehearsalRecordedAt | fromdateiso8601) <=
      ($rebootedAt | fromdateiso8601)
  ' >/dev/null \
  || die "backup and rehearsal evidence must follow legacy forward acceptance and precede reboot recovery"

[[ $PRE_SCAN_SIGNATURE == "${PRE_SCAN_RECEIPT}.sig" ]] \
  || die "pre-scan signature path must be the receipt .sig companion"
validate_regular_file \
  "$PRE_SCAN_RECEIPT" "0:${ONLYWAY_GID}" "600,640" 65536
validate_regular_file \
  "$PRE_SCAN_SIGNATURE" "0:${ONLYWAY_GID}" "600,640" 16384
validate_regular_file "$PRE_SCAN_TRUST_KEY" "0:0" "600,644" 16384
assert_distinct_evidence_files \
  "$PRE_SCAN_RECEIPT" "$PRE_SCAN_SIGNATURE" "$PRE_SCAN_TRUST_KEY"
PRE_SCAN_RECEIPT_SNAPSHOT="${WORK_DIR}/pre-scan-verification.json"
PRE_SCAN_SIGNATURE_SNAPSHOT="${PRE_SCAN_RECEIPT_SNAPSHOT}.sig"
PRE_SCAN_TRUST_SNAPSHOT="${WORK_DIR}/pre-scan-verification.pub"
snapshot_nofollow \
  "$PRE_SCAN_RECEIPT" "$PRE_SCAN_RECEIPT_SNAPSHOT" "0:0" 600
snapshot_nofollow \
  "$PRE_SCAN_SIGNATURE" "$PRE_SCAN_SIGNATURE_SNAPSHOT" "0:0" 600
snapshot_nofollow \
  "$PRE_SCAN_TRUST_KEY" "$PRE_SCAN_TRUST_SNAPSHOT" "0:0" 600
TRUSTED_PRE_SCAN_PUBLIC_KEY=$(awk '
  NR == 1 && $1 == "ssh-ed25519" && $2 ~ /^[A-Za-z0-9+\/]+={0,2}$/ {
    print $1 " " $2
    found = 1
  }
  END {if (!found) exit 1}
' "$PRE_SCAN_TRUST_SNAPSHOT") \
  || die "pre-scan trust anchor must be an Ed25519 public key"
PRE_SCAN_SIGNER_FINGERPRINT=$(ssh-keygen \
  -lf "$PRE_SCAN_TRUST_SNAPSHOT" -E sha256 | awk 'NR == 1 {print $2}')
[[ $PRE_SCAN_SIGNER_FINGERPRINT =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
  || die "pre-scan trust-anchor fingerprint is invalid"
PRE_SCAN_ALLOWED_SIGNERS="${WORK_DIR}/pre-scan-allowed-signers"
printf 'onlyway-pre-scan %s\n' \
  "$TRUSTED_PRE_SCAN_PUBLIC_KEY" >"$PRE_SCAN_ALLOWED_SIGNERS"
chmod 0600 "$PRE_SCAN_ALLOWED_SIGNERS"
ssh-keygen -Y verify \
  -f "$PRE_SCAN_ALLOWED_SIGNERS" \
  -I onlyway-pre-scan \
  -n onlyway-pre-scan-verification-v1 \
  -s "$PRE_SCAN_SIGNATURE_SNAPSHOT" \
  <"$PRE_SCAN_RECEIPT_SNAPSHOT" >/dev/null \
  || die "pre-scan receipt detached signature is invalid"

github_repository_identity() {
  local remote=$1
  local repository
  case "$remote" in
    https://github.com/*)
      repository=${remote#https://github.com/}
      ;;
    git@github.com:*)
      repository=${remote#git@github.com:}
      ;;
    ssh://git@github.com/*)
      repository=${remote#ssh://git@github.com/}
      ;;
    *)
      die "pre-scan and deployed origins must identify a GitHub repository"
      ;;
  esac
  repository=${repository%.git}
  [[ $repository =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
    || die "GitHub repository identity is invalid"
  printf '%s\n' "$repository" | tr '[:upper:]' '[:lower:]'
}

PRE_SCAN_REMOTE_URL=$(jq -er '.remote.url' "$PRE_SCAN_RECEIPT_SNAPSHOT")
RELEASE_REMOTE_URL=$(git -C "$RELEASE" remote get-url origin)
[[ $(github_repository_identity "$PRE_SCAN_REMOTE_URL") == \
  "$(github_repository_identity "$RELEASE_REMOTE_URL")" ]] \
  || die "signed pre-scan receipt targets a different deployed repository"
jq -e \
  --arg commit "$COMMIT" \
  --arg gitTree "$(git -C "$RELEASE" rev-parse 'HEAD^{tree}')" \
  --arg signerFingerprint "$PRE_SCAN_SIGNER_FINGERPRINT" \
  --arg signerPublicKey "$TRUSTED_PRE_SCAN_PUBLIC_KEY" \
  '
    (keys == [
      "branch", "commit", "completedAt", "contractVersion", "gitTree",
      "kind", "remote", "secretsExposed", "signature", "startedAt",
      "status", "suiteCommand", "suiteStatus", "workingTree"
    ]) and
    .branch == "feature/telegram-operator-console" and
    .commit == $commit and
    (.completedAt | type == "string") and
    .contractVersion == "1" and
    .gitTree == $gitTree and
    .kind == "PRE_SCAN_VERIFICATION_RECEIPT" and
    (.remote | keys == ["commit", "name", "ref", "url"]) and
    .remote.commit == $commit and
    .remote.name == "origin" and
    .remote.ref == "refs/heads/feature/telegram-operator-console" and
    (.remote.url | type == "string" and length > 0 and length <= 2048) and
    .secretsExposed == false and
    (.signature | keys == [
      "algorithm", "namespace", "signerFingerprint", "signerPublicKey"
    ]) and
    .signature.algorithm == "OPENSSH_SSHSIG_ED25519" and
    .signature.namespace == "onlyway-pre-scan-verification-v1" and
    .signature.signerFingerprint == $signerFingerprint and
    .signature.signerPublicKey == $signerPublicKey and
    (.startedAt | type == "string") and
    .status == "PASSED" and
    .suiteCommand == "npm run check" and
    .suiteStatus == "PASSED" and
    .workingTree == "CLEAN" and
    (.startedAt |
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
    (.completedAt |
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
    ((.startedAt | fromdateiso8601) <=
      (.completedAt | fromdateiso8601))
  ' "$PRE_SCAN_RECEIPT_SNAPSHOT" >/dev/null \
  || die "signed pre-scan verification receipt is invalid"
PRE_SCAN_STARTED_AT=$(jq -er '.startedAt' "$PRE_SCAN_RECEIPT_SNAPSHOT")
PRE_SCAN_COMPLETED_AT=$(jq -er '.completedAt' "$PRE_SCAN_RECEIPT_SNAPSHOT")

validate_regular_file "$SCAN_RESULT" "0:${ONLYWAY_GID}" "600,640" 65536
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "DEEP_SECURITY_SCAN_RESULT" and
    .source == "codex-security/deep-scan" and
    .executed == true and
    .status == "COMPLETED" and
    .branch == "feature/telegram-operator-console" and
    .scannedCommit == $commit and
    .targetKind == "COMMIT" and
    .targetRef == $commit and
    .openCriticalFindings == 0 and
    .openHighFindings == 0 and
    .openMaterialP2Findings == 0 and
    (.scanId | type == "string" and
      test("^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$")) and
    (.startedAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$")) and
    (.completedAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$")) and
    (.artifactFingerprint | test("^[a-f0-9]{64}$")) and
    (.fingerprint | test("^[a-f0-9]{64}$"))
  ' "$SCAN_RESULT" >/dev/null \
  || die "Deep Security Scan result is not bound to the final feature commit"
[[ $(canonical_fingerprint "$SCAN_RESULT" 'del(.fingerprint)') == \
  "$(jq -r '.fingerprint' "$SCAN_RESULT")" ]] \
  || die "Deep Security Scan result fingerprint is invalid"
validate_regular_file "$SCAN_ARTIFACT" "0:${ONLYWAY_GID}" "600,640" 10485760
assert_distinct_evidence_files "$SCAN_RESULT" "$SCAN_ARTIFACT"
[[ $(file_fingerprint "$SCAN_ARTIFACT") == \
  "$(jq -r '.artifactFingerprint' "$SCAN_RESULT")" ]] \
  || die "Deep Security Scan artifact does not match its receipt fingerprint"
SCAN_COMPLETED_AT=$(jq -er '.completedAt' "$SCAN_RESULT")
SCAN_STARTED_AT=$(jq -er '.startedAt' "$SCAN_RESULT")
jq -e -n \
  --arg deployedAt "$DEPLOYED_AT" \
  --arg preScanCompletedAt "$PRE_SCAN_COMPLETED_AT" \
  --arg scanCompletedAt "$SCAN_COMPLETED_AT" \
  --arg scanStartedAt "$SCAN_STARTED_AT" \
  '
    def seconds:
      sub("\\.[0-9]{3}Z$"; "Z") | fromdateiso8601;
    ($preScanCompletedAt | seconds) <= ($scanStartedAt | seconds) and
    ($scanStartedAt | seconds) <= ($scanCompletedAt | seconds) and
    ($scanCompletedAt | seconds) <= ($deployedAt | seconds)
  ' >/dev/null \
  || die "Deep Security Scan must follow signed pre-scan verification and complete before deployment"

validate_regular_file "$TUNNEL_RECEIPT" "0:${ONLYWAY_GID}" "600" 131072
validate_regular_file "$TUNNEL_TRUST_KEY" "0:0" "600,644" 16384
assert_distinct_evidence_files "$TUNNEL_RECEIPT" "$TUNNEL_TRUST_KEY"
assert_distinct_evidence_files "$PRE_SCAN_TRUST_KEY" "$TUNNEL_TRUST_KEY"
[[ $(file_fingerprint "$PRE_SCAN_TRUST_SNAPSHOT") != \
  "$(file_fingerprint "$TUNNEL_TRUST_KEY")" ]] \
  || die "pre-scan and private-tunnel evidence require distinct trust-anchor fingerprints"
TRUSTED_TUNNEL_PUBLIC_KEY=$(awk '
  NR == 1 && $1 == "ssh-ed25519" && $2 ~ /^[A-Za-z0-9+\/]+={0,2}$/ {
    print $1 " " $2
    found = 1
  }
  END {if (!found) exit 1}
' "$TUNNEL_TRUST_KEY") \
  || die "private tunnel trust anchor must be an Ed25519 public key"
[[ $TRUSTED_TUNNEL_PUBLIC_KEY != "$TRUSTED_PRE_SCAN_PUBLIC_KEY" ]] \
  || die "pre-scan and private-tunnel evidence require distinct signing keys"
read -r _ _ COLLECTOR_SERVER_ADDRESS COLLECTOR_SSH_PORT \
  <<<"${SSH_CONNECTION:-}"
COLLECTOR_ADMIN_USER=${SUDO_USER:-}
[[ $COLLECTOR_SERVER_ADDRESS =~ ^[0-9A-Fa-f:.]+$ \
  && $COLLECTOR_SSH_PORT =~ ^[1-9][0-9]{0,4}$ \
  && $COLLECTOR_SSH_PORT -le 65535 \
  && $COLLECTOR_ADMIN_USER =~ ^[A-Za-z0-9._-]{1,64}$ \
  && $COLLECTOR_ADMIN_USER != root ]] \
  || die "active SSH server endpoint is unavailable for tunnel evidence"
SSHD_HOST_PUBLIC_KEY=/etc/ssh/ssh_host_ed25519_key.pub
[[ -f $SSHD_HOST_PUBLIC_KEY && ! -L $SSHD_HOST_PUBLIC_KEY \
  && $(stat -c '%u' "$SSHD_HOST_PUBLIC_KEY") == "0" ]] \
  || die "VPS Ed25519 SSH host public key is unavailable"
VPS_HOST_KEY_FINGERPRINT=$(ssh-keygen -lf "$SSHD_HOST_PUBLIC_KEY" -E sha256 \
  | awk 'NR == 1 {print $2}')
[[ $VPS_HOST_KEY_FINGERPRINT =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
  || die "VPS Ed25519 SSH host-key fingerprint is invalid"
jq -e \
  --arg commit "$COMMIT" \
  --arg expectedTarget \
    "${COLLECTOR_ADMIN_USER}@${COLLECTOR_SERVER_ADDRESS}" \
  --arg hostKeyFingerprint "$VPS_HOST_KEY_FINGERPRINT" \
  --arg serverAddress "$COLLECTOR_SERVER_ADDRESS" \
  --arg serverPort "$COLLECTOR_SSH_PORT" \
  --arg trustedPublicKey "$TRUSTED_TUNNEL_PUBLIC_KEY" \
  '
    (keys == [
      "branch", "commit", "contentFingerprint", "contractVersion",
      "externalProbe", "kind",
      "publicApplicationPortsAuthorized", "readinessFingerprint",
      "signature", "signatureAlgorithm", "signerFingerprint",
      "signerPublicKey", "status", "unauthorizedExternalEffectOccurred",
      "url", "verifiedAt"
    ]) and
    .branch == "feature/telegram-operator-console" and
    .commit == $commit and
    .contractVersion == "1" and
    (.externalProbe | keys ==
      [
        "closedPorts", "sshHostKeyFingerprint", "sshPort", "sshReachable",
        "sshTarget", "targetHost"
      ]) and
    .externalProbe.closedPorts == [80, 443, 43100, 43101, 8080] and
    .externalProbe.sshHostKeyFingerprint == $hostKeyFingerprint and
    .externalProbe.sshPort == ($serverPort | tonumber) and
    .externalProbe.sshReachable == true and
    .externalProbe.sshTarget == $expectedTarget and
    .externalProbe.targetHost == $serverAddress and
    .kind == "PRIVATE_TUNNEL_RECEIPT" and
    .publicApplicationPortsAuthorized == 0 and
    (.readinessFingerprint | test("^[a-f0-9]{64}$")) and
    .signatureAlgorithm == "OPENSSH_SSHSIG_ED25519" and
    (.signature | type == "string" and length >= 128 and length <= 16384) and
    (.signerFingerprint | test("^SHA256:[A-Za-z0-9+/]{43}$")) and
    (.signerPublicKey |
      test("^ssh-ed25519 [A-Za-z0-9+/]+={0,2}$")) and
    .signerPublicKey == $trustedPublicKey and
    .status == "PRIVATE_TUNNEL_VERIFIED" and
    .unauthorizedExternalEffectOccurred == false and
    (.url == "http://localhost:43100" or
      .url == "http://127.0.0.1:43100") and
    (.verifiedAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
    (.contentFingerprint | test("^[a-f0-9]{64}$"))
  ' "$TUNNEL_RECEIPT" >/dev/null \
  || die "private tunnel receipt contract is invalid"
[[ $(canonical_fingerprint "$TUNNEL_RECEIPT" \
  'del(.contentFingerprint, .signature, .signatureAlgorithm)') == \
  "$(jq -r '.contentFingerprint' "$TUNNEL_RECEIPT")" ]] \
  || die "private tunnel receipt content fingerprint is invalid"
TUNNEL_PUBLIC_KEY="${WORK_DIR}/tunnel-signer.pub"
TUNNEL_ALLOWED_SIGNERS="${WORK_DIR}/tunnel-allowed-signers"
TUNNEL_SIGNATURE="${WORK_DIR}/tunnel-receipt.sig"
TUNNEL_PAYLOAD="${WORK_DIR}/tunnel-receipt.payload"
printf '%s\n' "$TRUSTED_TUNNEL_PUBLIC_KEY" >"$TUNNEL_PUBLIC_KEY"
chmod 0600 "$TUNNEL_PUBLIC_KEY"
[[ $(ssh-keygen -lf "$TUNNEL_PUBLIC_KEY" -E sha256 \
  | awk 'NR == 1 {print $2}') == \
  "$(jq -r '.signerFingerprint' "$TUNNEL_RECEIPT")" ]] \
  || die "private tunnel receipt signer fingerprint is invalid"
printf 'onlyway-tunnel %s\n' \
  "$TRUSTED_TUNNEL_PUBLIC_KEY" \
  >"$TUNNEL_ALLOWED_SIGNERS"
chmod 0600 "$TUNNEL_ALLOWED_SIGNERS"
if ! jq -r '.signature' "$TUNNEL_RECEIPT" \
  | base64 -d >"$TUNNEL_SIGNATURE"; then
  die "private tunnel receipt signature encoding is invalid"
fi
CANONICAL_TUNNEL_PAYLOAD=$(jq -Sc \
  'del(.contentFingerprint, .signature, .signatureAlgorithm)' \
  "$TUNNEL_RECEIPT")
printf '%s' "$CANONICAL_TUNNEL_PAYLOAD" >"$TUNNEL_PAYLOAD"
ssh-keygen -Y verify \
  -f "$TUNNEL_ALLOWED_SIGNERS" \
  -I onlyway-tunnel \
  -n onlyway-private-tunnel \
  -s "$TUNNEL_SIGNATURE" <"$TUNNEL_PAYLOAD" >/dev/null \
  || die "private tunnel receipt SSH signature is invalid"
TUNNEL_VERIFIED_AT=$(jq -er '.verifiedAt' "$TUNNEL_RECEIPT")
jq -e -n \
  --arg rebootedAt "$REBOOTED_AT" \
  --arg tunnelVerifiedAt "$TUNNEL_VERIFIED_AT" \
  '
    ($rebootedAt | fromdateiso8601) <=
      ($tunnelVerifiedAt | fromdateiso8601)
  ' >/dev/null \
  || die "private tunnel verification predates reboot recovery"

VERIFICATION_IMAGE="mv-ai-os-verification:${COMMIT}"
docker build \
  --label "org.opencontainers.image.revision=${COMMIT}" \
  --tag "$VERIFICATION_IMAGE" \
  --target verification \
  "$RELEASE"
VERIFICATION_IMAGE_ID=$(docker image inspect --format '{{.Id}}' \
  "$VERIFICATION_IMAGE")
[[ $VERIFICATION_IMAGE_ID =~ ^sha256:[a-f0-9]{64}$ ]] \
  || die "verification image ID is invalid"
[[ $(docker image inspect \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "$VERIFICATION_IMAGE") == "$COMMIT" ]] \
  || die "verification image is not bound to the final commit"
jq -S -n \
  --arg commit "$COMMIT" \
  --arg gitTree "$(git -C "$RELEASE" rev-parse 'HEAD^{tree}')" \
  --arg imageId "$VERIFICATION_IMAGE_ID" \
  --arg observedAt "$OBSERVED_AT" \
  '{
    checks: ["npm-ci", "lint", "typecheck", "full-test-suite", "build"],
    commit: $commit,
    contractVersion: "1",
    gitTree: $gitTree,
    imageId: $imageId,
    kind: "CODE_VERIFICATION_REPORT",
    observedAt: $observedAt,
    status: "PASSED"
  }' >"${WORK_DIR}/code-verification.json"
CODE_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/code-verification.json")

set +e
git -C "$RELEASE" grep -I -q -E \
  -e '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-(proj-)?[A-Za-z0-9_-]{32,}|[0-9]{8,10}:[A-Za-z0-9_-]{30,}' \
  "$COMMIT" -- .
SECRET_CONTENT_STATUS=$?
set -e
if [[ $SECRET_CONTENT_STATUS -eq 0 ]]; then
  die "tracked final-commit tree contains a high-confidence secret signature"
elif [[ $SECRET_CONTENT_STATUS -ne 1 ]]; then
  die "tracked final-commit secret content scan failed"
fi
set +e
SECRET_FILENAMES=$(git -C "$RELEASE" ls-tree -r --name-only "$COMMIT")
SECRET_TREE_STATUS=$?
set -e
[[ $SECRET_TREE_STATUS -eq 0 ]] \
  || die "tracked final-commit filename scan failed"
if printf '%s\n' "$SECRET_FILENAMES" \
  | grep -Eq '(^|/)(\.env|id_(rsa|ed25519)|[^/]*private-key[^/]*)$'; then
  die "tracked final-commit tree contains a forbidden secret filename"
fi
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "TRACKED_TREE_SECRET_SCAN",
    observedAt: $observedAt,
    patternSetVersion: "1",
    scope: "EXACT_COMMIT_TRACKED_TREE",
    status: "PASSED"
  }' >"${WORK_DIR}/secret-scan.json"
SECRET_SCAN_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/secret-scan.json")

mapfile -t CONTAINER_IDS < <(
  docker ps --no-trunc \
    --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
    --format '{{.ID}}' | sort
)
[[ ${#CONTAINER_IDS[@]} -eq 5 ]] \
  || die "live stack does not contain exactly five core containers"
docker inspect "${CONTAINER_IDS[@]}" >"${WORK_DIR}/container-inspect.raw.json"
mapfile -t NETWORK_IDS < <(
  docker network ls \
    --filter "label=com.docker.compose.project=${ONLYWAY_COMPOSE_PROJECT}" \
    --format '{{.ID}}'
)
[[ ${#NETWORK_IDS[@]} -eq 1 ]] \
  || die "live stack does not have exactly one Compose network"
docker network inspect "${NETWORK_IDS[0]}" >"${WORK_DIR}/network-inspect.raw.json"
jq -e \
  --arg caddyImage "$ONLYWAY_CADDY_IMAGE" \
  --arg commit "$COMMIT" \
  --arg imageId "$IMAGE_ID" \
  '
    length == 5 and
    ([.[].Config.Labels["com.docker.compose.service"]] | sort) ==
      (["command-center", "health-monitor", "reverse-proxy", "scheduler",
        "worker"] | sort) and
    all(.[];
      .State.Running == true and
      .HostConfig.Privileged == false and
      .HostConfig.ReadonlyRootfs == true and
      .Config.User == "2001:2001" and
      (.HostConfig.CapDrop | index("ALL")) != null and
      (.HostConfig.SecurityOpt | index("no-new-privileges:true")) != null and
      .HostConfig.NetworkMode != "host" and
      .HostConfig.LogConfig.Type == "json-file" and
      .HostConfig.LogConfig.Config["max-size"] == "10m" and
      .HostConfig.LogConfig.Config["max-file"] == "5" and
      .HostConfig.LogConfig.Config.compress == "true" and
      ([.Mounts[]?.Destination] | index("/var/run/docker.sock")) == null
    ) and
    all(.[];
      if .Config.Labels["com.docker.compose.service"] == "reverse-proxy"
      then .Config.Image == $caddyImage
      else
        .Image == $imageId and
        .Config.Image == ("mv-ai-os:" + $commit) and
        (.Config.Env | index("ONLYWAY_RELEASE_COMMIT=" + $commit)) != null and
        ([.Mounts[].Destination] | index("/var/lib/onlyway")) != null and
        ([.Config.Env[] |
          select(test("^(OPENAI_API_KEY|TELEGRAM_BOT_TOKEN|.*PASSWORD|.*SECRET)="))]
          | length) == 0
      end
    ) and
    ([.[] | (.NetworkSettings.Ports // {}) | to_entries[] | .value[]?] |
      length == 1 and
      .[0].HostIp == "127.0.0.1" and
      .[0].HostPort == "43100") and
    ([.[] | .Mounts[]? |
      select(.Destination == "/etc/onlyway" or
        .Destination == "/run/secrets/onlyway" or
        .Destination == "/run/secrets/onlyway/admin-source-key-pepper") |
      .RW] | all(. == false))
  ' "${WORK_DIR}/container-inspect.raw.json" >/dev/null \
  || die "live container confinement or identity measurement failed"
jq -e \
  'length == 1 and .[0].Internal == true and .[0].Driver == "bridge"' \
  "${WORK_DIR}/network-inspect.raw.json" >/dev/null \
  || die "live Compose network is not an internal bridge"
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --entrypoint /bin/sh "mv-ai-os:${COMMIT}" \
  -c 'test ! -e /app/.env && test ! -e /run/secrets/onlyway && test ! -e /var/lib/onlyway/mv-ai-os.sqlite'
jq -S -n \
  --arg commit "$COMMIT" \
  --arg imageId "$IMAGE_ID" \
  --arg observedAt "$OBSERVED_AT" \
  --arg rawFingerprint \
    "$(file_fingerprint "${WORK_DIR}/container-inspect.raw.json")" \
  --arg networkFingerprint \
    "$(file_fingerprint "${WORK_DIR}/network-inspect.raw.json")" \
  '{
    checks: [
      "exact-image", "non-root", "not-privileged", "cap-drop-all",
      "no-new-privileges", "read-only-root", "no-docker-socket",
      "no-host-network", "internal-network", "loopback-publish-only",
      "bounded-log-rotation", "external-data", "external-secrets"
    ],
    commit: $commit,
    containerInspectionFingerprint: $rawFingerprint,
    contractVersion: "1",
    imageId: $imageId,
    kind: "CONTAINER_INSPECTION_REPORT",
    networkInspectionFingerprint: $networkFingerprint,
    observedAt: $observedAt,
    status: "PASSED"
  }' >"${WORK_DIR}/container-report.json"
CONTAINER_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/container-report.json")

assert_path() {
  local path=$1
  local owner=$2
  local mode=$3
  local type=$4
  [[ ! -L $path ]] || die "protected path is a symlink: ${path}"
  if [[ $type == "directory" ]]; then
    [[ -d $path ]] || die "protected directory is unavailable: ${path}"
  else
    [[ -f $path ]] || die "protected file is unavailable: ${path}"
  fi
  [[ $(stat -c '%u:%g' "$path") == "$owner" ]] \
    || die "protected path ownership is invalid: ${path}"
  [[ $(stat -c '%a' "$path") == "$mode" ]] \
    || die "protected path mode is invalid: ${path}"
}

for directory in \
  "$ONLYWAY_DATA_DIR" "$ONLYWAY_BACKUP_DIR" "$ONLYWAY_LOG_DIR" \
  "$ONLYWAY_ADMIN_STATE_DIR" \
  "$ONLYWAY_SECRETS_DIR" "$ONLYWAY_ADMIN_SECRETS_DIR" \
  "$ONLYWAY_ADMIN_BOOTSTRAP_DIR"; do
  assert_path "$directory" "${ONLYWAY_UID}:${ONLYWAY_GID}" 700 directory
done
assert_path "$ONLYWAY_RUN_DIR" "0:${ONLYWAY_GID}" 750 directory
assert_path "$ONLYWAY_CONFIG_DIR" "0:${ONLYWAY_GID}" 750 directory
assert_path "$ONLYWAY_OPERATION_LOCK_DIR" "0:${ONLYWAY_GID}" 750 directory
assert_path "$ONLYWAY_DEPLOY_SECRETS_DIR" "0:0" 700 directory
assert_path "$ONLYWAY_ADMIN_PEPPER_FILE" \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 file
assert_path "${ONLYWAY_CONFIG_DIR}/runtime.json" \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 file
assert_path "${ONLYWAY_CONFIG_DIR}/compose.env" \
  "0:${ONLYWAY_GID}" 640 file
assert_path "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" \
  "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 file
ADMIN_STATE_IDENTITY_BEFORE=$(stat -c \
  '%d:%i:%u:%g:%a:%s:%Y:%Z' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
ADMIN_STATE_FILE_FINGERPRINT=$(file_fingerprint \
  "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
jq -e '
  type == "object" and
  (keys == [
    "bootstrap", "challenges", "contractVersion", "credentials", "principals",
    "rateLimits", "revision", "securityEvents", "sessions", "stateVersion",
    "stepUpReceipts"
  ]) and
  .contractVersion == "1" and
  .stateVersion == 1 and
  (.revision | type == "number" and floor == . and . >= 1) and
  (.bootstrap | type == "object") and
  (.bootstrap | keys == ["consumedAt", "createdAt", "expiresAt", "tokenHash"]) and
  (.bootstrap.tokenHash | test("^[a-f0-9]{64}$")) and
  (.bootstrap.createdAt | type == "string" and
    test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$")) and
  (.bootstrap.consumedAt == null or
    (.bootstrap.consumedAt | type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$"))) and
  (.bootstrap.expiresAt | type == "string" and
    test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$")) and
  ([.principals, .credentials, .challenges, .sessions, .stepUpReceipts,
    .rateLimits, .securityEvents] | all(type == "array")) and
  ([paths(scalars) as $path
    | ($path[-1] | tostring | ascii_downcase)
    | select(. == "bootstraptoken" or . == "bootstrapsecret"
      or . == "rawbootstraptoken")] | length == 0)
' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" >/dev/null \
  || die "Founder bootstrap durable state is not verifiable"

ADMIN_UNAUTHENTICATED_STATUS=$(curl \
  --silent \
  --show-error \
  --output /dev/null \
  --write-out '%{http_code}' \
  --connect-timeout 3 \
  --max-time 10 \
  --header 'Host: localhost' \
  http://127.0.0.1:43100/api/admin/diagnostics)
[[ $ADMIN_UNAUTHENTICATED_STATUS == "401" ]] \
  || die "unauthenticated Admin endpoint is not fail-closed"

mapfile -t FOUNDER_BOOTSTRAP_ENTRIES < <(
  find "$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
    -mindepth 1 -maxdepth 1 -print | sort
)
BOOTSTRAP_CHANNEL_FINGERPRINT=
if jq -e '.bootstrap.consumedAt != null' \
  "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" >/dev/null; then
  [[ ${#FOUNDER_BOOTSTRAP_ENTRIES[@]} -eq 0 ]] \
    || die "consumed Founder bootstrap channel was not removed"
  jq -e '
    def iso_milliseconds:
      type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{3})?Z$");
    def seconds:
      sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
    ((.bootstrap.createdAt | seconds) <=
      (.bootstrap.consumedAt | seconds)) and
    ((.bootstrap.consumedAt | seconds) <=
      (.bootstrap.expiresAt | seconds)) and
    ((.bootstrap.createdAt | seconds) <= now) and
    ((.bootstrap.consumedAt | seconds) <= now) and
    ([.principals[] | select(.principalId == "founder")] as $principals |
      ($principals | length) == 1 and
      all($principals[];
        (keys == [
          "capabilities", "createdAt", "displayName", "kind",
          "principalId", "roles", "status"
        ]) and
        .capabilities == [] and
        (.createdAt | iso_milliseconds) and
        ((.createdAt | seconds) <= now) and
        .displayName == "Founder" and
        .kind == "HUMAN" and
        .principalId == "founder" and
        .roles == ["FOUNDER"] and
        .status == "ACTIVE"
      )) and
    ([.credentials[] | select(.principalId == "founder")] as $credentials |
      ($credentials | length) >= 1 and
      all($credentials[];
        (keys == [
          "backedUp", "counter", "createdAt", "credentialId",
          "deviceType", "principalId", "publicKey", "transports"
        ]) and
        (.backedUp | type == "boolean") and
        (.counter | type == "number" and floor == . and
          . >= 0 and . <= 9007199254740991) and
        (.createdAt | iso_milliseconds) and
        ((.createdAt | seconds) <= now) and
        (.credentialId | type == "string" and
          test("^[A-Za-z0-9_-]{8,2048}$")) and
        (.deviceType == "multiDevice" or .deviceType == "singleDevice") and
        .principalId == "founder" and
        (.publicKey | type == "string" and
          test("^[A-Za-z0-9_-]{16,8192}$")) and
        (.transports | type == "array" and length <= 16 and
          all(.[]; type == "string" and length >= 1 and length <= 64))
      )) and
    ([.securityEvents[] | select(.eventType == "FOUNDER_REGISTERED")] as $events |
      ($events | length) >= 1 and
      all($events[];
        (keys == [
          "contractVersion", "eventId", "eventType", "occurredAt",
          "outcome", "principalId", "reasonCode", "sourceKeyHash",
          "subjectId"
        ]) and
        .contractVersion == "1" and
        (.eventId | type == "string" and
          test("^event_[A-Za-z0-9_-]{16,128}$")) and
        .eventType == "FOUNDER_REGISTERED" and
        (.occurredAt | iso_milliseconds) and
        ((.occurredAt | seconds) <= now) and
        .outcome == "SUCCEEDED" and
        .principalId == "founder" and
        .reasonCode == "PASSKEY_USER_VERIFIED" and
        (.sourceKeyHash | test("^[a-f0-9]{64}$")) and
        .subjectId == "founder"
      ))
  ' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" >/dev/null \
    || die "consumed Founder bootstrap lacks its registered passkey proof"
  BOOTSTRAP_CLOSURE_STATE=CONSUMED_PASSKEY_REGISTERED
  BOOTSTRAP_CONSUMED_AT=$(jq -er \
    '.bootstrap.consumedAt' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
  FOUNDER_CREDENTIAL_COUNT=$(jq -er \
    '[.credentials[] | select(.principalId == "founder")] | length' \
    "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
  HUMAN_ENROLLMENT_REQUIRED=false
  OWNER_ONLY_CHANNEL_AVAILABLE=false
else
  FOUNDER_BOOTSTRAP_FILE="${ONLYWAY_ADMIN_BOOTSTRAP_DIR}/founder-bootstrap.json"
  [[ ${#FOUNDER_BOOTSTRAP_ENTRIES[@]} -eq 1 \
    && ${FOUNDER_BOOTSTRAP_ENTRIES[0]} == "$FOUNDER_BOOTSTRAP_FILE" ]] \
    || die "fresh Founder bootstrap must be the only owner-only channel entry"
  legacy_require_file_metadata \
    "$FOUNDER_BOOTSTRAP_FILE" \
    "$ONLYWAY_UID" "$ONLYWAY_GID" 600 16384 \
    "owner-only Founder bootstrap"
  BOOTSTRAP_CHANNEL_IDENTITY_BEFORE=$(stat -c \
    '%d:%i:%u:%g:%a:%s:%Y:%Z' "$FOUNDER_BOOTSTRAP_FILE")
  legacy_validate_new_admin_bootstrap \
    "$FOUNDER_BOOTSTRAP_FILE" "http://localhost:43100"
  jq -e -n \
    --arg createdAt "$(jq -er '.createdAt' "$FOUNDER_BOOTSTRAP_FILE")" \
    --arg expiresAt "$(jq -er '.expiresAt' "$FOUNDER_BOOTSTRAP_FILE")" \
    --arg stateCreatedAt "$(jq -er \
      '.bootstrap.createdAt' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")" \
    --arg stateExpiresAt "$(jq -er \
      '.bootstrap.expiresAt' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")" \
    '
      def seconds:
        sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
      $createdAt == $stateCreatedAt and
      $expiresAt == $stateExpiresAt and
      ($createdAt | seconds) <= now and
      ($createdAt | seconds) <= ($expiresAt | seconds) and
      ($stateExpiresAt | seconds) > now
    ' >/dev/null \
    || die "owner-only Founder bootstrap is expired or not state-bound"
  FOUNDER_BOOTSTRAP_TOKEN_HASH=$(jq -j '.bootstrapToken' \
    "$FOUNDER_BOOTSTRAP_FILE" | sha256sum | awk '{print $1}')
  [[ $FOUNDER_BOOTSTRAP_TOKEN_HASH == \
    "$(jq -er '.bootstrap.tokenHash' \
      "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")" ]] \
    || die "owner-only Founder bootstrap token is not state-bound"
  jq -e '
    ([.principals[] | select(.principalId == "founder")] | length == 0) and
    ([.credentials[] | select(.principalId == "founder")] | length == 0) and
    ([.securityEvents[] | select(
      .eventType == "FOUNDER_REGISTERED" and
      .outcome == "SUCCEEDED" and
      .principalId == "founder"
    )] | length == 0)
  ' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE" >/dev/null \
    || die "fresh Founder bootstrap conflicts with registered Founder state"
  BOOTSTRAP_CHANNEL_FINGERPRINT=$(file_fingerprint \
    "$FOUNDER_BOOTSTRAP_FILE")
  BOOTSTRAP_CHANNEL_IDENTITY_AFTER=$(stat -c \
    '%d:%i:%u:%g:%a:%s:%Y:%Z' "$FOUNDER_BOOTSTRAP_FILE")
  [[ $BOOTSTRAP_CHANNEL_IDENTITY_AFTER == \
      "$BOOTSTRAP_CHANNEL_IDENTITY_BEFORE" \
    && $(file_fingerprint "$FOUNDER_BOOTSTRAP_FILE") == \
      "$BOOTSTRAP_CHANNEL_FINGERPRINT" ]] \
    || die "owner-only Founder bootstrap changed during verification"
  BOOTSTRAP_CLOSURE_STATE=OWNER_ONLY_AVAILABLE_HUMAN_GATED
  BOOTSTRAP_CONSUMED_AT=
  FOUNDER_CREDENTIAL_COUNT=0
  HUMAN_ENROLLMENT_REQUIRED=true
  OWNER_ONLY_CHANNEL_AVAILABLE=true
fi

ADMIN_STATE_IDENTITY_AFTER=$(stat -c \
  '%d:%i:%u:%g:%a:%s:%Y:%Z' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
[[ $ADMIN_STATE_IDENTITY_AFTER == "$ADMIN_STATE_IDENTITY_BEFORE" \
  && $(file_fingerprint "$ONLYWAY_ADMIN_SECURITY_STATE_FILE") == \
    "$ADMIN_STATE_FILE_FINGERPRINT" ]] \
  || die "Admin Security state changed during bootstrap verification"
ADMIN_STATE_REVISION=$(jq -er '.revision' "$ONLYWAY_ADMIN_SECURITY_STATE_FILE")
mapfile -t FOUNDER_BOOTSTRAP_FINAL_ENTRIES < <(
  find "$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
    -mindepth 1 -maxdepth 1 -print | sort
)
if [[ $OWNER_ONLY_CHANNEL_AVAILABLE == "true" ]]; then
  [[ ${#FOUNDER_BOOTSTRAP_FINAL_ENTRIES[@]} -eq 1 \
    && ${FOUNDER_BOOTSTRAP_FINAL_ENTRIES[0]} == "$FOUNDER_BOOTSTRAP_FILE" \
    && $(stat -c '%d:%i:%u:%g:%a:%s:%Y:%Z' \
      "$FOUNDER_BOOTSTRAP_FILE") == "$BOOTSTRAP_CHANNEL_IDENTITY_BEFORE" \
    && $(file_fingerprint "$FOUNDER_BOOTSTRAP_FILE") == \
      "$BOOTSTRAP_CHANNEL_FINGERPRINT" \
    && $(stat -c '%d:%i:%u:%g:%a:%s:%Y:%Z' \
      "$ONLYWAY_ADMIN_SECURITY_STATE_FILE") == "$ADMIN_STATE_IDENTITY_BEFORE" \
    && $(file_fingerprint "$ONLYWAY_ADMIN_SECURITY_STATE_FILE") == \
      "$ADMIN_STATE_FILE_FINGERPRINT" ]] \
    || die "owner-only Founder bootstrap boundary changed during verification"
else
  [[ ${#FOUNDER_BOOTSTRAP_FINAL_ENTRIES[@]} -eq 0 \
    && $(stat -c '%d:%i:%u:%g:%a:%s:%Y:%Z' \
      "$ONLYWAY_ADMIN_SECURITY_STATE_FILE") == "$ADMIN_STATE_IDENTITY_BEFORE" \
    && $(file_fingerprint "$ONLYWAY_ADMIN_SECURITY_STATE_FILE") == \
      "$ADMIN_STATE_FILE_FINGERPRINT" ]] \
    || die "consumed Founder bootstrap boundary changed during verification"
fi
jq -S -n \
  --arg adminStateFingerprint "$ADMIN_STATE_FILE_FINGERPRINT" \
  --arg bootstrapChannelFingerprint "$BOOTSTRAP_CHANNEL_FINGERPRINT" \
  --arg bootstrapConsumedAt "$BOOTSTRAP_CONSUMED_AT" \
  --arg closureState "$BOOTSTRAP_CLOSURE_STATE" \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --argjson humanEnrollmentRequired "$HUMAN_ENROLLMENT_REQUIRED" \
  --argjson founderCredentialCount "$FOUNDER_CREDENTIAL_COUNT" \
  --argjson ownerOnlyChannelAvailable "$OWNER_ONLY_CHANNEL_AVAILABLE" \
  --argjson revision "$ADMIN_STATE_REVISION" \
  '{
    adminStateFingerprint: $adminStateFingerprint,
    bootstrapChannelFingerprint: (
      if $bootstrapChannelFingerprint == ""
      then null else $bootstrapChannelFingerprint end
    ),
    bootstrapConsumedAt: (
      if $bootstrapConsumedAt == "" then null else $bootstrapConsumedAt end
    ),
    closureState: $closureState,
    commit: $commit,
    contractVersion: "1",
    endpointUnauthorizedStatus: 401,
    founderCredentialCount: $founderCredentialCount,
    humanEnrollmentRequired: $humanEnrollmentRequired,
    kind: "FOUNDER_BOOTSTRAP_EVIDENCE",
    observedAt: $observedAt,
    ownerOnlyBootstrapChannelAvailable: $ownerOnlyChannelAvailable,
    rawBootstrapMaterialExposed: false,
    revision: $revision,
    status: "PASSED"
  }' >"${WORK_DIR}/bootstrap-report.json"
BOOTSTRAP_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/bootstrap-report.json")
while IFS= read -r secret; do
  assert_path "$secret" "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 file
done < <(find "$ONLYWAY_SECRETS_DIR" -mindepth 1 -maxdepth 1 -type f -print)
[[ ! -e "${ONLYWAY_SECRETS_DIR}/openai-api-key" \
  && ! -L "${ONLYWAY_SECRETS_DIR}/openai-api-key" ]] \
  || die "OpenAI secret must remain absent for the offline private milestone"
[[ $(getent passwd "$ONLYWAY_SERVICE_USER" | cut -d: -f7) == \
  "/usr/sbin/nologin" ]] \
  || die "service account has a login shell"
if id -nG "$ONLYWAY_SERVICE_USER" | tr ' ' '\n' \
  | grep -Eq '^(docker|sudo)$'; then
  die "service account belongs to a privileged group"
fi
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  '{
    checks: [
      "owner-and-mode-policy", "service-account-no-login",
      "service-account-no-docker-or-sudo", "founder-bootstrap-private-closure",
      "offline-provider-secret-absent", "backup-private"
    ],
    commit: $commit,
    contractVersion: "1",
    kind: "HOST_FILESYSTEM_REPORT",
    observedAt: $observedAt,
    status: "PASSED"
  }' >"${WORK_DIR}/filesystem-report.json"
FILESYSTEM_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/filesystem-report.json")

ADMIN_USER=${SUDO_USER:-}
SSH_ADDRESS=${SSH_CONNECTION%% *}
HOST_NAME=$(hostname)
[[ -n $ADMIN_USER && $ADMIN_USER != root \
  && $SSH_ADDRESS =~ ^[0-9A-Fa-f:.]+$ \
  && $HOST_NAME =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ ]] \
  || die "key-only SSH evidence requires the active administrative SSH session"
sshd -T -C \
  "user=${ADMIN_USER},host=${HOST_NAME},addr=${SSH_ADDRESS}" \
  >"${WORK_DIR}/sshd.raw.txt"
for policy in \
  "passwordauthentication no" \
  "kbdinteractiveauthentication no" \
  "permitemptypasswords no" \
  "permitrootlogin no" \
  "pubkeyauthentication yes"; do
  grep -qx "$policy" "${WORK_DIR}/sshd.raw.txt" \
    || die "effective sshd key-only policy is incomplete"
done
mapfile -t SSH_PORTS < <(
  awk '$1 == "port" {print $2}' "${WORK_DIR}/sshd.raw.txt" | sort -nu
)
[[ ${#SSH_PORTS[@]} -ge 1 && ${#SSH_PORTS[@]} -le 8 ]] \
  || die "effective sshd port set is invalid"
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg rawFingerprint "$(file_fingerprint "${WORK_DIR}/sshd.raw.txt")" \
  --argjson ports "$(printf '%s\n' "${SSH_PORTS[@]}" | jq -Rsc \
    'split("\n") | map(select(length > 0) | tonumber)')" \
  '{
    checks: [
      "password-disabled", "interactive-password-disabled",
      "empty-password-disabled", "root-login-disabled", "public-key-enabled"
    ],
    commit: $commit,
    contractVersion: "1",
    effectivePolicyFingerprint: $rawFingerprint,
    kind: "SSHD_POLICY_REPORT",
    observedAt: $observedAt,
    ports: $ports,
    status: "PASSED"
  }' >"${WORK_DIR}/sshd-report.json"
SSHD_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/sshd-report.json")

LC_ALL=C ufw status verbose >"${WORK_DIR}/ufw-verbose.raw.txt"
LC_ALL=C ufw status >"${WORK_DIR}/ufw.raw.txt"
grep -qx 'Status: active' "${WORK_DIR}/ufw-verbose.raw.txt" \
  || die "UFW is not active"
grep -Eq '^Default: deny \(incoming\), allow \(outgoing\)' \
  "${WORK_DIR}/ufw-verbose.raw.txt" \
  || die "UFW default policy is not deny-incoming/allow-outgoing"
grep -Eq '^IPV6=yes$' /etc/default/ufw \
  || die "UFW IPv6 enforcement is disabled"
for port in "${SSH_PORTS[@]}"; do
  grep -Eq "^${port}/tcp[[:space:]]+ALLOW([[:space:]]+IN)?[[:space:]]+Anywhere([[:space:]]+#.*)?$" \
    "${WORK_DIR}/ufw.raw.txt" \
    || die "UFW lacks the IPv4 SSH allowance for port ${port}"
  grep -Eq "^${port}/tcp \\(v6\\)[[:space:]]+ALLOW([[:space:]]+IN)?[[:space:]]+Anywhere \\(v6\\)([[:space:]]+#.*)?$" \
    "${WORK_DIR}/ufw.raw.txt" \
    || die "UFW lacks the IPv6 SSH allowance for port ${port}"
done
if awk '/ALLOW/ {print $1}' "${WORK_DIR}/ufw.raw.txt" \
  | sed -E 's/ \(v6\)$//' \
  | while IFS= read -r rule; do
      allowed=false
      for port in "${SSH_PORTS[@]}"; do
        [[ $rule == "${port}/tcp" ]] && allowed=true
      done
      "$allowed" || exit 1
    done; then
  :
else
  die "UFW contains a non-SSH inbound allow rule"
fi
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg policyFingerprint \
    "$(file_fingerprint "${WORK_DIR}/ufw-verbose.raw.txt")" \
  '{
    checks: [
      "active", "deny-incoming", "allow-outgoing", "ipv4-ssh-only",
      "ipv6-ssh-only"
    ],
    commit: $commit,
    contractVersion: "1",
    kind: "UFW_POLICY_REPORT",
    observedAt: $observedAt,
    policyFingerprint: $policyFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/ufw-report.json"
UFW_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/ufw-report.json")

systemctl is-enabled --quiet fail2ban.service \
  || die "fail2ban is not enabled"
systemctl is-active --quiet fail2ban.service \
  || die "fail2ban is not active"
fail2ban-client status sshd >"${WORK_DIR}/fail2ban.raw.txt"
grep -Eq '^Status for the jail: sshd$' "${WORK_DIR}/fail2ban.raw.txt" \
  || die "fail2ban sshd jail is unavailable"
FAIL2BAN_MAXRETRY=$(fail2ban-client get sshd maxretry)
FAIL2BAN_FINDTIME=$(fail2ban-client get sshd findtime)
FAIL2BAN_BANTIME=$(fail2ban-client get sshd bantime)
FAIL2BAN_JOURNAL_MATCH=$(fail2ban-client get sshd journalmatch)
[[ $FAIL2BAN_MAXRETRY == "5" ]] \
  || die "effective fail2ban maxretry is not 5"
[[ $FAIL2BAN_FINDTIME =~ ^600([.]0)?$ ]] \
  || die "effective fail2ban findtime is not 600 seconds"
[[ $FAIL2BAN_BANTIME =~ ^3600([.]0)?$ ]] \
  || die "effective fail2ban bantime is not 3600 seconds"
grep -Eq '(_SYSTEMD_UNIT=(ssh|sshd)[.]service|_COMM=sshd)' \
  <<<"$FAIL2BAN_JOURNAL_MATCH" \
  || die "effective fail2ban backend is not systemd"
jq -S -n \
  --arg bantime "$FAIL2BAN_BANTIME" \
  --arg commit "$COMMIT" \
  --arg findtime "$FAIL2BAN_FINDTIME" \
  --arg journalMatch "$FAIL2BAN_JOURNAL_MATCH" \
  --arg maxretry "$FAIL2BAN_MAXRETRY" \
  --arg observedAt "$OBSERVED_AT" \
  --arg statusFingerprint \
    "$(file_fingerprint "${WORK_DIR}/fail2ban.raw.txt")" \
  '{
    bantimeSeconds: ($bantime | tonumber),
    checks: [
      "service-enabled", "service-active", "sshd-jail-active",
      "systemd-backend", "maxretry-5", "findtime-600", "bantime-3600"
    ],
    commit: $commit,
    contractVersion: "1",
    findtimeSeconds: ($findtime | tonumber),
    journalMatch: $journalMatch,
    kind: "FAIL2BAN_REPORT",
    maxretry: ($maxretry | tonumber),
    observedAt: $observedAt,
    status: "PASSED",
    statusFingerprint: $statusFingerprint
  }' >"${WORK_DIR}/fail2ban-report.json"
FAIL2BAN_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/fail2ban-report.json")

systemctl is-active --quiet unattended-upgrades.service \
  || die "unattended-upgrades service is not active"
for timer in apt-daily.timer apt-daily-upgrade.timer; do
  systemctl is-enabled --quiet "$timer" \
    || die "unattended upgrades timer is not enabled: ${timer}"
  systemctl is-active --quiet "$timer" \
    || die "unattended upgrades timer is not active: ${timer}"
done
apt-config dump >"${WORK_DIR}/apt-periodic.raw.txt"
grep -Fqx 'APT::Periodic::Update-Package-Lists "1";' \
  "${WORK_DIR}/apt-periodic.raw.txt" \
  || die "effective package-list refresh schedule is not daily"
grep -Fqx 'APT::Periodic::Unattended-Upgrade "1";' \
  "${WORK_DIR}/apt-periodic.raw.txt" \
  || die "effective unattended-upgrade schedule is not daily"
jq -S -n \
  --arg commit "$COMMIT" \
  --arg configFingerprint \
    "$(file_fingerprint "${WORK_DIR}/apt-periodic.raw.txt")" \
  --arg observedAt "$OBSERVED_AT" \
  '{
    checks: [
      "service-active", "apt-daily-enabled-active",
      "apt-daily-upgrade-enabled-active", "daily-package-list-refresh",
      "daily-unattended-upgrade"
    ],
    commit: $commit,
    configFingerprint: $configFingerprint,
    contractVersion: "1",
    kind: "UNATTENDED_UPGRADES_REPORT",
    observedAt: $observedAt,
    status: "PASSED"
  }' >"${WORK_DIR}/unattended-upgrades-report.json"
UNATTENDED_UPGRADES_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/unattended-upgrades-report.json")

ss -H -lnt >"${WORK_DIR}/listeners.raw.txt"
grep -Eq '(^|[[:space:]])(127\.0\.0\.1|\[::1\]):43100([[:space:]]|$)' \
  "${WORK_DIR}/listeners.raw.txt" \
  || die "private reverse proxy is not bound to loopback port 43100"
while IFS= read -r address; do
  port=${address##*:}
  allowed=false
  for ssh_port in "${SSH_PORTS[@]}"; do
    [[ $port == "$ssh_port" ]] && allowed=true
  done
  "$allowed" || die "non-SSH wildcard listener detected on port ${port}"
done < <(
  awk '{print $4}' "${WORK_DIR}/listeners.raw.txt" \
    | grep -E '^(0\.0\.0\.0|\[::\]|\*):' || true
)
for port in 80 443 43100 43101 8080; do
  if awk -v port="$port" \
    '$4 ~ ("^(0.0.0.0|\\[::\\]|\\*):" port "$") {found=1} END {exit !found}' \
    "${WORK_DIR}/listeners.raw.txt"; then
    die "application port ${port} is exposed on a wildcard listener"
  fi
done
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg listenerFingerprint \
    "$(file_fingerprint "${WORK_DIR}/listeners.raw.txt")" \
  '{
    checks: [
      "loopback-proxy-present", "ssh-only-wildcard-listeners",
      "no-public-application-port"
    ],
    commit: $commit,
    contractVersion: "1",
    kind: "NETWORK_LISTENER_REPORT",
    listenerFingerprint: $listenerFingerprint,
    observedAt: $observedAt,
    publicApplicationPorts: 0,
    status: "PASSED"
  }' >"${WORK_DIR}/listeners-report.json"
LISTENERS_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/listeners-report.json")

READINESS_RESPONSE="${WORK_DIR}/readiness-response.json"
"${RELEASE}/scripts/production/readiness.sh" \
  --expected-commit "$COMMIT" \
  --expected-image-id "$IMAGE_ID" \
  --expected-kind READINESS \
  --expected-provider-mode OFFLINE_REHEARSAL \
  --compose-project "$ONLYWAY_COMPOSE_PROJECT" >"$READINESS_RESPONSE"
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "READINESS" and
    .status == "READY" and
    .unauthorizedExternalEffectOccurred == false and
    .summary.releaseCommit == $commit and
    .summary.providerMode == "OFFLINE_REHEARSAL" and
    ([.checks[].status] | all(. == "PASS" or . == "NOT_REQUIRED"))
  ' "$READINESS_RESPONSE" >/dev/null \
  || die "live readiness response is invalid"
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg responseFingerprint "$(file_fingerprint "$READINESS_RESPONSE")" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "LIVE_READINESS_REPORT",
    observedAt: $observedAt,
    responseFingerprint: $responseFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/readiness-report.json"
READINESS_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/readiness-report.json")

jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg receiptFileFingerprint "$(file_fingerprint "$REHEARSAL_RECEIPT")" \
  --arg receiptFingerprint "$(jq -r '.receiptFingerprint' "$REHEARSAL_RECEIPT")" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "PRODUCTION_REHEARSAL_EVIDENCE",
    observedAt: $observedAt,
    receiptFileFingerprint: $receiptFileFingerprint,
    receiptFingerprint: $receiptFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/rehearsal-report.json"
REHEARSAL_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/rehearsal-report.json")

jq -S -n \
  --arg commit "$COMMIT" \
  --arg manifestSignatureFingerprint \
    "$(file_fingerprint "$BACKUP_SIGNATURE")" \
  --arg manifestSigningKeyFingerprint \
    "$(jq -r '.publicKeySha256' "$BACKUP_SIGNATURE")" \
  --arg manifestFingerprint "$(file_fingerprint "$BACKUP_MANIFEST")" \
  --arg observedAt "$OBSERVED_AT" \
  --arg receiptFingerprint "$(file_fingerprint "$BACKUP_RECEIPT")" \
  --arg receiptSignatureFingerprint \
    "$(file_fingerprint "${BACKUP_RECEIPT}.sig")" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "BACKUP_RESTORE_EVIDENCE",
    manifestFileFingerprint: $manifestFingerprint,
    manifestSignatureFingerprint: $manifestSignatureFingerprint,
    manifestSigningKeyFingerprint: $manifestSigningKeyFingerprint,
    observedAt: $observedAt,
    receiptFileFingerprint: $receiptFingerprint,
    receiptSignatureFingerprint: $receiptSignatureFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/backup-report.json"
BACKUP_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/backup-report.json")

jq -S -n \
  --arg commit "$COMMIT" \
  --arg cutoverRollbackFingerprint \
    "$(file_fingerprint "$LEGACY_CUTOVER_ROLLBACK_RECEIPT")" \
  --arg cutoverRollbackSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_CUTOVER_ROLLBACK_SIGNATURE")" \
  --arg finalSuccessFingerprint \
    "$(file_fingerprint "$LEGACY_FINAL_SUCCESS_MARKER")" \
  --arg finalSuccessSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_FINAL_SUCCESS_SIGNATURE")" \
  --arg firstBackupManifestFingerprint "$LEGACY_FIRST_BACKUP_SHA" \
  --arg firstBackupSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_FIRST_BACKUP_SIGNATURE")" \
  --arg firstQuiesceFingerprint \
    "$(file_fingerprint "$LEGACY_FIRST_QUIESCE_RECEIPT")" \
  --arg firstQuiesceSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_FIRST_QUIESCE_SIGNATURE")" \
  --arg firstSuccessFingerprint \
    "$(file_fingerprint "$LEGACY_FIRST_SUCCESS_MARKER")" \
  --arg firstSuccessSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_FIRST_SUCCESS_SIGNATURE")" \
  --arg forwardDeployFingerprint \
    "$(file_fingerprint "$LEGACY_FORWARD_DEPLOY_RECEIPT")" \
  --arg forwardDeploySignatureFingerprint \
    "$(file_fingerprint "${LEGACY_FORWARD_DEPLOY_RECEIPT}.sig")" \
  --arg forwardQuiesceFingerprint \
    "$(file_fingerprint "$LEGACY_FORWARD_QUIESCE_RECEIPT")" \
  --arg forwardQuiesceSignatureFingerprint \
    "$(file_fingerprint "$LEGACY_FORWARD_QUIESCE_SIGNATURE")" \
  --arg identitySetFingerprint \
    "$(jq -Sc '.legacyRuntime.exactIdentities | sort_by(.name)' \
      "$LEGACY_CUTOVER_ROLLBACK_RECEIPT" | sha256sum | awk '{print $1}')" \
  --arg observedAt "$OBSERVED_AT" \
  '{
    commit: $commit,
    contractVersion: "1",
    cutoverRollbackFingerprint: $cutoverRollbackFingerprint,
    cutoverRollbackSignatureFingerprint:
      $cutoverRollbackSignatureFingerprint,
    exactLegacyIdentityCount: 4,
    finalSuccessFingerprint: $finalSuccessFingerprint,
    finalSuccessSignatureFingerprint: $finalSuccessSignatureFingerprint,
    firstBackupManifestFingerprint: $firstBackupManifestFingerprint,
    firstBackupSignatureFingerprint: $firstBackupSignatureFingerprint,
    firstQuiesceFingerprint: $firstQuiesceFingerprint,
    firstQuiesceSignatureFingerprint: $firstQuiesceSignatureFingerprint,
    firstSuccessFingerprint: $firstSuccessFingerprint,
    firstSuccessSignatureFingerprint: $firstSuccessSignatureFingerprint,
    forwardDeployFingerprint: $forwardDeployFingerprint,
    forwardDeploySignatureFingerprint: $forwardDeploySignatureFingerprint,
    forwardQuiesceFingerprint: $forwardQuiesceFingerprint,
    forwardQuiesceSignatureFingerprint:
      $forwardQuiesceSignatureFingerprint,
    identitySetFingerprint: $identitySetFingerprint,
    kind: "LEGACY_MIGRATION_ROLLBACK_FORWARD_EVIDENCE",
    observedAt: $observedAt,
    status: "PASSED"
  }' >"${WORK_DIR}/legacy-migration-report.json"
LEGACY_MIGRATION_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/legacy-migration-report.json")
ROLLBACK_FINGERPRINT=$LEGACY_MIGRATION_FINGERPRINT

jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg postRebootBackupReceiptFingerprint \
    "$REBOOT_BACKUP_RECEIPT_FINGERPRINT" \
  --arg postRebootBackupReceiptSignatureFingerprint \
    "$REBOOT_BACKUP_RECEIPT_SIGNATURE_FINGERPRINT" \
  --arg receiptFingerprint "$(file_fingerprint "$REBOOT_RECEIPT")" \
  --arg receiptSignatureFingerprint \
    "$(file_fingerprint "${REBOOT_RECEIPT}.sig")" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "REBOOT_RECOVERY_EVIDENCE",
    observedAt: $observedAt,
    postRebootBackupReceiptFingerprint:
      $postRebootBackupReceiptFingerprint,
    postRebootBackupReceiptSignatureFingerprint:
      $postRebootBackupReceiptSignatureFingerprint,
    receiptFileFingerprint: $receiptFingerprint,
    receiptSignatureFingerprint: $receiptSignatureFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/reboot-report.json"
REBOOT_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/reboot-report.json")

jq -S -n \
  --arg commit "$COMMIT" \
  --arg markerFingerprint "$(file_fingerprint "$MARKER")" \
  --arg observedAt "$OBSERVED_AT" \
  --arg receiptFingerprint "$(file_fingerprint "$DEPLOYMENT_RECEIPT")" \
  --arg receiptSignatureFingerprint \
    "$(file_fingerprint "${DEPLOYMENT_RECEIPT}.sig")" \
  '{
    commit: $commit,
    contractVersion: "1",
    deploymentReceiptFingerprint: $receiptFingerprint,
    kind: "SIGNED_RELEASE_ACCEPTANCE_EVIDENCE",
    markerFingerprint: $markerFingerprint,
    observedAt: $observedAt,
    receiptSignatureFingerprint: $receiptSignatureFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/acceptance-report.json"
ACCEPTANCE_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/acceptance-report.json")

jq -S -n \
  --arg commit "$COMMIT" \
  --arg contentFingerprint \
    "$(jq -r '.contentFingerprint' "$TUNNEL_RECEIPT")" \
  --arg observedAt "$OBSERVED_AT" \
  --arg receiptFileFingerprint "$(file_fingerprint "$TUNNEL_RECEIPT")" \
  --arg signerFingerprint "$(jq -r '.signerFingerprint' "$TUNNEL_RECEIPT")" \
  '{
    commit: $commit,
    contentFingerprint: $contentFingerprint,
    contractVersion: "1",
    kind: "PRIVATE_TUNNEL_EVIDENCE",
    observedAt: $observedAt,
    receiptFileFingerprint: $receiptFileFingerprint,
    signerFingerprint: $signerFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/tunnel-report.json"

jq -S -n \
  --arg commit "$COMMIT" \
  --arg completedAt "$PRE_SCAN_COMPLETED_AT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg receiptFingerprint "$(file_fingerprint "$PRE_SCAN_RECEIPT_SNAPSHOT")" \
  --arg signatureFingerprint \
    "$(file_fingerprint "$PRE_SCAN_SIGNATURE_SNAPSHOT")" \
  --arg signerFingerprint "$PRE_SCAN_SIGNER_FINGERPRINT" \
  --arg startedAt "$PRE_SCAN_STARTED_AT" \
  --arg trustAnchorFingerprint \
    "$(file_fingerprint "$PRE_SCAN_TRUST_SNAPSHOT")" \
  '{
    commit: $commit,
    completedAt: $completedAt,
    contractVersion: "1",
    kind: "SIGNED_PRE_SCAN_VERIFICATION_EVIDENCE",
    observedAt: $observedAt,
    receiptFingerprint: $receiptFingerprint,
    signatureFingerprint: $signatureFingerprint,
    signerFingerprint: $signerFingerprint,
    startedAt: $startedAt,
    status: "PASSED",
    trustAnchorFingerprint: $trustAnchorFingerprint
  }' >"${WORK_DIR}/pre-scan-report.json"
PRE_SCAN_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/pre-scan-report.json")

jq -S -n \
  --arg artifactFingerprint "$(file_fingerprint "$SCAN_ARTIFACT")" \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg resultFingerprint "$(file_fingerprint "$SCAN_RESULT")" \
  '{
    artifactFingerprint: $artifactFingerprint,
    commit: $commit,
    contractVersion: "1",
    kind: "DEEP_SECURITY_SCAN_EVIDENCE",
    observedAt: $observedAt,
    resultFileFingerprint: $resultFingerprint,
    status: "PASSED"
  }' >"${WORK_DIR}/scan-report.json"

EVIDENCE_DIR="${ONLYWAY_RUN_DIR}/evidence"
install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 "$EVIDENCE_DIR"
BUNDLE="${EVIDENCE_DIR}/$(date -u +%Y%m%dT%H%M%SZ)-security-${COMMIT}.json"
[[ ! -e $BUNDLE && ! -L $BUNDLE ]] \
  || die "security evidence bundle target already exists"
jq -S -n \
  --arg commit "$COMMIT" \
  --arg observedAt "$OBSERVED_AT" \
  --slurpfile acceptance "${WORK_DIR}/acceptance-report.json" \
  --slurpfile backup "${WORK_DIR}/backup-report.json" \
  --slurpfile bootstrap "${WORK_DIR}/bootstrap-report.json" \
  --slurpfile code "${WORK_DIR}/code-verification.json" \
  --slurpfile containers "${WORK_DIR}/container-report.json" \
  --slurpfile fail2ban "${WORK_DIR}/fail2ban-report.json" \
  --slurpfile filesystem "${WORK_DIR}/filesystem-report.json" \
  --slurpfile listeners "${WORK_DIR}/listeners-report.json" \
  --slurpfile legacyMigration \
    "${WORK_DIR}/legacy-migration-report.json" \
  --slurpfile preScan "${WORK_DIR}/pre-scan-report.json" \
  --slurpfile readiness "${WORK_DIR}/readiness-report.json" \
  --slurpfile reboot "${WORK_DIR}/reboot-report.json" \
  --slurpfile rehearsal "${WORK_DIR}/rehearsal-report.json" \
  --slurpfile rollback "${WORK_DIR}/legacy-migration-report.json" \
  --slurpfile scan "${WORK_DIR}/scan-report.json" \
  --slurpfile secretScan "${WORK_DIR}/secret-scan.json" \
  --slurpfile sshd "${WORK_DIR}/sshd-report.json" \
  --slurpfile tunnel "${WORK_DIR}/tunnel-report.json" \
  --slurpfile ufw "${WORK_DIR}/ufw-report.json" \
  --slurpfile unattended \
    "${WORK_DIR}/unattended-upgrades-report.json" \
  '{
    commit: $commit,
    contractVersion: "1",
    kind: "SECURITY_EVIDENCE_BUNDLE",
    observedAt: $observedAt,
    reports: {
      acceptance: $acceptance[0],
      backup: $backup[0],
      bootstrap: $bootstrap[0],
      code: $code[0],
      containers: $containers[0],
      fail2ban: $fail2ban[0],
      filesystem: $filesystem[0],
      legacyMigration: $legacyMigration[0],
      listeners: $listeners[0],
      preScan: $preScan[0],
      readiness: $readiness[0],
      reboot: $reboot[0],
      rehearsal: $rehearsal[0],
      rollback: $rollback[0],
      scan: $scan[0],
      secretScan: $secretScan[0],
      sshd: $sshd[0],
      tunnel: $tunnel[0],
      ufw: $ufw[0],
      unattendedUpgrades: $unattended[0]
    },
    status: "PASSED"
  }' >"${WORK_DIR}/bundle-unsigned.json"
BUNDLE_FINGERPRINT=$(canonical_fingerprint "${WORK_DIR}/bundle-unsigned.json")
jq -S --arg fingerprint "$BUNDLE_FINGERPRINT" \
  '. + {fingerprint: $fingerprint}' \
  "${WORK_DIR}/bundle-unsigned.json" >"${WORK_DIR}/bundle.json"
[[ $(canonical_fingerprint "${WORK_DIR}/bundle.json" \
  'del(.fingerprint)') == "$BUNDLE_FINGERPRINT" ]] \
  || die "generated evidence bundle fingerprint is invalid"

jq -S -n \
  --arg acceptanceFp "$ACCEPTANCE_FINGERPRINT" \
  --arg backupFp "$BACKUP_FINGERPRINT" \
  --arg bootstrapFp "$BOOTSTRAP_FINGERPRINT" \
  --arg codeFp "$CODE_FINGERPRINT" \
  --arg commit "$COMMIT" \
  --arg containerFp "$CONTAINER_FINGERPRINT" \
  --arg fail2banFp "$FAIL2BAN_FINGERPRINT" \
  --arg filesystemFp "$FILESYSTEM_FINGERPRINT" \
  --arg listenersFp "$LISTENERS_FINGERPRINT" \
  --arg observedAt "$OBSERVED_AT" \
  --arg preScanCompletedAt "$PRE_SCAN_COMPLETED_AT" \
  --arg preScanFp "$PRE_SCAN_FINGERPRINT" \
  --arg readinessFp "$READINESS_FINGERPRINT" \
  --arg rebootFp "$REBOOT_FINGERPRINT" \
  --arg rehearsalFp "$REHEARSAL_FINGERPRINT" \
  --arg rollbackFp "$ROLLBACK_FINGERPRINT" \
  --arg secretScanFp "$SECRET_SCAN_FINGERPRINT" \
  --arg sshdFp "$SSHD_FINGERPRINT" \
  --arg ufwFp "$UFW_FINGERPRINT" \
  --slurpfile scanResult "$SCAN_RESULT" \
  '
    def evidenceAt($kind; $source; $fingerprint; $evidenceObservedAt): {
      commit: $commit,
      contractVersion: "1",
      fingerprint: $fingerprint,
      kind: $kind,
      observedAt: $evidenceObservedAt,
      source: $source,
      verified: true
    };
    def evidence($kind; $source; $fingerprint):
      evidenceAt($kind; $source; $fingerprint; $observedAt);
    {
      branch: "feature/telegram-operator-console",
      contractVersion: "2",
      controls: {
        adminRecovery: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        backupRestoreVerified: evidence("RUNTIME_RECEIPT"; "runtime/backup-restore"; $backupFp),
        backupStoragePrivate: evidence("HOST_CONFIGURATION"; "host/filesystem"; $filesystemFp),
        bruteForceProtection: evidence("HOST_CONFIGURATION"; "host/fail2ban"; $fail2banFp),
        commandBoundStepUp: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        containerNotPrivileged: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        csp: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        csrfProtection: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        databaseOutsideImage: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        defaultDenyAuthorization: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        dependencyIntegrity: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        dockerfileNonRoot: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        dockerSocketAbsent: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        firewallActive: evidence("HOST_CONFIGURATION"; "host/ufw"; $ufwFp),
        globalLogout: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        hostNetworkAbsent: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        hostValidation: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        killSwitchAuthorization: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        linuxCapabilitiesDropped: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        localFounderBootstrap: evidence("RUNTIME_RECEIPT"; "runtime/founder-bootstrap"; $bootstrapFp),
        logRedaction: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        logRotation: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        noNewPrivileges: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        noSecretScan: evidence("CODE_VERIFICATION"; "verification-image/secret-scan"; $secretScanFp),
        noStore: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        opaqueServerSessions: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        originValidation: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        privateFilePermissions: evidence("HOST_CONFIGURATION"; "host/filesystem"; $filesystemFp),
        publicAdminPortClosed: evidence("NETWORK_MEASUREMENT"; "host/listeners"; $listenersFp),
        publicRegistrationDisabled: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        rateLimiting: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        rbacCapabilities: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        readOnlyRootFilesystem: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        readinessVerified: evidence("RUNTIME_RECEIPT"; "runtime/readiness"; $readinessFp),
        rebootRecoveryVerified: evidence("RUNTIME_RECEIPT"; "runtime/reboot-recovery"; $rebootFp),
        reverseProxyPrivate: evidence("NETWORK_MEASUREMENT"; "host/listeners"; $listenersFp),
        rollbackVerified: evidence("RUNTIME_RECEIPT"; "runtime/rollback"; $rollbackFp),
        secureHttpOnlySameSiteCookie: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        secretsOutsideImage: evidence("CONTAINER_INSPECTION"; "docker/inspect"; $containerFp),
        securityEvents: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        serviceAccountsSeparated: evidence("HOST_CONFIGURATION"; "host/filesystem"; $filesystemFp),
        sessionRevocation: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        skillIntegrity: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        sseAuthentication: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        sshKeyOnly: evidence("HOST_CONFIGURATION"; "host/sshd"; $sshdFp),
        webAuthnAuthentication: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp)
      },
      finalCommit: $commit,
      kind: "SECURITY_EVIDENCE_ATTESTATION",
      maximumDeploymentState: "SECURE_DEPLOYMENT_READY_PRIVATE",
      prerequisites: {
        codeComplete: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp),
        finalCommitPushed: evidence("RELEASE_ACCEPTANCE"; "release/signed-acceptance"; $acceptanceFp),
        preScanVerified: evidenceAt("CODE_VERIFICATION"; "pre-scan/signed-verification"; $preScanFp; $preScanCompletedAt),
        productionRehearsalPassed: evidence("RUNTIME_RECEIPT"; "runtime/production-rehearsal"; $rehearsalFp),
        suiteGreen: evidence("CODE_VERIFICATION"; "verification-image/npm-check"; $codeFp)
      },
      publicExposureAuthorized: false,
      pushedCommit: $commit,
      scanResult: $scanResult[0],
      scanTarget: {kind: "COMMIT", ref: $commit}
    }
  ' >"${WORK_DIR}/attestation-unsigned.json"
ATTESTATION_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/attestation-unsigned.json")
jq -S --arg fingerprint "$ATTESTATION_FINGERPRINT" \
  '. + {attestationFingerprint: $fingerprint}' \
  "${WORK_DIR}/attestation-unsigned.json" >"${WORK_DIR}/attestation.json"
sign_release_attestation \
  "${WORK_DIR}/attestation.json" \
  "${WORK_DIR}/attestation.json.sig"

jq -S -n \
  --arg commit "$COMMIT" \
  --arg rehearsalFingerprint \
    "$(jq -r '.receiptFingerprint' "$REHEARSAL_RECEIPT")" \
  --arg tunnelFingerprint \
    "$(jq -r '.contentFingerprint' "$TUNNEL_RECEIPT")" \
  '{
    branch: "feature/telegram-operator-console",
    commit: $commit,
    contractVersion: "2",
    deployed: true,
    kind: "PRIVATE_DEPLOYMENT_ATTESTATION",
    privateTunnelVerified: true,
    privateTunnelReceiptFingerprint: $tunnelFingerprint,
    publicApplicationPorts: 0,
    readinessVerified: true,
    rehearsalReceiptFingerprint: $rehearsalFingerprint,
    rebootRecoveryVerified: true,
    rollbackVerified: true,
    status: "DEPLOYED_PRIVATE"
  }' >"${WORK_DIR}/deployment-unsigned.json"
DEPLOYMENT_FINGERPRINT=$(canonical_fingerprint \
  "${WORK_DIR}/deployment-unsigned.json")
jq -S --arg fingerprint "$DEPLOYMENT_FINGERPRINT" \
  '. + {receiptFingerprint: $fingerprint}' \
  "${WORK_DIR}/deployment-unsigned.json" >"${WORK_DIR}/deployment.json"
sign_release_attestation \
  "${WORK_DIR}/deployment.json" \
  "${WORK_DIR}/deployment.json.sig"

docker run --rm \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --mount \
    "type=bind,src=${WORK_DIR}/attestation.json,dst=/tmp/security-attestation.json,readonly" \
  --mount \
    "type=bind,src=${WORK_DIR}/attestation.json.sig,dst=/tmp/security-attestation.json.sig,readonly" \
  --mount \
    "type=bind,src=${ONLYWAY_ACCEPTANCE_PUBLIC_KEY},dst=/run/onlyway/release-acceptance-ed25519.pub.pem,readonly" \
  "mv-ai-os:${COMMIT}" \
  node ./dist/production/production-closure-cli.js \
    security-readiness \
    --attestation /tmp/security-attestation.json >/dev/null

jq -e \
  --arg commit "$COMMIT" \
  --arg rehearsalFingerprint \
    "$(jq -r '.receiptFingerprint' "$REHEARSAL_RECEIPT")" \
  '
    (keys == [
      "branch", "commit", "contractVersion", "deployed",
      "kind",
      "privateTunnelReceiptFingerprint", "privateTunnelVerified",
      "publicApplicationPorts", "readinessVerified",
      "rehearsalReceiptFingerprint",
      "rebootRecoveryVerified", "receiptFingerprint",
      "rollbackVerified", "status"
    ]) and
    .branch == "feature/telegram-operator-console" and
    .commit == $commit and
    .contractVersion == "2" and
    .deployed == true and
    .kind == "PRIVATE_DEPLOYMENT_ATTESTATION" and
    .privateTunnelVerified == true and
    (.privateTunnelReceiptFingerprint | test("^[a-f0-9]{64}$")) and
    .publicApplicationPorts == 0 and
    .readinessVerified == true and
    (.rehearsalReceiptFingerprint | test("^[a-f0-9]{64}$")) and
    .rehearsalReceiptFingerprint ==
      $rehearsalFingerprint and
    .rebootRecoveryVerified == true and
    .rollbackVerified == true and
    .status == "DEPLOYED_PRIVATE" and
    (.receiptFingerprint | test("^[a-f0-9]{64}$"))
  ' "${WORK_DIR}/deployment.json" >/dev/null \
  || die "generated deployment attestation contract is invalid"
[[ $(canonical_fingerprint "${WORK_DIR}/deployment.json" \
  'del(.receiptFingerprint)') == "$DEPLOYMENT_FINGERPRINT" ]] \
  || die "generated deployment attestation fingerprint is invalid"

install_signed_attestation() {
  local source=$1
  local signature_source=$2
  local target=$3
  local signature_target="${target}.sig"
  local existing
  for existing in "$target" "$signature_target"; do
    if [[ -e $existing || -L $existing ]]; then
      [[ -f $existing && ! -L $existing ]] \
        || die "attestation target is not a regular file: ${existing}"
      [[ $(stat -c '%u:%g' "$existing") == "0:${ONLYWAY_GID}" ]] \
        || die "existing attestation target ownership is invalid: ${existing}"
      [[ $(stat -c '%a' "$existing") == "640" ]] \
        || die "existing attestation target mode is invalid: ${existing}"
    fi
  done
  ATTESTATION_TEMPORARY=$(mktemp \
    "${ONLYWAY_CONFIG_DIR}/.attestation.XXXXXX")
  SIGNATURE_TEMPORARY=$(mktemp \
    "${ONLYWAY_CONFIG_DIR}/.attestation-signature.XXXXXX")
  install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
    "$source" "$ATTESTATION_TEMPORARY"
  install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
    "$signature_source" "$SIGNATURE_TEMPORARY"
  [[ $(stat -c '%s' "$SIGNATURE_TEMPORARY") == "64" ]] \
    || die "published attestation signature is not Ed25519"
  sync -f "$ATTESTATION_TEMPORARY"
  sync -f "$SIGNATURE_TEMPORARY"
  mv -fT -- "$SIGNATURE_TEMPORARY" "$signature_target"
  SIGNATURE_TEMPORARY=
  sync -f "$ONLYWAY_CONFIG_DIR"
  mv -fT -- "$ATTESTATION_TEMPORARY" "$target"
  ATTESTATION_TEMPORARY=
  sync -f "$ONLYWAY_CONFIG_DIR"
}

publish_evidence_bundle() {
  local source=$1
  local target=$2
  BUNDLE_TEMPORARY=$(mktemp \
    "${EVIDENCE_DIR}/.security-evidence.XXXXXX")
  install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
    "$source" "$BUNDLE_TEMPORARY"
  ln "$BUNDLE_TEMPORARY" "$target" \
    || die "security evidence bundle target was created concurrently"
  unlink "$BUNDLE_TEMPORARY"
  BUNDLE_TEMPORARY=
}

retain_evidence_bundles() {
  local maximum=30
  local entry
  local name
  local size
  local index
  local -a bundles
  while IFS= read -r -d '' entry; do
    name=$(basename -- "$entry")
    [[ $name =~ \
      ^[0-9]{8}T[0-9]{6}Z-security-[a-f0-9]{40}\.json$ \
      && -f $entry \
      && ! -L $entry \
      && $(stat -c '%u:%g' "$entry") == "0:${ONLYWAY_GID}" \
      && $(stat -c '%a' "$entry") == "640" ]] \
      || die "evidence retention encountered an unsafe entry"
    size=$(stat -c '%s' "$entry")
    [[ $size =~ ^[1-9][0-9]*$ && $size -le 1048576 ]] \
      || die "evidence retention encountered an invalid bundle size"
  done < <(find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -print0)
  mapfile -t bundles < <(
    find "$EVIDENCE_DIR" -mindepth 1 -maxdepth 1 -type f \
      -name '*-security-*.json' -printf '%T@ %p\n' \
      | sort -nr \
      | awk '{sub(/^[^ ]+ /, ""); print}'
  )
  [[ ${#bundles[@]} -ge 1 ]] \
    || die "evidence retention did not find the new bundle"
  [[ ${bundles[0]} == "$BUNDLE" ]] \
    || die "new evidence bundle is not the newest retained entry"
  for ((index = maximum; index < ${#bundles[@]}; index += 1)); do
    entry=${bundles[$index]}
    [[ $entry == "${EVIDENCE_DIR}/"* \
      && $entry != "$BUNDLE" \
      && ! -L $entry ]] \
      || die "evidence retention selected an unsafe bundle"
    unlink "$entry"
  done
}

publish_evidence_bundle "${WORK_DIR}/bundle.json" "$BUNDLE"
retain_evidence_bundles
install_signed_attestation \
  "${WORK_DIR}/attestation.json" \
  "${WORK_DIR}/attestation.json.sig" \
  "$ATTESTATION_OUTPUT"
install_signed_attestation \
  "${WORK_DIR}/deployment.json" \
  "${WORK_DIR}/deployment.json.sig" \
  "$DEPLOYMENT_OUTPUT"
[[ $(file_fingerprint "$ATTESTATION_OUTPUT") == \
  "$(file_fingerprint "${WORK_DIR}/attestation.json")" ]] \
  || die "installed security attestation changed during publication"
[[ $(file_fingerprint "$ATTESTATION_SIGNATURE_OUTPUT") == \
  "$(file_fingerprint "${WORK_DIR}/attestation.json.sig")" ]] \
  || die "installed security attestation signature changed during publication"
[[ $(file_fingerprint "$DEPLOYMENT_OUTPUT") == \
  "$(file_fingerprint "${WORK_DIR}/deployment.json")" ]] \
  || die "installed deployment attestation changed during publication"
[[ $(file_fingerprint "$DEPLOYMENT_SIGNATURE_OUTPUT") == \
  "$(file_fingerprint "${WORK_DIR}/deployment.json.sig")" ]] \
  || die "installed deployment attestation signature changed during publication"

trap - EXIT
cleanup
printf 'SECURITY_ATTESTATION=%s\n' "$ATTESTATION_OUTPUT"
printf 'SECURITY_ATTESTATION_SIGNATURE=%s\n' "$ATTESTATION_SIGNATURE_OUTPUT"
printf 'SECURITY_EVIDENCE_BUNDLE=%s\n' "$BUNDLE"
printf 'DEPLOYMENT_ATTESTATION=%s\n' "$DEPLOYMENT_OUTPUT"
printf 'DEPLOYMENT_ATTESTATION_SIGNATURE=%s\n' \
  "$DEPLOYMENT_SIGNATURE_OUTPUT"
