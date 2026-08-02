#!/usr/bin/env bash

set -Eeuo pipefail

URL=${ONLYWAY_PRIVATE_URL:-http://localhost:43100}
ATTEMPTS=1
INTERVAL=5
EXPECTED_COMMIT=${ONLYWAY_EXPECTED_RELEASE_COMMIT:-${ONLYWAY_RELEASE_COMMIT:-}}
EXPECTED_IMAGE_ID=
EXPECTED_KIND=READINESS
EXPECTED_PROVIDER_MODE=OFFLINE_REHEARSAL
COMPOSE_PROJECT=${ONLYWAY_COMPOSE_PROJECT:-onlyway}
CONTAINER_ID=
OPENAI_SECRET_PATH=${ONLYWAY_OPENAI_SECRET_PATH:-/srv/onlyway/secrets/runtime/openai-api-key}

usage() {
  printf '%s\n' \
    "usage: $0 --expected-commit FULL_SHA [--expected-image-id sha256:HEX] [--container-id HEX | --compose-project NAME] [--expected-kind READINESS|STARTUP] [--expected-provider-mode OFFLINE_REHEARSAL] [--url HTTP_LOOPBACK_URL] [--attempts N] [--interval SECONDS]" >&2
  exit 2
}

while (($# > 0)); do
  case "$1" in
    --url) [[ $# -ge 2 ]] || usage; URL=$2; shift ;;
    --attempts) [[ $# -ge 2 ]] || usage; ATTEMPTS=$2; shift ;;
    --interval) [[ $# -ge 2 ]] || usage; INTERVAL=$2; shift ;;
    --expected-commit) [[ $# -ge 2 ]] || usage; EXPECTED_COMMIT=$2; shift ;;
    --expected-image-id) [[ $# -ge 2 ]] || usage; EXPECTED_IMAGE_ID=$2; shift ;;
    --expected-kind) [[ $# -ge 2 ]] || usage; EXPECTED_KIND=$2; shift ;;
    --expected-provider-mode) [[ $# -ge 2 ]] || usage; EXPECTED_PROVIDER_MODE=$2; shift ;;
    --compose-project) [[ $# -ge 2 ]] || usage; COMPOSE_PROJECT=$2; shift ;;
    --container-id) [[ $# -ge 2 ]] || usage; CONTAINER_ID=$2; shift ;;
    *) usage ;;
  esac
  shift
done

[[ $URL =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]] \
  || { printf '%s\n' "readiness URL must be loopback HTTP" >&2; exit 2; }
[[ $ATTEMPTS =~ ^[1-9][0-9]{0,2}$ ]] \
  || { printf '%s\n' "attempts must be between 1 and 999" >&2; exit 2; }
[[ $INTERVAL =~ ^[1-9][0-9]?$ ]] \
  || { printf '%s\n' "interval must be between 1 and 99 seconds" >&2; exit 2; }
[[ $EXPECTED_COMMIT =~ ^[0-9a-f]{40}$ ]] \
  || { printf '%s\n' "expected commit must be a full lowercase SHA" >&2; exit 2; }
[[ $EXPECTED_KIND == "READINESS" || $EXPECTED_KIND == "STARTUP" ]] \
  || { printf '%s\n' "expected kind must be READINESS or STARTUP" >&2; exit 2; }
[[ $EXPECTED_PROVIDER_MODE =~ ^[A-Z][A-Z0-9_]{2,63}$ ]] \
  || { printf '%s\n' "expected provider mode is invalid" >&2; exit 2; }
[[ $COMPOSE_PROJECT =~ ^[a-z0-9][a-z0-9_-]{1,62}$ ]] \
  || { printf '%s\n' "Compose project name is invalid" >&2; exit 2; }
[[ -z $EXPECTED_IMAGE_ID || $EXPECTED_IMAGE_ID =~ ^sha256:[0-9a-f]{64}$ ]] \
  || { printf '%s\n' "expected image ID is invalid" >&2; exit 2; }
[[ -z $CONTAINER_ID || $CONTAINER_ID =~ ^[0-9a-f]{64}$ ]] \
  || { printf '%s\n' "container ID is invalid" >&2; exit 2; }
[[ $OPENAI_SECRET_PATH == /* ]] \
  || { printf '%s\n' "OpenAI secret reference path must be absolute" >&2; exit 2; }
[[ ! -e $OPENAI_SECRET_PATH && ! -L $OPENAI_SECRET_PATH ]] \
  || { printf '%s\n' "OpenAI secret must remain absent in offline mode" >&2; exit 1; }

for command in curl docker jq sha256sum stat; do
  command -v "$command" >/dev/null 2>&1 \
    || { printf 'required command unavailable: %s\n' "$command" >&2; exit 1; }
done

if [[ -z $EXPECTED_IMAGE_ID ]]; then
  EXPECTED_IMAGE_ID=$(docker image inspect \
    --format '{{.Id}}' "mv-ai-os:${EXPECTED_COMMIT}")
fi
[[ $EXPECTED_IMAGE_ID =~ ^sha256:[0-9a-f]{64}$ ]] \
  || { printf '%s\n' "expected image is unavailable or invalid" >&2; exit 1; }
IMAGE_REVISION=$(docker image inspect \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
  "mv-ai-os:${EXPECTED_COMMIT}")
[[ $IMAGE_REVISION == "$EXPECTED_COMMIT" ]] \
  || { printf '%s\n' "image OCI revision does not match expected commit" >&2; exit 1; }
[[ $(docker image inspect --format '{{.Id}}' "mv-ai-os:${EXPECTED_COMMIT}") == "$EXPECTED_IMAGE_ID" ]] \
  || { printf '%s\n' "image tag no longer resolves to expected image ID" >&2; exit 1; }

if [[ -z $CONTAINER_ID ]]; then
  mapfile -t CONTAINERS < <(
    docker ps --no-trunc \
      --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" \
      --filter "label=com.docker.compose.service=command-center" \
      --format '{{.ID}}'
  )
  [[ ${#CONTAINERS[@]} -eq 1 ]] \
    || { printf '%s\n' "exactly one Command Center container is required" >&2; exit 1; }
  CONTAINER_ID=${CONTAINERS[0]}
fi
[[ $CONTAINER_ID =~ ^[0-9a-f]{64}$ ]] \
  || { printf '%s\n' "resolved Command Center container ID is invalid" >&2; exit 1; }

docker inspect "$CONTAINER_ID" \
  | jq -e \
    --arg commit "$EXPECTED_COMMIT" \
    --arg imageId "$EXPECTED_IMAGE_ID" \
    --arg project "$COMPOSE_PROJECT" \
    '
      length == 1 and
      .[0].State.Running == true and
      .[0].Image == $imageId and
      .[0].Config.Image == ("mv-ai-os:" + $commit) and
      .[0].Config.Labels["com.docker.compose.project"] == $project and
      .[0].Config.Labels["com.docker.compose.service"] == "command-center" and
      (.[0].Config.Env | index("ONLYWAY_RELEASE_COMMIT=" + $commit)) != null
    ' >/dev/null \
  || { printf '%s\n' "running Command Center identity does not match expected release" >&2; exit 1; }

RESPONSE=$(mktemp)
ENDPOINT=ready
if [[ $EXPECTED_KIND == "STARTUP" ]]; then
  ENDPOINT=startup
fi
cleanup() {
  [[ -f $RESPONSE ]] && unlink "$RESPONSE"
}
trap cleanup EXIT

for ((attempt = 1; attempt <= ATTEMPTS; attempt += 1)); do
  if curl --fail --silent --show-error \
    --connect-timeout 5 --max-time 10 \
    --output "$RESPONSE" "${URL}/health/${ENDPOINT}" \
    && [[ $(stat -c '%s' "$RESPONSE") -le 65536 ]] \
    && jq -e \
      --arg kind "$EXPECTED_KIND" \
      --arg commit "$EXPECTED_COMMIT" \
      --arg providerMode "$EXPECTED_PROVIDER_MODE" \
      '
        .contractVersion == "1" and
        .kind == $kind and
        .status == "READY" and
        .unauthorizedExternalEffectOccurred == false and
        .summary.releaseCommit == $commit and
        .summary.providerMode == $providerMode and
        (.checks | type == "array" and length > 0) and
        ([.checks[].status] | all(. == "PASS" or . == "NOT_REQUIRED"))
      ' "$RESPONSE" >/dev/null; then
    cat "$RESPONSE"
    printf '\n'
    exit 0
  fi
  if ((attempt < ATTEMPTS)); then
    sleep "$INTERVAL"
  fi
done

printf 'Onlyway readiness did not prove commit %s / kind %s / zero unauthorized effects after %s attempt(s)\n' \
  "$EXPECTED_COMMIT" "$EXPECTED_KIND" "$ATTEMPTS" >&2
exit 1
