#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=${1:-}
[[ $ROOT == /* && -d $ROOT ]] \
  || {
    printf '%s\n' "usage: $0 ABSOLUTE_REPOSITORY_ROOT" >&2
    exit 2
  }

if [[ $(uname -s) != "Linux" || ${EUID} -ne 0 ]]; then
  printf '%s\n' "host receipt signature contract: SKIP (requires Linux root)"
  exit 0
fi

for command in dd find mktemp openssl readlink stat; do
  command -v "$command" >/dev/null 2>&1 \
    || {
      printf 'host receipt signature contract: SKIP (missing %s)\n' \
        "$command"
      exit 0
    }
done

CONTRACT_TEMP_ROOT=$(mktemp -d \
  /tmp/onlyway-host-receipt-signature-contract.XXXXXX)
cleanup() {
  if [[ -d ${CONTRACT_TEMP_ROOT:-} \
    && $CONTRACT_TEMP_ROOT == \
      /tmp/onlyway-host-receipt-signature-contract.* ]]; then
    rm -rf --one-file-system -- "$CONTRACT_TEMP_ROOT"
  fi
}
trap cleanup EXIT

export ONLYWAY_ROOT="${CONTRACT_TEMP_ROOT}/onlyway"
export ONLYWAY_RUN_DIR="${ONLYWAY_ROOT}/run"
export ONLYWAY_OPERATION_LOCK_DIR="${ONLYWAY_ROOT}/.operation-locks"
export ONLYWAY_DEPLOY_SECRETS_DIR="${ONLYWAY_ROOT}/deploy-secrets"
export ONLYWAY_ACCEPTANCE_PRIVATE_KEY="${ONLYWAY_DEPLOY_SECRETS_DIR}/release-acceptance-ed25519.pem"
export ONLYWAY_ACCEPTANCE_PUBLIC_KEY="${ONLYWAY_DEPLOY_SECRETS_DIR}/release-acceptance-ed25519.pub.pem"
export ONLYWAY_SERVICE_USER=root
export ONLYWAY_SERVICE_GROUP=root
export ONLYWAY_UID=0
export ONLYWAY_GID=0

# shellcheck source=scripts/production/lib/common.sh
source "${ROOT}/scripts/production/lib/common.sh"

install -d -o root -g root -m 0700 \
  "$ONLYWAY_RUN_DIR" \
  "$ONLYWAY_OPERATION_LOCK_DIR" \
  "$ONLYWAY_DEPLOY_SECRETS_DIR"
RECEIPT_DIR="${ONLYWAY_RUN_DIR}/receipts"
install -d -o root -g root -m 0750 "$RECEIPT_DIR"

openssl genpkey -algorithm ED25519 \
  -out "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY"
openssl pkey -in "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" -pubout \
  -out "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"
chown root:root \
  "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
  "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"
chmod 0600 "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY"
chmod 0644 "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"

RECEIPT="${RECEIPT_DIR}/20260729T120000Z-backup-4242.json"
VALID_RECEIPT="${CONTRACT_TEMP_ROOT}/valid-receipt.json"
VALID_SIGNATURE="${CONTRACT_TEMP_ROOT}/valid-receipt.json.sig"
printf '%s\n' \
  '{"contractVersion":"1","action":"backup","status":"VERIFIED_RESTORE_PROBE_PASSED","recordedAt":"2026-07-29T12:00:00Z","commit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","detail":null,"secretsExposed":false}' \
  >"$VALID_RECEIPT"
openssl pkeyutl -sign -rawin \
  -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
  -in "$VALID_RECEIPT" \
  -out "$VALID_SIGNATURE"
install -o root -g root -m 0640 "$VALID_RECEIPT" "$RECEIPT"
install -o root -g root -m 0640 "$VALID_SIGNATURE" "${RECEIPT}.sig"
verify_host_receipt_signature "$RECEIPT" >/dev/null

expect_rejection() {
  local scenario=$1
  if verify_host_receipt_signature "$RECEIPT" >/dev/null 2>&1; then
    printf 'host receipt signature contract accepted %s\n' \
      "$scenario" >&2
    exit 1
  fi
}

printf '%s\n' \
  '{"contractVersion":"1","action":"backup","status":"TAMPERED","secretsExposed":false}' \
  >"$RECEIPT"
chown root:root "$RECEIPT"
chmod 0640 "$RECEIPT"
expect_rejection "tampered receipt content"
install -o root -g root -m 0640 "$VALID_RECEIPT" "$RECEIPT"

mv -T -- "${RECEIPT}.sig" "${RECEIPT}.sig.missing"
expect_rejection "missing detached signature"
mv -T -- "${RECEIPT}.sig.missing" "${RECEIPT}.sig"

WRONG_PRIVATE_KEY="${CONTRACT_TEMP_ROOT}/wrong-ed25519.pem"
openssl genpkey -algorithm ED25519 -out "$WRONG_PRIVATE_KEY"
openssl pkeyutl -sign -rawin \
  -inkey "$WRONG_PRIVATE_KEY" \
  -in "$RECEIPT" \
  -out "${RECEIPT}.sig"
chown root:root "${RECEIPT}.sig"
chmod 0640 "${RECEIPT}.sig"
expect_rejection "signature from an untrusted key"

install -o root -g root -m 0640 "$VALID_SIGNATURE" "${RECEIPT}.sig"
verify_host_receipt_signature "$RECEIPT" >/dev/null

WRITTEN_RECEIPT=$(write_receipt \
  "deploy-release" \
  "DEPLOYED_PRIVATE_ACCEPTED" \
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  "failure-atomic contract fixture")
verify_host_receipt_signature "$WRITTEN_RECEIPT" >/dev/null
jq -e '
  .contractVersion == "1" and
  .action == "deploy-release" and
  .status == "DEPLOYED_PRIVATE_ACCEPTED" and
  .commit == "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" and
  .secretsExposed == false
' "$WRITTEN_RECEIPT" >/dev/null
invalidate_host_receipt \
  "$WRITTEN_RECEIPT" \
  "deploy-release" \
  "DEPLOYED_PRIVATE_ACCEPTED" \
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
[[ ! -e $WRITTEN_RECEIPT \
  && ! -L $WRITTEN_RECEIPT \
  && ! -e "${WRITTEN_RECEIPT}.sig" \
  && ! -L "${WRITTEN_RECEIPT}.sig" ]] \
  || {
    printf '%s\n' \
      "host receipt signature contract: invalidated receipt remains authoritative" >&2
    exit 1
  }

printf '%s\n' "host receipt signature contract: PASS"
