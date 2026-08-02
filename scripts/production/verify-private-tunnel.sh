#!/usr/bin/env bash

set -Eeuo pipefail

COMMIT=
OUTPUT=
KEY=${ONLYWAY_SSH_KEY:-"${HOME}/.ssh/onlyway_ovh_ed25519"}
URL=${ONLYWAY_PRIVATE_URL:-http://localhost:43100}
TARGET=${ONLYWAY_SSH_TARGET:-ubuntu@145.239.73.248}
KNOWN_HOSTS=${ONLYWAY_SSH_KNOWN_HOSTS:-"${HOME}/.ssh/known_hosts"}
SSH_PORT=${ONLYWAY_PUBLIC_SSH_PORT:-22}
SIGNATURE_NAMESPACE=onlyway-private-tunnel
readonly APPLICATION_PORTS=(80 443 43100 43101 8080)

usage() {
  printf '%s\n' \
    "usage: $0 --commit FULL_SHA --receipt ABS [--key ABS] [--known-hosts ABS] [--target USER@HOST] [--url http://localhost:43100] [--ssh-port PORT]" >&2
  exit 2
}

while (($# > 0)); do
  case "$1" in
    --commit) [[ $# -ge 2 ]] || usage; COMMIT=$2; shift ;;
    --receipt) [[ $# -ge 2 ]] || usage; OUTPUT=$2; shift ;;
    --key) [[ $# -ge 2 ]] || usage; KEY=$2; shift ;;
    --known-hosts) [[ $# -ge 2 ]] || usage; KNOWN_HOSTS=$2; shift ;;
    --url) [[ $# -ge 2 ]] || usage; URL=$2; shift ;;
    --target) [[ $# -ge 2 ]] || usage; TARGET=$2; shift ;;
    --ssh-port) [[ $# -ge 2 ]] || usage; SSH_PORT=$2; shift ;;
    *) usage ;;
  esac
  shift
done

[[ ${EUID} -ne 0 ]] \
  || { printf '%s\n' "run tunnel verification as the local operator, not root" >&2; exit 1; }
[[ $COMMIT =~ ^[a-f0-9]{40}$ ]] || usage
[[ $OUTPUT == /* && $KEY == /* && $KNOWN_HOSTS == /* ]] || usage
[[ $URL == "http://localhost:43100" \
  || $URL == "http://127.0.0.1:43100" ]] \
  || { printf '%s\n' "private readiness URL must be fixed loopback port 43100" >&2; exit 2; }
[[ $TARGET =~ ^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$ ]] \
  || { printf '%s\n' "SSH target is invalid" >&2; exit 2; }
SSH_HOST=${TARGET#*@}
[[ $SSH_HOST =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] \
  || { printf '%s\n' "SSH target must use the VPS public IPv4 address" >&2; exit 2; }
IFS=. read -r -a SSH_HOST_OCTETS <<<"$SSH_HOST"
for octet in "${SSH_HOST_OCTETS[@]}"; do
  ((10#$octet <= 255)) \
    || { printf '%s\n' "SSH target IPv4 address is invalid" >&2; exit 2; }
done
[[ $SSH_PORT =~ ^[1-9][0-9]{0,4}$ \
  && $SSH_PORT -le 65535 ]] \
  || { printf '%s\n' "public SSH port is invalid" >&2; exit 2; }
for port in "${APPLICATION_PORTS[@]}"; do
  [[ $SSH_PORT != "$port" ]] \
    || { printf '%s\n' "SSH port overlaps a forbidden application port" >&2; exit 2; }
done
[[ ! -e $OUTPUT && ! -L $OUTPUT ]] \
  || { printf '%s\n' "receipt target must not already exist" >&2; exit 1; }
[[ -d $(dirname -- "$OUTPUT") ]] \
  || { printf '%s\n' "receipt parent directory is unavailable" >&2; exit 1; }
[[ -f $KEY && ! -L $KEY && -f ${KEY}.pub && ! -L ${KEY}.pub \
  && -f $KNOWN_HOSTS && ! -L $KNOWN_HOSTS ]] \
  || { printf '%s\n' "SSH signing key pair is unavailable or unsafe" >&2; exit 1; }
for command in base64 curl jq nc ssh ssh-keygen; do
  command -v "$command" >/dev/null 2>&1 \
    || { printf 'required command unavailable: %s\n' "$command" >&2; exit 1; }
done

sha256_file() {
  local path=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$path" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$path" | awk '{print $1}'
  else
    printf '%s\n' "SHA-256 command is unavailable" >&2
    return 1
  fi
}

sha256_text() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    printf '%s\n' "SHA-256 command is unavailable" >&2
    return 1
  fi
}

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/onlyway-tunnel-evidence.XXXXXX")
SSH_CONTROL="${WORK_DIR}/ssh-control"
cleanup() {
  if [[ -S $SSH_CONTROL ]]; then
    ssh -S "$SSH_CONTROL" -p "$SSH_PORT" \
      -O exit "$TARGET" >/dev/null 2>&1 || true
  fi
  if [[ -n ${TEMPORARY:-} && -f $TEMPORARY \
    && $TEMPORARY == "$(dirname -- "$OUTPUT")/.private-tunnel-receipt."* ]]; then
    unlink "$TEMPORARY"
  fi
  if [[ -d $WORK_DIR \
    && $WORK_DIR == "${TMPDIR:-/tmp}/onlyway-tunnel-evidence."* ]]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup EXIT
chmod 0700 "$WORK_DIR"

PINNED_HOST_KEY="${WORK_DIR}/ssh-host-key.pub"
HOST_KEY_LOOKUP=$SSH_HOST
if [[ $SSH_PORT != "22" ]]; then
  HOST_KEY_LOOKUP="[${SSH_HOST}]:${SSH_PORT}"
fi
ssh-keygen -F "$HOST_KEY_LOOKUP" -f "$KNOWN_HOSTS" \
  | awk '
      $2 == "ssh-ed25519" &&
      $3 ~ /^[A-Za-z0-9+\/]+={0,2}$/ {
        print $2 " " $3
        found = 1
        exit
      }
      END {if (!found) exit 1}
    ' >"$PINNED_HOST_KEY" \
  || { printf '%s\n' "pinned Ed25519 SSH host key is unavailable" >&2; exit 1; }
SSH_HOST_KEY_FINGERPRINT=$(ssh-keygen -lf "$PINNED_HOST_KEY" -E sha256 \
  | awk 'NR == 1 {print $2}')
[[ $SSH_HOST_KEY_FINGERPRINT =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
  || { printf '%s\n' "pinned SSH host-key fingerprint is invalid" >&2; exit 1; }
if nc -z -w 1 127.0.0.1 43100 >/dev/null 2>&1; then
  printf '%s\n' \
    "local port 43100 is already in use; close the existing tunnel before producing evidence" >&2
  exit 1
fi
ssh \
  -i "$KEY" \
  -M \
  -S "$SSH_CONTROL" \
  -f \
  -N \
  -p "$SSH_PORT" \
  -o CheckHostIP=yes \
  -o ExitOnForwardFailure=yes \
  -o HostKeyAlgorithms=ssh-ed25519 \
  -o IdentitiesOnly=yes \
  -o KbdInteractiveAuthentication=no \
  -o PasswordAuthentication=no \
  -o PreferredAuthentications=publickey \
  -o StrictHostKeyChecking=yes \
  -o UpdateHostKeys=no \
  -o "UserKnownHostsFile=${KNOWN_HOSTS}" \
  -o GlobalKnownHostsFile=/dev/null \
  -o ServerAliveInterval=15 \
  -o ServerAliveCountMax=2 \
  -L 127.0.0.1:43100:127.0.0.1:43100 \
  "$TARGET"
[[ -S $SSH_CONTROL ]] \
  || { printf '%s\n' "SSH control socket was not created" >&2; exit 1; }
ssh -S "$SSH_CONTROL" -p "$SSH_PORT" -O check "$TARGET" >/dev/null \
  || { printf '%s\n' "pinned SSH tunnel is not active" >&2; exit 1; }

READINESS="${WORK_DIR}/readiness.json"
curl --fail --silent --show-error \
  --connect-timeout 5 \
  --max-time 15 \
  --output "$READINESS" \
  "${URL}/health/ready"
READINESS_SIZE=$(wc -c <"$READINESS" | tr -d '[:space:]')
[[ $READINESS_SIZE =~ ^[1-9][0-9]*$ && $READINESS_SIZE -le 65536 ]] \
  || { printf '%s\n' "private readiness response size is invalid" >&2; exit 1; }
jq -e \
  --arg commit "$COMMIT" \
  '
    .contractVersion == "1" and
    .kind == "READINESS" and
    .status == "READY" and
    .unauthorizedExternalEffectOccurred == false and
    .summary.releaseCommit == $commit and
    .summary.providerMode == "OFFLINE_REHEARSAL" and
    (.checks | type == "array" and length > 0) and
    ([.checks[].status] | all(. == "PASS" or . == "NOT_REQUIRED"))
  ' "$READINESS" >/dev/null \
  || { printf '%s\n' "private tunnel response is not exact-commit readiness" >&2; exit 1; }
nc -z -w 5 "$SSH_HOST" "$SSH_PORT" >/dev/null 2>&1 \
  || { printf '%s\n' "public host reachability cannot be established on the approved SSH port" >&2; exit 1; }
for port in "${APPLICATION_PORTS[@]}"; do
  if nc -z -w 3 "$SSH_HOST" "$port" >/dev/null 2>&1; then
    printf 'public application port is reachable: %s\n' "$port" >&2
    exit 1
  fi
done

PUBLIC_KEY=$(awk '
  NR == 1 && $1 == "ssh-ed25519" && $2 ~ /^[A-Za-z0-9+\/]+={0,2}$/ {
    print $1 " " $2
    found = 1
  }
  END {if (!found) exit 1}
' "${KEY}.pub") \
  || { printf '%s\n' "tunnel signer must be an Ed25519 SSH key" >&2; exit 1; }
SIGNER_FINGERPRINT=$(ssh-keygen -lf "${KEY}.pub" -E sha256 \
  | awk 'NR == 1 {print $2}')
[[ $SIGNER_FINGERPRINT =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
  || { printf '%s\n' "SSH signer fingerprint is invalid" >&2; exit 1; }

BODY="${WORK_DIR}/receipt-body.json"
PAYLOAD="${WORK_DIR}/signed-payload.json"
jq -S -n \
  --arg branch "feature/telegram-operator-console" \
  --arg commit "$COMMIT" \
  --arg publicKey "$PUBLIC_KEY" \
  --arg readinessFingerprint "$(sha256_file "$READINESS")" \
  --arg signerFingerprint "$SIGNER_FINGERPRINT" \
  --arg sshHostKeyFingerprint "$SSH_HOST_KEY_FINGERPRINT" \
  --arg sshPort "$SSH_PORT" \
  --arg sshTarget "$TARGET" \
  --arg targetHost "$SSH_HOST" \
  --arg url "$URL" \
  --arg verifiedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    branch: $branch,
    commit: $commit,
    contractVersion: "1",
    externalProbe: {
      closedPorts: [80, 443, 43100, 43101, 8080],
      sshHostKeyFingerprint: $sshHostKeyFingerprint,
      sshPort: ($sshPort | tonumber),
      sshReachable: true,
      sshTarget: $sshTarget,
      targetHost: $targetHost
    },
    kind: "PRIVATE_TUNNEL_RECEIPT",
    publicApplicationPortsAuthorized: 0,
    readinessFingerprint: $readinessFingerprint,
    signerFingerprint: $signerFingerprint,
    signerPublicKey: $publicKey,
    status: "PRIVATE_TUNNEL_VERIFIED",
    unauthorizedExternalEffectOccurred: false,
    url: $url,
    verifiedAt: $verifiedAt
  }' >"$BODY"
CANONICAL_BODY=$(jq -Sc . "$BODY")
printf '%s' "$CANONICAL_BODY" >"$PAYLOAD"
CONTENT_FINGERPRINT=$(printf '%s' "$CANONICAL_BODY" | sha256_text)
[[ $CONTENT_FINGERPRINT =~ ^[a-f0-9]{64}$ ]] \
  || { printf '%s\n' "tunnel receipt fingerprint is invalid" >&2; exit 1; }

# ssh-keygen accesses the private key internally; the script never reads,
# copies, fingerprints or prints its private contents.
ssh-keygen -Y sign \
  -f "$KEY" \
  -n "$SIGNATURE_NAMESPACE" \
  "$PAYLOAD"
SIGNATURE="${PAYLOAD}.sig"
[[ -f $SIGNATURE && ! -L $SIGNATURE ]] \
  || { printf '%s\n' "SSH signature was not produced" >&2; exit 1; }
ALLOWED_SIGNERS="${WORK_DIR}/allowed-signers"
printf 'onlyway-tunnel %s\n' "$PUBLIC_KEY" >"$ALLOWED_SIGNERS"
chmod 0600 "$ALLOWED_SIGNERS"
ssh-keygen -Y verify \
  -f "$ALLOWED_SIGNERS" \
  -I onlyway-tunnel \
  -n "$SIGNATURE_NAMESPACE" \
  -s "$SIGNATURE" <"$PAYLOAD" >/dev/null \
  || { printf '%s\n' "SSH signature self-verification failed" >&2; exit 1; }

TEMPORARY=$(mktemp "$(dirname -- "$OUTPUT")/.private-tunnel-receipt.XXXXXX")
jq -S \
  --arg contentFingerprint "$CONTENT_FINGERPRINT" \
  --arg signature "$(base64 <"$SIGNATURE" | tr -d '\r\n')" \
  '. + {
    contentFingerprint: $contentFingerprint,
    signature: $signature,
    signatureAlgorithm: "OPENSSH_SSHSIG_ED25519"
  }' "$BODY" >"$TEMPORARY"
chmod 0600 "$TEMPORARY"
ln "$TEMPORARY" "$OUTPUT" \
  || { printf '%s\n' "receipt target was created concurrently" >&2; exit 1; }
unlink "$TEMPORARY"
TEMPORARY=

trap - EXIT
cleanup
printf 'PRIVATE_TUNNEL_RECEIPT=%s\n' "$OUTPUT"
