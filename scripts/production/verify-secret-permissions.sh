#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
[[ $(stat -c '%u:%g' "$ONLYWAY_SECRETS_DIR") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
  || die "secret directory ownership is invalid"
[[ $(stat -c '%a' "$ONLYWAY_SECRETS_DIR") == "700" ]] \
  || die "secret directory mode must be 0700"

FAILURES=0
while IFS= read -r -d '' path; do
  name=$(basename -- "$path")
  if [[ -L $path || ! -f $path || ! $name =~ ^[a-z][a-z0-9._-]{2,127}$ ]]; then
    log "secret ${name}: INVALID_ENTRY"
    FAILURES=$((FAILURES + 1))
    continue
  fi
  if [[ $(stat -c '%u:%g' "$path") != "${ONLYWAY_UID}:${ONLYWAY_GID}" \
    || $(stat -c '%a' "$path") != "600" ]]; then
    log "secret ${name}: INVALID_PERMISSIONS"
    FAILURES=$((FAILURES + 1))
  else
    log "secret ${name}: CONFIGURED_PERMISSIONS_OK (value redacted)"
  fi
done < <(find "$ONLYWAY_SECRETS_DIR" -mindepth 1 -maxdepth 1 -print0)

((FAILURES == 0)) || die "one or more secret entries failed permission verification"
log "secret boundary permissions: PASS"
