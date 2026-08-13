#!/usr/bin/env bash

# This library is sourced after production/lib/common.sh.

readonly ONLYWAY_CANDIDATE_RECOVERY_DIR="${ONLYWAY_CANDIDATE_RECOVERY_DIR:-${ONLYWAY_RUN_DIR}/candidate-recovery}"

candidate_recovery_expected_project() {
  local commit=$1
  require_commit "$commit"
  printf 'onlyway-candidate-%s\n' "${commit:0:12}"
}

candidate_recovery_expected_port() {
  local commit=$1
  require_commit "$commit"
  printf '%s\n' "$((44000 + (16#${commit:0:4} % 1000)))"
}

candidate_recovery_prepare_directory() {
  [[ -d $ONLYWAY_RUN_DIR && ! -L $ONLYWAY_RUN_DIR ]] \
    || die "candidate recovery requires a non-symlink run directory"
  if [[ ! -e $ONLYWAY_CANDIDATE_RECOVERY_DIR \
    && ! -L $ONLYWAY_CANDIDATE_RECOVERY_DIR ]]; then
    install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 \
      "$ONLYWAY_CANDIDATE_RECOVERY_DIR"
    sync -f "$ONLYWAY_RUN_DIR"
  fi
  [[ -d $ONLYWAY_CANDIDATE_RECOVERY_DIR \
    && ! -L $ONLYWAY_CANDIDATE_RECOVERY_DIR ]] \
    || die "candidate recovery directory is unsafe"
  [[ $(stat -c '%u:%a' "$ONLYWAY_CANDIDATE_RECOVERY_DIR") == "0:750" ]] \
    || die "candidate recovery directory permissions are invalid"
  [[ $(dirname -- "$ONLYWAY_CANDIDATE_RECOVERY_DIR") == "$ONLYWAY_RUN_DIR" ]] \
    || die "candidate recovery directory must be a direct child of the run directory"
}

candidate_recovery_state_path() {
  local commit=$1
  require_commit "$commit"
  printf '%s/%s.json\n' "$ONLYWAY_CANDIDATE_RECOVERY_DIR" "$commit"
}

candidate_recovery_validate_root_path() {
  local candidate_root=$1
  local commit=$2
  local candidate_basename
  require_absolute_path "$candidate_root" "candidate recovery root"
  require_commit "$commit"
  [[ $candidate_root != *[[:space:]]* ]] \
    || die "candidate recovery root must not contain whitespace"
  [[ $(dirname -- "$candidate_root") == "$ONLYWAY_RUN_DIR" ]] \
    || die "candidate recovery root must be a direct child of the run directory"
  candidate_basename=$(basename -- "$candidate_root")
  [[ $candidate_basename =~ ^candidate\.${commit:0:12}\.[A-Za-z0-9]{6}$ ]] \
    || die "candidate recovery root does not match its commit"
  if [[ -e $candidate_root || -L $candidate_root ]]; then
    [[ -d $candidate_root && ! -L $candidate_root ]] \
      || die "candidate recovery root is unsafe"
    [[ $(stat -c '%u' "$candidate_root") == "0" ]] \
      || die "candidate recovery root must remain root-owned"
    [[ $(readlink -f -- "$candidate_root") == "$candidate_root" ]] \
      || die "candidate recovery root is not canonical"
  fi
}

candidate_recovery_validate_source_path() {
  local source_root=$1
  local commit=$2
  local source_basename
  require_absolute_path "$source_root" "candidate source root"
  require_commit "$commit"
  [[ $source_root != *[[:space:]]* ]] \
    || die "candidate source root must not contain whitespace"
  [[ $(dirname -- "$source_root") == "$ONLYWAY_RELEASES_DIR" ]] \
    || die "candidate source root must stay under the release directory"
  source_basename=$(basename -- "$source_root")
  [[ $source_basename == "$commit" \
    || $source_basename =~ ^\.staging\.${commit}\.[A-Za-z0-9]{6}$ ]] \
    || die "candidate source root does not match its commit"
  if [[ -e $source_root || -L $source_root ]]; then
    [[ -d $source_root && ! -L $source_root ]] \
      || die "candidate source root is unsafe"
  fi
}

