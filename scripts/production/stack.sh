#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=scripts/production/lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

ACTION=${1:-}
[[ $# -le 1 ]] || die "usage: $0 <start|stop|restart|status|logs>"
require_root
ensure_layout_exists
if [[ $ACTION == "start" || $ACTION == "stop" || $ACTION == "restart" ]]; then
  acquire_operation_lock stack
fi
source_compose_environment

case "$ACTION" in
  start)
    systemctl start "$ONLYWAY_SYSTEMD_UNIT"
    "${SCRIPT_DIR}/readiness.sh" \
      --expected-commit "$ONLYWAY_RELEASE_COMMIT" \
      --attempts 24 \
      --interval 5 >/dev/null
    ;;
  stop)
    systemctl stop "$ONLYWAY_SYSTEMD_UNIT"
    ! systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
      || die "systemd unit remains active after stop"
    ;;
  restart)
    systemctl restart "$ONLYWAY_SYSTEMD_UNIT"
    "${SCRIPT_DIR}/readiness.sh" \
      --expected-commit "$ONLYWAY_RELEASE_COMMIT" \
      --attempts 24 \
      --interval 5 >/dev/null
    ;;
  status)
    systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" \
      || die "systemd unit is not active"
    systemctl status --no-pager "$ONLYWAY_SYSTEMD_UNIT"
    "${SCRIPT_DIR}/release-preflight.sh" \
      --expected-commit "$ONLYWAY_RELEASE_COMMIT"
    compose ps
    mapfile -t RUNNING_SERVICES < <(compose ps --status running --services | sort)
    [[ ${RUNNING_SERVICES[*]} == \
      "command-center health-monitor reverse-proxy scheduler worker" ]] \
      || die "the five core Compose services are not all running"
    "${SCRIPT_DIR}/readiness.sh" \
      --expected-commit "$ONLYWAY_RELEASE_COMMIT" >/dev/null
    ;;
  logs)
    compose logs --tail 200
    ;;
  *)
    die "usage: $0 <start|stop|restart|status|logs>"
    ;;
esac
