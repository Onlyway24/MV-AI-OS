#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

readonly INTAKE_PATH="${ONLYWAY_CONFIG_DIR}/private-production-intake.json"
readonly MAX_INTAKE_BYTES=524288

[[ $# -eq 0 ]] || die "usage: $0"
require_root
require_command docker
require_command jq
ensure_layout_exists
acquire_operation_lock private-production-start
source_compose_environment

[[ -f $INTAKE_PATH && ! -L $INTAKE_PATH ]] \
  || die "private production intake is unavailable"
[[ $(stat -c '%u:%g:%a' "$INTAKE_PATH") == "0:${ONLYWAY_GID}:640" ]] \
  || die "private production intake ownership or mode is unsafe"
INTAKE_BYTES=$(stat -c '%s' "$INTAKE_PATH")
[[ $INTAKE_BYTES =~ ^[1-9][0-9]*$ && $INTAKE_BYTES -le $MAX_INTAKE_BYTES ]] \
  || die "private production intake size is invalid"
jq -e 'type == "object" and .contractVersion == "1"' "$INTAKE_PATH" \
  >/dev/null || die "private production intake envelope is invalid"

"${SCRIPT_DIR}/release-preflight.sh" \
  --expected-commit "$ONLYWAY_RELEASE_COMMIT" >/dev/null

compose --profile production-start run --rm --no-deps production-starter