candidate_recovery_load_guard() {
  local state=$1
  local expected_identity
  local expected_fingerprint
  local state_commit
  local state_basename
  require_absolute_path "$state" "candidate recovery guard"
  [[ $(dirname -- "$state") == "$ONLYWAY_CANDIDATE_RECOVERY_DIR" ]] \
    || die "candidate recovery guard escapes its directory"
  [[ -f $state && ! -L $state ]] \
    || die "candidate recovery guard is unavailable or unsafe"
  [[ $(stat -c '%u:%a' "$state") == "0:600" ]] \
    || die "candidate recovery guard permissions are invalid"
  expected_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$state")
  expected_fingerprint=$(sha256sum "$state" | awk '{print $1}')
  jq -e \
    '
      (keys | sort) == ([
        "candidateRoot",
        "commit",
        "containsSecrets",
        "contractVersion",
        "imageId",
        "kind",
        "loopbackPort",
        "project",
        "restartPolicy",
        "sourceRoot",
        "status"
      ] | sort) and
      .contractVersion == "1" and
      .kind == "CANDIDATE_RECOVERY_GUARD" and
      .status == "ARMED" and
      .containsSecrets == false and
      .restartPolicy == "no" and
      (.commit | type == "string" and test("^[0-9a-f]{40}$")) and
      (.project | type == "string") and
      (.candidateRoot | type == "string") and
      (.sourceRoot | type == "string") and
      (.imageId | type == "string" and test("^sha256:[0-9a-f]{64}$")) and
      (.loopbackPort | type == "number" and . >= 1 and . <= 65535)
    ' "$state" >/dev/null \
    || die "candidate recovery guard contract is invalid"
  IFS=$'\t' read -r \
    CANDIDATE_RECOVERY_COMMIT \
    CANDIDATE_RECOVERY_PROJECT \
    CANDIDATE_RECOVERY_ROOT \
    CANDIDATE_RECOVERY_SOURCE \
    CANDIDATE_RECOVERY_IMAGE_ID \
    CANDIDATE_RECOVERY_PORT < <(
      jq -r \
        '[.commit, .project, .candidateRoot, .sourceRoot, .imageId, (.loopbackPort | tostring)] | @tsv' \
        "$state"
    )
  require_commit "$CANDIDATE_RECOVERY_COMMIT"
  [[ $CANDIDATE_RECOVERY_PROJECT == \
    "$(candidate_recovery_expected_project "$CANDIDATE_RECOVERY_COMMIT")" ]] \
    || die "candidate recovery project does not match its commit"
  [[ $CANDIDATE_RECOVERY_PORT == \
    "$(candidate_recovery_expected_port "$CANDIDATE_RECOVERY_COMMIT")" ]] \
    || die "candidate recovery port does not match its commit"
  candidate_recovery_validate_root_path \
    "$CANDIDATE_RECOVERY_ROOT" "$CANDIDATE_RECOVERY_COMMIT"
  candidate_recovery_validate_source_path \
    "$CANDIDATE_RECOVERY_SOURCE" "$CANDIDATE_RECOVERY_COMMIT"
  state_commit=${state##*/}
  state_commit=${state_commit%.json}
  state_basename=$(basename -- "$state")
  [[ $state_basename == "${CANDIDATE_RECOVERY_COMMIT}.json" \
    && $state_commit == "$CANDIDATE_RECOVERY_COMMIT" ]] \
    || die "candidate recovery guard filename does not match its commit"
  [[ $(stat -c '%d:%i:%u:%g:%a:%s' "$state") == "$expected_identity" \
    && $(sha256sum "$state" | awk '{print $1}') == "$expected_fingerprint" ]] \
    || die "candidate recovery guard changed during validation"
}

candidate_recovery_arm_guard() {
  local commit=$1
  local project=$2
  local candidate_root=$3
  local source_root=$4
  local image_id=$5
  local loopback_port=$6
  local state
  local temporary
  require_commit "$commit"
  [[ $project == "$(candidate_recovery_expected_project "$commit")" ]] \
    || die "candidate recovery project does not match its commit"
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] \
    || die "candidate recovery image ID is invalid"
  [[ $loopback_port == "$(candidate_recovery_expected_port "$commit")" ]] \
    || die "candidate recovery loopback port does not match its commit"
  candidate_recovery_validate_root_path "$candidate_root" "$commit"
  candidate_recovery_validate_source_path "$source_root" "$commit"
  [[ -d $candidate_root && ! -L $candidate_root ]] \
    || die "candidate recovery cannot arm without its root"
  candidate_recovery_prepare_directory
  state=$(candidate_recovery_state_path "$commit")
  [[ ! -e $state && ! -L $state ]] \
    || die "candidate recovery guard already exists"
  temporary=$(mktemp "${ONLYWAY_CANDIDATE_RECOVERY_DIR}/.guard.${commit}.XXXXXX")
  if ! jq -n -S \
    --arg candidateRoot "$candidate_root" \
    --arg commit "$commit" \
    --arg imageId "$image_id" \
    --argjson loopbackPort "$loopback_port" \
    --arg project "$project" \
    --arg sourceRoot "$source_root" \
    '{
      candidateRoot: $candidateRoot,
      commit: $commit,
      containsSecrets: false,
      contractVersion: "1",
      imageId: $imageId,
      kind: "CANDIDATE_RECOVERY_GUARD",
      loopbackPort: $loopbackPort,
      project: $project,
      restartPolicy: "no",
      sourceRoot: $sourceRoot,
      status: "ARMED"
    }' >"$temporary"; then
    unlink "$temporary"
    die "candidate recovery guard could not be rendered"
  fi
  chown root:root "$temporary"
  chmod 0600 "$temporary"
  sync -f "$temporary"
  mv -T -- "$temporary" "$state"
  sync -f "$ONLYWAY_CANDIDATE_RECOVERY_DIR"
  candidate_recovery_load_guard "$state"
}

