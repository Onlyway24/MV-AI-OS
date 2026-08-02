#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)

if (($# == 0)); then
  printf 'usage: %s --repo SSH_URL --branch feature/telegram-operator-console --commit VERIFIED_FULL_SHA [--deploy-key ABS] [--known-hosts ABS] [--dry-run]\n' "$0" >&2
  exit 2
fi

# Updates deliberately require an exact, already verified commit. Never deploy
# an unreviewed moving branch tip.
exec "${SCRIPT_DIR}/deploy-release.sh" "$@"
