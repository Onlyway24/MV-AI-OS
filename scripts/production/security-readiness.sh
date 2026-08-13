#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
acquire_operation_lock security-readiness
source_compose_environment
ATTESTATION="${ONLYWAY_CONFIG_DIR}/security-attestation.json"
ATTESTATION_SIGNATURE="${ATTESTATION}.sig"
[[ -f $ATTESTATION && ! -L $ATTESTATION ]] \
  || die "security attestation is unavailable; do not fabricate it before final commit and push"
[[ -f $ATTESTATION_SIGNATURE && ! -L $ATTESTATION_SIGNATURE ]] \
  || die "security attestation signature is unavailable"
for command in jq sha256sum stat; do
  require_command "$command"
done
COMMIT=${ONLYWAY_RELEASE_COMMIT:-}
require_commit "$COMMIT"
[[ $(basename -- "$(current_release)") == "$COMMIT" ]] \
  || die "security readiness release identity is invalid"
[[ $(readlink -f -- "$ATTESTATION") == "$ATTESTATION" ]] \
  || die "security attestation path is not canonical"
[[ $(stat -c '%u:%g' "$ATTESTATION") == "0:${ONLYWAY_GID}" ]] \
  || die "security attestation ownership must be root:onlyway"
[[ $(stat -c '%a' "$ATTESTATION") == "640" ]] \
  || die "security attestation mode must be 0640"
[[ $(readlink -f -- "$ATTESTATION_SIGNATURE") == \
  "$ATTESTATION_SIGNATURE" ]] \
  || die "security attestation signature path is not canonical"
[[ $(stat -c '%u:%g' "$ATTESTATION_SIGNATURE") == \
  "0:${ONLYWAY_GID}" ]] \
  || die "security attestation signature ownership must be root:onlyway"
[[ $(stat -c '%a' "$ATTESTATION_SIGNATURE") == "640" ]] \
  || die "security attestation signature mode must be 0640"
[[ $(stat -c '%s' "$ATTESTATION_SIGNATURE") == "64" ]] \
  || die "security attestation signature must be detached Ed25519"
ATTESTATION_SIZE=$(stat -c '%s' "$ATTESTATION")
[[ $ATTESTATION_SIZE =~ ^[1-9][0-9]*$ \
  && $ATTESTATION_SIZE -le 65536 ]] \
  || die "security attestation size is invalid"
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "2" and
    .kind == "SECURITY_EVIDENCE_ATTESTATION" and
    .branch == "main" and
    .finalCommit == $commit and
    .pushedCommit == $commit and
    .scanTarget.kind == "COMMIT" and
    .scanTarget.ref == $commit and
    .scanResult.scannedCommit == $commit and
    (.attestationFingerprint | test("^[a-f0-9]{64}$"))
  ' "$ATTESTATION" >/dev/null \
  || die "security attestation is not bound to the final feature commit"
CANONICAL_ATTESTATION=$(jq -Sc 'del(.attestationFingerprint)' "$ATTESTATION")
[[ $(printf '%s' "$CANONICAL_ATTESTATION" | sha256sum | awk '{print $1}') == \
  "$(jq -r '.attestationFingerprint' "$ATTESTATION")" ]] \
  || die "security attestation canonical fingerprint is invalid"
compose run --rm --no-deps command-center \
  npm run security-readiness -- \
  --attestation /etc/onlyway/security-attestation.json
