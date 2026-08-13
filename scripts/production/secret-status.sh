#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists

COUNT=0
while IFS= read -r -d '' path; do
  name=$(basename -- "$path")
  COUNT=$((COUNT + 1))
  if [[ -f $path && ! -L $path \
    && $(stat -c '%u:%g' "$path") == "${ONLYWAY_UID}:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$path") == "600" ]]; then
    printf '%s CONFIGURED_REDACTED\n' "$name"
  else
    printf '%s MISCONFIGURED_REDACTED\n' "$name"
  fi
done < <(find "$ONLYWAY_SECRETS_DIR" -mindepth 1 -maxdepth 1 -print0 | sort -z)
printf 'TOTAL_SECRET_REFERENCES=%s\n' "$COUNT"
printf 'SECRET_VALUES_DISPLAYED=0\n'
