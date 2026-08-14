#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=${1:-}
[[ $ROOT == /* && -d $ROOT ]] \
  || { printf '%s\n' "usage: $0 ABSOLUTE_REPOSITORY_ROOT" >&2; exit 2; }

# shellcheck source=../lib/legacy-migration-common.sh
source "${ROOT}/scripts/production/lib/legacy-migration-common.sh"

FIXTURES="${ROOT}/scripts/production/tests/fixtures"
VALID="${FIXTURES}/legacy-container-inspect.json"
SPECIFICATIONS="${FIXTURES}/legacy-container-specifications.json"
IMAGE_ID="sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
DATABASE="/srv/onlyway/data/onlyway.sqlite"
CONFIG="/srv/onlyway/config/runtime-private.json"
EXCLUDED_SECRET="/srv/onlyway/secrets/openai-api-key"

validate() {
  local inspect_file=$1
  legacy_validate_inventory_file \
    "$inspect_file" "$SPECIFICATIONS" "$IMAGE_ID" 2001 unless-stopped \
    127.0.0.1 41479 "$DATABASE" "$CONFIG" "$EXCLUDED_SECRET"
}

expect_rejection() {
  local inspect_file=$1
  local label=$2
  if (validate "$inspect_file") >/dev/null 2>&1; then
    printf 'legacy fixture unexpectedly accepted: %s\n' "$label" >&2
    exit 1
  fi
}

validate "$VALID"
TMP=$(mktemp -d)
trap 'find "$TMP" -xdev -depth -delete' EXIT

jq '.[0].HostConfig.NetworkMode = "host" |
  .[0].HostConfig.PortBindings = {}' \
  "$VALID" >"${TMP}/host-network-command-center.json"
validate "${TMP}/host-network-command-center.json"

jq '.[1].HostConfig.NetworkMode = "host" |
  .[0].HostConfig.PortBindings = {}' \
  "$VALID" >"${TMP}/wrong-host-network-container.json"
expect_rejection \
  "${TMP}/wrong-host-network-container.json" "non-command-center host network"

jq '.[0].Image = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"' \
  "$VALID" >"${TMP}/wrong-image.json"
expect_rejection "${TMP}/wrong-image.json" "changed immutable image ID"

jq '.[0].Config.User = "2002:2002"' \
  "$VALID" >"${TMP}/wrong-uid.json"
expect_rejection "${TMP}/wrong-uid.json" "changed runtime UID"

jq '.[1].HostConfig.RestartPolicy.Name = "always"' \
  "$VALID" >"${TMP}/wrong-restart.json"
expect_rejection "${TMP}/wrong-restart.json" "changed restart policy"

jq '.[0].HostConfig.PortBindings["43100/tcp"][0].HostIp = "0.0.0.0"' \
  "$VALID" >"${TMP}/public-listener.json"
expect_rejection "${TMP}/public-listener.json" "public listener"

jq '.[0].HostConfig.PortBindings["9999/tcp"] = [{
  HostIp: "127.0.0.1", HostPort: "9999"
}]' "$VALID" >"${TMP}/extra-listener.json"
expect_rejection "${TMP}/extra-listener.json" "extra listener"

jq '.[2].Config.Labels["com.docker.compose.project"] = "onlyway"' \
  "$VALID" >"${TMP}/compose-label.json"
expect_rejection "${TMP}/compose-label.json" "Compose-labelled legacy container"

jq 'map(.Mounts |= map(select(.Source !=
  "/srv/onlyway/config/runtime-private.json")))' \
  "$VALID" >"${TMP}/missing-config-mount.json"
expect_rejection "${TMP}/missing-config-mount.json" "missing config bind"

jq '.[2].Mounts += [{
  Destination: "/run/secrets/openai-api-key",
  RW: false,
  Source: "/srv/onlyway/secrets/openai-api-key",
  Type: "bind"
}]' "$VALID" >"${TMP}/dormant-secret-mounted.json"
expect_rejection "${TMP}/dormant-secret-mounted.json" "dormant secret mounted"

jq '. + [.[0] | .Id =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"]' \
  "$VALID" >"${TMP}/extra-container.json"
expect_rejection "${TMP}/extra-container.json" "fifth container"

jq '.[0].Config.Image = "attacker-controlled:mutable-tag"' \
  "$VALID" >"${TMP}/mutable-tag.json"
validate "${TMP}/mutable-tag.json"

BASELINE_FINGERPRINT=$(legacy_inventory_configuration_fingerprint "$VALID")
CHANGED_FINGERPRINT=$(
  legacy_inventory_configuration_fingerprint "${TMP}/dormant-secret-mounted.json"
)
[[ $BASELINE_FINGERPRINT =~ ^[0-9a-f]{64}$ \
  && $CHANGED_FINGERPRINT =~ ^[0-9a-f]{64}$ \
  && $BASELINE_FINGERPRINT != "$CHANGED_FINGERPRINT" ]] \
  || {
    printf '%s\n' "legacy configuration fingerprint does not bind mounts" >&2
    exit 1
  }

printf '%s\n' "legacy migration contract fixtures: PASS"
