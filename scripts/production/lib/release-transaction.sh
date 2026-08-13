#!/usr/bin/env bash

# This file is sourced after lib/common.sh by release mutators.

RELEASE_TRANSACTION_ACTIVE=false
RELEASE_TRANSACTION_COMMITTED=false
RELEASE_TRANSACTION_DIR=
RELEASE_TRANSACTION_HAD_CURRENT=false
RELEASE_TRANSACTION_CURRENT=
RELEASE_TRANSACTION_HAD_ENV=false
RELEASE_TRANSACTION_HAD_UNIT=false
RELEASE_TRANSACTION_HAD_BACKUP_SERVICE_UNIT=false
RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT=false
RELEASE_TRANSACTION_HAD_PREVIOUS_RECORD=false
RELEASE_TRANSACTION_HAD_RUNTIME_CONFIG=false
RELEASE_TRANSACTION_HAD_SECURITY_ATTESTATION=false
RELEASE_TRANSACTION_WAS_ACTIVE=false
RELEASE_TRANSACTION_WAS_ENABLED=false
RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE=false
RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ENABLED=false

begin_release_transaction() {
  [[ $RELEASE_TRANSACTION_ACTIVE == "false" ]] \
    || die "release transaction is already active"
  RELEASE_TRANSACTION_DIR=$(mktemp -d "${ONLYWAY_RUN_DIR}/.release-transaction.XXXXXX")
  chmod 0700 "$RELEASE_TRANSACTION_DIR"

  if RELEASE_TRANSACTION_CURRENT=$(current_release 2>/dev/null); then
    RELEASE_TRANSACTION_CURRENT=$(validate_release_path "$RELEASE_TRANSACTION_CURRENT")
    RELEASE_TRANSACTION_HAD_CURRENT=true
  fi
  if [[ -f "${ONLYWAY_CONFIG_DIR}/compose.env" && ! -L "${ONLYWAY_CONFIG_DIR}/compose.env" ]]; then
    cp --preserve=all -- "${ONLYWAY_CONFIG_DIR}/compose.env" \
      "${RELEASE_TRANSACTION_DIR}/compose.env"
    RELEASE_TRANSACTION_HAD_ENV=true
  elif [[ -e "${ONLYWAY_CONFIG_DIR}/compose.env" || -L "${ONLYWAY_CONFIG_DIR}/compose.env" ]]; then
    die "Compose environment is not a regular file"
  fi
  if [[ -f "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" \
    && ! -L "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" ]]; then
    cp --preserve=all -- "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" \
      "${RELEASE_TRANSACTION_DIR}/systemd-unit"
    RELEASE_TRANSACTION_HAD_UNIT=true
  elif [[ -e "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" \
    || -L "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" ]]; then
    die "systemd unit is not a regular file"
  fi
  if [[ -f "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
    && ! -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" ]]; then
    cp --preserve=all -- \
      "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
      "${RELEASE_TRANSACTION_DIR}/backup-systemd-service"
    RELEASE_TRANSACTION_HAD_BACKUP_SERVICE_UNIT=true
  elif [[ -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" ]]; then
    die "backup systemd service is not a regular file"
  fi
  if [[ -f "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
    && ! -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" ]]; then
    cp --preserve=all -- \
      "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
      "${RELEASE_TRANSACTION_DIR}/backup-systemd-timer"
    RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT=true
  elif [[ -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" ]]; then
    die "backup systemd timer is not a regular file"
  fi
  if [[ -f "${ONLYWAY_RUN_DIR}/previous-release" \
    && ! -L "${ONLYWAY_RUN_DIR}/previous-release" ]]; then
    cp --preserve=all -- "${ONLYWAY_RUN_DIR}/previous-release" \
      "${RELEASE_TRANSACTION_DIR}/previous-release"
    RELEASE_TRANSACTION_HAD_PREVIOUS_RECORD=true
  elif [[ -e "${ONLYWAY_RUN_DIR}/previous-release" \
    || -L "${ONLYWAY_RUN_DIR}/previous-release" ]]; then
    die "previous-release record is not a regular file"
  fi
  if [[ -f "${ONLYWAY_CONFIG_DIR}/runtime.json" \
    && ! -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]]; then
    cp --preserve=all -- "${ONLYWAY_CONFIG_DIR}/runtime.json" \
      "${RELEASE_TRANSACTION_DIR}/runtime.json"
    RELEASE_TRANSACTION_HAD_RUNTIME_CONFIG=true
  elif [[ -e "${ONLYWAY_CONFIG_DIR}/runtime.json" \
    || -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]]; then
    die "runtime configuration is not a regular file"
  fi
  if [[ -f "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
    && ! -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
    cp --preserve=all -- "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
      "${RELEASE_TRANSACTION_DIR}/security-attestation.json"
    RELEASE_TRANSACTION_HAD_SECURITY_ATTESTATION=true
  elif [[ -e "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
    || -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
    die "security attestation is not a regular file"
  fi
  if systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT"; then
    RELEASE_TRANSACTION_WAS_ACTIVE=true
  fi
  if systemctl is-enabled --quiet "$ONLYWAY_SYSTEMD_UNIT"; then
    RELEASE_TRANSACTION_WAS_ENABLED=true
  fi
  if systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER"; then
    RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE=true
  fi
  if systemctl is-enabled --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER"; then
    RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ENABLED=true
  fi
  RELEASE_TRANSACTION_ACTIVE=true
}

restore_release_transaction() {
  local restore_service=${1:-true}
  local restored=true
  local temporary
  [[ $restore_service == "true" || $restore_service == "false" ]] \
    || return 1
  [[ $RELEASE_TRANSACTION_ACTIVE == "true" ]] || return 0
  [[ $RELEASE_TRANSACTION_COMMITTED == "false" ]] || return 0
  set +e

  if [[ $RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT == "true" \
    || $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE == "true" \
    || -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" ]]; then
    systemctl stop "$ONLYWAY_BACKUP_SYSTEMD_TIMER" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_HAD_BACKUP_SERVICE_UNIT == "true" \
    || -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" ]]; then
    systemctl stop "$ONLYWAY_BACKUP_SYSTEMD_SERVICE" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ENABLED == "false" ]] \
    && systemctl is-enabled --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER"; then
    systemctl disable "$ONLYWAY_BACKUP_SYSTEMD_TIMER" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_HAD_UNIT == "true" \
    || $RELEASE_TRANSACTION_WAS_ACTIVE == "true" ]]; then
    systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_WAS_ENABLED == "false" \
    && -e "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" ]]; then
    systemctl disable "$ONLYWAY_SYSTEMD_UNIT" || restored=false
  fi

  if [[ $RELEASE_TRANSACTION_HAD_ENV == "true" ]]; then
    temporary=
    temporary=$(mktemp "${ONLYWAY_CONFIG_DIR}/.compose.env.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- "${RELEASE_TRANSACTION_DIR}/compose.env" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" "${ONLYWAY_CONFIG_DIR}/compose.env" \
        || restored=false
    fi
  else
    if [[ -e "${ONLYWAY_CONFIG_DIR}/compose.env" \
      || -L "${ONLYWAY_CONFIG_DIR}/compose.env" ]]; then
      unlink "${ONLYWAY_CONFIG_DIR}/compose.env" || restored=false
    fi
  fi

  if [[ $RELEASE_TRANSACTION_HAD_CURRENT == "true" ]]; then
    atomic_switch_current "$RELEASE_TRANSACTION_CURRENT" || restored=false
  elif [[ -e $ONLYWAY_CURRENT_LINK || -L $ONLYWAY_CURRENT_LINK ]]; then
    if [[ -L $ONLYWAY_CURRENT_LINK ]]; then
      unlink "$ONLYWAY_CURRENT_LINK" || restored=false
    else
      restored=false
    fi
  fi

  if [[ $RELEASE_TRANSACTION_HAD_UNIT == "true" ]]; then
    temporary=
    temporary=$(mktemp "/etc/systemd/system/.${ONLYWAY_SYSTEMD_UNIT}.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- "${RELEASE_TRANSACTION_DIR}/systemd-unit" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" \
        || restored=false
    fi
  elif [[ -e "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" \
    || -L "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" ]]; then
    unlink "/etc/systemd/system/${ONLYWAY_SYSTEMD_UNIT}" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_HAD_BACKUP_SERVICE_UNIT == "true" ]]; then
    temporary=
    temporary=$(mktemp \
      "/etc/systemd/system/.${ONLYWAY_BACKUP_SYSTEMD_SERVICE}.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- \
        "${RELEASE_TRANSACTION_DIR}/backup-systemd-service" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" \
        "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
        || restored=false
    fi
  elif [[ -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" ]]; then
    unlink "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_SERVICE}" \
      || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT == "true" ]]; then
    temporary=
    temporary=$(mktemp \
      "/etc/systemd/system/.${ONLYWAY_BACKUP_SYSTEMD_TIMER}.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- \
        "${RELEASE_TRANSACTION_DIR}/backup-systemd-timer" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" \
        "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
        || restored=false
    fi
  elif [[ -e "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
    || -L "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" ]]; then
    unlink "/etc/systemd/system/${ONLYWAY_BACKUP_SYSTEMD_TIMER}" \
      || restored=false
  fi

  if [[ $RELEASE_TRANSACTION_HAD_PREVIOUS_RECORD == "true" ]]; then
    temporary=
    temporary=$(mktemp "${ONLYWAY_RUN_DIR}/.previous-release.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- "${RELEASE_TRANSACTION_DIR}/previous-release" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" "${ONLYWAY_RUN_DIR}/previous-release" \
        || restored=false
    fi
  elif [[ -e "${ONLYWAY_RUN_DIR}/previous-release" \
    || -L "${ONLYWAY_RUN_DIR}/previous-release" ]]; then
    unlink "${ONLYWAY_RUN_DIR}/previous-release" || restored=false
  fi

  if [[ $RELEASE_TRANSACTION_HAD_RUNTIME_CONFIG == "true" ]]; then
    temporary=
    temporary=$(mktemp "${ONLYWAY_CONFIG_DIR}/.runtime.json.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- "${RELEASE_TRANSACTION_DIR}/runtime.json" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" "${ONLYWAY_CONFIG_DIR}/runtime.json" \
        || restored=false
    fi
  elif [[ -e "${ONLYWAY_CONFIG_DIR}/runtime.json" \
    || -L "${ONLYWAY_CONFIG_DIR}/runtime.json" ]]; then
    unlink "${ONLYWAY_CONFIG_DIR}/runtime.json" || restored=false
  fi

  if [[ $RELEASE_TRANSACTION_HAD_SECURITY_ATTESTATION == "true" ]]; then
    temporary=
    temporary=$(mktemp "${ONLYWAY_CONFIG_DIR}/.security-attestation.json.restore.XXXXXX") \
      || restored=false
    if [[ -n ${temporary:-} ]]; then
      cp --preserve=all -- \
        "${RELEASE_TRANSACTION_DIR}/security-attestation.json" "$temporary" \
        || restored=false
      mv -fT -- "$temporary" "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
        || restored=false
    fi
  elif [[ -e "${ONLYWAY_CONFIG_DIR}/security-attestation.json" \
    || -L "${ONLYWAY_CONFIG_DIR}/security-attestation.json" ]]; then
    unlink "${ONLYWAY_CONFIG_DIR}/security-attestation.json" || restored=false
  fi

  systemctl daemon-reload || restored=false
  if [[ $RELEASE_TRANSACTION_WAS_ENABLED == "true" ]]; then
    systemctl enable "$ONLYWAY_SYSTEMD_UNIT" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ENABLED == "true" ]]; then
    systemctl enable "$ONLYWAY_BACKUP_SYSTEMD_TIMER" || restored=false
  fi
  if [[ $RELEASE_TRANSACTION_BACKUP_TIMER_WAS_ACTIVE == "true" ]]; then
    systemctl start "$ONLYWAY_BACKUP_SYSTEMD_TIMER" || restored=false
    systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER" \
      || restored=false
  elif [[ $RELEASE_TRANSACTION_HAD_BACKUP_TIMER_UNIT == "true" ]]; then
    systemctl stop "$ONLYWAY_BACKUP_SYSTEMD_TIMER" || restored=false
    if systemctl is-active --quiet "$ONLYWAY_BACKUP_SYSTEMD_TIMER"; then
      restored=false
    fi
  fi
  if [[ $restore_service == "true" ]]; then
    if [[ $RELEASE_TRANSACTION_WAS_ACTIVE == "true" ]]; then
      systemctl start "$ONLYWAY_SYSTEMD_UNIT" || restored=false
      systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT" || restored=false
    elif [[ $RELEASE_TRANSACTION_HAD_UNIT == "true" ]]; then
      systemctl stop "$ONLYWAY_SYSTEMD_UNIT" || restored=false
      if systemctl is-active --quiet "$ONLYWAY_SYSTEMD_UNIT"; then
        restored=false
      fi
    fi
  fi

  set -e
  [[ $restored == "true" ]]
}

commit_release_transaction() {
  [[ $RELEASE_TRANSACTION_ACTIVE == "true" ]] \
    || die "release transaction is not active"
  [[ -n $RELEASE_TRANSACTION_DIR \
    && -d $RELEASE_TRANSACTION_DIR \
    && ! -L $RELEASE_TRANSACTION_DIR \
    && $RELEASE_TRANSACTION_DIR == \
      "${ONLYWAY_RUN_DIR}/.release-transaction."* ]] \
    || die "release transaction snapshot is unavailable or unsafe"
  rm -rf --one-file-system -- "$RELEASE_TRANSACTION_DIR"
  [[ ! -e $RELEASE_TRANSACTION_DIR && ! -L $RELEASE_TRANSACTION_DIR ]] \
    || die "release transaction snapshot could not be committed"
  RELEASE_TRANSACTION_DIR=
  RELEASE_TRANSACTION_COMMITTED=true
  RELEASE_TRANSACTION_ACTIVE=false
}

discard_release_transaction_snapshot() {
  [[ -n $RELEASE_TRANSACTION_DIR \
    && -d $RELEASE_TRANSACTION_DIR \
    && ! -L $RELEASE_TRANSACTION_DIR \
    && $RELEASE_TRANSACTION_DIR == \
      "${ONLYWAY_RUN_DIR}/.release-transaction."* ]] \
    || return 1
  rm -rf --one-file-system -- "$RELEASE_TRANSACTION_DIR" || return 1
  [[ ! -e $RELEASE_TRANSACTION_DIR && ! -L $RELEASE_TRANSACTION_DIR ]] \
    || return 1
  RELEASE_TRANSACTION_DIR=
}
