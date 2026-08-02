#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_root
ensure_layout_exists
require_command fail2ban-client
require_command apt-config
require_command jq
require_command sshd
require_command systemctl
require_command ufw

[[ -n ${SSH_CONNECTION:-} && -n ${SSH_TTY:-} ]] \
  || die "confirmation must run inside the newly opened SSH session"
ADMIN_USER=${ONLYWAY_ADMIN_USER:-${SUDO_USER:-}}
[[ -n $ADMIN_USER && $ADMIN_USER != root ]] \
  || die "run through sudo from the key-authenticated administrative account"
ADMIN_HOME=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
[[ -n $ADMIN_HOME && -s "${ADMIN_HOME}/.ssh/authorized_keys" ]] \
  || die "the administrative account has no non-empty authorized_keys file"
[[ -d $ONLYWAY_SSH_HARDENING_PENDING_DIR \
  && ! -L $ONLYWAY_SSH_HARDENING_PENDING_DIR ]] \
  || die "no pending SSH hardening change is available for confirmation"
[[ $(stat -c '%u:%a' "$ONLYWAY_SSH_HARDENING_PENDING_DIR") == "0:700" ]] \
  || die "pending SSH hardening rollback directory is unsafe"

read -r SSH_CLIENT_ADDRESS _ _ <<<"$SSH_CONNECTION"
[[ $SSH_CLIENT_ADDRESS =~ ^[0-9A-Fa-f:.]+$ ]] \
  || die "SSH client address is invalid"
SSHD_CONTEXT_HOST=$(hostname)
[[ $SSHD_CONTEXT_HOST =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ ]] \
  || die "host name is invalid for sshd effective-policy validation"
SSHD_EFFECTIVE=$(mktemp /tmp/onlyway-sshd-effective.XXXXXX)
UFW_STATUS=$(mktemp /tmp/onlyway-ufw-status.XXXXXX)
CONFIRMATION_TEMPORARY=
CONFIRMATION_SIGNATURE_TEMPORARY=
cleanup() {
  [[ ! -e $SSHD_EFFECTIVE ]] || unlink "$SSHD_EFFECTIVE"
  [[ ! -e $UFW_STATUS ]] || unlink "$UFW_STATUS"
  [[ -z ${CONFIRMATION_TEMPORARY:-} \
    || ! -e $CONFIRMATION_TEMPORARY ]] \
    || unlink "$CONFIRMATION_TEMPORARY"
  [[ -z ${CONFIRMATION_SIGNATURE_TEMPORARY:-} \
    || ! -e $CONFIRMATION_SIGNATURE_TEMPORARY ]] \
    || unlink "$CONFIRMATION_SIGNATURE_TEMPORARY"
}
trap cleanup EXIT

sshd -t
sshd -T -C \
  "user=${ADMIN_USER},host=${SSHD_CONTEXT_HOST},addr=${SSH_CLIENT_ADDRESS}" \
  >"$SSHD_EFFECTIVE"
for policy in \
  'passwordauthentication no' \
  'kbdinteractiveauthentication no' \
  'permitemptypasswords no' \
  'permitrootlogin no' \
  'pubkeyauthentication yes'; do
  grep -qx "$policy" "$SSHD_EFFECTIVE" \
    || die "effective sshd key-only policy is incomplete"
done

mapfile -t SSHD_PORTS < <(
  awk '$1 == "port" { print $2 }' "$SSHD_EFFECTIVE" | sort -nu
)
[[ ${#SSHD_PORTS[@]} -ge 1 && ${#SSHD_PORTS[@]} -le 8 ]] \
  || die "effective SSH port set is invalid"
ufw status verbose >"$UFW_STATUS"
grep -qx 'Status: active' "$UFW_STATUS" \
  || die "UFW is not active"
for SSHD_PORT in "${SSHD_PORTS[@]}"; do
  [[ $SSHD_PORT =~ ^[0-9]+$ \
    && $SSHD_PORT -ge 1 \
    && $SSHD_PORT -le 65535 ]] \
    || die "effective SSH port is invalid"
  grep -Eq "^${SSHD_PORT}/tcp[[:space:]]+ALLOW[[:space:]]" "$UFW_STATUS" \
    || die "UFW lacks the IPv4 SSH allow rule"
  grep -Eq "^${SSHD_PORT}/tcp \\(v6\\)[[:space:]]+ALLOW[[:space:]]" \
    "$UFW_STATUS" \
    || die "UFW lacks the IPv6 SSH allow rule"
done

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
  || die "effective fail2ban backend is not systemd"
systemctl is-active --quiet unattended-upgrades.service \
  || die "unattended-upgrades service is not active"
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

[[ ! -e ${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf ]] \
  || unlink "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.conf"
[[ ! -e ${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.absent ]] \
  || unlink "${ONLYWAY_SSH_HARDENING_PENDING_DIR}/previous.absent"
rmdir "$ONLYWAY_SSH_HARDENING_PENDING_DIR"

RECEIPT=$(write_receipt \
  "confirm-ssh-hardening" \
  "SSH_HARDENING_CONFIRMED" \
  "" \
  "Second key-authenticated SSH session, effective policy, UFW dual-stack, fail2ban and unattended upgrades verified")
[[ ! -e $ONLYWAY_SSH_HARDENING_CONFIRMATION \
  && ! -L $ONLYWAY_SSH_HARDENING_CONFIRMATION \
  && ! -e "${ONLYWAY_SSH_HARDENING_CONFIRMATION}.sig" \
  && ! -L "${ONLYWAY_SSH_HARDENING_CONFIRMATION}.sig" ]] \
  || die "SSH hardening confirmation target already exists"
CONFIRMATION_TEMPORARY=$(mktemp \
  "${ONLYWAY_RUN_DIR}/.ssh-hardening-confirmation.XXXXXX")
CONFIRMATION_SIGNATURE_TEMPORARY=$(mktemp \
  "${ONLYWAY_RUN_DIR}/.ssh-hardening-confirmation-signature.XXXXXX")
install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
  "$RECEIPT" "$CONFIRMATION_TEMPORARY"
install -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0640 \
  "${RECEIPT}.sig" "$CONFIRMATION_SIGNATURE_TEMPORARY"
sync -f "$CONFIRMATION_TEMPORARY"
sync -f "$CONFIRMATION_SIGNATURE_TEMPORARY"
mv -T -- "$CONFIRMATION_SIGNATURE_TEMPORARY" \
  "${ONLYWAY_SSH_HARDENING_CONFIRMATION}.sig"
CONFIRMATION_SIGNATURE_TEMPORARY=
sync -f "$ONLYWAY_RUN_DIR"
mv -T -- "$CONFIRMATION_TEMPORARY" "$ONLYWAY_SSH_HARDENING_CONFIRMATION"
CONFIRMATION_TEMPORARY=
sync -f "$ONLYWAY_RUN_DIR"
verify_host_receipt_signature "$ONLYWAY_SSH_HARDENING_CONFIRMATION" \
  >/dev/null
log "SSH hardening confirmed from the second session; host preparation is complete"
