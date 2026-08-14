#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT=
PORT=

usage() {
  printf '%s\n' \
    "usage: $0 --compose-project NAME --listen-port PORT" >&2
  exit 2
}

while (($# > 0)); do
  case "$1" in
    --compose-project) [[ $# -ge 2 ]] || usage; PROJECT=$2; shift ;;
    --listen-port) [[ $# -ge 2 ]] || usage; PORT=$2; shift ;;
    *) usage ;;
  esac
  shift
done

[[ ${EUID} -eq 0 ]] || { printf '%s\n' "loopback proxy requires root" >&2; exit 1; }
[[ $PROJECT =~ ^[a-z0-9][a-z0-9_-]{1,62}$ ]] || usage
[[ $PORT =~ ^[1-9][0-9]{0,4}$ && $PORT -le 65535 ]] || usage
for command in docker jq socat; do
  command -v "$command" >/dev/null 2>&1 \
    || { printf 'required command unavailable: %s\n' "$command" >&2; exit 1; }
done

mapfile -t IDS < <(docker ps --no-trunc \
  --filter "label=com.docker.compose.project=${PROJECT}" \
  --filter "label=com.docker.compose.service=command-center" \
  --format '{{.ID}}')
[[ ${#IDS[@]} -eq 1 && ${IDS[0]} =~ ^[0-9a-f]{64}$ ]] \
  || { printf '%s\n' "exactly one running Command Center is required" >&2; exit 1; }

INSPECT=$(mktemp)
cleanup() { [[ ! -e $INSPECT ]] || unlink "$INSPECT"; }
trap cleanup EXIT
docker inspect "${IDS[0]}" >"$INSPECT"
TARGET_IP=$(jq -er --arg project "$PROJECT" '
  select(length == 1)
  | .[0] as $container
  | select(
      $container.State.Running == true and
      $container.Config.Labels["com.docker.compose.project"] == $project and
      $container.Config.Labels["com.docker.compose.service"] == "command-center" and
      ($container.NetworkSettings.Networks | length) == 1)
  | $container.NetworkSettings.Networks | to_entries[0]
  | select(.key == ($project + "_onlyway_private"))
  | .value.IPAddress
  | select(test("^[0-9]{1,3}(\\.[0-9]{1,3}){3}$"))
' "$INSPECT")
docker network inspect "${PROJECT}_onlyway_private" \
  | jq -e 'length == 1 and .[0].Internal == true and .[0].Driver == "bridge"' \
    >/dev/null \
  || { printf '%s\n' "Command Center network is not an internal bridge" >&2; exit 1; }
[[ -n $TARGET_IP ]] || { printf '%s\n' "Command Center internal address is unavailable" >&2; exit 1; }

cleanup
trap - EXIT
exec socat \
  "TCP4-LISTEN:${PORT},bind=127.0.0.1,reuseaddr,fork,max-children=64,backlog=128" \
  "TCP4:${TARGET_IP}:8080,connect-timeout=5"
