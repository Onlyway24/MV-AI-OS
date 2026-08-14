#!/usr/bin/env bash

set -Eeuo pipefail

readonly ONLYWAY_ROOT="${ONLYWAY_ROOT:-/srv/onlyway}"
readonly ONLYWAY_RELEASES_DIR="${ONLYWAY_RELEASES_DIR:-${ONLYWAY_ROOT}/releases}"
readonly ONLYWAY_CURRENT_LINK="${ONLYWAY_CURRENT_LINK:-${ONLYWAY_ROOT}/current}"
readonly ONLYWAY_DATA_DIR="${ONLYWAY_DATA_DIR:-${ONLYWAY_ROOT}/data}"
readonly ONLYWAY_BACKUP_DIR="${ONLYWAY_BACKUP_DIR:-${ONLYWAY_ROOT}/backups}"
readonly ONLYWAY_LOG_DIR="${ONLYWAY_LOG_DIR:-${ONLYWAY_ROOT}/logs}"
readonly ONLYWAY_RUN_DIR="${ONLYWAY_RUN_DIR:-${ONLYWAY_ROOT}/run}"
readonly ONLYWAY_OPERATION_LOCK_DIR="${ONLYWAY_OPERATION_LOCK_DIR:-${ONLYWAY_ROOT}/.operation-locks}"
readonly ONLYWAY_CONFIG_DIR="${ONLYWAY_CONFIG_DIR:-${ONLYWAY_ROOT}/config}"
readonly ONLYWAY_ADMIN_STATE_DIR="${ONLYWAY_ADMIN_STATE_DIR:-${ONLYWAY_ROOT}/admin-state}"
readonly ONLYWAY_ADMIN_SECURITY_STATE_FILE="${ONLYWAY_ADMIN_SECURITY_STATE_FILE:-${ONLYWAY_ADMIN_STATE_DIR}/admin-security.json}"
readonly ONLYWAY_SECRETS_ROOT="${ONLYWAY_SECRETS_ROOT:-${ONLYWAY_ROOT}/secrets}"
readonly ONLYWAY_SECRETS_DIR="${ONLYWAY_SECRETS_DIR:-${ONLYWAY_SECRETS_ROOT}/runtime}"
readonly ONLYWAY_ADMIN_SECRETS_DIR="${ONLYWAY_ADMIN_SECRETS_DIR:-${ONLYWAY_SECRETS_ROOT}/admin}"
readonly ONLYWAY_ADMIN_BOOTSTRAP_DIR="${ONLYWAY_ADMIN_BOOTSTRAP_DIR:-${ONLYWAY_SECRETS_ROOT}/bootstrap}"
readonly ONLYWAY_DEPLOY_SECRETS_DIR="${ONLYWAY_DEPLOY_SECRETS_DIR:-${ONLYWAY_SECRETS_ROOT}/deploy}"
readonly ONLYWAY_ADMIN_PEPPER_FILE="${ONLYWAY_ADMIN_PEPPER_FILE:-${ONLYWAY_ADMIN_SECRETS_DIR}/admin-source-key-pepper}"
readonly ONLYWAY_SERVICE_USER="${ONLYWAY_SERVICE_USER:-onlyway}"
readonly ONLYWAY_SERVICE_GROUP="${ONLYWAY_SERVICE_GROUP:-onlyway}"
readonly ONLYWAY_UID="${ONLYWAY_UID:-2001}"
readonly ONLYWAY_GID="${ONLYWAY_GID:-2001}"
readonly ONLYWAY_SYSTEMD_UNIT="${ONLYWAY_SYSTEMD_UNIT:-mv-ai-os.service}"
readonly ONLYWAY_BACKUP_SYSTEMD_SERVICE="${ONLYWAY_BACKUP_SYSTEMD_SERVICE:-mv-ai-os-backup.service}"
readonly ONLYWAY_BACKUP_SYSTEMD_TIMER="${ONLYWAY_BACKUP_SYSTEMD_TIMER:-mv-ai-os-backup.timer}"
readonly ONLYWAY_COMPOSE_PROJECT="${ONLYWAY_COMPOSE_PROJECT:-onlyway}"
readonly ONLYWAY_CADDY_IMAGE="caddy:2.11.4-alpine@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648"
readonly ONLYWAY_ACCEPTED_RELEASES_DIR="${ONLYWAY_ACCEPTED_RELEASES_DIR:-${ONLYWAY_RUN_DIR}/accepted-releases}"
readonly ONLYWAY_ACCEPTANCE_PRIVATE_KEY="${ONLYWAY_ACCEPTANCE_PRIVATE_KEY:-${ONLYWAY_DEPLOY_SECRETS_DIR}/release-acceptance-ed25519.pem}"
readonly ONLYWAY_ACCEPTANCE_PUBLIC_KEY="${ONLYWAY_ACCEPTANCE_PUBLIC_KEY:-${ONLYWAY_DEPLOY_SECRETS_DIR}/release-acceptance-ed25519.pub.pem}"
readonly ONLYWAY_SSH_HARDENING_PENDING_DIR="${ONLYWAY_SSH_HARDENING_PENDING_DIR:-${ONLYWAY_DEPLOY_SECRETS_DIR}/ssh-hardening-pending}"
readonly ONLYWAY_SSH_HARDENING_CONFIRMATION="${ONLYWAY_SSH_HARDENING_CONFIRMATION:-${ONLYWAY_RUN_DIR}/ssh-hardening-confirmed.json}"

log() {
  printf '[onlyway] %s\n' "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_root() {
  [[ ${EUID} -eq 0 ]] || die "this command must run through sudo/root"
}

refuse_root() {
  [[ ${EUID} -ne 0 ]] || die "this command must run as the local operator, not root"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command unavailable: $1"
}

