#!/usr/bin/env bash

set -Eeuo pipefail

URL=${ONLYWAY_PRIVATE_URL:-http://localhost:43100}
TIMEOUT=5
while (($# > 0)); do
  case "$1" in
    --url) [[ $# -ge 2 ]] || { printf '%s\n' "--url requires a value" >&2; exit 2; }; URL=$2; shift ;;
    --timeout) [[ $# -ge 2 ]] || { printf '%s\n' "--timeout requires a value" >&2; exit 2; }; TIMEOUT=$2; shift ;;
    *) printf 'usage: %s [--url HTTP_LOOPBACK_URL] [--timeout SECONDS]\n' "$0" >&2; exit 2 ;;
  esac
  shift
done

[[ $URL =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]] \
  || { printf '%s\n' "health URL must be loopback HTTP" >&2; exit 2; }
[[ $TIMEOUT =~ ^[1-9][0-9]?$ ]] \
  || { printf '%s\n' "timeout must be between 1 and 99 seconds" >&2; exit 2; }
command -v curl >/dev/null 2>&1 || { printf '%s\n' "curl is required" >&2; exit 1; }

curl --fail --silent --show-error \
  --connect-timeout "$TIMEOUT" --max-time "$TIMEOUT" \
  "${URL}/health/live"
printf '\n'
