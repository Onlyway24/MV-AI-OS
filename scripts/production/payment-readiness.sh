#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
acquire_operation_lock payment-readiness
source_compose_environment
for command in dd jq sha256sum stat; do
  require_command "$command"
done
COMMIT=${ONLYWAY_RELEASE_COMMIT:-}
require_commit "$COMMIT"
[[ $(basename -- "$(current_release)") == "$COMMIT" ]] \
  || die "payment readiness release identity is invalid"
CONFIG="${ONLYWAY_CONFIG_DIR}/runtime.json"
POINTER="${ONLYWAY_RUN_DIR}/receipts/latest-production-rehearsal.json"
DEPLOYMENT_ATTESTATION="${ONLYWAY_CONFIG_DIR}/deployment-attestation.json"
DEPLOYMENT_SIGNATURE="${DEPLOYMENT_ATTESTATION}.sig"
OPENAI_SECRET="${ONLYWAY_SECRETS_DIR}/openai-api-key"
[[ ! -e $OPENAI_SECRET && ! -L $OPENAI_SECRET ]] \
  || die "OpenAI secret must remain absent for offline payment readiness"

validate_regular() {
  local path=$1
  local owner=$2
  local mode=$3
  local maximum=$4
  [[ -f $path && ! -L $path ]] \
    || die "payment readiness input is not a regular file: ${path}"
  [[ $(readlink -f -- "$path") == "$path" ]] \
    || die "payment readiness input path is not canonical: ${path}"
  [[ $(stat -c '%u:%g' "$path") == "$owner" ]] \
    || die "payment readiness input ownership is invalid: ${path}"
  [[ $(stat -c '%a' "$path") == "$mode" ]] \
    || die "payment readiness input mode is invalid: ${path}"
  local size
  size=$(stat -c '%s' "$path")
  [[ $size =~ ^[1-9][0-9]*$ && $size -le $maximum ]] \
    || die "payment readiness input size is invalid: ${path}"
}

canonical_fingerprint() {
  local path=$1
  local filter=$2
  local canonical
  canonical=$(jq -Sc "$filter" "$path")
  printf '%s' "$canonical" | sha256sum | awk '{print $1}'
}

validate_regular "$CONFIG" "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 65536
validate_regular "$POINTER" "0:${ONLYWAY_GID}" 640 65536
validate_regular "$DEPLOYMENT_ATTESTATION" "0:${ONLYWAY_GID}" 640 65536
validate_regular "$DEPLOYMENT_SIGNATURE" "0:${ONLYWAY_GID}" 640 64
[[ $(stat -c '%s' "$DEPLOYMENT_SIGNATURE") == "64" ]] \
  || die "deployment attestation signature must be detached Ed25519"
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "PRODUCTION_REHEARSAL_POINTER" and
    .commit == $commit and
    (.receiptPath | type == "string" and startswith("/")) and
    (.receiptFingerprint | test("^[a-f0-9]{64}$")) and
    (.fileFingerprint | test("^[a-f0-9]{64}$")) and
    (.pointerFingerprint | test("^[a-f0-9]{64}$"))
  ' "$POINTER" >/dev/null \
  || die "latest production rehearsal pointer is invalid"
[[ $(canonical_fingerprint "$POINTER" 'del(.pointerFingerprint)') == \
  "$(jq -r '.pointerFingerprint' "$POINTER")" ]] \
  || die "latest production rehearsal pointer fingerprint is invalid"
REHEARSAL_RECEIPT=$(jq -r '.receiptPath' "$POINTER")
CANONICAL_DATA=$(readlink -f -- "$ONLYWAY_DATA_DIR")
validate_regular \
  "$REHEARSAL_RECEIPT" "${ONLYWAY_UID}:${ONLYWAY_GID}" 600 1048576
CANONICAL_RECEIPT=$(readlink -f -- "$REHEARSAL_RECEIPT")
[[ $CANONICAL_RECEIPT == "${CANONICAL_DATA}/rehearsals/"*"/receipt.json" ]] \
  || die "production rehearsal receipt is outside the mounted data root"
REHEARSAL_SOURCE_IDENTITY=$(stat -c '%d:%i:%u:%g:%a:%s' \
  "$CANONICAL_RECEIPT")
REHEARSAL_SNAPSHOT=$(mktemp \
  "${ONLYWAY_CONFIG_DIR}/.payment-rehearsal-receipt.XXXXXX.json")
cleanup() {
  [[ ! -e $REHEARSAL_SNAPSHOT ]] || unlink "$REHEARSAL_SNAPSHOT"
}
trap cleanup EXIT
dd \
  if="$CANONICAL_RECEIPT" \
  of="$REHEARSAL_SNAPSHOT" \
  iflag=nofollow,fullblock \
  conv=fsync \
  status=none
[[ $(stat -c '%d:%i:%u:%g:%a:%s' "$CANONICAL_RECEIPT") == \
  "$REHEARSAL_SOURCE_IDENTITY" ]] \
  || die "production rehearsal receipt changed during snapshot"
chown root:"$ONLYWAY_SERVICE_GROUP" "$REHEARSAL_SNAPSHOT"
chmod 0640 "$REHEARSAL_SNAPSHOT"
[[ $(sha256sum "$REHEARSAL_SNAPSHOT" | awk '{print $1}') == \
  "$(jq -r '.fileFingerprint' "$POINTER")" ]] \
  || die "production rehearsal receipt file fingerprint is invalid"
[[ $(jq -r '.receiptFingerprint' "$REHEARSAL_SNAPSHOT") == \
  "$(jq -r '.receiptFingerprint' "$POINTER")" ]] \
  || die "production rehearsal receipt content binding is invalid"
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "2" and
    .kind == "PRIVATE_DEPLOYMENT_ATTESTATION" and
    .branch == "feature/telegram-operator-console" and
    .commit == $commit and
    .deployed == true and
    .status == "DEPLOYED_PRIVATE" and
    .privateTunnelVerified == true and
    (.privateTunnelReceiptFingerprint | test("^[a-f0-9]{64}$")) and
    .publicApplicationPorts == 0 and
    .readinessVerified == true and
    (.rehearsalReceiptFingerprint | test("^[a-f0-9]{64}$")) and
    .rebootRecoveryVerified == true and
    .rollbackVerified == true and
    (.receiptFingerprint | test("^[a-f0-9]{64}$"))
  ' "$DEPLOYMENT_ATTESTATION" >/dev/null \
  || die "deployment attestation is not bound to the final private release"
[[ $(jq -r '.rehearsalReceiptFingerprint' "$DEPLOYMENT_ATTESTATION") == \
  "$(jq -r '.receiptFingerprint' "$REHEARSAL_SNAPSHOT")" ]] \
  || die "deployment attestation is not bound to the rehearsal receipt"
[[ $(canonical_fingerprint "$DEPLOYMENT_ATTESTATION" \
  'del(.receiptFingerprint)') == \
  "$(jq -r '.receiptFingerprint' "$DEPLOYMENT_ATTESTATION")" ]] \
  || die "deployment attestation fingerprint is invalid"

CONTAINER_RECEIPT="/etc/onlyway/$(basename -- "$REHEARSAL_SNAPSHOT")"
compose run --rm --no-deps worker \
  npm run payment-readiness -- \
  --config /etc/onlyway/runtime.json \
  --rehearsal-receipt "$CONTAINER_RECEIPT" \
  --deployment-attestation /etc/onlyway/deployment-attestation.json
trap - EXIT
cleanup
