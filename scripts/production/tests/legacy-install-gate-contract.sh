#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=${1:-}
[[ $ROOT == /* && -d $ROOT ]] \
  || { printf '%s\n' "usage: $0 ABSOLUTE_REPOSITORY_ROOT" >&2; exit 2; }

# shellcheck source=../lib/legacy-migration-common.sh
source "${ROOT}/scripts/production/lib/legacy-migration-common.sh"

FIXTURES="${ROOT}/scripts/production/tests/fixtures"
INSPECT="${FIXTURES}/legacy-container-inspect.json"
SPECIFICATIONS="${FIXTURES}/legacy-container-specifications.json"
OBSERVED_AT="2026-07-29T00:00:00Z"
TMP=$(mktemp -d)
trap 'find "$TMP" -xdev -depth -delete' EXIT

INVENTORY="${TMP}/inventory.json"
BASE="${TMP}/preflight.json"
legacy_inventory_configuration_json "$INSPECT" >"$INVENTORY"
INVENTORY_FINGERPRINT=$(legacy_inventory_configuration_fingerprint "$INSPECT")

jq -S -n \
  --arg configurationFingerprint "$INVENTORY_FINGERPRINT" \
  --slurpfile inventory "$INVENTORY" \
  '{
    confirmedAction: "PREPARE_LEGACY_MIGRATION_V1",
    contractVersion: "1",
    createdAt: "2026-07-28T23:30:00Z",
    inventory: {
      configurationFingerprint: $configurationFingerprint,
      containerCount: 4,
      containers: $inventory[0],
      expectedImageId:
        "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      expectedListener: {host: "127.0.0.1", port: 41479},
      expectedRestartPolicy: "unless-stopped",
      expectedRuntimeUid: 2001
    },
    kind: "LEGACY_MIGRATION_PREFLIGHT",
    migrationPolicy: {
      adminSecurityContinuity: "NOT_APPLICABLE_PRE_ADMIN_SECURITY",
      copyOnMigrate: true,
      dormantSecretImport: "FORBIDDEN",
      immutableSourceRequired: true,
      mutableImageTagTrusted: false
    },
    secretsExposed: false,
    sources: {
      adminPepper: {
        path: "/srv/onlyway/secrets/admin/admin-source-key-pepper",
        status: "ABSENT"
      },
      adminSecurityState: {
        path: "/srv/onlyway/admin-state/admin-security.json",
        status: "ABSENT"
      },
      database: {
        observedSnapshotSha256:
          "1111111111111111111111111111111111111111111111111111111111111111",
        path: "/srv/onlyway/data/onlyway.sqlite",
        sqliteIntegrity: "ok",
        stat: {gid: 2001, mode: "600", uid: 2001},
        userVersion: 32
      },
      dormantSecret: {
        contentRead: false,
        importAllowed: false,
        mountedByLegacyContainer: false,
        path: "/srv/onlyway/secrets/openai-api-key",
        status: "PRESENT_NOT_MOUNTED_EXCLUDED"
      },
      legacyBootstrap: {
        accessUrlDisclosed: false,
        expectedOrigin: "http://127.0.0.1:41479",
        healthProbe: "AUTHENTICATED_OK",
        path: "/srv/onlyway/run/command-center-bootstrap.json",
        secretCopied: false,
        stat: {gid: 2001, mode: "600", uid: 2001},
        status: "OWNER_ONLY_VALID"
      },
      directories: [{
        path: "/srv/onlyway",
        sourceIdentity: "1:1",
        stat: {gid: 2001, mode: "750", uid: 0}
      }],
      runtimeConfig: {
        path: "/srv/onlyway/config/runtime-private.json",
        sha256:
          "2222222222222222222222222222222222222222222222222222222222222222",
        sourceIdentity: "1:2:0:2001:640:1:1:1",
        stat: {gid: 2001, mode: "640", size: 1, uid: 0},
        validated: {
          actorId: "fabio",
          contentAgentMode: "deterministic",
          modelProvider: "ABSENT",
          providerMode: "ABSENT",
          sqlitePath: "/data/onlyway.sqlite",
          workspaceId: "onlyway-private"
        }
      }
    },
    status: "READY_FOR_EXPLICIT_QUIESCE",
    validUntil: "2026-07-29T00:30:00Z"
  }' >"$BASE"

validate() {
  legacy_validate_install_preflight_contract \
    "$1" "$SPECIFICATIONS" "$OBSERVED_AT"
}

expect_rejection() {
  local label=$1
  local filter=$2
  local candidate="${TMP}/rejected-$3.json"
  jq "$filter" "$BASE" >"$candidate"
  if (validate "$candidate") >/dev/null 2>&1; then
    printf 'legacy install gate unexpectedly accepted: %s\n' "$label" >&2
    exit 1
  fi
}

validate "$BASE"
jq '
  .inventory.containers |= map(
    if .name == "onlyway-command-center" then
      .configuration.networkMode = "host" |
      .configuration.portBindings = []
    else . end
  )
' "$BASE" >"${TMP}/accepted-host-command-center.json"
validate "${TMP}/accepted-host-command-center.json"
expect_rejection \
  "non-command-center host network" \
  '.inventory.containers |= map(
    if .name == "onlyway-scheduler" then
      .configuration.networkMode = "host"
    else . end
  )' \
  "wrong-host-network-container"
expect_rejection \
  "receipt ID drift" \
  '.inventory.containers[0].id =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"' \
  "id-drift"
expect_rejection \
  "expired receipt" \
  '.validUntil = "2026-07-28T23:59:59Z"' \
  "expired"
expect_rejection \
  "future-dated receipt" \
  '.createdAt = "2026-07-29T00:00:01Z"' \
  "future"
expect_rejection \
  "validity window longer than one hour" \
  '.createdAt = "2026-07-28T23:00:00Z" |
    .validUntil = "2026-07-29T00:30:00Z"' \
  "unbounded-validity"
expect_rejection \
  "mutable image identity" \
  '.inventory.expectedImageId = "onlyway/mv-ai-os:1982d7f"' \
  "mutable-image"
expect_rejection \
  "fifth container" \
  '.inventory.containers += [.inventory.containers[0]] |
    .inventory.containerCount = 5' \
  "fifth-container"
expect_rejection \
  "dormant secret import allowed" \
  '.sources.dormantSecret.importAllowed = true' \
  "secret-import"
expect_rejection \
  "unexpected receipt field" \
  '.operatorNote = "not signed by the contract"' \
  "extra-field"

printf '%s\n' "legacy install gate contract fixtures: PASS"
