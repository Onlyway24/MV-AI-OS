#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

NAME=
SOURCE=
CONFIRM=
while (($# > 0)); do
  case "$1" in
    --name) [[ $# -ge 2 ]] || die "--name requires a value"; NAME=$2; shift ;;
    --source) [[ $# -ge 2 ]] || die "--source requires a value"; SOURCE=$2; shift ;;
    --confirm) [[ $# -ge 2 ]] || die "--confirm requires a value"; CONFIRM=$2; shift ;;
    *) die "usage: $0 --name SAFE_ID --source ABSOLUTE_FILE --confirm INSTALL" ;;
  esac
  shift
done

require_root
require_safe_name "$NAME" "secret name"
require_absolute_path "$SOURCE" "secret source"
[[ $CONFIRM == "INSTALL" ]] || die "secret installation requires --confirm INSTALL"
ensure_layout_exists
acquire_operation_lock secret-install
[[ -f $SOURCE && ! -L $SOURCE ]] || die "secret source must be a regular non-symlink file"
SIZE=$(stat -c '%s' "$SOURCE")
[[ $SIZE =~ ^[0-9]+$ && $SIZE -ge 1 && $SIZE -le 65536 ]] \
  || die "secret source size is outside the accepted boundary"
TARGET="${ONLYWAY_SECRETS_DIR}/${NAME}"
[[ ! -e $TARGET && ! -L $TARGET ]] || die "secret already exists; use rotate-secret.sh"
TEMPORARY=$(mktemp "${ONLYWAY_SECRETS_DIR}/.${NAME}.XXXXXX")
install -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0600 \
  "$SOURCE" "$TEMPORARY"
mv -T -- "$TEMPORARY" "$TARGET"
write_receipt "install-secret" "SECRET_INSTALLED_REDACTED" "" "$NAME" >/dev/null
log "secret ${NAME}: CONFIGURED (value redacted)"
