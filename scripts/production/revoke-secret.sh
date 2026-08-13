#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

NAME=
CONFIRM=
while (($# > 0)); do
  case "$1" in
    --name) [[ $# -ge 2 ]] || die "--name requires a value"; NAME=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || die "--confirm requires a value"; CONFIRM=$2; shift ;;
    *) die "usage: $0 --name SAFE_ID --confirm REVOKE" ;;
  esac
  shift
done

require_root
require_safe_name "$NAME" "secret name"
[[ $CONFIRM == "REVOKE" ]] || die "secret revocation requires --confirm REVOKE"
ensure_layout_exists
acquire_operation_lock secret-revoke
TARGET="${ONLYWAY_SECRETS_DIR}/${NAME}"
[[ -f $TARGET && ! -L $TARGET ]] || die "secret is not installed"
unlink "$TARGET"
write_receipt "revoke-secret" "SECRET_REVOKED" "" "$NAME" >/dev/null
log "secret ${NAME}: REVOKED"
