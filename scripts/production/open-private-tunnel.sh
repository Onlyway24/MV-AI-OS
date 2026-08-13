#!/usr/bin/env bash

set -Eeuo pipefail

TARGET=${ONLYWAY_SSH_TARGET:-ubuntu@145.239.73.248}
KEY=${ONLYWAY_SSH_KEY:-"${HOME}/.ssh/onlyway_ovh_ed25519"}
KNOWN_HOSTS=${ONLYWAY_SSH_KNOWN_HOSTS:-"${HOME}/.ssh/known_hosts"}
LOCAL_PORT=${ONLYWAY_LOCAL_PORT:-43100}
REMOTE_PORT=${ONLYWAY_REMOTE_PORT:-43100}

while (($# > 0)); do
  case "$1" in
    --target) [[ $# -ge 2 ]] || { printf '%s\n' "--target requires a value" >&2; exit 2; }; TARGET=$2; shift ;;
    --key) [[ $# -ge 2 ]] || { printf '%s\n' "--key requires a value" >&2; exit 2; }; KEY=$2; shift ;;
    --known-hosts) [[ $# -ge 2 ]] || { printf '%s\n' "--known-hosts requires a value" >&2; exit 2; }; KNOWN_HOSTS=$2; shift ;;
    --local-port) [[ $# -ge 2 ]] || { printf '%s\n' "--local-port requires a value" >&2; exit 2; }; LOCAL_PORT=$2; shift ;;
    --remote-port) [[ $# -ge 2 ]] || { printf '%s\n' "--remote-port requires a value" >&2; exit 2; }; REMOTE_PORT=$2; shift ;;
    *) printf 'usage: %s [--target USER@HOST] [--key ABS] [--known-hosts ABS] [--local-port PORT] [--remote-port PORT]\n' "$0" >&2; exit 2 ;;
  esac
  shift
done

[[ ${EUID} -ne 0 ]] || { printf '%s\n' "run the tunnel as the local operator, not root" >&2; exit 1; }
[[ $TARGET =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$ ]] \
  || { printf '%s\n' "invalid SSH target" >&2; exit 2; }
[[ $KEY == /* && -f $KEY && ! -L $KEY ]] \
  || { printf '%s\n' "SSH key path is unavailable" >&2; exit 1; }
[[ $KNOWN_HOSTS == /* && -f $KNOWN_HOSTS && ! -L $KNOWN_HOSTS ]] \
  || { printf '%s\n' "SSH known_hosts path is unavailable" >&2; exit 1; }
command -v ssh-keygen >/dev/null 2>&1 \
  || { printf '%s\n' "ssh-keygen is required" >&2; exit 1; }
SSH_HOST=${TARGET#*@}
ssh-keygen -F "$SSH_HOST" -f "$KNOWN_HOSTS" >/dev/null \
  || { printf '%s\n' "SSH host key is not pinned in the selected known_hosts" >&2; exit 1; }
for port in "$LOCAL_PORT" "$REMOTE_PORT"; do
  [[ $port =~ ^[0-9]+$ && $port -ge 1024 && $port -le 65535 ]] \
    || { printf '%s\n' "tunnel ports must be between 1024 and 65535" >&2; exit 2; }
done
[[ $LOCAL_PORT == "43100" && $REMOTE_PORT == "43100" ]] \
  || { printf '%s\n' "PRIVATE_TUNNEL origin is fixed to port 43100" >&2; exit 2; }

exec ssh \
  -i "$KEY" \
  -o BatchMode=yes \
  -o CheckHostIP=yes \
  -o IdentitiesOnly=yes \
  -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=yes \
  -o UpdateHostKeys=no \
  -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -N \
  -L "127.0.0.1:${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" \
  "$TARGET"
