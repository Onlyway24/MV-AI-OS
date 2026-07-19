#!/bin/sh
set -eu

LABELS="api telegram scheduler worker backup-verifier health-monitor"
DOMAIN="gui/$(id -u)"

usage() {
  echo "usage: $0 <render|install|start|stop|status|uninstall|smoke|rotate-logs> --repo ABS --node ABS --config ABS --log-dir ABS --backup-dir ABS" >&2
  exit 2
}

ACTION=${1:-}
[ -n "$ACTION" ] || usage
shift
REPO="" NODE="" CONFIG="" LOG_DIR="" BACKUP_DIR=""
while [ "$#" -gt 0 ]; do
  [ "$#" -ge 2 ] || usage
  case "$1" in
    --repo) REPO=$2 ;;
    --node) NODE=$2 ;;
    --config) CONFIG=$2 ;;
    --log-dir) LOG_DIR=$2 ;;
    --backup-dir) BACKUP_DIR=$2 ;;
    *) usage ;;
  esac
  shift 2
done

for VALUE in "$REPO" "$NODE" "$CONFIG" "$LOG_DIR" "$BACKUP_DIR"; do
  case "$VALUE" in /*) ;; *) usage ;; esac
done
[ -d "$REPO/ops/launchd" ] || { echo "launchd templates not found" >&2; exit 3; }
[ -x "$NODE" ] || { echo "node executable not found" >&2; exit 3; }
[ -f "$CONFIG" ] || { echo "config file not found" >&2; exit 3; }

DEST="$HOME/Library/LaunchAgents"
mkdir -p "$DEST" "$LOG_DIR" "$BACKUP_DIR"
chmod 700 "$LOG_DIR" "$BACKUP_DIR"

escape_xml_sed() {
  printf '%s' "$1" \
    | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' \
    | sed 's/[&|\\]/\\&/g'
}
render_one() {
  LABEL=$1
  SOURCE="$REPO/ops/launchd/ai.onlyway.mv-ai-os.$LABEL.plist.template"
  TARGET="$DEST/ai.onlyway.mv-ai-os.$LABEL.plist"
  sed -e "s|__NODE__|$(escape_xml_sed "$NODE")|g" \
      -e "s|__REPO__|$(escape_xml_sed "$REPO")|g" \
      -e "s|__CONFIG__|$(escape_xml_sed "$CONFIG")|g" \
      -e "s|__LOG_DIR__|$(escape_xml_sed "$LOG_DIR")|g" \
      -e "s|__BACKUP_DIR__|$(escape_xml_sed "$BACKUP_DIR")|g" "$SOURCE" > "$TARGET"
  chmod 600 "$TARGET"
  plutil -lint "$TARGET" >/dev/null
}
render_all() { for LABEL in $LABELS; do render_one "$LABEL"; done; }
stop_all() { for LABEL in $LABELS; do launchctl bootout "$DOMAIN" "$DEST/ai.onlyway.mv-ai-os.$LABEL.plist" >/dev/null 2>&1 || true; done; }
start_all() { for LABEL in $LABELS; do launchctl bootstrap "$DOMAIN" "$DEST/ai.onlyway.mv-ai-os.$LABEL.plist"; done; }
rotate_logs() {
  NOW=$(date -u +%Y%m%dT%H%M%SZ)
  for LOG in "$LOG_DIR"/*.log; do
    [ -f "$LOG" ] || continue
    SIZE=$(stat -f %z "$LOG")
    if [ "$SIZE" -gt 10485760 ]; then cp "$LOG" "$LOG.$NOW"; : > "$LOG"; fi
  done
  find "$LOG_DIR" -type f -name '*.log.*' -mtime +14 -delete
}

case "$ACTION" in
  render) render_all ;;
  install) render_all; stop_all; start_all ;;
  start) start_all ;;
  stop) stop_all ;;
  status) for LABEL in $LABELS; do launchctl print "$DOMAIN/ai.onlyway.mv-ai-os.$LABEL" 2>/dev/null || echo "ai.onlyway.mv-ai-os.$LABEL: stopped"; done ;;
  uninstall) stop_all; for LABEL in $LABELS; do rm -f "$DEST/ai.onlyway.mv-ai-os.$LABEL.plist"; done ;;
  smoke) "$NODE" "$REPO/dist/operations-runtime/operations-runtime-cli.js" --config "$CONFIG" --role smoke ;;
  rotate-logs) rotate_logs ;;
  *) usage ;;
esac
