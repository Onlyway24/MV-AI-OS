.contractVersion == "1"
and .kind == "LEGACY_MIGRATION_QUIESCE_COPY"
and .status == "QUIESCED_COPY_VERIFIED"
and .secretsExposed == false
and .containers.runningAfterQuiesce == false
and .containers.restartPolicyAfterQuiesce == "no"
and .containers.restartPolicyBeforeQuiesce == "unless-stopped"
and (.containers.configurationFingerprint | test("^[0-9a-f]{64}$"))
and (
  [.containers.exactIdentities[] | {id, name}]
  | length == 4
    and length == (unique_by(.id) | length)
    and length == (unique_by(.name) | length)
    and all(
      (.id | test("^[0-9a-f]{64}$"))
      and (.name | test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$"))
    )
)
and (.source.directories | type == "array" and length >= 3 and length <= 16)
and (.source.database.sha256 | test("^[0-9a-f]{64}$"))
and (.source.runtimeConfig.sha256 | test("^[0-9a-f]{64}$"))
and (.copy.database.sha256 | test("^[0-9a-f]{64}$"))
and .copy.forensicDatabase.sha256 == .source.database.sha256
and .copy.runtimeConfig.sha256 == .source.runtimeConfig.sha256
and .retention.legacyContainersRemoved == false
and .retention.originalSourcesRemoved == false
and .legacyBoundary.bootstrap.secretCopied == false
and .legacyBoundary.dormantSecret.contentRead == false
and .legacyBoundary.dormantSecret.importAllowed == false
and (
  (
    .quiescePhase == "INITIAL"
    and .confirmedAction == "QUIESCE_AND_COPY_LEGACY_V1"
    and .legacyBoundary.adminSecurityState.status == "ABSENT"
    and .legacyBoundary.adminPepper.status == "ABSENT"
    and .rollbackEvidence.receiptPath == null
    and .rollbackEvidence.firstSuccessMarker == null
    and .rollbackEvidence.receiptSha256
      == "NOT_APPLICABLE_INITIAL_QUIESCE"
    and .rollbackEvidence.signatureSha256
      == "NOT_APPLICABLE_INITIAL_QUIESCE"
    and .rollbackEvidence.firstSuccessMarkerSha256
      == "NOT_APPLICABLE_INITIAL_QUIESCE"
    and .rollbackEvidence.firstSuccessSignatureSha256
      == "NOT_APPLICABLE_INITIAL_QUIESCE"
  )
  or
  (
    .quiescePhase == "FORWARD_AFTER_ROLLBACK"
    and .confirmedAction == "REQUIESCE_FOR_FORWARD_DEPLOY_V1"
    and .legacyBoundary.adminSecurityState.status
      == "RETAINED_NEW_STACK_STATE"
    and .legacyBoundary.adminPepper.status
      == "RETAINED_NEW_STACK_PEPPER"
    and (.rollbackEvidence.receiptPath
      | type == "string"
      and test("^/[A-Za-z0-9._/-]+$"))
    and (.rollbackEvidence.firstSuccessMarker
      | type == "string"
      and test("^/[A-Za-z0-9._/-]+$"))
    and (.rollbackEvidence.receiptSha256 | test("^[0-9a-f]{64}$"))
    and (.rollbackEvidence.signatureSha256 | test("^[0-9a-f]{64}$"))
    and (.rollbackEvidence.firstSuccessMarkerSha256
      | test("^[0-9a-f]{64}$"))
    and (.rollbackEvidence.firstSuccessSignatureSha256
      | test("^[0-9a-f]{64}$"))
  )
)
