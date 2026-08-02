#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly REQUIRED_BRANCH="feature/telegram-operator-console"
readonly REMOTE_NAME="origin"
readonly SIGNATURE_IDENTITY="onlyway-pre-scan"
readonly SIGNATURE_NAMESPACE="onlyway-pre-scan-verification-v1"
readonly MAX_RECEIPT_BYTES=65536
readonly MAX_SIGNATURE_BYTES=16384
readonly MAX_KEY_BYTES=65536

REPOSITORY=
OUTPUT=
SIGNING_KEY=

usage() {
  printf '%s\n' \
    "usage: $0 --repository ABS --output ABS.json --signing-key ABS" >&2
  exit 2
}

die() {
  printf '[onlyway-pre-scan] ERROR: %s\n' "$*" >&2
  exit 1
}

while (($# > 0)); do
  case "$1" in
    --repository)
      [[ $# -ge 2 ]] || usage
      REPOSITORY=$2
      shift
      ;;
    --output)
      [[ $# -ge 2 ]] || usage
      OUTPUT=$2
      shift
      ;;
    --signing-key)
      [[ $# -ge 2 ]] || usage
      SIGNING_KEY=$2
      shift
      ;;
    *)
      usage
      ;;
  esac
  shift
done

[[ ${EUID} -ne 0 ]] \
  || die "run pre-scan verification as the local operator, not root"
[[ $REPOSITORY == /* && $OUTPUT == /* && $SIGNING_KEY == /* ]] || usage
[[ $(basename -- "$OUTPUT") =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}\.json$ ]] \
  || die "output must use a bounded JSON filename"

for command in awk date git jq ln mktemp mv node npm ssh-keygen stat uname; do
  command -v "$command" >/dev/null 2>&1 \
    || die "required command unavailable: ${command}"
done

canonical_existing_path() {
  local path=$1
  local parent
  parent=$(cd -- "$(dirname -- "$path")" && pwd -P)
  printf '%s/%s\n' "$parent" "$(basename -- "$path")"
}

file_uid() {
  if [[ $(uname -s) == "Darwin" ]]; then
    stat -f '%u' "$1"
  else
    stat -c '%u' "$1"
  fi
}

file_mode() {
  if [[ $(uname -s) == "Darwin" ]]; then
    stat -f '%Lp' "$1"
  else
    stat -c '%a' "$1"
  fi
}

file_size() {
  if [[ $(uname -s) == "Darwin" ]]; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

fsync_paths() {
  node -e '
    const fs = require("node:fs");
    for (const path of process.argv.slice(1)) {
      const descriptor = fs.openSync(path, fs.constants.O_RDONLY);
      try {
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
    }
  ' "$@"
}

[[ -d $REPOSITORY && ! -L $REPOSITORY ]] \
  || die "repository must be a regular non-symlink directory"
CANONICAL_REPOSITORY=$(cd -- "$REPOSITORY" && pwd -P)
[[ $CANONICAL_REPOSITORY == "$REPOSITORY" ]] \
  || die "repository path must be canonical"
[[ $(git -C "$REPOSITORY" rev-parse --show-toplevel) == "$REPOSITORY" ]] \
  || die "repository must be the Git worktree root"

OUTPUT_PARENT=$(cd -- "$(dirname -- "$OUTPUT")" && pwd -P)
[[ "${OUTPUT_PARENT}/$(basename -- "$OUTPUT")" == "$OUTPUT" ]] \
  || die "output path must be canonical"
OUTPUT_SIGNATURE="${OUTPUT}.sig"
[[ ! -e $OUTPUT && ! -L $OUTPUT \
  && ! -e $OUTPUT_SIGNATURE && ! -L $OUTPUT_SIGNATURE ]] \
  || die "receipt and detached signature targets must not already exist"

PUBLIC_KEY="${SIGNING_KEY}.pub"
[[ -f $SIGNING_KEY && ! -L $SIGNING_KEY ]] \
  || die "dedicated Ed25519 signing key is unavailable"
[[ -f $PUBLIC_KEY && ! -L $PUBLIC_KEY ]] \
  || die "dedicated Ed25519 public key is unavailable"
[[ $(canonical_existing_path "$SIGNING_KEY") == "$SIGNING_KEY" \
  && $(canonical_existing_path "$PUBLIC_KEY") == "$PUBLIC_KEY" ]] \
  || die "signing key paths must be canonical"
[[ $(file_uid "$SIGNING_KEY") == "$EUID" \
  && $(file_uid "$PUBLIC_KEY") == "$EUID" ]] \
  || die "signing key pair must be owned by the local operator"
[[ $(file_mode "$SIGNING_KEY") == "600" ]] \
  || die "signing key mode must be 0600"
PUBLIC_KEY_MODE=$(file_mode "$PUBLIC_KEY")
[[ $PUBLIC_KEY_MODE == "600" || $PUBLIC_KEY_MODE == "644" ]] \
  || die "public key mode must be 0600 or 0644"
PRIVATE_KEY_SIZE=$(file_size "$SIGNING_KEY")
PUBLIC_KEY_SIZE=$(file_size "$PUBLIC_KEY")
[[ $PRIVATE_KEY_SIZE =~ ^[1-9][0-9]*$ \
  && $PRIVATE_KEY_SIZE -le $MAX_KEY_BYTES \
  && $PUBLIC_KEY_SIZE =~ ^[1-9][0-9]*$ \
  && $PUBLIC_KEY_SIZE -le $MAX_KEY_BYTES ]] \
  || die "signing key pair size is invalid"

SIGNER_PUBLIC_KEY=$(awk '
  NR == 1 && $1 == "ssh-ed25519" &&
    $2 ~ /^[A-Za-z0-9+\/]+={0,2}$/ {
      print $1 " " $2
      found = 1
    }
  END {if (!found) exit 1}
' "$PUBLIC_KEY") \
  || die "dedicated public key must be Ed25519"
SIGNER_FINGERPRINT=$(ssh-keygen -lf "$PUBLIC_KEY" -E sha256 \
  | awk 'NR == 1 {print $2}')
[[ $SIGNER_FINGERPRINT =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] \
  || die "dedicated public key fingerprint is invalid"

RECEIPT_TEMPORARY=
SIGNATURE_TEMPORARY=
KEY_CHALLENGE=
KEY_CHALLENGE_SIGNATURE=
ALLOWED_SIGNERS=
SIGNATURE_PUBLISHED=false
RECEIPT_PUBLISHED=false

cleanup() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ $RECEIPT_PUBLISHED == "false" \
    && $SIGNATURE_PUBLISHED == "true" \
    && -n $SIGNATURE_TEMPORARY \
    && -f $SIGNATURE_TEMPORARY \
    && -f $OUTPUT_SIGNATURE \
    && $SIGNATURE_TEMPORARY -ef $OUTPUT_SIGNATURE ]]; then
    unlink "$OUTPUT_SIGNATURE" 2>/dev/null || true
    fsync_paths "$OUTPUT_PARENT" 2>/dev/null || true
  fi
  for temporary in \
    "$RECEIPT_TEMPORARY" "$SIGNATURE_TEMPORARY" \
    "$KEY_CHALLENGE" "$KEY_CHALLENGE_SIGNATURE" "$ALLOWED_SIGNERS"; do
    [[ -n $temporary && -f $temporary && ! -L $temporary ]] \
      || continue
    unlink "$temporary" 2>/dev/null || true
  done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

KEY_CHALLENGE=$(mktemp "${OUTPUT_PARENT}/.pre-scan-key-challenge.XXXXXX")
printf '%s\n' "onlyway-pre-scan-key-pair-check-v1" >"$KEY_CHALLENGE"
chmod 0600 "$KEY_CHALLENGE"
ssh-keygen -Y sign \
  -f "$SIGNING_KEY" \
  -n "$SIGNATURE_NAMESPACE" \
  "$KEY_CHALLENGE" >/dev/null \
  || die "dedicated signing key does not match its public key"
KEY_CHALLENGE_SIGNATURE="${KEY_CHALLENGE}.sig"
[[ -f $KEY_CHALLENGE_SIGNATURE && ! -L $KEY_CHALLENGE_SIGNATURE ]] \
  || die "dedicated signing key did not produce a detached signature"
ALLOWED_SIGNERS=$(mktemp "${OUTPUT_PARENT}/.pre-scan-allowed-signers.XXXXXX")
printf '%s %s\n' "$SIGNATURE_IDENTITY" "$SIGNER_PUBLIC_KEY" \
  >"$ALLOWED_SIGNERS"
chmod 0600 "$ALLOWED_SIGNERS"
ssh-keygen -Y verify \
  -f "$ALLOWED_SIGNERS" \
  -I "$SIGNATURE_IDENTITY" \
  -n "$SIGNATURE_NAMESPACE" \
  -s "$KEY_CHALLENGE_SIGNATURE" \
  <"$KEY_CHALLENGE" >/dev/null \
  || die "dedicated signing key does not match its public key"
unlink "$KEY_CHALLENGE"
unlink "$KEY_CHALLENGE_SIGNATURE"
KEY_CHALLENGE=
KEY_CHALLENGE_SIGNATURE=

assert_local_identity() {
  local actual_branch
  local actual_commit
  local actual_tree
  local status
  actual_branch=$(git -C "$REPOSITORY" symbolic-ref --quiet --short HEAD) \
    || die "repository must not use detached HEAD"
  [[ $actual_branch == "$REQUIRED_BRANCH" ]] \
    || die "repository is not on feature/telegram-operator-console"
  actual_commit=$(git -C "$REPOSITORY" rev-parse --verify 'HEAD^{commit}')
  actual_tree=$(git -C "$REPOSITORY" rev-parse --verify 'HEAD^{tree}')
  [[ $actual_commit =~ ^[a-f0-9]{40}$ \
    && $actual_tree =~ ^[a-f0-9]{40}$ ]] \
    || die "HEAD commit or Git tree is not a full SHA"
  status=$(git -C "$REPOSITORY" status \
    --porcelain=v1 --untracked-files=all --ignore-submodules=none)
  [[ -z $status ]] || die "repository working tree is not clean"
  printf '%s %s\n' "$actual_commit" "$actual_tree"
}

REMOTE_URL=$(git -C "$REPOSITORY" remote get-url "$REMOTE_NAME")
[[ -n $REMOTE_URL && ${#REMOTE_URL} -le 2048 \
  && $REMOTE_URL != *$'\n'* && $REMOTE_URL != *$'\r'* ]] \
  || die "origin URL is invalid"
if [[ $REMOTE_URL =~ ^https?://[^/@]+@ \
  || $REMOTE_URL == *"?"* \
  || $REMOTE_URL == *"#"* ]]; then
  die "origin URL must not contain credentials, query parameters or fragments"
fi
REMOTE_REF="refs/heads/${REQUIRED_BRANCH}"

read -r COMMIT GIT_TREE <<<"$(assert_local_identity)"

remote_feature_commit() {
  local result
  local count
  result=$(GIT_TERMINAL_PROMPT=0 \
    git ls-remote --exit-code "$REMOTE_URL" "$REMOTE_REF") \
    || die "origin feature branch could not be resolved"
  count=$(printf '%s\n' "$result" | awk 'END {print NR}')
  [[ $count == "1" ]] || die "origin feature branch resolution is ambiguous"
  printf '%s\n' "$result" | awk \
    -v expected_ref="$REMOTE_REF" '
      $1 ~ /^[a-f0-9]{40}$/ && $2 == expected_ref {print $1; found = 1}
      END {if (!found) exit 1}
    ' || die "origin feature branch response is invalid"
}

REMOTE_COMMIT=$(remote_feature_commit)
[[ $REMOTE_COMMIT == "$COMMIT" ]] \
  || die "local HEAD does not equal origin feature HEAD"

STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
(cd -- "$REPOSITORY" && npm run check)

read -r COMPLETED_COMMIT COMPLETED_TREE <<<"$(assert_local_identity)"
[[ $COMPLETED_COMMIT == "$COMMIT" && $COMPLETED_TREE == "$GIT_TREE" ]] \
  || die "repository identity changed while the full suite was running"
[[ $(git -C "$REPOSITORY" remote get-url "$REMOTE_NAME") == "$REMOTE_URL" ]] \
  || die "origin URL changed while the full suite was running"
COMPLETED_REMOTE_COMMIT=$(remote_feature_commit)
[[ $COMPLETED_REMOTE_COMMIT == "$COMMIT" ]] \
  || die "origin feature HEAD changed while the full suite was running"
COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)

RECEIPT_TEMPORARY=$(mktemp "${OUTPUT_PARENT}/.pre-scan-receipt.XXXXXX")
jq -S -n \
  --arg branch "$REQUIRED_BRANCH" \
  --arg commit "$COMMIT" \
  --arg completedAt "$COMPLETED_AT" \
  --arg gitTree "$GIT_TREE" \
  --arg remoteCommit "$COMPLETED_REMOTE_COMMIT" \
  --arg remoteName "$REMOTE_NAME" \
  --arg remoteRef "$REMOTE_REF" \
  --arg remoteUrl "$REMOTE_URL" \
  --arg signatureNamespace "$SIGNATURE_NAMESPACE" \
  --arg signerFingerprint "$SIGNER_FINGERPRINT" \
  --arg signerPublicKey "$SIGNER_PUBLIC_KEY" \
  --arg startedAt "$STARTED_AT" \
  '{
    branch: $branch,
    commit: $commit,
    completedAt: $completedAt,
    contractVersion: "1",
    gitTree: $gitTree,
    kind: "PRE_SCAN_VERIFICATION_RECEIPT",
    remote: {
      commit: $remoteCommit,
      name: $remoteName,
      ref: $remoteRef,
      url: $remoteUrl
    },
    secretsExposed: false,
    signature: {
      algorithm: "OPENSSH_SSHSIG_ED25519",
      namespace: $signatureNamespace,
      signerFingerprint: $signerFingerprint,
      signerPublicKey: $signerPublicKey
    },
    startedAt: $startedAt,
    status: "PASSED",
    suiteCommand: "npm run check",
    suiteStatus: "PASSED",
    workingTree: "CLEAN"
  }' >"$RECEIPT_TEMPORARY"
chmod 0600 "$RECEIPT_TEMPORARY"
RECEIPT_SIZE=$(file_size "$RECEIPT_TEMPORARY")
[[ $RECEIPT_SIZE =~ ^[1-9][0-9]*$ \
  && $RECEIPT_SIZE -le $MAX_RECEIPT_BYTES ]] \
  || die "pre-scan receipt exceeds its bounded size"

ssh-keygen -Y sign \
  -f "$SIGNING_KEY" \
  -n "$SIGNATURE_NAMESPACE" \
  "$RECEIPT_TEMPORARY" >/dev/null \
  || die "pre-scan detached signature could not be produced"
SIGNATURE_TEMPORARY="${RECEIPT_TEMPORARY}.sig"
[[ -f $SIGNATURE_TEMPORARY && ! -L $SIGNATURE_TEMPORARY ]] \
  || die "pre-scan detached signature was not produced"
chmod 0600 "$SIGNATURE_TEMPORARY"
SIGNATURE_SIZE=$(file_size "$SIGNATURE_TEMPORARY")
[[ $SIGNATURE_SIZE =~ ^[1-9][0-9]*$ \
  && $SIGNATURE_SIZE -le $MAX_SIGNATURE_BYTES ]] \
  || die "pre-scan detached signature exceeds its bounded size"
ssh-keygen -Y verify \
  -f "$ALLOWED_SIGNERS" \
  -I "$SIGNATURE_IDENTITY" \
  -n "$SIGNATURE_NAMESPACE" \
  -s "$SIGNATURE_TEMPORARY" \
  <"$RECEIPT_TEMPORARY" >/dev/null \
  || die "pre-scan detached signature failed self-verification"

fsync_paths "$RECEIPT_TEMPORARY" "$SIGNATURE_TEMPORARY"
ln "$SIGNATURE_TEMPORARY" "$OUTPUT_SIGNATURE" \
  || die "detached signature target was created concurrently"
SIGNATURE_PUBLISHED=true
fsync_paths "$OUTPUT_PARENT"
ln "$RECEIPT_TEMPORARY" "$OUTPUT" \
  || die "receipt target was created concurrently"
RECEIPT_PUBLISHED=true
fsync_paths "$OUTPUT_PARENT"
[[ $RECEIPT_TEMPORARY -ef $OUTPUT \
  && $SIGNATURE_TEMPORARY -ef $OUTPUT_SIGNATURE \
  && $(file_mode "$OUTPUT") == "600" \
  && $(file_mode "$OUTPUT_SIGNATURE") == "600" ]] \
  || die "published pre-scan evidence identity or permissions changed"
unlink "$RECEIPT_TEMPORARY"
unlink "$SIGNATURE_TEMPORARY"
RECEIPT_TEMPORARY=
SIGNATURE_TEMPORARY=
fsync_paths "$OUTPUT_PARENT"

trap - EXIT HUP INT TERM
unlink "$ALLOWED_SIGNERS"
ALLOWED_SIGNERS=
fsync_paths "$OUTPUT_PARENT"
printf 'PRE_SCAN_RECEIPT=%s\n' "$OUTPUT"
printf 'PRE_SCAN_SIGNATURE=%s\n' "$OUTPUT_SIGNATURE"
printf 'PRE_SCAN_PUBLIC_KEY=%s\n' "$PUBLIC_KEY"
printf 'PRE_SCAN_SIGNER_FINGERPRINT=%s\n' "$SIGNER_FINGERPRINT"
