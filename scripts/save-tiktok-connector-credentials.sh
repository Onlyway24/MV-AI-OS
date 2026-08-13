#!/usr/bin/env bash
set -euo pipefail

CONFIG_ROOT="${XDG_CONFIG_HOME:-${HOME}/.config}/mv-ai-os/social"
mkdir -p "${CONFIG_ROOT}"
chmod 700 "${CONFIG_ROOT}"
umask 077

IFS= read -r -p "TikTok Client Key: " CLIENT_KEY
IFS= read -r -s -p "TikTok Client Secret (input nascosto): " CLIENT_SECRET
printf '\n'

if [[ -z "${CLIENT_KEY}" || -z "${CLIENT_SECRET}" ]]; then
  printf 'Valori mancanti: nessun file aggiornato.\n' >&2
  exit 1
fi

printf '%s' "${CLIENT_KEY}" > "${CONFIG_ROOT}/tiktok-client-key"
printf '%s' "${CLIENT_SECRET}" > "${CONFIG_ROOT}/tiktok-client-secret"
chmod 600 "${CONFIG_ROOT}/tiktok-client-key" "${CONFIG_ROOT}/tiktok-client-secret"
if [[ ! -f "${CONFIG_ROOT}/oauth-vault-key" ]]; then
  openssl rand -hex 32 > "${CONFIG_ROOT}/oauth-vault-key"
  chmod 600 "${CONFIG_ROOT}/oauth-vault-key"
fi
unset CLIENT_KEY CLIENT_SECRET

KEY_MODE="$(stat -f '%Lp' "${CONFIG_ROOT}/tiktok-client-key")"
SECRET_MODE="$(stat -f '%Lp' "${CONFIG_ROOT}/tiktok-client-secret")"
printf 'TikTok references: PRESENT; client-key mode=%s; client-secret mode=%s; values not displayed.\n' "${KEY_MODE}" "${SECRET_MODE}"
