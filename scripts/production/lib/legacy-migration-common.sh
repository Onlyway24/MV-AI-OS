#!/usr/bin/env bash

# Shared, standalone primitives for the one-time Docker legacy migration.
# This library intentionally does not source common.sh: the legacy preflight must
# be usable before the new host layout has been adopted.

set -Eeuo pipefail

legacy_log() {
  printf '[onlyway-legacy] %s\n' "$*" >&2
}

legacy_die() {
  legacy_log "ERROR: $*"
  exit 1
}

legacy_require_root() {
  [[ ${EUID} -eq 0 ]] \
    || legacy_die "this command must run through sudo/root"
}

legacy_require_command() {
  command -v "$1" >/dev/null 2>&1 \
    || legacy_die "required command unavailable: $1"
}

legacy_require_integer() {
  local value=$1
  local label=$2
  [[ $value =~ ^[0-9]+$ ]] || legacy_die "${label} must be an integer"
}

legacy_require_positive_integer() {
  local value=$1
  local label=$2
  [[ $value =~ ^[1-9][0-9]*$ ]] \
    || legacy_die "${label} must be a positive integer"
}

legacy_require_sha256() {
  local value=$1
  local label=$2
  [[ $value =~ ^[0-9a-f]{64}$ ]] \
    || legacy_die "${label} must be a lowercase SHA-256 fingerprint"
}

legacy_require_image_id() {
  local value=$1
  [[ $value =~ ^sha256:[0-9a-f]{64}$ ]] \
    || legacy_die "expected image ID must be an immutable sha256: digest"
}

