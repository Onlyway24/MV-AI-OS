#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

EXPECTED_COMMIT=${ONLYWAY_RELEASE_COMMIT:-}
while (($# > 0)); do
  case "$1" in
    --expected-commit)
      [[ $# -ge 2 ]] || die "--expected-commit requires a value"
      EXPECTED_COMMIT=$2
      shift
      ;;
    *)
      die "usage: $0 --expected-commit FULL_SHA"
      ;;
  esac
  shift
done

require_root
require_commit "$EXPECTED_COMMIT"
ensure_layout_exists
require_ssh_hardening_confirmed
require_command docker
require_command git
require_command jq
source_compose_environment
[[ ${ONLYWAY_RELEASE_COMMIT:-} == "$EXPECTED_COMMIT" ]] \
  || die "Compose environment commit does not match expected release"

RELEASE=$(current_release) || die "current release is unavailable"
RELEASE=$(validate_release_path "$RELEASE")
[[ $(basename -- "$RELEASE") == "$EXPECTED_COMMIT" ]] \
  || die "current release path does not match expected commit"
verify_release_checkout "$RELEASE" "$EXPECTED_COMMIT"
MARKER=$(acceptance_marker_path "$EXPECTED_COMMIT")
IMAGE_ID=$(jq -r '.imageId // empty' "$MARKER")
verify_release_acceptance_marker "$EXPECTED_COMMIT" "$IMAGE_ID" >/dev/null
[[ $(git -C "$RELEASE" rev-parse 'HEAD^{tree}') == "$(jq -r '.gitTree' "$MARKER")" ]] \
  || die "release Git tree does not match its signed acceptance"
verify_release_image "$EXPECTED_COMMIT" "$IMAGE_ID" >/dev/null

COMPOSE_JSON=$(mktemp "${ONLYWAY_RUN_DIR}/.compose-preflight.XXXXXX")
cleanup() {
  [[ -f $COMPOSE_JSON ]] && unlink "$COMPOSE_JSON"
}
trap cleanup EXIT
compose config --quiet
compose config --format json >"$COMPOSE_JSON"
jq -e \
  --arg caddyImage "$ONLYWAY_CADDY_IMAGE" \
  --arg image "mv-ai-os:${EXPECTED_COMMIT}" \
  '
    .services["command-center"].image == $image and
    .services.scheduler.image == $image and
    .services.worker.image == $image and
    .services["health-monitor"].image == $image and
    .services["backup-verifier"].image == $image and
    .services["reverse-proxy"].image == $caddyImage and
    ([.services[].ports[]?] | length) == 0
  ' "$COMPOSE_JSON" >/dev/null \
  || die "Compose release identity or private-only port contract is invalid"

log "release preflight passed for ${EXPECTED_COMMIT}"
