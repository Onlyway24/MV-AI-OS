#!/usr/bin/env bash
set -euo pipefail

CONFIG_ROOT="${XDG_CONFIG_HOME:-${HOME}/.config}/mv-ai-os/social"
mkdir -p "${CONFIG_ROOT}"
chmod 700 "${CONFIG_ROOT}"
umask 077

IFS= read -r -p "Instagram App ID: " APP_ID
IFS= read -r -s -p "Instagram Client Secret (input nascosto): " CLIENT_SECRET
printf '\n'

if [[ -z "${APP_ID}" || -z "${CLIENT_SECRET}" ]]; then
  printf 'Valori mancanti: nessun file aggiornato.\n' >&2
  exit 1
fi

printf '%s' "${APP_ID}" > "${CONFIG_ROOT}/instagram-app-id"
printf '%s' "${CLIENT_SECRET}" > "${CONFIG_ROOT}/instagram-client-secret"
chmod 600 "${CONFIG_ROOT}/instagram-app-id" "${CONFIG_ROOT}/instagram-client-secret"
if [[ ! -f "${CONFIG_ROOT}/oauth-vault-key" ]]; then
  openssl rand -hex 32 > "${CONFIG_ROOT}/oauth-vault-key"
  chmod 600 "${CONFIG_ROOT}/oauth-vault-key"
fi
unset APP_ID CLIENT_SECRET

APP_MODE="$(stat -f '%Lp' "${CONFIG_ROOT}/instagram-app-id")"
SECRET_MODE="$(stat -f '%Lp' "${CONFIG_ROOT}/instagram-client-secret")"
printf 'Instagram references: PRESENT; app-id mode=%s; client-secret mode=%s; values not displayed.\n' "${APP_MODE}" "${SECRET_MODE}"