legacy_require_safe_name() {
  local value=$1
  local label=$2
  [[ $value =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] \
    || legacy_die "${label} is invalid"
}

legacy_require_absolute_safe_path() {
  local value=$1
  local label=$2
  [[ $value =~ ^/[A-Za-z0-9._/-]+$ && $value != *"//"* \
    && $value != *"/../"* && $value != */.. && $value != *"/./"* \
    && $value != */. ]] \
    || legacy_die "${label} must be a canonical absolute path"
}

legacy_require_canonical_existing_file() {
  local path=$1
  local label=$2
  legacy_require_absolute_safe_path "$path" "$label"
  [[ -f $path && ! -L $path ]] \
    || legacy_die "${label} must be a regular non-symlink file"
  [[ $(readlink -f -- "$path") == "$path" ]] \
    || legacy_die "${label} path traverses a symlink or is not canonical"
}

legacy_require_canonical_directory() {
  local path=$1
  local label=$2
  legacy_require_absolute_safe_path "$path" "$label"
  [[ -d $path && ! -L $path ]] \
    || legacy_die "${label} must be a non-symlink directory"
  [[ $(readlink -f -- "$path") == "$path" ]] \
    || legacy_die "${label} path traverses a symlink or is not canonical"
}

legacy_require_absent_path() {
  local path=$1
  local label=$2
  local parent
  legacy_require_absolute_safe_path "$path" "$label"
  [[ ! -e $path && ! -L $path ]] \
    || legacy_die "${label} must be absent"
  parent=$(dirname -- "$path")
  legacy_require_canonical_directory "$parent" "${label} parent"
  [[ $(readlink -m -- "$path") == "$path" ]] \
    || legacy_die "${label} path traverses a symlink or is not canonical"
}

legacy_assert_path_absent() {
  local path=$1
  local label=$2
  legacy_require_absolute_safe_path "$path" "$label"
  [[ ! -e $path && ! -L $path ]] \
    || legacy_die "${label} must be absent"
  [[ $(readlink -m -- "$path") == "$path" ]] \
    || legacy_die "${label} path traverses a symlink or is not canonical"
}

legacy_require_file_metadata() {
  local path=$1
  local expected_uid=$2
  local expected_gid=$3
  local expected_mode=$4
  local maximum_size=$5
  local label=$6
  local size
  legacy_require_canonical_existing_file "$path" "$label"
  legacy_require_integer "$expected_uid" "${label} UID"
  legacy_require_integer "$expected_gid" "${label} GID"
  [[ $expected_mode =~ ^[0-7]{3,4}$ ]] \
    || legacy_die "${label} mode is invalid"
  legacy_require_positive_integer "$maximum_size" "${label} maximum size"
  [[ $(stat -c '%u:%g' "$path") == "${expected_uid}:${expected_gid}" ]] \
    || legacy_die "${label} ownership is invalid"
  [[ $(stat -c '%a' "$path") == "$expected_mode" ]] \
    || legacy_die "${label} mode is invalid"
  size=$(stat -c '%s' "$path")
  [[ $size =~ ^[1-9][0-9]*$ && $size -le $maximum_size ]] \
    || legacy_die "${label} size is invalid"
}

legacy_file_identity() {
  local path=$1
  stat -c '%d:%i:%u:%g:%a:%s:%Y:%Z' "$path"
}

legacy_sha256_file() {
  local path=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  else
    shasum -a 256 "$path" | awk '{print $1}'
  fi
}

legacy_sha256_stdin() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

legacy_prepare_secure_directory() {
  local path=$1
  local gid=$2
  local mode=${3:-0750}
  local parent
  legacy_require_absolute_safe_path "$path" "secure directory"
  legacy_require_integer "$gid" "secure directory GID"
  [[ $mode == "0750" || $mode == "0700" ]] \
    || legacy_die "secure directory mode is invalid"
  if [[ ! -e $path && ! -L $path ]]; then
    parent=$(dirname -- "$path")
    legacy_require_canonical_directory "$parent" "secure directory parent"
    [[ $(stat -c '%u' "$parent") == "0" ]] \
      || legacy_die "secure directory parent must be root-owned"
    [[ $((8#$(stat -c '%a' "$parent") & 0022)) -eq 0 ]] \
      || legacy_die "secure directory parent is group/world writable"
    install -d -o root -g "$gid" -m "$mode" "$path"
  fi
  legacy_require_canonical_directory "$path" "secure directory"
  [[ $(stat -c '%u:%g' "$path") == "0:${gid}" \
    && $(stat -c '%a' "$path") == "${mode#0}" ]] \
    || legacy_die "secure directory ownership or mode is invalid"
}

legacy_acquire_lock() {
  local lock_path=$1
  local gid=$2
  local parent
  legacy_require_absolute_safe_path "$lock_path" "migration lock"
  parent=$(dirname -- "$lock_path")
  legacy_prepare_secure_directory "$parent" "$gid" 0750
  exec {LEGACY_MIGRATION_LOCK_FD}>"$lock_path"
  chown root:"$gid" "$lock_path"
  chmod 0640 "$lock_path"
  flock -n "$LEGACY_MIGRATION_LOCK_FD" \
    || legacy_die "another production mutation is active"
}

legacy_write_container_specs() {
  local target=$1
  shift
  local specification
  local name
  local id
  local temporary
  local -A names=()
  local -A ids=()
  [[ $# -eq 4 ]] \
    || legacy_die "exactly four --container NAME=FULL_ID values are required"
  temporary=$(mktemp "$(dirname -- "$target")/.legacy-container-specs.XXXXXX")
  printf '[]\n' >"$temporary"
  for specification in "$@"; do
    [[ $specification =~ ^([A-Za-z0-9][A-Za-z0-9_.-]{0,127})=([0-9a-f]{64})$ ]] \
      || legacy_die "container specification must be NAME=64_CHAR_LOWERCASE_ID"
    name=${BASH_REMATCH[1]}
    id=${BASH_REMATCH[2]}
    [[ -z ${names[$name]+present} ]] \
      || legacy_die "container names must be unique"
    [[ -z ${ids[$id]+present} ]] \
      || legacy_die "container IDs must be unique"
    names[$name]=1
    ids[$id]=1
    jq --arg id "$id" --arg name "$name" \
      '. + [{id: $id, name: $name}] | sort_by(.name)' \
      "$temporary" >"${temporary}.next"
    mv -fT -- "${temporary}.next" "$temporary"
  done
  mv -fT -- "$temporary" "$target"
}

legacy_capture_exact_inventory() {
  local target=$1
  local specifications=$2
  local listed
  local expected
  local -a ids
  mapfile -t ids < <(jq -er '.[].id' "$specifications")
  [[ ${#ids[@]} -eq 4 ]] || legacy_die "container specification is incomplete"
  listed=$(docker ps --all --no-trunc --quiet | sort)
  expected=$(printf '%s\n' "${ids[@]}" | sort)
  [[ $listed == "$expected" ]] \
    || legacy_die "Docker inventory is not exactly the four approved legacy IDs"
  docker inspect "${ids[@]}" >"$target"
  [[ -s $target ]] || legacy_die "Docker inspect returned no legacy inventory"
}

legacy_capture_selected_containers() {
  local target=$1
  local specifications=$2
  local -a ids
  mapfile -t ids < <(jq -er '.[].id' "$specifications")
  [[ ${#ids[@]} -eq 4 ]] || legacy_die "container specification is incomplete"
  docker inspect "${ids[@]}" >"$target"
  [[ -s $target ]] || legacy_die "Docker inspect returned no legacy inventory"
}

legacy_validate_inventory_file() {
  local inspect_file=$1
  local specifications=$2
  local expected_image_id=$3
  local expected_uid=$4
  local expected_restart_policy=$5
  local expected_host=$6
  local expected_port=$7
  local database=$8
  local runtime_config=$9
  local excluded_secret=${10}
  jq -e \
    --arg database "$database" \
    --arg excludedSecret "$excluded_secret" \
    --arg expectedHost "$expected_host" \
    --arg expectedImageId "$expected_image_id" \
    --arg expectedPort "$expected_port" \
    --arg expectedRestartPolicy "$expected_restart_policy" \
    --arg expectedUid "$expected_uid" \
    --arg runtimeConfig "$runtime_config" \
    --slurpfile expected "$specifications" \
    '
      def covered_by_bind($path):
        any(.[] | .Mounts[]?;
          . as $mount |
          $mount.Type == "bind" and
          ($mount.Source == $path or
            ($path | startswith($mount.Source + "/")))
        );
      def port_bindings:
        [
          .[] as $container
          | ($container.HostConfig.PortBindings // {})
          | to_entries[]
          | .key as $containerPort
          | .value[]?
          | {
              containerId: $container.Id,
              containerPort: $containerPort,
              hostIp: .HostIp,
              hostPort: .HostPort
            }
        ];
      length == 4 and
      ([.[].Id] | length == (unique | length)) and
      ([.[].Name] | length == (unique | length)) and
      ([.[] | {id: .Id, name: (.Name | ltrimstr("/"))}] | sort_by(.name))
        == ($expected[0] | sort_by(.name)) and
      all(.[];
        (.Id | test("^[0-9a-f]{64}$")) and
        .Image == $expectedImageId and
        .State.Running == true and
        ((.Config.User // "") | split(":")[0]) == $expectedUid and
        .HostConfig.RestartPolicy.Name == $expectedRestartPolicy and
        .HostConfig.NetworkMode != "host" and
        ([((.Config.Labels // {}) | keys[]) |
          select(startswith("com.docker.compose."))] | length == 0) and
        all(.Mounts[]?;
          (.Type == "bind" or .Type == "volume") and
          (.Source | type == "string" and startswith("/")) and
          (.Destination | type == "string" and startswith("/"))
        )
      ) and
      (port_bindings | length == 1) and
      (port_bindings[0].hostIp == $expectedHost) and
      (port_bindings[0].hostPort == $expectedPort) and
      covered_by_bind($database) and
      covered_by_bind($runtimeConfig) and
      (covered_by_bind($excludedSecret) | not)
    ' "$inspect_file" >/dev/null \
    || legacy_die "legacy container identity, mount, label, UID, policy or listener contract failed"
}

legacy_assert_host_path_not_mounted() {
  local inspect_file=$1
  local host_path=$2
  legacy_require_absolute_safe_path "$host_path" "excluded host path"
  jq -e \
    --arg hostPath "$host_path" \
    '
      all(.[].Mounts[]?;
        . as $mount |
        $mount.Source != $hostPath and
        ($hostPath | startswith($mount.Source + "/") | not)
      )
    ' "$inspect_file" >/dev/null \
    || legacy_die "excluded host path is mounted by a legacy container"
}

legacy_inventory_configuration_json() {
  local inspect_file=$1
  jq -S '
    [
      .[] |
      {
        configuration: {
          imageId: .Image,
          mounts: ([.Mounts[]? | {
            destination: .Destination,
            readWrite: .RW,
            source: .Source,
            type: .Type
          }] | sort_by(.destination, .source)),
          networkMode: .HostConfig.NetworkMode,
          networkNames: ([((.NetworkSettings.Networks // {}) | keys[])] | sort),
          portBindings: ((.HostConfig.PortBindings // {}) | to_entries |
            map({
              containerPort: .key,
              hostBindings: ((.value // []) |
                map({hostIp: .HostIp, hostPort: .HostPort}) |
                sort_by(.hostIp, .hostPort))
            }) | sort_by(.containerPort)),
          restartPolicy: .HostConfig.RestartPolicy.Name,
          user: .Config.User
        },
        id: .Id,
        name: (.Name | ltrimstr("/"))
      }
    ] | sort_by(.name)
  ' "$inspect_file"
}

legacy_inventory_configuration_fingerprint() {
  local inspect_file=$1
  legacy_inventory_configuration_json "$inspect_file" \
    | legacy_sha256_stdin
}

legacy_assert_configuration_fingerprint() {
  local inspect_file=$1
  local expected=$2
  local actual
  legacy_require_sha256 "$expected" "legacy configuration fingerprint"
  actual=$(legacy_inventory_configuration_fingerprint "$inspect_file")
  [[ $actual == "$expected" ]] \
    || legacy_die "legacy container configuration changed after preflight"
}

legacy_assert_configuration_fingerprint_with_policy() {
  local inspect_file=$1
  local expected=$2
  local normalized_policy=$3
  local actual
  legacy_require_sha256 "$expected" "legacy configuration fingerprint"
  actual=$(
    legacy_inventory_configuration_json "$inspect_file" \
      | jq -S --arg policy "$normalized_policy" \
        'map(.configuration.restartPolicy = $policy)' \
      | legacy_sha256_stdin
  )
  [[ $actual == "$expected" ]] \
    || legacy_die "legacy container configuration changed outside the controlled restart policy"
}

legacy_assert_container_state() {
  local inspect_file=$1
  local running=$2
  local restart_policy=$3
  [[ $running == "true" || $running == "false" ]] \
    || legacy_die "container running state contract is invalid"
  jq -e \
    --argjson running "$running" \
    --arg restartPolicy "$restart_policy" \
    'length == 4 and all(.[];
      .State.Running == $running and
      .HostConfig.RestartPolicy.Name == $restartPolicy
    )' "$inspect_file" >/dev/null \
    || legacy_die "legacy container runtime state is invalid"
}

legacy_validate_runtime_config() {
  local path=$1
  local actor_id=$2
  local workspace_id=$3
  local content_agent_mode=$4
  local sqlite_path=$5
  jq -e \
    --arg actorId "$actor_id" \
    --arg contentAgentMode "$content_agent_mode" \
    --arg sqlitePath "$sqlite_path" \
    --arg workspaceId "$workspace_id" \
    '
      type == "object" and
      .contractVersion == "1" and
      .actorId == $actorId and
      .workspaceId == $workspaceId and
      .contentAgentMode == $contentAgentMode and
      .sqlite.path == $sqlitePath and
      (has("providerMode") | not) and
      (has("modelProvider") | not)
    ' "$path" >/dev/null \
    || legacy_die "legacy runtime configuration contract is invalid"
}

legacy_validate_legacy_bootstrap() {
  local path=$1
  local expected_origin=$2
  jq -e \
    --arg expectedOrigin "$expected_origin" \
    '
      (keys == ["accessUrl", "contractVersion", "createdAt", "pid"]) and
      .contractVersion == "1" and
      (.createdAt | type == "string" and
        test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z$")) and
      (.pid | type == "number" and floor == . and . >= 1) and
      (.accessUrl | type == "string" and length <= 4096) and
      (.accessUrl | startswith($expectedOrigin + "/")) and
      (.accessUrl |
        test("[?&]access_token=[A-Za-z0-9._~-]{16,1024}([&#]|$)"))
    ' "$path" >/dev/null \
    || legacy_die "legacy bootstrap channel contract is invalid"
}

legacy_probe_legacy_bootstrap() {
  local path=$1
  local expected_origin=$2
  local access_url
  legacy_validate_legacy_bootstrap "$path" "$expected_origin"
  access_url=$(jq -er '.accessUrl' "$path")
  curl --silent --fail --location --max-redirs 3 --max-time 10 \
    --output /dev/null "$access_url" 2>/dev/null \
    || legacy_die "authenticated legacy Command Center probe failed"
  unset access_url
}

legacy_wait_for_legacy_bootstrap() {
  local path=$1
  local expected_origin=$2
  local attempts=$3
  local interval=$4
  local attempt
  legacy_require_positive_integer "$attempts" "bootstrap probe attempts"
  legacy_require_positive_integer "$interval" "bootstrap probe interval"
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if [[ -f $path && ! -L $path ]] \
      && (
        legacy_validate_legacy_bootstrap "$path" "$expected_origin"
        legacy_probe_legacy_bootstrap "$path" "$expected_origin"
      ) >/dev/null 2>&1; then
      return 0
    fi
    sleep "$interval"
  done
  legacy_die "legacy Command Center did not recover its owner-only bootstrap channel"
}

legacy_assert_listener_closed() {
  local expected_host=$1
  local expected_port=$2
  local listeners
  listeners=$(ss -H -ltn "sport = :${expected_port}" 2>/dev/null || true)
  [[ -z $listeners ]] \
    || legacy_die "listener ${expected_host}:${expected_port} must be closed"
}

legacy_assert_listener_open() {
  local expected_host=$1
  local expected_port=$2
  local -a addresses
  mapfile -t addresses < <(
    ss -H -ltn "sport = :${expected_port}" 2>/dev/null \
      | awk '{print $4}'
  )
  [[ ${#addresses[@]} -eq 1 \
    && ${addresses[0]} == "${expected_host}:${expected_port}" ]] \
    || legacy_die "expected loopback listener is unavailable or over-exposed"
}

legacy_sqlite_integrity_and_version() {
  local database=$1
  local expected_version=$2
  local integrity
  local version
  integrity=$(sqlite3 -readonly "$database" 'PRAGMA integrity_check;' 2>/dev/null) \
    || legacy_die "SQLite integrity probe failed"
  [[ $integrity == "ok" ]] || legacy_die "SQLite integrity check failed"
  version=$(sqlite3 -readonly "$database" 'PRAGMA user_version;' 2>/dev/null) \
    || legacy_die "SQLite schema probe failed"
  [[ $version == "$expected_version" ]] \
    || legacy_die "SQLite schema version does not match the approved legacy version"
}

legacy_create_sqlite_copy() {
  local source=$1
  local target=$2
  local expected_version=$3
  local temporary
  legacy_require_absent_path "$target" "SQLite migration copy"
  temporary=$(mktemp "$(dirname -- "$target")/.legacy-sqlite-copy.XXXXXX")
  chmod 0600 "$temporary"
  unlink "$temporary"
  sqlite3 -readonly "$source" ".backup '${temporary}'" 2>/dev/null \
    || legacy_die "coherent SQLite backup failed"
  [[ -f $temporary && ! -L $temporary ]] \
    || legacy_die "coherent SQLite backup was not created"
  chmod 0600 "$temporary"
  legacy_sqlite_integrity_and_version "$temporary" "$expected_version"
  mv -T -- "$temporary" "$target"
  sync -f "$(dirname -- "$target")"
}

legacy_copy_regular_file_nofollow() {
  local source=$1
  local target=$2
  local temporary
  legacy_require_absent_path "$target" "migration copy"
  temporary=$(mktemp "$(dirname -- "$target")/.legacy-file-copy.XXXXXX")
  chmod 0600 "$temporary"
  dd if="$source" of="$temporary" iflag=nofollow,fullblock status=none
  chmod 0600 "$temporary"
  mv -T -- "$temporary" "$target"
  sync -f "$(dirname -- "$target")"
}

legacy_restore_regular_file_exact() {
  local source=$1
  local target=$2
  local expected_sha=$3
  local uid=$4
  local gid=$5
  local mode=$6
  local temporary
  legacy_require_canonical_existing_file "$source" "forensic restore source"
  legacy_require_canonical_existing_file "$target" "forensic restore target"
  legacy_require_sha256 "$expected_sha" "forensic restore fingerprint"
  [[ $(legacy_sha256_file "$source") == "$expected_sha" ]] \
    || legacy_die "forensic restore source fingerprint is invalid"
  temporary=$(mktemp "$(dirname -- "$target")/.legacy-forensic-restore.XXXXXX")
  chmod 0600 "$temporary"
  dd if="$source" of="$temporary" iflag=nofollow,fullblock status=none
  [[ $(legacy_sha256_file "$temporary") == "$expected_sha" ]] \
    || legacy_die "forensic restore staging fingerprint is invalid"
  chown "$uid:$gid" "$temporary"
  chmod "$mode" "$temporary"
  mv -fT -- "$temporary" "$target"
  sync -f "$(dirname -- "$target")"
  [[ $(legacy_sha256_file "$target") == "$expected_sha" \
    && $(stat -c '%u:%g' "$target") == "${uid}:${gid}" \
    && $(stat -c '%a' "$target") == "$mode" ]] \
    || legacy_die "forensic restore publication failed"
}

legacy_file_observation_json() {
  local path=$1
  local fingerprint
  local identity_before
  local identity_after
  identity_before=$(legacy_file_identity "$path")
  fingerprint=$(legacy_sha256_file "$path")
  identity_after=$(legacy_file_identity "$path")
  [[ $identity_before == "$identity_after" ]] \
    || legacy_die "file changed while it was fingerprinted"
  jq -S -n \
    --arg fingerprint "$fingerprint" \
    --arg gid "$(stat -c '%g' "$path")" \
    --arg identity "$identity_after" \
    --arg mode "$(stat -c '%a' "$path")" \
    --arg path "$path" \
    --arg size "$(stat -c '%s' "$path")" \
    --arg uid "$(stat -c '%u' "$path")" \
    '{
      path: $path,
      sha256: $fingerprint,
      sourceIdentity: $identity,
      stat: {
        gid: ($gid | tonumber),
        mode: $mode,
        size: ($size | tonumber),
        uid: ($uid | tonumber)
      }
    }'
}

legacy_verify_file_observation() {
  local observation=$1
  local path
  local expected_sha
  local expected_stat
  path=$(jq -er '.path' "$observation")
  expected_sha=$(jq -er '.sha256' "$observation")
  expected_stat=$(jq -er \
    '(.stat.uid | tostring) + ":" + (.stat.gid | tostring) + ":" +
      .stat.mode + ":" + (.stat.size | tostring)' \
    "$observation")
  legacy_require_canonical_existing_file "$path" "retained migration artifact"
  legacy_require_sha256 "$expected_sha" "retained migration fingerprint"
  [[ $(legacy_sha256_file "$path") == "$expected_sha" \
    && $(stat -c '%u:%g:%a:%s' "$path") == "$expected_stat" ]] \
    || legacy_die "retained migration artifact content or metadata changed"
}

legacy_directory_observation_json() {
  local path=$1
  legacy_require_canonical_directory "$path" "legacy source directory"
  jq -S -n \
    --arg gid "$(stat -c '%g' "$path")" \
    --arg identity "$(stat -c '%d:%i' "$path")" \
    --arg mode "$(stat -c '%a' "$path")" \
    --arg path "$path" \
    --arg uid "$(stat -c '%u' "$path")" \
    '{
      path: $path,
      sourceIdentity: $identity,
      stat: {
        gid: ($gid | tonumber),
        mode: $mode,
        uid: ($uid | tonumber)
      }
    }'
}

legacy_restore_directory_metadata() {
  local observations=$1
  local path
  local uid
  local gid
  local mode
  local identity
  local index
  local length
  length=$(jq -er 'length' "$observations")
  [[ $length =~ ^[1-9][0-9]*$ && $length -le 16 ]] \
    || legacy_die "legacy directory metadata receipt is invalid"
  for ((index = 0; index < length; index += 1)); do
    path=$(jq -er --argjson index "$index" '.[$index].path' "$observations")
    uid=$(jq -er --argjson index "$index" '.[$index].stat.uid' "$observations")
    gid=$(jq -er --argjson index "$index" '.[$index].stat.gid' "$observations")
    mode=$(jq -er --argjson index "$index" '.[$index].stat.mode' "$observations")
    identity=$(jq -er \
      --argjson index "$index" '.[$index].sourceIdentity' "$observations")
    legacy_require_canonical_directory "$path" "legacy source directory"
    [[ $(stat -c '%d:%i' "$path") == "$identity" ]] \
      || legacy_die "legacy source directory identity changed"
    legacy_require_integer "$uid" "legacy directory UID"
    legacy_require_integer "$gid" "legacy directory GID"
    [[ $mode =~ ^[0-7]{3,4}$ ]] \
      || legacy_die "legacy directory mode is invalid"
    chown "$uid:$gid" "$path"
    chmod "$mode" "$path"
  done
}

legacy_verify_directory_metadata() {
  local observations=$1
  local path
  local expected
  local index
  local length
  length=$(jq -er 'length' "$observations")
  [[ $length =~ ^[1-9][0-9]*$ && $length -le 16 ]] \
    || legacy_die "legacy directory metadata receipt is invalid"
  for ((index = 0; index < length; index += 1)); do
    path=$(jq -er --argjson index "$index" '.[$index].path' "$observations")
    expected=$(jq -er --argjson index "$index" \
      '.[$index] |
        (.sourceIdentity + ":" + (.stat.uid | tostring) + ":" +
          (.stat.gid | tostring) + ":" + .stat.mode)' \
      "$observations")
    legacy_require_canonical_directory "$path" "legacy source directory"
    [[ "$(stat -c '%d:%i:%u:%g:%a' "$path")" == "$expected" ]] \
      || legacy_die "legacy source directory metadata changed"
  done
}

legacy_verify_directory_identities() {
  local observations=$1
  local path
  local identity
  local index
  local length
  length=$(jq -er 'length' "$observations")
  [[ $length =~ ^[1-9][0-9]*$ && $length -le 16 ]] \
    || legacy_die "legacy directory identity receipt is invalid"
  for ((index = 0; index < length; index += 1)); do
    path=$(jq -er --argjson index "$index" '.[$index].path' "$observations")
    identity=$(jq -er \
      --argjson index "$index" '.[$index].sourceIdentity' "$observations")
    legacy_require_canonical_directory "$path" "retained legacy source directory"
    [[ $(stat -c '%d:%i' "$path") == "$identity" ]] \
      || legacy_die "retained legacy source directory identity changed"
  done
}

legacy_restore_file_metadata_from_observation() {
  local observation=$1
  local path
  local uid
  local gid
  local mode
  path=$(jq -er '.path' "$observation")
  uid=$(jq -er '.stat.uid' "$observation")
  gid=$(jq -er '.stat.gid' "$observation")
  mode=$(jq -er '.stat.mode' "$observation")
  legacy_require_canonical_existing_file "$path" "legacy retained source"
  legacy_require_integer "$uid" "legacy source UID"
  legacy_require_integer "$gid" "legacy source GID"
  [[ $mode =~ ^[0-7]{3,4}$ ]] \
    || legacy_die "legacy source mode is invalid"
  chown "$uid:$gid" "$path"
  chmod "$mode" "$path"
}

legacy_public_key_fingerprint() {
  local public_key=$1
  openssl pkey -pubin -in "$public_key" -outform DER 2>/dev/null \
    | legacy_sha256_stdin
}

legacy_require_existing_trust_anchor() {
  local private_key=$1
  local public_key=$2
  local scratch_dir=$3
  local challenge
  local signature
  legacy_require_file_metadata "$private_key" 0 0 600 16384 \
    "legacy receipt private key"
  legacy_require_canonical_existing_file "$public_key" \
    "legacy receipt public key"
  [[ $(stat -c '%u' "$public_key") == "0" ]] \
    || legacy_die "legacy receipt public key must be root-owned"
  [[ $(stat -c '%a' "$public_key") == "600" \
    || $(stat -c '%a' "$public_key") == "644" ]] \
    || legacy_die "legacy receipt public key mode is invalid"
  openssl pkey -pubin -in "$public_key" -noout 2>/dev/null \
    || legacy_die "legacy receipt public key is invalid"
  challenge=$(mktemp "${scratch_dir}/.legacy-trust-challenge.XXXXXX")
  signature=$(mktemp "${scratch_dir}/.legacy-trust-signature.XXXXXX")
  printf '%s\n' "onlyway-legacy-migration-trust-anchor-v1" >"$challenge"
  openssl pkeyutl -sign -rawin -inkey "$private_key" \
    -in "$challenge" -out "$signature" 2>/dev/null \
    || legacy_die "legacy receipt trust anchor could not sign"
  openssl pkeyutl -verify -rawin -pubin -inkey "$public_key" \
    -in "$challenge" -sigfile "$signature" >/dev/null 2>&1 \
    || legacy_die "legacy receipt trust anchor key pair does not match"
  unlink "$challenge"
  unlink -- "$signature"
}

legacy_publish_exclusive_file() (
  local source=$1
  local target=$2
  local uid=$3
  local gid=$4
  local mode=$5
  local target_fd=
  local target_fd_path=
  local target_identity=
  local created=false
  local published=false
  trap '
    if [[ -n ${target_fd:-} ]]; then
      exec {target_fd}>&-
    fi
    if [[ ${created:-false} == "true" && ${published:-false} == "false" \
      && -n ${target_identity:-} && -f $target && ! -L $target \
      && $(stat -c "%d:%i" "$target") == "$target_identity" ]]; then
      unlink "$target" 2>/dev/null || true
    fi
  ' EXIT
  legacy_require_absent_path "$target" "signed artifact target"
  set -o noclobber
  if ! exec {target_fd}>"$target"; then
    set +o noclobber
    legacy_die "signed artifact target was created concurrently"
  fi
  set +o noclobber
  target_fd_path="/proc/${BASHPID}/fd/${target_fd}"
  target_identity=$(stat -Lc '%d:%i' "$target_fd_path")
  created=true
  dd if="$source" of="$target_fd_path" iflag=nofollow,fullblock status=none
  chown --dereference "$uid:$gid" "$target_fd_path"
  chmod "$mode" "$target_fd_path"
  sync -f "$target_fd_path"
  [[ $(stat -c '%d:%i' "$target") == "$target_identity" ]] \
    || legacy_die "signed artifact identity changed during publication"
  exec {target_fd}>&-
  target_fd=
  published=true
)

legacy_publish_signed_json() (
  local source=$1
  local target=$2
  local private_key=$3
  local public_key=$4
  local gid=$5
  local signature_target="${target}.sig"
  local parent
  local raw_signature=
  local signature_document=
  local receipt_sha
  local public_key_sha
  local created_receipt=false
  local created_signature=false
  local complete=false
  trap '
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
    [[ -z ${signature_document:-} || ! -e $signature_document ]] \
      || unlink "$signature_document"
    if [[ ${created_signature:-false} == "true" \
      && ${complete:-false} == "false" \
      && -f $signature_target && ! -L $signature_target ]]; then
      unlink "$signature_target" 2>/dev/null || true
    fi
    if [[ ${created_receipt:-false} == "true" \
      && ${complete:-false} == "false" \
      && -f $target && ! -L $target ]]; then
      unlink "$target" 2>/dev/null || true
    fi
  ' EXIT
  legacy_require_canonical_existing_file "$source" "signed JSON source"
  jq -e 'type == "object"' "$source" >/dev/null \
    || legacy_die "signed JSON source is invalid"
  parent=$(dirname -- "$target")
  legacy_require_canonical_directory "$parent" "signed JSON directory"
  legacy_require_existing_trust_anchor "$private_key" "$public_key" "$parent"
  legacy_require_absent_path "$target" "signed JSON receipt"
  legacy_require_absent_path "$signature_target" "signed JSON signature"
  receipt_sha=$(legacy_sha256_file "$source")
  public_key_sha=$(legacy_public_key_fingerprint "$public_key")
  raw_signature=$(mktemp "${parent}/.legacy-signature-raw.XXXXXX")
  signature_document=$(mktemp "${parent}/.legacy-signature-document.XXXXXX")
  openssl pkeyutl -sign -rawin -inkey "$private_key" \
    -in "$source" -out "$raw_signature" 2>/dev/null \
    || legacy_die "legacy receipt signing failed"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || legacy_die "legacy receipt signature is not Ed25519"
  openssl pkeyutl -verify -rawin -pubin -inkey "$public_key" \
    -in "$source" -sigfile "$raw_signature" >/dev/null 2>&1 \
    || legacy_die "legacy receipt signature self-verification failed"
  jq -S -n \
    --arg publicKeySha256 "$public_key_sha" \
    --arg receiptFile "$(basename -- "$target")" \
    --arg receiptSha256 "$receipt_sha" \
    --arg signature "$(openssl base64 -A -in "$raw_signature")" \
    '{
      contractVersion: "1",
      kind: "LEGACY_MIGRATION_RECEIPT_SIGNATURE",
      publicKeySha256: $publicKeySha256,
      receiptFile: $receiptFile,
      receiptSha256: $receiptSha256,
      signature: $signature,
      signatureAlgorithm: "ED25519"
    }' >"$signature_document"
  legacy_publish_exclusive_file "$source" "$target" 0 "$gid" 0640
  created_receipt=true
  legacy_publish_exclusive_file \
    "$signature_document" "$signature_target" 0 "$gid" 0640
  created_signature=true
  legacy_verify_signed_json "$target" "$signature_target" "$public_key" "$gid" \
    >/dev/null
  sync -f "$parent"
  unlink "$raw_signature"
  unlink -- "$signature_document"
  raw_signature=
  signature_document=
  complete=true
  printf '%s\n' "$target"
)

legacy_verify_signed_json() (
  local receipt=$1
  local signature_path=$2
  local public_key=$3
  local gid=$4
  local receipt_identity
  local signature_identity
  local public_key_identity
  local receipt_sha
  local public_key_sha
  local raw_signature=
  trap '
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
  ' EXIT
  legacy_require_canonical_existing_file "$receipt" "signed legacy receipt"
  legacy_require_canonical_existing_file "$signature_path" \
    "signed legacy receipt signature"
  legacy_require_canonical_existing_file "$public_key" \
    "legacy receipt public key"
  [[ $(stat -c '%u:%g' "$receipt") == "0:${gid}" \
    && $(stat -c '%a' "$receipt") == "640" \
    && $(stat -c '%s' "$receipt") -ge 1 \
    && $(stat -c '%s' "$receipt") -le $((1024 * 1024)) ]] \
    || legacy_die "signed legacy receipt ownership, mode or size is invalid"
  [[ $(stat -c '%u:%g' "$signature_path") == "0:${gid}" \
    && $(stat -c '%a' "$signature_path") == "640" \
    && $(stat -c '%s' "$signature_path") -ge 1 \
    && $(stat -c '%s' "$signature_path") -le 16384 ]] \
    || legacy_die "legacy receipt signature ownership, mode or size is invalid"
  [[ $(stat -c '%u' "$public_key") == "0" \
    && ( $(stat -c '%a' "$public_key") == "600" \
      || $(stat -c '%a' "$public_key") == "644" ) ]] \
    || legacy_die "legacy receipt public key permissions are invalid"
  receipt_identity=$(legacy_file_identity "$receipt")
  signature_identity=$(legacy_file_identity "$signature_path")
  public_key_identity=$(legacy_file_identity "$public_key")
  receipt_sha=$(legacy_sha256_file "$receipt")
  public_key_sha=$(legacy_public_key_fingerprint "$public_key")
  jq -e \
    --arg publicKeySha256 "$public_key_sha" \
    --arg receiptFile "$(basename -- "$receipt")" \
    --arg receiptSha256 "$receipt_sha" \
    '
      (keys == [
        "contractVersion", "kind", "publicKeySha256", "receiptFile",
        "receiptSha256", "signature", "signatureAlgorithm"
      ]) and
      .contractVersion == "1" and
      .kind == "LEGACY_MIGRATION_RECEIPT_SIGNATURE" and
      .publicKeySha256 == $publicKeySha256 and
      .receiptFile == $receiptFile and
      .receiptSha256 == $receiptSha256 and
      .signatureAlgorithm == "ED25519" and
      (.signature | type == "string" and length == 88)
    ' "$signature_path" >/dev/null \
    || legacy_die "legacy receipt signature contract is invalid"
  raw_signature=$(mktemp "$(dirname -- "$receipt")/.legacy-signature-verify.XXXXXX")
  jq -er '.signature' "$signature_path" \
    | openssl base64 -d -A -out "$raw_signature" 2>/dev/null \
    || legacy_die "legacy receipt signature encoding is invalid"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || legacy_die "legacy receipt signature length is invalid"
  openssl pkeyutl -verify -rawin -pubin -inkey "$public_key" \
    -in "$receipt" -sigfile "$raw_signature" >/dev/null 2>&1 \
    || legacy_die "legacy receipt signature is invalid"
  [[ $(legacy_file_identity "$receipt") == "$receipt_identity" \
    && $(legacy_file_identity "$signature_path") == "$signature_identity" \
    && $(legacy_file_identity "$public_key") == "$public_key_identity" \
    && $(legacy_sha256_file "$receipt") == "$receipt_sha" ]] \
    || legacy_die "legacy receipt verification inputs changed"
  unlink "$raw_signature"
  raw_signature=
  printf '%s\n' "$receipt_sha"
)

legacy_verify_release_acceptance() (
  local marker=$1
  local public_key=$2
  local gid=$3
  local expected_commit=$4
  local expected_image_id=$5
  local unsigned=
  local raw_signature=
  local fingerprint
  local marker_identity
  local key_identity
  trap '
    [[ -z ${unsigned:-} || ! -e $unsigned ]] || unlink "$unsigned"
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
  ' EXIT
  [[ $expected_commit =~ ^[0-9a-f]{40}$ ]] \
    || legacy_die "accepted release commit is invalid"
  legacy_require_image_id "$expected_image_id"
  legacy_require_canonical_existing_file "$marker" "release acceptance marker"
  legacy_require_canonical_existing_file "$public_key" \
    "release acceptance public key"
  [[ $(stat -c '%u:%g' "$marker") == "0:${gid}" \
    && $(stat -c '%a' "$marker") == "640" \
    && $(stat -c '%s' "$marker") -ge 1 \
    && $(stat -c '%s' "$marker") -le $((1024 * 1024)) ]] \
    || legacy_die "release acceptance marker permissions or size are invalid"
  marker_identity=$(legacy_file_identity "$marker")
  key_identity=$(legacy_file_identity "$public_key")
  jq -e \
    --arg commit "$expected_commit" \
    --arg imageId "$expected_image_id" \
    '
      .contractVersion == "1" and
      .kind == "RELEASE_ACCEPTANCE" and
      .status == "CANDIDATE_ACCEPTED" and
      .branch == "main" and
      .commit == $commit and
      .imageId == $imageId and
      .imageRevision == $commit and
      .candidateExternalEffects == false and
      .candidateNetworkIsolation == "INTERNAL_NO_EGRESS" and
      .candidateSecretProfile == "SYNTHETIC_ISOLATED" and
      .publicApplicationPorts == 0 and
      (.contentFingerprint | test("^[0-9a-f]{64}$")) and
      .signatureAlgorithm == "ED25519" and
      (.signature | type == "string" and length == 88)
    ' "$marker" >/dev/null \
    || legacy_die "release acceptance marker contract is invalid"
  unsigned=$(mktemp "$(dirname -- "$marker")/.legacy-acceptance-unsigned.XXXXXX")
  raw_signature=$(mktemp \
    "$(dirname -- "$marker")/.legacy-acceptance-signature.XXXXXX")
  jq -S 'del(.contentFingerprint, .signature, .signatureAlgorithm)' \
    "$marker" >"$unsigned"
  fingerprint=$(legacy_sha256_file "$unsigned")
  [[ $fingerprint == "$(jq -er '.contentFingerprint' "$marker")" ]] \
    || legacy_die "release acceptance content fingerprint is invalid"
  jq -er '.signature' "$marker" \
    | openssl base64 -d -A -out "$raw_signature" 2>/dev/null \
    || legacy_die "release acceptance signature encoding is invalid"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || legacy_die "release acceptance signature length is invalid"
  openssl pkeyutl -verify -rawin -pubin -inkey "$public_key" \
    -in "$unsigned" -sigfile "$raw_signature" >/dev/null 2>&1 \
    || legacy_die "release acceptance signature is invalid"
  [[ $(legacy_file_identity "$marker") == "$marker_identity" \
    && $(legacy_file_identity "$public_key") == "$key_identity" ]] \
    || legacy_die "release acceptance verification inputs changed"
  unlink "$unsigned"
  unlink -- "$raw_signature"
  unsigned=
  raw_signature=
  printf '%s\n' "$(legacy_sha256_file "$marker")"
)

legacy_verify_backup_bundle_manifest() (
  local manifest=$1
  local signature_path=$2
  local public_key=$3
  local service_gid=$4
  local artifact_uid=$5
  local artifact_gid=$6
  local expected_commit=$7
  local backup
  local admin_state
  local raw_signature=
  local manifest_sha
  local public_key_sha
  local unsigned_fingerprint
  local manifest_identity
  local signature_identity
  trap '
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
  ' EXIT
  legacy_require_canonical_existing_file "$manifest" "new-state backup manifest"
  legacy_require_canonical_existing_file \
    "$signature_path" "new-state backup signature"
  [[ $(stat -c '%u:%g' "$manifest") == "${artifact_uid}:${artifact_gid}" \
    && $(stat -c '%a' "$manifest") == "600" ]] \
    || legacy_die "new-state backup manifest permissions are invalid"
  [[ $(stat -c '%u:%g' "$signature_path") == "0:${service_gid}" \
    && $(stat -c '%a' "$signature_path") == "640" ]] \
    || legacy_die "new-state backup signature permissions are invalid"
  manifest_identity=$(legacy_file_identity "$manifest")
  signature_identity=$(legacy_file_identity "$signature_path")
  manifest_sha=$(legacy_sha256_file "$manifest")
  public_key_sha=$(legacy_public_key_fingerprint "$public_key")
  jq -e \
    --arg manifestFile "$(basename -- "$manifest")" \
    --arg manifestSha256 "$manifest_sha" \
    --arg publicKeySha256 "$public_key_sha" \
    '
      (keys == [
        "contractVersion", "kind", "manifestFile", "manifestSha256",
        "publicKeySha256", "signature", "signatureAlgorithm"
      ]) and
      .contractVersion == "1" and
      .kind == "BACKUP_MANIFEST_SIGNATURE" and
      .manifestFile == $manifestFile and
      .manifestSha256 == $manifestSha256 and
      .publicKeySha256 == $publicKeySha256 and
      .signatureAlgorithm == "ED25519" and
      (.signature | type == "string" and length == 88)
    ' "$signature_path" >/dev/null \
    || legacy_die "new-state backup signature contract is invalid"
  raw_signature=$(mktemp \
    "$(dirname -- "$manifest")/.legacy-backup-signature-verify.XXXXXX")
  jq -er '.signature' "$signature_path" \
    | openssl base64 -d -A -out "$raw_signature" 2>/dev/null \
    || legacy_die "new-state backup signature encoding is invalid"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || legacy_die "new-state backup signature length is invalid"
  openssl pkeyutl -verify -rawin -pubin -inkey "$public_key" \
    -in "$manifest" -sigfile "$raw_signature" >/dev/null 2>&1 \
    || legacy_die "new-state backup signature is invalid"
  jq -e \
    --arg commit "$expected_commit" \
    '
      .contractVersion == "1" and
      .releaseCommit == $commit and
      .integrityCheck == "ok" and
      .restoreProbe == "PASSED" and
      .encryptionState == "BACKUP_AT_REST_ENCRYPTION_REQUIRED" and
      .secretsIncluded == false and
      .rawBootstrapIncluded == false and
      (.sha256 | test("^[0-9a-f]{64}$")) and
      (.schemaVersion | type == "number" and floor == . and . >= 1) and
      (.sizeBytes | type == "number" and floor == . and . >= 1) and
      (.manifestFingerprint | test("^[0-9a-f]{64}$")) and
      .adminSecurityState.contractVersion == "1" and
      .adminSecurityState.stateVersion == 1 and
      (.adminSecurityState.sha256 | test("^[0-9a-f]{64}$"))
    ' "$manifest" >/dev/null \
    || legacy_die "new-state backup manifest policy is invalid"
  unsigned_fingerprint=$(
    jq -c 'del(.manifestFingerprint)' "$manifest" | legacy_sha256_stdin
  )
  [[ $unsigned_fingerprint == "$(jq -er '.manifestFingerprint' "$manifest")" ]] \
    || legacy_die "new-state backup manifest fingerprint is invalid"
  backup="$(dirname -- "$manifest")/$(jq -er '.backupFile' "$manifest")"
  admin_state="$(dirname -- "$manifest")/$(jq -er \
    '.adminSecurityState.file' "$manifest")"
  legacy_require_canonical_existing_file "$backup" "new-state database backup"
  legacy_require_canonical_existing_file \
    "$admin_state" "new-state Admin Security backup"
  [[ $(dirname -- "$backup") == "$(dirname -- "$manifest")" \
    && $(dirname -- "$admin_state") == "$(dirname -- "$manifest")" ]] \
    || legacy_die "new-state backup bundle escapes its manifest directory"
  [[ $(stat -c '%u:%g' "$backup") == "${artifact_uid}:${artifact_gid}" \
    && $(stat -c '%a' "$backup") == "600" \
    && $(stat -c '%u:%g' "$admin_state") == "${artifact_uid}:${artifact_gid}" \
    && $(stat -c '%a' "$admin_state") == "600" ]] \
    || legacy_die "new-state backup artifact permissions are invalid"
  [[ $(legacy_sha256_file "$backup") == "$(jq -er '.sha256' "$manifest")" \
    && $(stat -c '%s' "$backup") == "$(jq -er '.sizeBytes' "$manifest")" \
    && $(legacy_sha256_file "$admin_state") == \
      "$(jq -er '.adminSecurityState.sha256' "$manifest")" \
    && $(stat -c '%s' "$admin_state") == \
      "$(jq -er '.adminSecurityState.sizeBytes' "$manifest")" ]] \
    || legacy_die "new-state backup bundle fingerprint or size binding is invalid"
  legacy_sqlite_integrity_and_version \
    "$backup" "$(jq -er '.schemaVersion' "$manifest")"
  [[ $(legacy_file_identity "$manifest") == "$manifest_identity" \
    && $(legacy_file_identity "$signature_path") == "$signature_identity" \
    && $(legacy_sha256_file "$manifest") == "$manifest_sha" ]] \
    || legacy_die "new-state backup verification inputs changed"
  unlink "$raw_signature"
  raw_signature=
  printf '%s\n' "$manifest_sha"
)

legacy_future_timestamp() {
  local seconds=$1
  legacy_require_positive_integer "$seconds" "retention duration"
  jq -nr --argjson seconds "$seconds" 'now + $seconds | todateiso8601'
}

legacy_current_timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

legacy_assert_not_expired() {
  local timestamp=$1
  local label=$2
  local now
  [[ $timestamp =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
    || legacy_die "${label} timestamp is invalid"
  now=$(legacy_current_timestamp)
  [[ $now < $timestamp ]] || legacy_die "${label} has expired"
}

legacy_validate_install_preflight_contract() {
  local receipt=$1
  local specifications=$2
  local observed_at=$3
  [[ $observed_at =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
    || legacy_die "legacy install gate observation timestamp is invalid"
  jq -e \
    --arg observedAt "$observed_at" \
    --slurpfile expected "$specifications" \
    '
      try (
        . as $preflight |
        ($observedAt | fromdateiso8601) as $observedEpoch |
        (.createdAt | fromdateiso8601) as $createdEpoch |
        (.validUntil | fromdateiso8601) as $validUntilEpoch |
        (keys | sort) == ([
          "confirmedAction", "contractVersion", "createdAt", "inventory",
          "kind", "migrationPolicy", "secretsExposed", "sources", "status",
          "validUntil"
        ] | sort) and
        .contractVersion == "1" and
        .kind == "LEGACY_MIGRATION_PREFLIGHT" and
        .status == "READY_FOR_EXPLICIT_QUIESCE" and
        .confirmedAction == "PREPARE_LEGACY_MIGRATION_V1" and
        .secretsExposed == false and
        $createdEpoch <= $observedEpoch and
        $validUntilEpoch > $observedEpoch and
        ($validUntilEpoch - $createdEpoch) >= 1 and
        ($validUntilEpoch - $createdEpoch) <= 3600 and
        ($expected | length) == 1 and
        ($expected[0] | type == "array" and length == 4) and
        ($expected[0] | all(.[];
          (.id | type == "string" and test("^[0-9a-f]{64}$")) and
          (.name | type == "string" and
            test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$"))
        )) and
        ($expected[0] | [.[].id] | length == (unique | length)) and
        ($expected[0] | [.[].name] | length == (unique | length)) and
        .inventory.containerCount == 4 and
        (.inventory.configurationFingerprint |
          type == "string" and test("^[0-9a-f]{64}$")) and
        (.inventory.expectedImageId |
          type == "string" and test("^sha256:[0-9a-f]{64}$")) and
        .inventory.expectedRestartPolicy == "unless-stopped" and
        .inventory.expectedRuntimeUid == 2001 and
        .inventory.expectedListener.host == "127.0.0.1" and
        (.inventory.expectedListener.port |
          type == "number" and floor == . and . >= 1 and . <= 65535) and
        (.inventory.containers | type == "array" and length == 4) and
        ([.inventory.containers[] | {id, name}] | sort_by(.name)) ==
          ($expected[0] | sort_by(.name)) and
        ([.inventory.containers[].id] | length == (unique | length)) and
        ([.inventory.containers[].name] | length == (unique | length)) and
        all(.inventory.containers[];
          (.id | test("^[0-9a-f]{64}$")) and
          (.name | test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")) and
          .configuration.imageId == $preflight.inventory.expectedImageId and
          .configuration.restartPolicy == "unless-stopped" and
          (.configuration.user | split(":")[0]) == "2001" and
          .configuration.networkMode != "host"
        ) and
        .migrationPolicy.adminSecurityContinuity ==
          "NOT_APPLICABLE_PRE_ADMIN_SECURITY" and
        .migrationPolicy.copyOnMigrate == true and
        .migrationPolicy.dormantSecretImport == "FORBIDDEN" and
        .migrationPolicy.immutableSourceRequired == true and
        .migrationPolicy.mutableImageTagTrusted == false and
        .sources.adminSecurityState.status == "ABSENT" and
        .sources.adminPepper.status == "ABSENT" and
        (.sources.database.path |
          type == "string" and startswith("/")) and
        (.sources.database.observedSnapshotSha256 |
          type == "string" and test("^[0-9a-f]{64}$")) and
        .sources.database.sqliteIntegrity == "ok" and
        .sources.database.userVersion == 32 and
        .sources.database.stat.uid == 2001 and
        .sources.database.stat.mode == "600" and
        .sources.dormantSecret.status ==
          "PRESENT_NOT_MOUNTED_EXCLUDED" and
        .sources.dormantSecret.contentRead == false and
        .sources.dormantSecret.importAllowed == false and
        .sources.dormantSecret.mountedByLegacyContainer == false and
        (.sources.dormantSecret.path |
          type == "string" and startswith("/")) and
        .sources.legacyBootstrap.status == "OWNER_ONLY_VALID" and
        .sources.legacyBootstrap.healthProbe == "AUTHENTICATED_OK" and
        .sources.legacyBootstrap.accessUrlDisclosed == false and
        .sources.legacyBootstrap.secretCopied == false and
        .sources.legacyBootstrap.expectedOrigin ==
          ("http://" + $preflight.inventory.expectedListener.host + ":" +
            ($preflight.inventory.expectedListener.port | tostring)) and
        (.sources.legacyBootstrap.path |
          type == "string" and startswith("/")) and
        (.sources.directories |
          type == "array" and length >= 1 and length <= 16) and
        (.sources.runtimeConfig.path |
          type == "string" and startswith("/")) and
        .sources.runtimeConfig.validated.actorId == "fabio" and
        .sources.runtimeConfig.validated.workspaceId == "onlyway-private" and
        .sources.runtimeConfig.validated.contentAgentMode ==
          "deterministic" and
        .sources.runtimeConfig.validated.providerMode == "ABSENT" and
        .sources.runtimeConfig.validated.modelProvider == "ABSENT" and
        .sources.runtimeConfig.validated.sqlitePath ==
          "/data/onlyway.sqlite"
      ) catch false
    ' "$receipt" >/dev/null \
    || legacy_die "signed legacy preflight cannot authorize host installation"
}

legacy_validate_new_admin_bootstrap() {
  local path=$1
  local expected_origin=$2
  jq -e \
    --arg expectedOrigin "$expected_origin" \
    '
      (keys == [
        "accessUrl", "authentication", "bootstrapToken", "contractVersion",
        "createdAt", "expiresAt", "pid"
      ]) and
      .contractVersion == "1" and
      .authentication == "PASSKEY" and
      .accessUrl == ($expectedOrigin + "/admin-auth") and
      (.bootstrapToken | type == "string" and length >= 32 and length <= 4096) and
      (.createdAt | type == "string") and
      (.expiresAt | type == "string") and
      (.pid | type == "number" and floor == . and . >= 1)
    ' "$path" >/dev/null \
    || legacy_die "new owner-only Founder bootstrap contract is invalid"
}

legacy_validate_new_admin_state() {
  local path=$1
  jq -e '
    (keys == [
      "bootstrap", "challenges", "contractVersion", "credentials",
      "principals", "rateLimits", "revision", "securityEvents", "sessions",
      "stateVersion", "stepUpReceipts"
    ]) and
    .contractVersion == "1" and
    .stateVersion == 1 and
    (.revision | type == "number" and floor == . and . >= 1) and
    (.principals | type == "array") and
    (.credentials | type == "array") and
    (.challenges | type == "array") and
    (.sessions | type == "array") and
    (.stepUpReceipts | type == "array") and
    (.rateLimits | type == "array") and
    (.securityEvents | type == "array") and
    (.bootstrap | type == "object") and
    .bootstrap.consumedAt == null and
    (.bootstrap.tokenHash | test("^[0-9a-f]{64}$"))
  ' "$path" >/dev/null \
    || legacy_die "new Admin Security state does not contain a fresh Founder bootstrap"
}