candidate_recovery_project_containers() {
  local project=$1
  require_safe_name "$project" "candidate recovery project"
  docker ps --all --no-trunc \
    --filter "label=com.docker.compose.project=${project}" \
    --format '{{.ID}}'
}

candidate_recovery_project_networks() {
  local project=$1
  require_safe_name "$project" "candidate recovery project"
  docker network ls --no-trunc --quiet \
    --filter "label=com.docker.compose.project=${project}"
}

candidate_recovery_assert_no_restart() {
  local project=$1
  local inspect_file
  local -a container_ids
  mapfile -t container_ids < <(candidate_recovery_project_containers "$project")
  ((${#container_ids[@]} > 0)) \
    || die "candidate restart-policy check found no containers"
  inspect_file=$(mktemp "${ONLYWAY_RUN_DIR}/.candidate-restart-policy.XXXXXX")
  if ! docker inspect "${container_ids[@]}" >"$inspect_file"; then
    unlink "$inspect_file"
    die "candidate restart-policy inventory could not be inspected"
  fi
  if ! jq -e \
    --arg project "$project" \
    '
      length > 0 and
      all(.[];
        .Config.Labels["com.docker.compose.project"] == $project and
        .HostConfig.RestartPolicy.Name == "no"
      )
    ' "$inspect_file" >/dev/null; then
    unlink "$inspect_file"
    die "candidate containers must use restart policy no"
  fi
  unlink "$inspect_file"
}

candidate_recovery_remove_staging_source() {
  local source_root=$1
  local commit=$2
  local source_basename
  local source_identity
  candidate_recovery_validate_source_path "$source_root" "$commit"
  source_basename=$(basename -- "$source_root")
  [[ $source_basename != "$commit" ]] \
    || return 0
  if [[ ! -e $source_root && ! -L $source_root ]]; then
    return 0
  fi
  [[ -d "${source_root}/.git" && ! -L "${source_root}/.git" ]] \
    || die "candidate recovery staging source is not a Git checkout"
  [[ $(stat -c '%u' "$source_root") == "0" ]] \
    || die "candidate recovery staging source must remain root-owned"
  source_identity=$(stat -c '%d:%i:%u:%g:%a' "$source_root")
  [[ $(git -C "$source_root" rev-parse HEAD) == "$commit" \
    && $(readlink -f -- "$(git -C "$source_root" rev-parse --show-toplevel)") == \
      "$source_root" \
    && -z $(git -C "$source_root" status --porcelain=v1 -uall) ]] \
    || die "candidate recovery staging source is dirty or has the wrong commit"
  [[ $(stat -c '%d:%i:%u:%g:%a' "$source_root") == "$source_identity" ]] \
    || die "candidate recovery staging source changed during validation"
  find "$source_root" -xdev -depth -delete \
    || die "candidate recovery could not remove its exact staging source"
  [[ ! -e $source_root && ! -L $source_root ]] \
    || die "candidate recovery staging source remains after cleanup"
  sync -f "$ONLYWAY_RELEASES_DIR"
}

candidate_recovery_remove_guarded_project() {
  local state=$1
  local inspect_file=
  local network_inspect_file=
  local root_identity=
  local remaining=
  local -a container_ids
  local -a network_ids
  candidate_recovery_load_guard "$state"
  if [[ -e $CANDIDATE_RECOVERY_ROOT || -L $CANDIDATE_RECOVERY_ROOT ]]; then
    root_identity=$(stat -c '%d:%i:%u:%g:%a' "$CANDIDATE_RECOVERY_ROOT")
  fi
  mapfile -t container_ids < <(
    candidate_recovery_project_containers "$CANDIDATE_RECOVERY_PROJECT"
  )
  if ((${#container_ids[@]} > 6)); then
    die "candidate recovery refuses an oversized container inventory"
  fi
  if ((${#container_ids[@]} > 0)); then
    printf '%s\n' "${container_ids[@]}" \
      | grep -Eqv '^[0-9a-f]{64}$' \
      && die "candidate recovery found an invalid container identity"
    inspect_file=$(mktemp \
      "${ONLYWAY_CANDIDATE_RECOVERY_DIR}/.container-inspect.${CANDIDATE_RECOVERY_COMMIT}.XXXXXX")
    if ! docker inspect "${container_ids[@]}" >"$inspect_file"; then
      unlink "$inspect_file"
      die "candidate recovery could not inspect its container inventory"
    fi
    if ! jq -e \
      --arg acceptanceKey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
      --arg caddyImage "$ONLYWAY_CADDY_IMAGE" \
      --arg commit "$CANDIDATE_RECOVERY_COMMIT" \
      --arg imageId "$CANDIDATE_RECOVERY_IMAGE_ID" \
      --arg port "$CANDIDATE_RECOVERY_PORT" \
      --arg project "$CANDIDATE_RECOVERY_PROJECT" \
      --arg root "$CANDIDATE_RECOVERY_ROOT" \
      --arg source "$CANDIDATE_RECOVERY_SOURCE" \
      '
        length > 0 and length <= 6 and
        all(.[];
          .Config.Labels["com.docker.compose.project"] == $project and
          .Config.Labels["com.docker.compose.project.working_dir"] == $source and
          .Config.Labels["com.docker.compose.project.config_files"] ==
            ($source + "/compose.production.yml") and
          (.Config.Labels["com.docker.compose.service"] |
            IN("command-center", "scheduler", "worker", "health-monitor",
              "reverse-proxy", "backup-verifier")) and
          (.Name | startswith("/" + $project + "-")) and
          .HostConfig.RestartPolicy.Name == "no" and
          .HostConfig.Privileged == false and
          .HostConfig.ReadonlyRootfs == true and
          .HostConfig.NetworkMode != "host" and
          ([.Mounts[]?.Destination] | index("/var/run/docker.sock")) == null and
          all(.Mounts[]?;
            (.Source | startswith($root + "/")) or
            (.Source == $acceptanceKey and .RW == false) or
            (.Source == ($source + "/ops/production/Caddyfile") and .RW == false)
          ) and
          (if .Config.Labels["com.docker.compose.service"] == "reverse-proxy"
          then .Config.Image == $caddyImage
          else
            .Image == $imageId and
            .Config.Image == ("mv-ai-os:" + $commit) and
            (.Config.Env | index("ONLYWAY_RELEASE_COMMIT=" + $commit)) != null
          end)
        ) and
        all(
          [.[].NetworkSettings.Ports // {} | to_entries[] | .value[]?][];
          .HostIp == "127.0.0.1" and .HostPort == $port
        )
      ' "$inspect_file" >/dev/null; then
      unlink "$inspect_file"
      die "candidate recovery container boundary does not match its guard"
    fi
    unlink "$inspect_file"
    docker rm --force --volumes "${container_ids[@]}" >/dev/null \
      || die "candidate recovery could not remove its exact containers"
  fi
  mapfile -t network_ids < <(
    candidate_recovery_project_networks "$CANDIDATE_RECOVERY_PROJECT"
  )
  if ((${#network_ids[@]} > 1)); then
    die "candidate recovery refuses an oversized network inventory"
  fi
  if ((${#network_ids[@]} > 0)); then
    [[ ${network_ids[0]} =~ ^[0-9a-f]{64}$ ]] \
      || die "candidate recovery found an invalid network identity"
    network_inspect_file=$(mktemp \
      "${ONLYWAY_CANDIDATE_RECOVERY_DIR}/.network-inspect.${CANDIDATE_RECOVERY_COMMIT}.XXXXXX")
    if ! docker network inspect "${network_ids[@]}" >"$network_inspect_file"; then
      unlink "$network_inspect_file"
      die "candidate recovery could not inspect its network inventory"
    fi
    if ! jq -e \
      --arg name "${CANDIDATE_RECOVERY_PROJECT}_onlyway_private" \
      --arg project "$CANDIDATE_RECOVERY_PROJECT" \
      '
        length == 1 and
        .[0].Name == $name and
        .[0].Internal == true and
        .[0].Driver == "bridge" and
        .[0].Labels["com.docker.compose.project"] == $project
      ' "$network_inspect_file" >/dev/null; then
      unlink "$network_inspect_file"
      die "candidate recovery network boundary does not match its guard"
    fi
    unlink "$network_inspect_file"
    docker network rm "${network_ids[@]}" >/dev/null \
      || die "candidate recovery could not remove its exact network"
  fi
  remaining=$(candidate_recovery_project_containers \
    "$CANDIDATE_RECOVERY_PROJECT")
  [[ -z $remaining ]] \
    || die "candidate recovery left guarded containers behind"
  remaining=$(candidate_recovery_project_networks \
    "$CANDIDATE_RECOVERY_PROJECT")
  [[ -z $remaining ]] \
    || die "candidate recovery left a guarded network behind"
  if [[ -n $root_identity ]]; then
    [[ -d $CANDIDATE_RECOVERY_ROOT \
      && ! -L $CANDIDATE_RECOVERY_ROOT \
      && $(stat -c '%d:%i:%u:%g:%a' "$CANDIDATE_RECOVERY_ROOT") == \
        "$root_identity" ]] \
      || die "candidate recovery root changed during cleanup"
    find "$CANDIDATE_RECOVERY_ROOT" -xdev -depth -delete \
      || die "candidate recovery could not remove its guarded root"
  fi
  [[ ! -e $CANDIDATE_RECOVERY_ROOT && ! -L $CANDIDATE_RECOVERY_ROOT ]] \
    || die "candidate recovery root remains after cleanup"
  candidate_recovery_remove_staging_source \
    "$CANDIDATE_RECOVERY_SOURCE" "$CANDIDATE_RECOVERY_COMMIT"
  unlink "$state"
  sync -f "$ONLYWAY_CANDIDATE_RECOVERY_DIR"
  log "recovered interrupted candidate ${CANDIDATE_RECOVERY_PROJECT}"
}

candidate_recovery_reject_untracked_projects() {
  local container_id
  local project
  local network_id
  while IFS='|' read -r container_id project; do
    [[ -z $container_id ]] && continue
    [[ $container_id =~ ^[0-9a-f]{64}$ ]] \
      || die "candidate recovery found an invalid untracked container identity"
    [[ $project != onlyway-candidate-* ]] \
      || die "untracked candidate containers require operator review"
  done < <(
    docker ps --all --no-trunc \
      --filter "label=com.docker.compose.project" \
      --format '{{.ID}}|{{.Label "com.docker.compose.project"}}'
  )
  while IFS='|' read -r network_id project; do
    [[ -z $network_id ]] && continue
    [[ $network_id =~ ^[0-9a-f]{64}$ ]] \
      || die "candidate recovery found an invalid untracked network identity"
    [[ $project != onlyway-candidate-* ]] \
      || die "untracked candidate networks require operator review"
  done < <(
    docker network ls --no-trunc \
      --filter "label=com.docker.compose.project" \
      --format '{{.ID}}|{{.Label "com.docker.compose.project"}}'
  )
}

candidate_recovery_remove_empty_orphans() {
  local candidate_root
  local candidate_basename
  local entries
  while IFS= read -r candidate_root; do
    [[ -z $candidate_root ]] && continue
    candidate_basename=$(basename -- "$candidate_root")
    [[ $candidate_basename =~ ^candidate\.[0-9a-f]{12}\.[A-Za-z0-9]{6}$ ]] \
      || die "candidate recovery found an unrecognized candidate root"
    [[ -d $candidate_root && ! -L $candidate_root \
      && $(stat -c '%u' "$candidate_root") == "0" \
      && $(readlink -f -- "$candidate_root") == "$candidate_root" ]] \
      || die "candidate recovery found an unsafe orphan root"
    entries=$(find "$candidate_root" -mindepth 1 -maxdepth 1 -print -quit)
    [[ -z $entries ]] \
      || die "non-empty unguarded candidate root requires operator review"
    rmdir "$candidate_root" \
      || die "candidate recovery could not remove an empty orphan root"
  done < <(
    find "$ONLYWAY_RUN_DIR" -mindepth 1 -maxdepth 1 -type d \
      -name 'candidate.*' -print | LC_ALL=C sort
  )
}

candidate_recovery_remove_safe_temporary_entries() {
  local entry
  local entry_basename
  local removed=false
  while IFS= read -r entry; do
    [[ -z $entry ]] && continue
    entry_basename=$(basename -- "$entry")
    case "$entry_basename" in
      .guard.*|.container-inspect.*|.network-inspect.*)
        [[ $entry_basename =~ \
          ^\.(guard|container-inspect|network-inspect)\.[0-9a-f]{40}\.[A-Za-z0-9]{6}$ \
          && -f $entry \
          && ! -L $entry \
          && $(dirname -- "$entry") == "$ONLYWAY_CANDIDATE_RECOVERY_DIR" \
          && $(stat -c '%u:%g:%a' "$entry") == "0:0:600" ]] \
          || die "candidate recovery found an unsafe temporary entry"
        unlink "$entry" \
          || die "candidate recovery could not remove a safe temporary entry"
        removed=true
        ;;
    esac
  done < <(
    find "$ONLYWAY_CANDIDATE_RECOVERY_DIR" \
      -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort
  )
  if [[ $removed == "true" ]]; then
    sync -f "$ONLYWAY_CANDIDATE_RECOVERY_DIR"
  fi
}

candidate_recovery_recover_all() {
  local entry
  local entry_basename
  local -a entries
  candidate_recovery_prepare_directory
  # SIGKILL may interrupt an atomic guard publication or a Docker inventory
  # snapshot. Only exact root-owned mktemp artifacts are disposable.
  candidate_recovery_remove_safe_temporary_entries
  mapfile -t entries < <(
    find "$ONLYWAY_CANDIDATE_RECOVERY_DIR" \
      -mindepth 1 -maxdepth 1 -print | LC_ALL=C sort
  )
  for entry in "${entries[@]}"; do
    entry_basename=$(basename -- "$entry")
    [[ -f $entry && ! -L $entry \
      && $entry_basename =~ ^[0-9a-f]{40}\.json$ ]] \
      || die "candidate recovery directory contains an unexpected entry"
    candidate_recovery_remove_guarded_project "$entry"
  done
  candidate_recovery_reject_untracked_projects
  candidate_recovery_remove_empty_orphans
}

candidate_recovery_disarm_guard() {
  local commit=$1
  local project=$2
  local candidate_root=$3
  local source_root=$4
  local image_id=$5
  local loopback_port=$6
  local remaining
  local state
  candidate_recovery_prepare_directory
  state=$(candidate_recovery_state_path "$commit")
  if [[ ! -e $state && ! -L $state ]]; then
    [[ ! -e $candidate_root && ! -L $candidate_root ]] \
      || die "candidate recovery guard is absent while its root remains"
    return 0
  fi
  candidate_recovery_load_guard "$state"
  [[ $CANDIDATE_RECOVERY_COMMIT == "$commit" \
    && $CANDIDATE_RECOVERY_PROJECT == "$project" \
    && $CANDIDATE_RECOVERY_ROOT == "$candidate_root" \
    && $CANDIDATE_RECOVERY_SOURCE == "$source_root" \
    && $CANDIDATE_RECOVERY_IMAGE_ID == "$image_id" \
    && $CANDIDATE_RECOVERY_PORT == "$loopback_port" ]] \
    || die "candidate recovery guard cannot be disarmed by different inputs"
  remaining=$(candidate_recovery_project_containers "$project")
  [[ -z $remaining ]] \
    || die "candidate recovery guard cannot be disarmed while containers remain"
  remaining=$(candidate_recovery_project_networks "$project")
  [[ -z $remaining ]] \
    || die "candidate recovery guard cannot be disarmed while a network remains"
  [[ ! -e $candidate_root && ! -L $candidate_root ]] \
    || die "candidate recovery guard cannot be disarmed while its root remains"
  unlink "$state"
  sync -f "$ONLYWAY_CANDIDATE_RECOVERY_DIR"
}