require_absolute_path() {
  local value=$1
  local label=$2
  [[ $value == /* ]] || die "${label} must be an absolute path"
}

require_commit() {
  local value=$1
  [[ $value =~ ^[0-9a-f]{40}$ ]] || die "commit must be a full lowercase 40-character SHA"
}

require_branch() {
  local value=$1
  [[ $value == "main" ]] \
    || die "only main is authorized"
}

require_safe_name() {
  local value=$1
  local label=$2
  [[ $value =~ ^[a-z][a-z0-9._-]{2,127}$ ]] || die "${label} is invalid"
}

ensure_layout_exists() {
  local path
  for path in \
    "$ONLYWAY_ROOT" \
    "$ONLYWAY_RELEASES_DIR" \
    "$ONLYWAY_DATA_DIR" \
    "$ONLYWAY_BACKUP_DIR" \
    "$ONLYWAY_LOG_DIR" \
    "$ONLYWAY_RUN_DIR" \
    "$ONLYWAY_CONFIG_DIR" \
    "$ONLYWAY_ADMIN_STATE_DIR" \
    "$ONLYWAY_SECRETS_ROOT" \
    "$ONLYWAY_SECRETS_DIR" \
    "$ONLYWAY_ADMIN_SECRETS_DIR" \
    "$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
    "$ONLYWAY_DEPLOY_SECRETS_DIR"; do
    [[ -d $path ]] || die "required host directory unavailable: ${path}"
  done
}

require_ssh_hardening_confirmed() {
  [[ ! -e $ONLYWAY_SSH_HARDENING_PENDING_DIR \
    && ! -L $ONLYWAY_SSH_HARDENING_PENDING_DIR ]] \
    || die "SSH hardening still requires confirmation from a second session"
  [[ -f $ONLYWAY_SSH_HARDENING_CONFIRMATION \
    && ! -L $ONLYWAY_SSH_HARDENING_CONFIRMATION ]] \
    || die "SSH hardening confirmation is unavailable"
  [[ $(stat -c '%u:%a' "$ONLYWAY_SSH_HARDENING_CONFIRMATION") == "0:640" ]] \
    || die "SSH hardening confirmation permissions are invalid"
  verify_host_receipt_signature "$ONLYWAY_SSH_HARDENING_CONFIRMATION" \
    >/dev/null
  jq -e '
    .contractVersion == "1" and
    .action == "confirm-ssh-hardening" and
    .status == "SSH_HARDENING_CONFIRMED" and
    .secretsExposed == false
  ' "$ONLYWAY_SSH_HARDENING_CONFIRMATION" >/dev/null \
    || die "SSH hardening confirmation is invalid"
}

current_release() {
  [[ -L $ONLYWAY_CURRENT_LINK ]] || return 1
  readlink -f -- "$ONLYWAY_CURRENT_LINK"
}

validate_release_path() {
  local path=$1
  local canonical_releases
  local canonical_path
  canonical_releases=$(readlink -f -- "$ONLYWAY_RELEASES_DIR")
  canonical_path=$(readlink -f -- "$path")
  [[ $canonical_path == "${canonical_releases}/"* ]] \
    || die "release path escapes the release root"
  [[ $(basename -- "$canonical_path") =~ ^[0-9a-f]{40}$ ]] \
    || die "release directory is not named by a full commit SHA"
  printf '%s\n' "$canonical_path"
}

verify_release_checkout() {
  local release=$1
  local commit=$2
  require_commit "$commit"
  release=$(validate_release_path "$release")
  [[ -d "${release}/.git" ]] || die "release is not a Git checkout"
  [[ $(git -C "$release" rev-parse HEAD) == "$commit" ]] \
    || die "release Git HEAD does not match its commit identity"
  [[ -z $(git -C "$release" status --porcelain=v1 -uall) ]] \
    || die "release working tree is dirty"
  [[ -f "${release}/Dockerfile" && -f "${release}/compose.production.yml" ]] \
    || die "release lacks production deployment assets"
}

verify_release_image() {
  local commit=$1
  local expected_image_id=${2:-}
  local image_id
  local revision
  require_commit "$commit"
  require_command docker
  image_id=$(docker image inspect --format '{{.Id}}' "mv-ai-os:${commit}")
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] \
    || die "release image ID is invalid"
  if [[ -n $expected_image_id && $image_id != "$expected_image_id" ]]; then
    die "release image tag does not resolve to its accepted image ID"
  fi
  revision=$(docker image inspect \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' \
    "mv-ai-os:${commit}")
  [[ $revision == "$commit" ]] \
    || die "release image OCI revision does not match the commit"
  printf '%s\n' "$image_id"
}

acceptance_marker_path() {
  local commit=$1
  require_commit "$commit"
  printf '%s/%s.json\n' "$ONLYWAY_ACCEPTED_RELEASES_DIR" "$commit"
}

ensure_acceptance_signing_identity() {
  local private_temporary
  local public_temporary
  local challenge
  local challenge_signature
  require_command openssl
  install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 \
    "$ONLYWAY_ACCEPTED_RELEASES_DIR"
  if [[ ! -e $ONLYWAY_ACCEPTANCE_PRIVATE_KEY && ! -e $ONLYWAY_ACCEPTANCE_PUBLIC_KEY ]]; then
    private_temporary=$(mktemp "${ONLYWAY_DEPLOY_SECRETS_DIR}/.release-acceptance-private.XXXXXX")
    public_temporary=$(mktemp "${ONLYWAY_DEPLOY_SECRETS_DIR}/.release-acceptance-public.XXXXXX")
    openssl genpkey -algorithm ED25519 -out "$private_temporary"
    openssl pkey -in "$private_temporary" -pubout -out "$public_temporary"
    chown root:root "$private_temporary" "$public_temporary"
    chmod 0600 "$private_temporary"
    chmod 0644 "$public_temporary"
    mv -T -- "$private_temporary" "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY"
    mv -T -- "$public_temporary" "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"
  fi
  [[ -f $ONLYWAY_ACCEPTANCE_PRIVATE_KEY && ! -L $ONLYWAY_ACCEPTANCE_PRIVATE_KEY ]] \
    || die "release acceptance private key is unavailable or invalid"
  [[ -f $ONLYWAY_ACCEPTANCE_PUBLIC_KEY && ! -L $ONLYWAY_ACCEPTANCE_PUBLIC_KEY ]] \
    || die "release acceptance public key is unavailable or invalid"
  [[ $(stat -c '%u:%a' "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY") == "0:600" ]] \
    || die "release acceptance private key must be root-owned mode 0600"
  [[ $(stat -c '%u' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "0" ]] \
    || die "release acceptance public key must be root-owned"
  [[ $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "600" \
    || $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "644" ]] \
    || die "release acceptance public key mode must be 0600 or 0644"
  # The public half is mounted into the UID/GID 2001 backup verifier. Preserve
  # the private key at 0600, but normalize an existing, otherwise-valid public
  # key so the non-root verifier can read the explicit trust anchor.
  chown root:root "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"
  chmod 0644 "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY"
  [[ $(stat -c '%u:%g:%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "0:0:644" ]] \
    || die "release acceptance public key could not be normalized for the backup verifier"
  openssl pkey -pubin -in "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" -noout
  challenge=$(mktemp "${ONLYWAY_RUN_DIR}/.acceptance-key-check.XXXXXX")
  challenge_signature=$(mktemp "${ONLYWAY_RUN_DIR}/.acceptance-key-signature.XXXXXX")
  printf '%s\n' "onlyway-release-acceptance-key-check-v1" >"$challenge"
  openssl pkeyutl -sign -rawin \
    -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    -in "$challenge" \
    -out "$challenge_signature"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$challenge" \
    -sigfile "$challenge_signature" >/dev/null \
    || die "release acceptance signing key pair does not match"
  unlink "$challenge"
  unlink -- "$challenge_signature"
}

write_release_acceptance_marker() {
  local commit=$1
  local image_id=$2
  local git_tree=$3
  local readiness_fingerprint=$4
  local backup_fingerprint=$5
  local target
  local unsigned
  local signature
  local temporary
  local accepted_at
  local content_fingerprint
  require_commit "$commit"
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] \
    || die "accepted image ID is invalid"
  [[ $git_tree =~ ^[0-9a-f]{40}$ ]] \
    || die "accepted Git tree is invalid"
  [[ $readiness_fingerprint =~ ^[0-9a-f]{64}$ ]] \
    || die "accepted readiness fingerprint is invalid"
  [[ $backup_fingerprint == "NOT_APPLICABLE_FIRST_DEPLOY" \
    || $backup_fingerprint =~ ^[0-9a-f]{64}$ ]] \
    || die "accepted backup fingerprint is invalid"
  ensure_acceptance_signing_identity
  target=$(acceptance_marker_path "$commit")
  [[ ! -e $target && ! -L $target ]] \
    || die "release acceptance marker already exists"
  unsigned=$(mktemp "${ONLYWAY_ACCEPTED_RELEASES_DIR}/.acceptance-unsigned.XXXXXX")
  signature=$(mktemp "${ONLYWAY_ACCEPTED_RELEASES_DIR}/.acceptance-signature.XXXXXX")
  temporary=$(mktemp "${ONLYWAY_ACCEPTED_RELEASES_DIR}/.acceptance-marker.XXXXXX")
  accepted_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  jq -S -n \
    --arg acceptedAt "$accepted_at" \
    --arg backupFingerprint "$backup_fingerprint" \
    --arg branch "main" \
    --arg commit "$commit" \
    --arg gitTree "$git_tree" \
    --arg imageId "$image_id" \
    --arg readinessFingerprint "$readiness_fingerprint" \
    '{
      acceptedAt: $acceptedAt,
      backupFingerprint: $backupFingerprint,
      branch: $branch,
      candidateExternalEffects: false,
      candidateNetworkIsolation: "INTERNAL_NO_EGRESS",
      candidateSecretProfile: "SYNTHETIC_ISOLATED",
      commit: $commit,
      contractVersion: "1",
      gitTree: $gitTree,
      imageId: $imageId,
      imageRevision: $commit,
      kind: "RELEASE_ACCEPTANCE",
      publicApplicationPorts: 0,
      readinessFingerprint: $readinessFingerprint,
      readinessKind: "READINESS",
      status: "CANDIDATE_ACCEPTED"
    }' >"$unsigned"
  content_fingerprint=$(sha256sum "$unsigned" | awk '{print $1}')
  openssl pkeyutl -sign -rawin \
    -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    -in "$unsigned" \
    -out "$signature"
  jq -S \
    --arg contentFingerprint "$content_fingerprint" \
    --arg signature "$(openssl base64 -A -in "$signature")" \
    '. + {
      contentFingerprint: $contentFingerprint,
      signature: $signature,
      signatureAlgorithm: "ED25519"
    }' "$unsigned" >"$temporary"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$temporary"
  chmod 0640 "$temporary"
  mv -T -- "$temporary" "$target"
  sync -f "$ONLYWAY_ACCEPTED_RELEASES_DIR"
  unlink "$unsigned"
  unlink -- "$signature"
  printf '%s\n' "$target"
}

verify_release_acceptance_marker() {
  local commit=$1
  local expected_image_id=${2:-}
  local marker
  local unsigned
  local signature
  local fingerprint
  require_commit "$commit"
  require_command jq
  require_command openssl
  require_command sha256sum
  marker=$(acceptance_marker_path "$commit")
  [[ -f $marker && ! -L $marker ]] \
    || die "release acceptance marker is unavailable"
  [[ $(stat -c '%u' "$marker") == "0" ]] \
    || die "release acceptance marker must be owned by root"
  [[ $(stat -c '%a' "$marker") == "640" ]] \
    || die "release acceptance marker mode must be 0640"
  [[ -f $ONLYWAY_ACCEPTANCE_PUBLIC_KEY && ! -L $ONLYWAY_ACCEPTANCE_PUBLIC_KEY ]] \
    || die "release acceptance public key is unavailable"
  [[ $(stat -c '%u' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "0" ]] \
    || die "release acceptance public key must be owned by root"
  [[ $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "600" \
    || $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "644" ]] \
    || die "release acceptance public key mode must be 0600 or 0644"
  jq -e \
    --arg commit "$commit" \
    --arg imageId "$expected_image_id" \
    '
      .contractVersion == "1" and
      .kind == "RELEASE_ACCEPTANCE" and
      .status == "CANDIDATE_ACCEPTED" and
      (.acceptedAt |
        test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")) and
      .branch == "main" and
      .commit == $commit and
      .imageRevision == $commit and
      ($imageId == "" or .imageId == $imageId) and
      (.imageId | test("^sha256:[0-9a-f]{64}$")) and
      (.gitTree | test("^[0-9a-f]{40}$")) and
      .readinessKind == "READINESS" and
      (.readinessFingerprint | test("^[0-9a-f]{64}$")) and
      (.backupFingerprint == "NOT_APPLICABLE_FIRST_DEPLOY" or
        (.backupFingerprint | test("^[0-9a-f]{64}$"))) and
      .candidateExternalEffects == false and
      .candidateNetworkIsolation == "INTERNAL_NO_EGRESS" and
      .candidateSecretProfile == "SYNTHETIC_ISOLATED" and
      .publicApplicationPorts == 0 and
      .signatureAlgorithm == "ED25519" and
      (.contentFingerprint | test("^[0-9a-f]{64}$")) and
      (.signature | type == "string" and length > 0)
    ' "$marker" >/dev/null \
    || die "release acceptance marker contract is invalid"
  unsigned=$(mktemp "${ONLYWAY_RUN_DIR}/.acceptance-verify-unsigned.XXXXXX")
  signature=$(mktemp "${ONLYWAY_RUN_DIR}/.acceptance-verify-signature.XXXXXX")
  jq -S 'del(.contentFingerprint, .signature, .signatureAlgorithm)' \
    "$marker" >"$unsigned"
  fingerprint=$(sha256sum "$unsigned" | awk '{print $1}')
  [[ $fingerprint == "$(jq -r '.contentFingerprint' "$marker")" ]] \
    || die "release acceptance marker fingerprint is invalid"
  jq -r '.signature' "$marker" \
    | openssl base64 -d -A -out "$signature"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$unsigned" \
    -sigfile "$signature" >/dev/null \
    || die "release acceptance marker signature is invalid"
  unlink "$unsigned"
  unlink -- "$signature"
  printf '%s\n' "$marker"
}

acceptance_public_key_fingerprint() {
  require_command openssl
  require_command sha256sum
  openssl pkey -pubin -in "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" -outform DER \
    | sha256sum \
    | awk '{print $1}'
}

write_backup_manifest_signature() (
  local manifest=$1
  local target="${manifest}.sig"
  local raw_signature=
  local signature_fd=
  local signature_fd_path=
  local signature_identity=
  local signature_created=0
  local published=0
  local manifest_fingerprint
  local manifest_identity
  local manifest_size
  local public_key_fingerprint
  trap '
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
    if [[ -n ${signature_fd:-} ]]; then
      exec {signature_fd}>&-
    fi
    if (( ${published:-0} == 0 && ${signature_created:-0} == 1 )) \
      && [[ -n ${signature_identity:-} && -f $target && ! -L $target ]] \
      && [[ $(stat -c "%d:%i" "$target") == "$signature_identity" ]]; then
      unlink -- "$target"
    fi
  ' EXIT

  require_absolute_path "$manifest" "backup manifest"
  require_command jq
  require_command openssl
  require_command sha256sum
  [[ -f $manifest && ! -L $manifest ]] \
    || die "backup manifest is unavailable for host signing"
  [[ $(stat -c '%u:%g' "$manifest") == "${ONLYWAY_UID}:${ONLYWAY_GID}" ]] \
    || die "backup manifest signing ownership is invalid"
  [[ $(stat -c '%a' "$manifest") == "600" ]] \
    || die "backup manifest signing mode must be 0600"
  manifest_size=$(stat -c '%s' "$manifest")
  [[ $manifest_size =~ ^[1-9][0-9]*$ \
    && $manifest_size -le $((1024 * 1024)) ]] \
    || die "backup manifest signing size is invalid"
  [[ ! -e $target && ! -L $target ]] \
    || die "backup manifest signature already exists"

  ensure_acceptance_signing_identity
  manifest_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$manifest")
  manifest_fingerprint=$(sha256sum "$manifest" | awk '{print $1}')
  public_key_fingerprint=$(acceptance_public_key_fingerprint)
  [[ $manifest_fingerprint =~ ^[0-9a-f]{64}$ \
    && $public_key_fingerprint =~ ^[0-9a-f]{64}$ ]] \
    || die "backup manifest signing fingerprint is invalid"

  raw_signature=$(mktemp \
    "${ONLYWAY_OPERATION_LOCK_DIR}/.backup-manifest-signature-raw.XXXXXX")
  openssl pkeyutl -sign -rawin \
    -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    -in "$manifest" \
    -out "$raw_signature"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || die "backup manifest signature is not Ed25519"
  [[ $(stat -c '%d:%i:%u:%g:%a:%s' "$manifest") == "$manifest_identity" \
    && $(sha256sum "$manifest" | awk '{print $1}') == "$manifest_fingerprint" ]] \
    || die "backup manifest changed while it was being signed"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$manifest" \
    -sigfile "$raw_signature" >/dev/null \
    || die "backup manifest host signature verification failed"

  set -o noclobber
  if ! exec {signature_fd}> "$target"; then
    die "backup manifest signature could not be created exclusively"
  fi
  set +o noclobber
  signature_fd_path="/proc/${BASHPID}/fd/${signature_fd}"
  signature_identity=$(stat -Lc '%d:%i' "$signature_fd_path")
  signature_created=1
  chown --dereference root:"$ONLYWAY_SERVICE_GROUP" "$signature_fd_path"
  chmod 0640 "$signature_fd_path"
  jq -S -n \
    --arg manifestFile "$(basename -- "$manifest")" \
    --arg manifestSha256 "$manifest_fingerprint" \
    --arg publicKeySha256 "$public_key_fingerprint" \
    --arg signature "$(openssl base64 -A -in "$raw_signature")" \
    '{
      contractVersion: "1",
      kind: "BACKUP_MANIFEST_SIGNATURE",
      manifestFile: $manifestFile,
      manifestSha256: $manifestSha256,
      publicKeySha256: $publicKeySha256,
      signatureAlgorithm: "ED25519",
      signature: $signature
    }' >&"$signature_fd"
  sync -f "$signature_fd_path"
  [[ -f $target && ! -L $target \
    && $(stat -c '%d:%i' "$target") == "$signature_identity" ]] \
    || die "backup manifest signature identity changed during publication"
  exec {signature_fd}>&-
  signature_fd=
  verify_backup_manifest_signature "$manifest" >/dev/null
  published=1
  sync -f "$ONLYWAY_BACKUP_DIR"
  printf '%s\n' "$target"
)

verify_backup_manifest_signature() (
  local manifest=$1
  local signature_path="${manifest}.sig"
  local raw_signature=
  local manifest_fingerprint
  local manifest_identity
  local public_key_fingerprint
  local public_key_identity
  local signature_identity
  local signature_size
  trap '
    [[ -z ${raw_signature:-} || ! -e $raw_signature ]] || unlink "$raw_signature"
  ' EXIT

  require_absolute_path "$manifest" "backup manifest"
  require_command jq
  require_command openssl
  require_command sha256sum
  [[ -f $manifest && ! -L $manifest ]] \
    || die "signed backup manifest is unavailable"
  [[ -f $signature_path && ! -L $signature_path ]] \
    || die "host backup manifest signature is unavailable"
  [[ $(stat -c '%u:%g' "$signature_path") == "0:${ONLYWAY_GID}" ]] \
    || die "host backup manifest signature ownership is invalid"
  [[ $(stat -c '%a' "$signature_path") == "640" ]] \
    || die "host backup manifest signature mode must be 0640"
  signature_size=$(stat -c '%s' "$signature_path")
  [[ $signature_size =~ ^[1-9][0-9]*$ \
    && $signature_size -le 16384 ]] \
    || die "host backup manifest signature size is invalid"
  [[ -f $ONLYWAY_ACCEPTANCE_PUBLIC_KEY && ! -L $ONLYWAY_ACCEPTANCE_PUBLIC_KEY ]] \
    || die "release acceptance public key is unavailable"
  [[ $(stat -c '%u' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "0" ]] \
    || die "release acceptance public key must be owned by root"
  [[ $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "600" \
    || $(stat -c '%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "644" ]] \
    || die "release acceptance public key mode must be 0600 or 0644"

  manifest_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$manifest")
  signature_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$signature_path")
  public_key_identity=$(stat -c '%d:%i:%u:%g:%a:%s' \
    "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY")
  manifest_fingerprint=$(sha256sum "$manifest" | awk '{print $1}')
  public_key_fingerprint=$(acceptance_public_key_fingerprint)
  jq -e \
    --arg manifestFile "$(basename -- "$manifest")" \
    --arg manifestSha256 "$manifest_fingerprint" \
    --arg publicKeySha256 "$public_key_fingerprint" \
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
    || die "host backup manifest signature contract is invalid"

  raw_signature=$(mktemp \
    "${ONLYWAY_OPERATION_LOCK_DIR}/.backup-manifest-signature-verify.XXXXXX")
  jq -r '.signature' "$signature_path" \
    | openssl base64 -d -A -out "$raw_signature"
  [[ $(stat -c '%s' "$raw_signature") == "64" ]] \
    || die "host backup manifest signature encoding is invalid"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$manifest" \
    -sigfile "$raw_signature" >/dev/null \
    || die "host backup manifest signature is invalid"
  [[ $(stat -c '%d:%i:%u:%g:%a:%s' "$manifest") == "$manifest_identity" \
    && $(sha256sum "$manifest" | awk '{print $1}') == "$manifest_fingerprint" \
    && $(stat -c '%d:%i:%u:%g:%a:%s' "$signature_path") == "$signature_identity" \
    && $(stat -c '%d:%i:%u:%g:%a:%s' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == \
      "$public_key_identity" ]] \
    || die "backup manifest signature inputs changed during verification"
  printf '%s\n' "$signature_path"
)

assert_private_running_stack() (
  local project=$1
  local commit=$2
  local image_id=$3
  local port=$4
  local inspect_file=
  local -a ids
  trap '
    [[ -z ${inspect_file:-} || ! -e $inspect_file ]] || unlink "$inspect_file"
  ' EXIT

  require_safe_name "$project" "Compose project"
  require_commit "$commit"
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] \
    || die "running stack image ID is invalid"
  [[ $port =~ ^[1-9][0-9]{0,4}$ && $port -le 65535 ]] \
    || die "running stack loopback port is invalid"
  require_command docker
  require_command jq

  docker network inspect "${project}_onlyway_private" \
    | jq -e \
      'length == 1 and .[0].Internal == true and .[0].Driver == "bridge"' \
      >/dev/null \
    || die "stack network is not an internal no-egress bridge"
  mapfile -t ids < <(
    docker ps --no-trunc \
      --filter "label=com.docker.compose.project=${project}" \
      --format '{{.ID}}'
  )
  [[ ${#ids[@]} -eq 5 ]] \
    || die "running stack does not contain exactly five core services"
  inspect_file=$(mktemp "${ONLYWAY_RUN_DIR}/.container-inspect.XXXXXX")
  docker inspect "${ids[@]}" >"$inspect_file"
  jq -e \
    --arg commit "$commit" \
    --arg caddyImage "$ONLYWAY_CADDY_IMAGE" \
    --arg imageId "$image_id" \
    --arg port "$port" \
    '
      ([.[].Config.Labels["com.docker.compose.service"]] | sort) ==
        (["command-center", "health-monitor", "reverse-proxy", "scheduler", "worker"] | sort) and
      all(.[];
        .State.Running == true and
        .HostConfig.Privileged == false and
        .HostConfig.ReadonlyRootfs == true and
        .Config.User == "2001:2001" and
        (.HostConfig.CapDrop | index("ALL")) != null and
        .HostConfig.NetworkMode != "host" and
        ([.Mounts[]?.Destination] | index("/var/run/docker.sock")) == null
      ) and
      all(.[];
        if .Config.Labels["com.docker.compose.service"] == "reverse-proxy"
        then .Config.Image == $caddyImage
        else
          .Image == $imageId and
          .Config.Image == ("mv-ai-os:" + $commit) and
          (.Config.Env | index("ONLYWAY_RELEASE_COMMIT=" + $commit)) != null
        end
      ) and
      ([.[] | (.NetworkSettings.Ports // {}) | to_entries[] | .value[]?] |
        length == 1 and
        .[0].HostIp == "127.0.0.1" and
        .[0].HostPort == $port)
    ' "$inspect_file" >/dev/null \
    || die "container identity, confinement or loopback-only port contract failed"
)

validate_release_systemd_units() {
  local source_root=$1
  local validation_dir
  local result=0
  require_absolute_path "$source_root" "systemd release root"
  require_command systemd-analyze
  [[ -d $source_root && ! -L $source_root ]] \
    || die "systemd release root is unavailable"
  validation_dir=$(mktemp -d "${ONLYWAY_RUN_DIR}/.systemd-validation.XXXXXX")
  chmod 0700 "$validation_dir"
  sed "s#/srv/onlyway/current#${source_root}#g" \
    "${source_root}/ops/systemd/mv-ai-os.service" \
    >"${validation_dir}/mv-ai-os.service" \
    || result=1
  sed "s#/srv/onlyway/current#${source_root}#g" \
    "${source_root}/ops/systemd/mv-ai-os-backup.service" \
    >"${validation_dir}/mv-ai-os-backup.service" \
    || result=1
  sed "s#/srv/onlyway/current#${source_root}#g" \
    "${source_root}/ops/systemd/mv-ai-os-backup.timer" \
    >"${validation_dir}/mv-ai-os-backup.timer" \
    || result=1
  if ((result == 0)); then
    systemd-analyze verify \
      "${validation_dir}/mv-ai-os.service" \
      "${validation_dir}/mv-ai-os-backup.service" \
      "${validation_dir}/mv-ai-os-backup.timer" \
      || result=1
  fi
  unlink \
    "${validation_dir}/mv-ai-os.service" \
    "${validation_dir}/mv-ai-os-backup.service" \
    "${validation_dir}/mv-ai-os-backup.timer" \
    2>/dev/null || true
  rmdir "$validation_dir" 2>/dev/null || true
  ((result == 0))
}

compose() {
  local release
  release=$(current_release) || die "current release is unavailable"
  validate_release_path "$release" >/dev/null
  COMPOSE_PROJECT_NAME="$ONLYWAY_COMPOSE_PROJECT" \
    docker compose \
      --project-directory "$release" \
      --file "$release/compose.production.yml" \
      "$@"
}

write_compose_environment() {
  local commit=$1
  local target="${ONLYWAY_CONFIG_DIR}/compose.env"
  local temporary
  require_commit "$commit"
  temporary=$(mktemp "${ONLYWAY_CONFIG_DIR}/.compose.env.XXXXXX")
  {
    printf 'ONLYWAY_RELEASE_COMMIT=%s\n' "$commit"
    printf 'ONLYWAY_DATA_DIR=%s\n' "$ONLYWAY_DATA_DIR"
    printf 'ONLYWAY_BACKUP_DIR=%s\n' "$ONLYWAY_BACKUP_DIR"
    printf 'ONLYWAY_CONFIG_DIR=%s\n' "$ONLYWAY_CONFIG_DIR"
    printf 'ONLYWAY_ADMIN_STATE_DIR=%s\n' "$ONLYWAY_ADMIN_STATE_DIR"
    printf 'ONLYWAY_SECRETS_DIR=%s\n' "$ONLYWAY_SECRETS_DIR"
    printf 'ONLYWAY_ADMIN_SECRETS_DIR=%s\n' "$ONLYWAY_ADMIN_SECRETS_DIR"
    printf 'ONLYWAY_ADMIN_BOOTSTRAP_DIR=%s\n' "$ONLYWAY_ADMIN_BOOTSTRAP_DIR"
    printf 'ONLYWAY_ADMIN_PEPPER_FILE=%s\n' "$ONLYWAY_ADMIN_PEPPER_FILE"
    printf 'ONLYWAY_EXTERNAL_ORIGIN=http://localhost:43100\n'
    printf 'ONLYWAY_TUNNEL_PORT=43100\n'
  } >"$temporary"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$temporary"
  chmod 0640 "$temporary"
  mv -fT -- "$temporary" "$target"
}

atomic_switch_current() {
  local target=$1
  local temporary="${ONLYWAY_ROOT}/.current.$$.tmp"
  validate_release_path "$target" >/dev/null
  [[ ! -e $temporary && ! -L $temporary ]] || die "temporary current link already exists"
  ln -s -- "$target" "$temporary"
  mv -fT -- "$temporary" "$ONLYWAY_CURRENT_LINK"
}

verify_host_receipt_signature() (
  local receipt=$1
  local signature="${receipt}.sig"
  local verification_dir=
  local receipt_snapshot
  local signature_snapshot
  local public_key_snapshot
  local receipt_identity
  local signature_identity
  local public_key_identity
  local receipt_size
  local signature_size
  local public_key_size

  cleanup_host_receipt_verification() {
    if [[ -n ${verification_dir:-} \
      && -d $verification_dir \
      && $verification_dir == \
        "${ONLYWAY_OPERATION_LOCK_DIR}/.host-receipt-verify."* ]]; then
      find "$verification_dir" -mindepth 1 -maxdepth 1 -type f -delete
      rmdir "$verification_dir"
    fi
  }
  trap cleanup_host_receipt_verification EXIT

  require_absolute_path "$receipt" "host receipt"
  for command in dd find mktemp openssl readlink stat; do
    require_command "$command"
  done
  [[ -f $receipt && ! -L $receipt ]] \
    || die "host receipt is unavailable or not a regular file"
  [[ $(readlink -f -- "$receipt") == "$receipt" ]] \
    || die "host receipt path is not canonical"
  [[ $(stat -c '%u:%g' "$receipt") == "0:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$receipt") == "640" ]] \
    || die "host receipt ownership or mode is invalid"
  receipt_size=$(stat -c '%s' "$receipt")
  [[ $receipt_size =~ ^[1-9][0-9]*$ && $receipt_size -le 65536 ]] \
    || die "host receipt size is invalid"
  [[ -f $signature && ! -L $signature ]] \
    || die "host receipt signature is unavailable or not a regular file"
  [[ $(readlink -f -- "$signature") == "$signature" ]] \
    || die "host receipt signature path is not canonical"
  [[ $(stat -c '%u:%g' "$signature") == "0:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$signature") == "640" ]] \
    || die "host receipt signature ownership or mode is invalid"
  signature_size=$(stat -c '%s' "$signature")
  [[ $signature_size == "64" ]] \
    || die "host receipt signature is not detached Ed25519"
  [[ -f $ONLYWAY_ACCEPTANCE_PUBLIC_KEY \
    && ! -L $ONLYWAY_ACCEPTANCE_PUBLIC_KEY ]] \
    || die "host receipt trust anchor is unavailable"
  [[ $(readlink -f -- "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == \
    "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" ]] \
    || die "host receipt trust anchor path is not canonical"
  [[ $(stat -c '%u:%g:%a' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == \
    "0:0:644" ]] \
    || die "host receipt trust anchor metadata is invalid"
  public_key_size=$(stat -c '%s' "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY")
  [[ $public_key_size =~ ^[1-9][0-9]*$ \
    && $public_key_size -le 4096 ]] \
    || die "host receipt trust anchor size is invalid"

  verification_dir=$(mktemp -d \
    "${ONLYWAY_OPERATION_LOCK_DIR}/.host-receipt-verify.XXXXXX")
  chmod 0700 "$verification_dir"
  receipt_snapshot="${verification_dir}/receipt.json"
  signature_snapshot="${verification_dir}/receipt.json.sig"
  public_key_snapshot="${verification_dir}/release-acceptance.pub.pem"
  receipt_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$receipt")
  signature_identity=$(stat -c '%d:%i:%u:%g:%a:%s' "$signature")
  public_key_identity=$(stat -c '%d:%i:%u:%g:%a:%s' \
    "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY")
  dd if="$receipt" of="$receipt_snapshot" \
    iflag=nofollow,fullblock conv=excl status=none
  dd if="$signature" of="$signature_snapshot" \
    iflag=nofollow,fullblock conv=excl status=none
  dd if="$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" of="$public_key_snapshot" \
    iflag=nofollow,fullblock conv=excl status=none
  chmod 0600 "$receipt_snapshot" "$signature_snapshot" "$public_key_snapshot"
  [[ $(stat -c '%d:%i:%u:%g:%a:%s' "$receipt") == \
      "$receipt_identity" \
    && $(stat -c '%d:%i:%u:%g:%a:%s' "$signature") == \
      "$signature_identity" \
    && $(stat -c '%d:%i:%u:%g:%a:%s' \
      "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY") == "$public_key_identity" \
    && $(stat -c '%s' "$receipt_snapshot") == "$receipt_size" \
    && $(stat -c '%s' "$signature_snapshot") == "$signature_size" \
    && $(stat -c '%s' "$public_key_snapshot") == "$public_key_size" ]] \
    || die "host receipt evidence changed during no-follow snapshot"
  openssl pkey -pubin -in "$public_key_snapshot" -noout
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$public_key_snapshot" \
    -in "$receipt_snapshot" \
    -sigfile "$signature_snapshot" >/dev/null \
    || die "host receipt detached Ed25519 signature is invalid"
  printf '%s\n' "$signature"
)

write_receipt() (
  local action=$1
  local status=$2
  local commit=${3:-}
  local detail=${4:-}
  local receipt_dir="${ONLYWAY_RUN_DIR}/receipts"
  local timestamp
  local compact_timestamp
  local target
  local signature_target
  local temporary
  local signature_temporary
  local expired_signature
  local expired_receipt
  local orphan_signature
  local signature_published=false
  local receipt_published=false

  cleanup_host_receipt_write() {
    [[ -z ${temporary:-} || ! -e $temporary ]] || unlink "$temporary"
    [[ -z ${signature_temporary:-} || ! -e $signature_temporary ]] \
      || unlink "$signature_temporary"
    if [[ ${signature_published:-false} == "true" \
      && ${receipt_published:-false} == "false" \
      && -n ${signature_target:-} \
      && -f $signature_target \
      && ! -L $signature_target ]]; then
      unlink "$signature_target"
      sync -f "$receipt_dir" || true
    fi
  }
  trap cleanup_host_receipt_write EXIT

  for command in jq openssl stat sync; do
    require_command "$command"
  done
  require_safe_name "$action" "receipt action"
  ensure_acceptance_signing_identity
  install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 "$receipt_dir"

  # Retention runs before publication. Once the JSON becomes visible, this
  # function performs no operation that can turn a valid receipt into a
  # reported failure.
  while IFS= read -r -d '' orphan_signature; do
    [[ $(basename -- "$orphan_signature") =~ \
      ^[0-9]{8}T[0-9]{6}Z-[a-z][a-z0-9._-]{2,127}-[0-9]+\.json\.sig$ \
      && -f $orphan_signature \
      && ! -L $orphan_signature \
      && $(stat -c '%u:%g' "$orphan_signature") == "0:${ONLYWAY_GID}" \
      && $(stat -c '%a' "$orphan_signature") == "640" \
      && $(stat -c '%s' "$orphan_signature") == "64" ]] \
      || die "receipt retention encountered an unsafe orphan signature"
    [[ ! -e ${orphan_signature%.sig} \
      && ! -L ${orphan_signature%.sig} ]] \
      || continue
    unlink "$orphan_signature"
  done < <(
    find "$receipt_dir" -mindepth 1 -maxdepth 1 -type f \
      -name '[0-9]*.json.sig' -print0
  )
  while IFS= read -r expired_receipt; do
    [[ -f $expired_receipt && ! -L $expired_receipt \
      && $(dirname -- "$expired_receipt") == "$receipt_dir" \
      && $(basename -- "$expired_receipt") =~ ^[0-9]{8}T[0-9]{6}Z-[a-z][a-z0-9._-]{2,127}-[0-9]+\.json$ \
      && $(stat -c '%u:%g' "$expired_receipt") == "0:${ONLYWAY_GID}" \
      && $(stat -c '%a' "$expired_receipt") == "640" ]] \
      || die "receipt retention encountered an unsafe entry"
    expired_signature="${expired_receipt}.sig"
    verify_host_receipt_signature "$expired_receipt" >/dev/null
    unlink "$expired_receipt"
    unlink "$expired_signature"
  done < <(
    find "$receipt_dir" -mindepth 1 -maxdepth 1 -type f \
      -name '[0-9]*.json' -printf '%T@ %p\n' \
      | sort -nr \
      | awk 'NR >= 200 {sub(/^[^ ]+ /, ""); print}'
  )
  sync -f "$receipt_dir"

  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  compact_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  target="${receipt_dir}/${compact_timestamp}-${action}-${BASHPID}.json"
  signature_target="${target}.sig"
  [[ ! -e $target && ! -L $target \
    && ! -e $signature_target && ! -L $signature_target ]] \
    || die "host receipt target already exists"
  temporary=$(mktemp "${receipt_dir}/.${action}.XXXXXX")
  signature_temporary=$(mktemp "${receipt_dir}/.${action}-signature.XXXXXX")
  jq -n \
    --arg action "$action" \
    --arg commit "$commit" \
    --arg detail "$detail" \
    --arg recordedAt "$timestamp" \
    --arg status "$status" \
    '{
      contractVersion: "1",
      action: $action,
      status: $status,
      recordedAt: $recordedAt,
      commit: (if $commit == "" then null else $commit end),
      detail: (if $detail == "" then null else $detail end),
      secretsExposed: false
    }' >"$temporary"
  openssl pkeyutl -sign -rawin \
    -inkey "$ONLYWAY_ACCEPTANCE_PRIVATE_KEY" \
    -in "$temporary" \
    -out "$signature_temporary"
  [[ $(stat -c '%s' "$signature_temporary") == "64" ]] \
    || die "host receipt signature is not detached Ed25519"
  openssl pkeyutl -verify -rawin -pubin \
    -inkey "$ONLYWAY_ACCEPTANCE_PUBLIC_KEY" \
    -in "$temporary" \
    -sigfile "$signature_temporary" >/dev/null \
    || die "host receipt signature verification failed before publication"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$temporary"
  chown root:"$ONLYWAY_SERVICE_GROUP" "$signature_temporary"
  chmod 0640 "$temporary" "$signature_temporary"
  sync -f "$temporary"
  sync -f "$signature_temporary"
  mv -T -- "$signature_temporary" "$signature_target"
  signature_temporary=
  signature_published=true
  sync -f "$receipt_dir"
  mv -T -- "$temporary" "$target"
  temporary=
  receipt_published=true
  sync -f "$receipt_dir" \
    || log "receipt published but receipt-directory durability sync requires operator review"
  trap - EXIT
  printf '%s\n' "$target"
)

invalidate_host_receipt() (
  local receipt=$1
  local expected_action=$2
  local expected_status=$3
  local expected_commit=${4:-}
  local receipt_dir="${ONLYWAY_RUN_DIR}/receipts"
  local signature="${receipt}.sig"

  require_absolute_path "$receipt" "host receipt"
  require_safe_name "$expected_action" "receipt action"
  [[ $(dirname -- "$receipt") == "$receipt_dir" \
    && $(basename -- "$receipt") =~ \
      ^[0-9]{8}T[0-9]{6}Z-[a-z][a-z0-9._-]{2,127}-[0-9]+\.json$ ]] \
    || die "host receipt invalidation target is outside the receipt boundary"
  verify_host_receipt_signature "$receipt" >/dev/null
  jq -e \
    --arg action "$expected_action" \
    --arg status "$expected_status" \
    --arg commit "$expected_commit" \
    '
      .contractVersion == "1" and
      .action == $action and
      .status == $status and
      .secretsExposed == false and
      (
        if $commit == ""
        then .commit == null
        else .commit == $commit
        end
      )
    ' "$receipt" >/dev/null \
    || die "host receipt invalidation contract does not match"

  # Removing the JSON first immediately makes the pair non-authoritative. A
  # detached orphan signature is harmless and is also pruned on the next write.
  unlink "$receipt"
  if [[ -f $signature && ! -L $signature ]]; then
    unlink "$signature" \
      || log "invalidated receipt left a detached orphan signature"
  fi
  sync -f "$receipt_dir" \
    || log "invalidated receipt directory sync requires operator review"
)

prune_release_artifacts() (
  local maximum=${1:-3}
  local current
  local previous=
  local candidate
  local commit
  local marker
  local quarantine
  local kept=0
  declare -A preserve=()

  [[ $maximum =~ ^[1-9][0-9]?$ && $maximum -ge 2 ]] \
    || die "release retention maximum is invalid"
  require_command docker
  current=$(current_release) || die "release retention requires current release"
  current=$(validate_release_path "$current")
  preserve[$current]=1
  if [[ -f "${ONLYWAY_RUN_DIR}/previous-release" \
    && ! -L "${ONLYWAY_RUN_DIR}/previous-release" ]]; then
    previous=$(<"${ONLYWAY_RUN_DIR}/previous-release")
    previous=$(validate_release_path "$previous")
    preserve[$previous]=1
  elif [[ -e "${ONLYWAY_RUN_DIR}/previous-release" \
    || -L "${ONLYWAY_RUN_DIR}/previous-release" ]]; then
    die "release retention previous-release pointer is unsafe"
  fi
  kept=${#preserve[@]}

  mapfile -t release_candidates < <(
    find "$ONLYWAY_RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
      -name '[0-9a-f]*' -printf '%T@ %p\n' \
      | sort -nr \
      | awk '{sub(/^[^ ]+ /, ""); print}'
  )
  for candidate in "${release_candidates[@]}"; do
    candidate=$(validate_release_path "$candidate")
    if [[ -n ${preserve[$candidate]+present} ]]; then
      continue
    fi
    if ((kept < maximum)); then
      preserve[$candidate]=1
      kept=$((kept + 1))
      continue
    fi
    commit=$(basename -- "$candidate")
    require_commit "$commit"
    marker=$(acceptance_marker_path "$commit")
    [[ -f $marker && ! -L $marker \
      && $(stat -c '%u:%g' "$marker") == "0:${ONLYWAY_GID}" \
      && $(stat -c '%a' "$marker") == "640" ]] \
      || die "release retention acceptance marker is unsafe"
    if [[ -n $(docker ps -a --quiet --filter "ancestor=mv-ai-os:${commit}") ]]; then
      die "release retention found a container using an expired image"
    fi
    quarantine=$(mktemp -d "${ONLYWAY_RUN_DIR}/.release-retention.XXXXXX")
    chmod 0700 "$quarantine"
    mv -T -- "$marker" "${quarantine}/acceptance.json"
    if ! mv -T -- "$candidate" "${quarantine}/release"; then
      mv -T -- "${quarantine}/acceptance.json" "$marker"
      find "$quarantine" -xdev -depth -delete
      die "release retention could not quarantine a release atomically"
    fi
    if docker image inspect "mv-ai-os:${commit}" >/dev/null 2>&1; then
      docker image rm "mv-ai-os:${commit}" >/dev/null \
        || log "expired image ${commit} could not be pruned"
    fi
    find "$quarantine" -xdev -depth -delete
  done
)

acquire_operation_lock() {
  local name=$1
  local inherited_fd=${ONLYWAY_MUTATION_LOCK_FD:-}
  local lock_target
  require_safe_name "$name" "lock name"
  require_command flock
  install -d -o root -g "$ONLYWAY_SERVICE_GROUP" -m 0750 \
    "$ONLYWAY_OPERATION_LOCK_DIR"
  if [[ -n $inherited_fd ]]; then
    [[ $inherited_fd =~ ^[0-9]{1,3}$ && -e "/proc/$$/fd/${inherited_fd}" ]] \
      || die "inherited production mutation lock is invalid"
    lock_target=$(readlink -f -- "/proc/$$/fd/${inherited_fd}")
    [[ $lock_target == "$(readlink -f -- "${ONLYWAY_OPERATION_LOCK_DIR}/production-mutation.lock")" ]] \
      || die "inherited production mutation lock targets the wrong file"
    flock -n "$inherited_fd" \
      || die "inherited production mutation lock is not held"
    ONLYWAY_GLOBAL_LOCK_FD=$inherited_fd
  else
    exec {ONLYWAY_GLOBAL_LOCK_FD}>"${ONLYWAY_OPERATION_LOCK_DIR}/production-mutation.lock"
    flock -n "$ONLYWAY_GLOBAL_LOCK_FD" \
      || die "another production mutation is active"
  fi
  export ONLYWAY_MUTATION_LOCK_FD="$ONLYWAY_GLOBAL_LOCK_FD"
  exec {ONLYWAY_LOCK_FD}>"${ONLYWAY_OPERATION_LOCK_DIR}/${name}.lock"
  flock -n "$ONLYWAY_LOCK_FD" || die "another ${name} operation is active"
}

source_compose_environment() {
  local file="${ONLYWAY_CONFIG_DIR}/compose.env"
  local line
  local key
  local value
  declare -A parsed=()
  [[ -f $file && ! -L $file ]] || die "Compose environment is unavailable"
  [[ $(stat -c '%u:%g' "$ONLYWAY_CONFIG_DIR") == "0:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$ONLYWAY_CONFIG_DIR") == "750" ]] \
    || die "Compose configuration directory ownership or mode is unsafe"
  [[ $(stat -c '%u:%g' "$file") == "0:${ONLYWAY_GID}" \
    && $(stat -c '%a' "$file") == "640" \
    && $(stat -c '%s' "$file") -ge 1 \
    && $(stat -c '%s' "$file") -le 8192 ]] \
    || die "Compose environment ownership, mode or size is unsafe"
  while IFS= read -r line || [[ -n $line ]]; do
    [[ $line =~ ^([A-Z][A-Z0-9_]*)=([^[:space:]]+)$ ]] \
      || die "Compose environment contains invalid syntax"
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    [[ -z ${parsed[$key]+present} ]] \
      || die "Compose environment contains a duplicate key"
    case "$key" in
      ONLYWAY_RELEASE_COMMIT|ONLYWAY_DATA_DIR|ONLYWAY_BACKUP_DIR|ONLYWAY_CONFIG_DIR|ONLYWAY_ADMIN_STATE_DIR|ONLYWAY_SECRETS_DIR|ONLYWAY_ADMIN_SECRETS_DIR|ONLYWAY_ADMIN_BOOTSTRAP_DIR|ONLYWAY_ADMIN_PEPPER_FILE|ONLYWAY_EXTERNAL_ORIGIN|ONLYWAY_TUNNEL_PORT)
        parsed[$key]=$value
        ;;
      *)
        die "Compose environment contains an unexpected key"
        ;;
    esac
  done <"$file"
  [[ ${#parsed[@]} -eq 11 ]] \
    || die "Compose environment is incomplete"
  require_commit "${parsed[ONLYWAY_RELEASE_COMMIT]:-}"
  [[ ${parsed[ONLYWAY_DATA_DIR]:-} == "$ONLYWAY_DATA_DIR" \
    && ${parsed[ONLYWAY_BACKUP_DIR]:-} == "$ONLYWAY_BACKUP_DIR" \
    && ${parsed[ONLYWAY_CONFIG_DIR]:-} == "$ONLYWAY_CONFIG_DIR" \
    && ${parsed[ONLYWAY_ADMIN_STATE_DIR]:-} == "$ONLYWAY_ADMIN_STATE_DIR" \
    && ${parsed[ONLYWAY_SECRETS_DIR]:-} == "$ONLYWAY_SECRETS_DIR" \
    && ${parsed[ONLYWAY_ADMIN_SECRETS_DIR]:-} == "$ONLYWAY_ADMIN_SECRETS_DIR" \
    && ${parsed[ONLYWAY_ADMIN_BOOTSTRAP_DIR]:-} == "$ONLYWAY_ADMIN_BOOTSTRAP_DIR" \
    && ${parsed[ONLYWAY_ADMIN_PEPPER_FILE]:-} == "$ONLYWAY_ADMIN_PEPPER_FILE" \
    && ${parsed[ONLYWAY_EXTERNAL_ORIGIN]:-} == "http://localhost:43100" \
    && ${parsed[ONLYWAY_TUNNEL_PORT]:-} == "43100" ]] \
    || die "Compose environment values do not match the private host boundary"
  ONLYWAY_RELEASE_COMMIT=${parsed[ONLYWAY_RELEASE_COMMIT]}
  ONLYWAY_EXTERNAL_ORIGIN=${parsed[ONLYWAY_EXTERNAL_ORIGIN]}
  ONLYWAY_TUNNEL_PORT=${parsed[ONLYWAY_TUNNEL_PORT]}
  export \
    ONLYWAY_RELEASE_COMMIT ONLYWAY_DATA_DIR ONLYWAY_BACKUP_DIR \
    ONLYWAY_CONFIG_DIR ONLYWAY_ADMIN_STATE_DIR ONLYWAY_SECRETS_DIR \
    ONLYWAY_ADMIN_SECRETS_DIR ONLYWAY_ADMIN_BOOTSTRAP_DIR \
    ONLYWAY_ADMIN_PEPPER_FILE ONLYWAY_EXTERNAL_ORIGIN ONLYWAY_TUNNEL_PORT
}
