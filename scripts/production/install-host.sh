#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"
# shellcheck source=scripts/production/lib/legacy-migration-common.sh
source "${SCRIPT_DIR}/lib/legacy-migration-common.sh"

DRY_RUN=false
LEGACY_PREFLIGHT_RECEIPT=
LEGACY_PREFLIGHT_SIGNATURE=
LEGACY_PUBLIC_KEY=
LEGACY_CONFIRMATION=
declare -a LEGACY_CONTAINER_SPECS=()

usage() {
  die "usage: $0 [--dry-run] --legacy-preflight-receipt ABS_PATH --legacy-preflight-signature ABS_PATH --legacy-public-key ABS_PATH --legacy-container NAME=FULL_64_CHAR_ID (exactly four) --confirm ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1"
}

while (($# > 0)); do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --legacy-preflight-receipt)
      [[ $# -ge 2 ]] || usage
      LEGACY_PREFLIGHT_RECEIPT=$2
      shift
      ;;
    --legacy-preflight-signature)
      [[ $# -ge 2 ]] || usage
      LEGACY_PREFLIGHT_SIGNATURE=$2
      shift
      ;;
    --legacy-public-key)
      [[ $# -ge 2 ]] || usage
      LEGACY_PUBLIC_KEY=$2
      shift
      ;;
    --legacy-container)
      [[ $# -ge 2 ]] || usage
      LEGACY_CONTAINER_SPECS+=("$2")
      shift
      ;;
    --confirm)
      [[ $# -ge 2 ]] || usage
      LEGACY_CONFIRMATION=$2
      shift
      ;;
    *) usage ;;
  esac
  shift
done

for required in \
  "$LEGACY_PREFLIGHT_RECEIPT" "$LEGACY_PREFLIGHT_SIGNATURE" \
  "$LEGACY_PUBLIC_KEY" "$LEGACY_CONFIRMATION"; do
  [[ -n $required ]] || usage
done
[[ ${#LEGACY_CONTAINER_SPECS[@]} -eq 4 ]] || usage
[[ $LEGACY_CONFIRMATION == "ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1" ]] \
  || die "literal confirmation ACCEPT_SIGNED_LEGACY_PREFLIGHT_V1 is required"

require_root
[[ -r /etc/os-release ]] || die "/etc/os-release is unavailable"
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == "ubuntu" ]] || die "the host installer supports Ubuntu only"
[[ -n ${VERSION_CODENAME:-} ]] || die "Ubuntu codename is unavailable"

ADMIN_USER=${ONLYWAY_ADMIN_USER:-${SUDO_USER:-}}
[[ -n $ADMIN_USER && $ADMIN_USER != root ]] \
  || die "run through sudo from the key-authenticated administrative account"
ADMIN_HOME=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
[[ -n $ADMIN_HOME && -s "${ADMIN_HOME}/.ssh/authorized_keys" ]] \
  || die "the administrative account has no non-empty authorized_keys file"

verify_legacy_install_preflight_gate() (
  local work_dir
  local specifications
  local inspect_file
  local runtime_observation
  local directory_observations
  local signed_sha
  local reverified_sha
  local observed_at
  local expected_image_id
  local expected_uid
  local expected_restart_policy
  local expected_listener_host
  local expected_listener_port
  local database
  local runtime_config
  local legacy_bootstrap
  local excluded_secret
  local admin_state
  local admin_pepper

  for command in docker find jq mktemp openssl readlink stat; do
    legacy_require_command "$command"
  done
  legacy_require_integer "$ONLYWAY_GID" "service GID"
  legacy_require_absolute_safe_path \
    "$LEGACY_PREFLIGHT_RECEIPT" "legacy preflight receipt"
  legacy_require_absolute_safe_path \
    "$LEGACY_PREFLIGHT_SIGNATURE" "legacy preflight signature"
  legacy_require_absolute_safe_path "$LEGACY_PUBLIC_KEY" "legacy public key"

  work_dir=$(mktemp -d /tmp/onlyway-install-legacy-gate.XXXXXX)
  chmod 0700 "$work_dir"
  trap 'find "$work_dir" -xdev -depth -delete 2>/dev/null || true' EXIT
  specifications="${work_dir}/container-specifications.json"
  inspect_file="${work_dir}/container-inspect.json"
  runtime_observation="${work_dir}/runtime-config-observation.json"
  directory_observations="${work_dir}/directory-observations.json"

  legacy_write_container_specs \
    "$specifications" "${LEGACY_CONTAINER_SPECS[@]}"
  signed_sha=$(legacy_verify_signed_json \
    "$LEGACY_PREFLIGHT_RECEIPT" "$LEGACY_PREFLIGHT_SIGNATURE" \
    "$LEGACY_PUBLIC_KEY" "$ONLYWAY_GID")
  observed_at=$(legacy_current_timestamp)
  legacy_validate_install_preflight_contract \
    "$LEGACY_PREFLIGHT_RECEIPT" "$specifications" "$observed_at"
  legacy_assert_not_expired \
    "$(jq -er '.validUntil' "$LEGACY_PREFLIGHT_RECEIPT")" \
    "legacy install preflight"

  expected_image_id=$(jq -er \
    '.inventory.expectedImageId' "$LEGACY_PREFLIGHT_RECEIPT")
  expected_uid=$(jq -er \
    '.inventory.expectedRuntimeUid' "$LEGACY_PREFLIGHT_RECEIPT")
  expected_restart_policy=$(jq -er \
    '.inventory.expectedRestartPolicy' "$LEGACY_PREFLIGHT_RECEIPT")
  expected_listener_host=$(jq -er \
    '.inventory.expectedListener.host' "$LEGACY_PREFLIGHT_RECEIPT")
  expected_listener_port=$(jq -er \
    '.inventory.expectedListener.port' "$LEGACY_PREFLIGHT_RECEIPT")
  database=$(jq -er '.sources.database.path' "$LEGACY_PREFLIGHT_RECEIPT")
  runtime_config=$(jq -er \
    '.sources.runtimeConfig.path' "$LEGACY_PREFLIGHT_RECEIPT")
  legacy_bootstrap=$(jq -er \
    '.sources.legacyBootstrap.path' "$LEGACY_PREFLIGHT_RECEIPT")
  excluded_secret=$(jq -er \
    '.sources.dormantSecret.path' "$LEGACY_PREFLIGHT_RECEIPT")
  admin_state=$(jq -er \
    '.sources.adminSecurityState.path' "$LEGACY_PREFLIGHT_RECEIPT")
  admin_pepper=$(jq -er \
    '.sources.adminPepper.path' "$LEGACY_PREFLIGHT_RECEIPT")

  legacy_require_file_metadata \
    "$database" \
    "$(jq -er '.sources.database.stat.uid' "$LEGACY_PREFLIGHT_RECEIPT")" \
    "$(jq -er '.sources.database.stat.gid' "$LEGACY_PREFLIGHT_RECEIPT")" \
    "$(jq -er '.sources.database.stat.mode' "$LEGACY_PREFLIGHT_RECEIPT")" \
    $((128 * 1024 * 1024 * 1024)) "legacy database"
  jq -S '.sources.runtimeConfig' \
    "$LEGACY_PREFLIGHT_RECEIPT" >"$runtime_observation"
  legacy_verify_file_observation "$runtime_observation"
  jq -S '.sources.directories' \
    "$LEGACY_PREFLIGHT_RECEIPT" >"$directory_observations"
  legacy_verify_directory_metadata "$directory_observations"
  legacy_require_file_metadata \
    "$legacy_bootstrap" \
    "$(jq -er '.sources.legacyBootstrap.stat.uid' \
      "$LEGACY_PREFLIGHT_RECEIPT")" \
    "$(jq -er '.sources.legacyBootstrap.stat.gid' \
      "$LEGACY_PREFLIGHT_RECEIPT")" \
    "$(jq -er '.sources.legacyBootstrap.stat.mode' \
      "$LEGACY_PREFLIGHT_RECEIPT")" \
    16384 "legacy bootstrap"
  legacy_require_canonical_existing_file \
    "$excluded_secret" "excluded dormant secret"
  legacy_assert_path_absent "$admin_state" "legacy Admin Security state"
  legacy_assert_path_absent "$admin_pepper" "legacy Admin Security pepper"

  legacy_capture_exact_inventory "$inspect_file" "$specifications"
  legacy_validate_inventory_file \
    "$inspect_file" "$specifications" "$expected_image_id" "$expected_uid" \
    "$expected_restart_policy" "$expected_listener_host" \
    "$expected_listener_port" "$database" "$runtime_config" "$excluded_secret"
  legacy_assert_configuration_fingerprint \
    "$inspect_file" \
    "$(jq -er '.inventory.configurationFingerprint' \
      "$LEGACY_PREFLIGHT_RECEIPT")"

  reverified_sha=$(legacy_verify_signed_json \
    "$LEGACY_PREFLIGHT_RECEIPT" "$LEGACY_PREFLIGHT_SIGNATURE" \
    "$LEGACY_PUBLIC_KEY" "$ONLYWAY_GID")
  [[ $reverified_sha == "$signed_sha" ]] \
    || legacy_die "legacy preflight changed during the install gate"
)

legacy_container_is_approved() {
  local observed_id=$1
  local observed_name=$2
  local specification
  for specification in "${LEGACY_CONTAINER_SPECS[@]}"; do
    [[ $specification == "${observed_name}=${observed_id}" ]] && return 0
  done
  return 1
}

verify_legacy_install_preflight_gate
log "signed, unexpired legacy preflight and exact four-container inventory accepted"

if $DRY_RUN; then
  log "dry-run: legacy receipt, signature, exact IDs and current inventory verified without persistent mutation"
  log "dry-run: install official Docker Engine/Compose, Git, rsync, jq, SQLite, UFW, fail2ban and unattended-upgrades"
  log "dry-run: create system user ${ONLYWAY_SERVICE_USER} (${ONLYWAY_UID}:${ONLYWAY_GID}) and ${ONLYWAY_ROOT}"
  log "dry-run: allow the detected SSH port before enabling deny-incoming UFW"
  log "dry-run: enforce SSH key-only/root-login-disabled after sshd validation"
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl fail2ban git gnupg iproute2 jq openssl rsync socat sqlite3 \
  ufw unattended-upgrades

install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg \
  --output /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc

ARCHITECTURE=$(dpkg --print-architecture)
[[ $ARCHITECTURE =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "unsupported package architecture"
DOCKER_SOURCE=/etc/apt/sources.list.d/docker.sources
cat >"$DOCKER_SOURCE" <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: ${ARCHITECTURE}
Signed-By: /etc/apt/keyrings/docker.asc
EOF
chmod 0644 "$DOCKER_SOURCE"

apt-get update
apt-get install -y --no-install-recommends \
  containerd.io docker-buildx-plugin docker-ce docker-ce-cli \
  docker-compose-plugin
systemctl enable --now docker.service containerd.service
docker version >/dev/null
docker compose version >/dev/null
if ss -lntH | awk '{print $4}' | grep -Eq ':(2375|2376)$'; then
  die "Docker daemon is listening on a TCP socket"
fi
POST_INSTALL_CONTAINER_COUNT=0
while IFS='|' read -r container_id project container_name; do
  [[ -z $container_name ]] && continue
  [[ -z $project ]] \
    || die "legacy container unexpectedly gained a Compose project label: ${container_name}"
  legacy_container_is_approved "$container_id" "$container_name" \
    || die "unexpected pre-existing container requires operator review: ${container_name}"
  ((POST_INSTALL_CONTAINER_COUNT += 1))
done < <(docker ps --all --no-trunc \
  --format '{{.ID}}|{{.Label "com.docker.compose.project"}}|{{.Names}}')
[[ $POST_INSTALL_CONTAINER_COUNT -eq 4 ]] \
  || die "Docker inventory changed after package installation"

if getent group "$ONLYWAY_SERVICE_GROUP" >/dev/null; then
  [[ $(getent group "$ONLYWAY_SERVICE_GROUP" | cut -d: -f3) == "$ONLYWAY_GID" ]] \
    || die "existing onlyway group has an unexpected GID"
else
  groupadd --system --gid "$ONLYWAY_GID" "$ONLYWAY_SERVICE_GROUP"
fi

if getent passwd "$ONLYWAY_SERVICE_USER" >/dev/null; then
  [[ $(id -u "$ONLYWAY_SERVICE_USER") == "$ONLYWAY_UID" ]] \
    || die "existing onlyway user has an unexpected UID"
  [[ $(id -g "$ONLYWAY_SERVICE_USER") == "$ONLYWAY_GID" ]] \
    || die "existing onlyway user has an unexpected primary GID"
else
  useradd --system --uid "$ONLYWAY_UID" --gid "$ONLYWAY_GID" \
    --home-dir "$ONLYWAY_ROOT" --no-create-home --shell /usr/sbin/nologin \
    "$ONLYWAY_SERVICE_USER"
fi

if id -nG "$ONLYWAY_SERVICE_USER" | tr ' ' '\n' | grep -qx docker; then
  gpasswd --delete "$ONLYWAY_SERVICE_USER" docker
fi

install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 \
  "$ONLYWAY_ROOT" "$ONLYWAY_RELEASES_DIR" "${ONLYWAY_ROOT}/app" \
  "$ONLYWAY_SECRETS_ROOT" "$ONLYWAY_CONFIG_DIR" "$ONLYWAY_RUN_DIR" \
  "$ONLYWAY_OPERATION_LOCK_DIR"
install -d -o "$ONLYWAY_SERVICE_USER" -g "$ONLYWAY_SERVICE_GROUP" -m 0700 \
  "$ONLYWAY_DATA_DIR" "$ONLYWAY_BACKUP_DIR" "$ONLYWAY_LOG_DIR" \
  "$ONLYWAY_ADMIN_STATE_DIR" "$ONLYWAY_SECRETS_DIR" \
  "$ONLYWAY_ADMIN_SECRETS_DIR" \
  "$ONLYWAY_ADMIN_BOOTSTRAP_DIR"
install -d -o root -g root -m 0700 "$ONLYWAY_DEPLOY_SECRETS_DIR"

[[ ! -e $ONLYWAY_ADMIN_PEPPER_FILE && ! -L $ONLYWAY_ADMIN_PEPPER_FILE ]] \
  || die "initial host installation must preserve the signed absent Admin Security pepper boundary"

GITHUB_META=$(mktemp /tmp/onlyway-github-meta.XXXXXX)
GITHUB_KNOWN_HOSTS=$(mktemp /tmp/onlyway-github-known-hosts.XXXXXX)
cleanup_github_metadata() {
  [[ ! -e $GITHUB_META ]] || unlink "$GITHUB_META"
  [[ ! -e $GITHUB_KNOWN_HOSTS ]] || unlink "$GITHUB_KNOWN_HOSTS"
}
trap cleanup_github_metadata EXIT
curl --fail --silent --show-error --location \
  --proto '=https' --tlsv1.2 \
  https://api.github.com/meta \
  --output "$GITHUB_META"
jq -er \
  '.ssh_keys | select(type == "array" and length >= 2) | .[] | select(test("^(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) ")) | "github.com " + .' \
  "$GITHUB_META" >"$GITHUB_KNOWN_HOSTS"
[[ $(grep -Ec '^github\.com (ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) ' "$GITHUB_KNOWN_HOSTS") -ge 2 ]] \
  || die "GitHub API did not return the expected SSH host keys"
install -o root -g root -m 0644 "$GITHUB_KNOWN_HOSTS" \
  "${ONLYWAY_DEPLOY_SECRETS_DIR}/github-known-hosts"

mapfile -t SSHD_PORTS < <(
  sshd -T | awk '$1 == "port" { print $2 }' | sort -nu
)
[[ ${#SSHD_PORTS[@]} -ge 1 && ${#SSHD_PORTS[@]} -le 8 ]] \
  || die "unable to resolve a bounded set of active SSH ports"
for SSHD_PORT in "${SSHD_PORTS[@]}"; do
  [[ $SSHD_PORT =~ ^[0-9]+$ \
    && $SSHD_PORT -ge 1 \
    && $SSHD_PORT -le 65535 ]] \
    || die "active SSH port is invalid"
done
[[ -f /etc/default/ufw ]] || die "UFW defaults file is unavailable"
if grep -Eq '^IPV6=' /etc/default/ufw; then
  sed -i -E 's/^IPV6=.*/IPV6=yes/' /etc/default/ufw
else
  printf '\nIPV6=yes\n' >>/etc/default/ufw
fi
grep -Eq '^IPV6=yes$' /etc/default/ufw \
  || die "UFW IPv6 policy could not be enabled"
for SSHD_PORT in "${SSHD_PORTS[@]}"; do
  ufw allow "${SSHD_PORT}/tcp" comment "SSH key-only"
done
ufw default deny incoming
ufw default allow outgoing
ufw --force enable
ufw status verbose

SSHD_PORT_LIST=$(IFS=,; printf '%s' "${SSHD_PORTS[*]}")
FAIL2BAN_JAIL=/etc/fail2ban/jail.d/onlyway-sshd.local
if [[ -e $FAIL2BAN_JAIL || -L $FAIL2BAN_JAIL ]]; then
  [[ -f $FAIL2BAN_JAIL && ! -L $FAIL2BAN_JAIL \
    && $(stat -c '%u:%g:%a' "$FAIL2BAN_JAIL") == "0:0:644" ]] \
    || die "existing Onlyway fail2ban jail is unsafe"
fi
FAIL2BAN_TEMPORARY=$(mktemp /etc/fail2ban/jail.d/.onlyway-sshd.XXXXXX)
cat >"$FAIL2BAN_TEMPORARY" <<EOF
[sshd]
enabled = true
port = ${SSHD_PORT_LIST}
backend = systemd
maxretry = 5
findtime = 600
bantime = 3600
EOF
chown root:root "$FAIL2BAN_TEMPORARY"
chmod 0644 "$FAIL2BAN_TEMPORARY"
mv -fT -- "$FAIL2BAN_TEMPORARY" "$FAIL2BAN_JAIL"
systemctl enable --now fail2ban.service
systemctl restart fail2ban.service
FAIL2BAN_READY=false
for _ in $(seq 1 15); do
  if fail2ban-client ping >/dev/null 2>&1; then
    FAIL2BAN_READY=true
    break
  fi
  sleep 1
done
[[ $FAIL2BAN_READY == "true" ]] \
  || die "fail2ban control socket did not become ready"
systemctl is-enabled --quiet fail2ban.service \
  || die "fail2ban is not enabled"
systemctl is-active --quiet fail2ban.service \
  || die "fail2ban is not active"
[[ $(fail2ban-client get sshd maxretry) == "5" ]] \
  || die "effective fail2ban maxretry is not 5"
[[ $(fail2ban-client get sshd findtime) =~ ^600([.]0)?$ ]] \
  || die "effective fail2ban findtime is not 600 seconds"
[[ $(fail2ban-client get sshd bantime) =~ ^3600([.]0)?$ ]] \
  || die "effective fail2ban bantime is not 3600 seconds"
FAIL2BAN_JOURNAL_MATCH=$(fail2ban-client get sshd journalmatch)
grep -Eq '(_SYSTEMD_UNIT=(ssh|sshd)[.]service|_COMM=sshd)' \
  <<<"$FAIL2BAN_JOURNAL_MATCH" \
  || die "effective fail2ban sshd jail is not using the systemd journal"

dpkg-reconfigure -f noninteractive unattended-upgrades
AUTO_UPGRADES=/etc/apt/apt.conf.d/20auto-upgrades
if [[ -e $AUTO_UPGRADES || -L $AUTO_UPGRADES ]]; then
  [[ -f $AUTO_UPGRADES && ! -L $AUTO_UPGRADES \
    && $(stat -c '%u:%g:%a' "$AUTO_UPGRADES") == "0:0:644" ]] \
    || die "existing unattended-upgrades periodic configuration is unsafe"
fi
AUTO_UPGRADES_TEMPORARY=$(mktemp \
  /etc/apt/apt.conf.d/.onlyway-auto-upgrades.XXXXXX)
cat >"$AUTO_UPGRADES_TEMPORARY" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
chown root:root "$AUTO_UPGRADES_TEMPORARY"
chmod 0644 "$AUTO_UPGRADES_TEMPORARY"
mv -fT -- "$AUTO_UPGRADES_TEMPORARY" "$AUTO_UPGRADES"
systemctl enable --now unattended-upgrades.service
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer
for TIMER in apt-daily.timer apt-daily-upgrade.timer; do
  systemctl is-enabled --quiet "$TIMER" \
    || die "unattended upgrades timer is not enabled: ${TIMER}"
  systemctl is-active --quiet "$TIMER" \
    || die "unattended upgrades timer is not active: ${TIMER}"
done
APT_EFFECTIVE=$(apt-config dump)
grep -Fqx 'APT::Periodic::Update-Package-Lists "1";' \
  <<<"$APT_EFFECTIVE" \
  || die "effective package-list refresh schedule is not daily"
grep -Fqx 'APT::Periodic::Unattended-Upgrade "1";' \
  <<<"$APT_EFFECTIVE" \
  || die "effective unattended-upgrade schedule is not daily"

SSHD_DROP_IN=/etc/ssh/sshd_config.d/99-onlyway-hardening.conf
[[ ! -e $ONLYWAY_SSH_HARDENING_PENDING_DIR \
  && ! -L $ONLYWAY_SSH_HARDENING_PENDING_DIR ]] \
  || die "a prior SSH hardening change still requires second-session confirmation"
if [[ -e $SSHD_DROP_IN || -L $SSHD_DROP_IN ]]; then
  [[ -f $SSHD_DROP_IN && ! -L $SSHD_DROP_IN ]] \
    || die "the existing Onlyway sshd drop-in is not a regular file"
fi
install -d -o root -g root -m 0700 "$ONLYWAY_SSH_HARDENING_PENDING_DIR"
if [[ -e $SSHD_DROP_IN ]]; then
  install -o root -g root -m 0600 "$SSHD_DROP_IN" \
    "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf"
else
  install -o root -g root -m 0600 /dev/null \
    "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.absent"
fi
cat >"$SSHD_DROP_IN" <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PermitRootLogin no
PubkeyAuthentication yes
EOF
chmod 0644 "$SSHD_DROP_IN"

restore_previous_sshd_configuration() {
  if [[ -f ${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf ]]; then
    cp --preserve=mode,ownership,timestamps -- \
      "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf" "$SSHD_DROP_IN"
  else
    unlink "$SSHD_DROP_IN"
  fi
  systemctl reload ssh.service || true
  [[ ! -e ${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf ]] \
    || unlink "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf"
  [[ ! -e ${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.absent ]] \
    || unlink "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.absent"
  rmdir "$ONLYWAY_SSH_HARDENING_PENDING_DIR"
}

read -r SSH_CLIENT_ADDRESS _ _ <<<"${SSH_CONNECTION:-}"
[[ $SSH_CLIENT_ADDRESS =~ ^[0-9A-Fa-f:.]+$ ]] \
  || {
    restore_previous_sshd_configuration
    die "host installation must run from the existing SSH session"
  }
SSHD_CONTEXT_HOST=$(hostname)
[[ $SSHD_CONTEXT_HOST =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ ]] \
  || {
    restore_previous_sshd_configuration
    die "host name is invalid for sshd effective-policy validation"
  }
SSHD_EFFECTIVE=$(mktemp /tmp/onlyway-sshd-effective.XXXXXX)
effective_sshd_policy_is_safe() {
  sshd -T -C \
    "user=${ADMIN_USER},host=${SSHD_CONTEXT_HOST},addr=${SSH_CLIENT_ADDRESS}" \
    >"$SSHD_EFFECTIVE" \
    && grep -qx 'passwordauthentication no' "$SSHD_EFFECTIVE" \
    && grep -qx 'kbdinteractiveauthentication no' "$SSHD_EFFECTIVE" \
    && grep -qx 'permitemptypasswords no' "$SSHD_EFFECTIVE" \
    && grep -qx 'permitrootlogin no' "$SSHD_EFFECTIVE" \
    && grep -qx 'pubkeyauthentication yes' "$SSHD_EFFECTIVE"
}
if ! sshd -t || ! effective_sshd_policy_is_safe; then
  unlink "$SSHD_EFFECTIVE"
  restore_previous_sshd_configuration
  die "sshd rejected the key-only effective policy"
fi
if ! systemctl reload ssh.service || ! effective_sshd_policy_is_safe; then
  unlink "$SSHD_EFFECTIVE"
  restore_previous_sshd_configuration
  die "sshd hardening could not be applied safely"
fi
unlink "$SSHD_EFFECTIVE"
[[ ! -e $ONLYWAY_SSH_HARDENING_CONFIRMATION ]] \
  || unlink "$ONLYWAY_SSH_HARDENING_CONFIRMATION"
[[ ! -e "${ONLYWAY_SSH_HARDENING_CONFIRMATION}.sig" ]] \
  || unlink "${ONLYWAY_SSH_HARDENING_CONFIRMATION}.sig"

write_receipt "install-host" "HOST_PREPARED_REQUIRES_SECOND_SSH_CHECK" "" \
  "SSH allow rules installed before deny-incoming; no application port opened" >/dev/null
log "host preparation paused at the mandatory SSH safety boundary"
log "open a second key-authenticated SSH session, then run: sudo ${SCRIPT_DIR}/confirm-ssh-hardening.sh"
