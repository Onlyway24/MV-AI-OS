#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=${1:-}
[[ $ROOT == /* && -d $ROOT ]] \
  || {
    printf '%s\n' "usage: $0 ABSOLUTE_REPOSITORY_ROOT" >&2
    exit 2
  }

if [[ $(uname -s) != "Linux" || ${EUID} -ne 0 ]]; then
  printf '%s\n' "legacy install gate signature contract: SKIP (requires Linux root)"
  exit 0
fi

for command in dd find install jq mktemp openssl readlink sha256sum stat; do
  command -v "$command" >/dev/null 2>&1 \
    || {
      printf 'legacy install gate signature contract: SKIP (missing %s)\n' \
        "$command"
      exit 0
    }
done

# shellcheck source=../lib/legacy-migration-common.sh
source "${ROOT}/scripts/production/lib/legacy-migration-common.sh"

CONTRACT_ROOT=$(mktemp -d \
  /tmp/onlyway-legacy-install-gate-signature.XXXXXX)
chmod 0700 "$CONTRACT_ROOT"
cleanup() {
  if [[ -d ${CONTRACT_ROOT:-} \
    && $CONTRACT_ROOT == \
      /tmp/onlyway-legacy-install-gate-signature.* ]]; then
    find "$CONTRACT_ROOT" -xdev -depth -delete
  fi
}
trap cleanup EXIT

PRIVATE_KEY="${CONTRACT_ROOT}/acceptance-ed25519.pem"
PUBLIC_KEY="${CONTRACT_ROOT}/acceptance-ed25519.pub.pem"
WRONG_PRIVATE_KEY="${CONTRACT_ROOT}/wrong-ed25519.pem"
WRONG_PUBLIC_KEY="${CONTRACT_ROOT}/wrong-ed25519.pub.pem"
SOURCE="${CONTRACT_ROOT}/unsigned.json"
RECEIPT="${CONTRACT_ROOT}/legacy-preflight.json"

openssl genpkey -algorithm ED25519 -out "$PRIVATE_KEY"
openssl pkey -in "$PRIVATE_KEY" -pubout -out "$PUBLIC_KEY"
openssl genpkey -algorithm ED25519 -out "$WRONG_PRIVATE_KEY"
openssl pkey -in "$WRONG_PRIVATE_KEY" -pubout -out "$WRONG_PUBLIC_KEY"
chown root:root \
  "$PRIVATE_KEY" "$PUBLIC_KEY" "$WRONG_PRIVATE_KEY" "$WRONG_PUBLIC_KEY"
chmod 0600 "$PRIVATE_KEY" "$WRONG_PRIVATE_KEY"
chmod 0644 "$PUBLIC_KEY" "$WRONG_PUBLIC_KEY"
printf '%s\n' \
  '{"contractVersion":"1","kind":"LEGACY_MIGRATION_PREFLIGHT","status":"READY_FOR_EXPLICIT_QUIESCE"}' \
  >"$SOURCE"
chown root:root "$SOURCE"
chmod 0600 "$SOURCE"

legacy_publish_signed_json \
  "$SOURCE" "$RECEIPT" "$PRIVATE_KEY" "$PUBLIC_KEY" 0 >/dev/null
legacy_verify_signed_json \
  "$RECEIPT" "${RECEIPT}.sig" "$PUBLIC_KEY" 0 >/dev/null

expect_rejection() {
  local scenario=$1
  local receipt=${2:-$RECEIPT}
  local signature=${3:-${RECEIPT}.sig}
  local key=${4:-$PUBLIC_KEY}
  if legacy_verify_signed_json \
    "$receipt" "$signature" "$key" 0 >/dev/null 2>&1; then
    printf 'legacy install gate signature accepted %s\n' "$scenario" >&2
    exit 1
  fi
}

VALID_RECEIPT="${CONTRACT_ROOT}/valid-receipt.json"
VALID_SIGNATURE="${CONTRACT_ROOT}/valid-receipt.json.sig"
install -o root -g root -m 0640 "$RECEIPT" "$VALID_RECEIPT"
install -o root -g root -m 0640 "${RECEIPT}.sig" "$VALID_SIGNATURE"

printf '%s\n' \
  '{"contractVersion":"1","kind":"LEGACY_MIGRATION_PREFLIGHT","status":"TAMPERED"}' \
  >"$RECEIPT"
chown root:root "$RECEIPT"
chmod 0640 "$RECEIPT"
expect_rejection "tampered receipt content"
install -o root -g root -m 0640 "$VALID_RECEIPT" "$RECEIPT"

expect_rejection \
  "missing detached signature" "$RECEIPT" "${RECEIPT}.sig.missing"
expect_rejection \
  "signature verified with an untrusted key" \
  "$RECEIPT" "${RECEIPT}.sig" "$WRONG_PUBLIC_KEY"

install -o root -g root -m 0640 "$VALID_SIGNATURE" "${RECEIPT}.sig"
legacy_verify_signed_json \
  "$RECEIPT" "${RECEIPT}.sig" "$PUBLIC_KEY" 0 >/dev/null

printf '%s\n' "legacy install gate signature contract: PASS"
