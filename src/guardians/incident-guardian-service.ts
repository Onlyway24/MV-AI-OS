import {
  INCIDENT_GUARDIAN_CONTRACT_VERSION,
  type IncidentGuardian,
  type IncidentGuardianEvaluationInput,
  type IncidentGuardianFinding,
  type IncidentGuardianFindingCategory,
  type IncidentGuardianOperationalSignals,
  type IncidentGuardianReport,
  type IncidentGuardianSeverity,
  type IncidentGuardianSignalName,
  type IncidentGuardianSourceGuardian,
  type IncidentGuardianSourceSummary,
  type IncidentGuardianThresholds,
} from "./incident-guardian.js";
import {
  IncidentGuardianEvaluationInputValidator,
  IncidentGuardianReportValidator,
} from "./incident-guardian-validator.js";

export class IncidentGuardianValidationError extends Error {
  public readonly issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }[];

  public constructor(
    message: string,
    issues: readonly {
      readonly code: string;
      readonly message: string;
      readonly path: string;
    }[],
  ) {
    super(message);
    this.issues = issues;
  }
}

export class DeterministicIncidentGuardian implements IncidentGuardian {
  readonly #inputValidator = new IncidentGuardianEvaluationInputValidator();
  readonly #reportValidator = new IncidentGuardianReportValidator();

  public evaluate(input: IncidentGuardianEvaluationInput): IncidentGuardianReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new IncidentGuardianValidationError(
        "Incident Guardian input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const thresholds = normalizeThresholds(validInput.thresholds);
    const findings = buildFindings(
      validInput.signals,
      validInput.guardianSummaries,
      thresholds,
    );
    const report: IncidentGuardianReport = {
      contractVersion: INCIDENT_GUARDIAN_CONTRACT_VERSION,
      findings,
      generatedAt: validInput.generatedAt,
      summary: {
        criticalFindings: findings.filter(
          ({ severity }) => severity === "critical",
        ).length,
        highestSeverity: highestSeverity(findings),
        totalFindings: findings.length,
        warningFindings: findings.filter(
          ({ severity }) => severity === "warning",
        ).length,
      },
    };

    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new IncidentGuardianValidationError(
        "Incident Guardian generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function buildFindings(
  signals: IncidentGuardianOperationalSignals,
  guardianSummaries: readonly IncidentGuardianSourceSummary[],
  thresholds: IncidentGuardianThresholds,
): readonly IncidentGuardianFinding[] {
  const findings: IncidentGuardianFinding[] = [];

  if (signals.modelFailureCount >= thresholds.modelFailureThreshold) {
    findings.push(
      signalFinding(
        "repeated_model_failures",
        "warning",
        "model_failures",
        signals.modelFailureCount,
        thresholds.modelFailureThreshold,
        "Repeated model failures",
        "Model failures reached the configured incident threshold.",
        "Inspect provider health and model-gateway error normalization before scaling usage.",
      ),
    );
  }

  if (signals.budgetBlockCount >= thresholds.budgetBlockThreshold) {
    findings.push(
      signalFinding(
        "repeated_budget_blocks",
        "critical",
        "budget_blocks",
        signals.budgetBlockCount,
        thresholds.budgetBlockThreshold,
        "Repeated model budget blocks",
        "Budget enforcement blocked repeated model operations.",
        "Review model workloads and budget policy before allowing more live usage.",
      ),
    );
  }

  if (
    signals.operationLimitBlockCount >=
    thresholds.operationLimitBlockThreshold
  ) {
    findings.push(
      signalFinding(
        "repeated_operation_limit_blocks",
        "warning",
        "operation_limit_blocks",
        signals.operationLimitBlockCount,
        thresholds.operationLimitBlockThreshold,
        "Repeated operation-limit blocks",
        "Model operation limits blocked repeated requests.",
        "Inspect calling workflows before raising operation limits.",
      ),
    );
  }

  if (
    signals.invalidConfigurationAttemptCount >=
    thresholds.invalidConfigurationAttemptThreshold
  ) {
    findings.push(
      signalFinding(
        "repeated_invalid_configuration_attempts",
        "warning",
        "invalid_configuration_attempts",
        signals.invalidConfigurationAttemptCount,
        thresholds.invalidConfigurationAttemptThreshold,
        "Repeated invalid configuration attempts",
        "Invalid configuration attempts reached the configured incident threshold.",
        "Review local configuration inputs before broader operator rollout.",
      ),
    );
  }

  if (
    signals.backupRestoreVerificationFailureCount >=
    thresholds.backupRestoreVerificationFailureThreshold
  ) {
    findings.push(
      signalFinding(
        "backup_restore_verification_failures",
        "critical",
        "backup_restore_verification_failures",
        signals.backupRestoreVerificationFailureCount,
        thresholds.backupRestoreVerificationFailureThreshold,
        "Backup or restore verification failures",
        "Backup/restore verification failures reached the incident threshold.",
        "Treat recovery posture as unsafe until restore verification passes.",
      ),
    );
  }

  if (
    signals.providerUnavailableCount >=
    thresholds.providerUnavailableThreshold
  ) {
    findings.push(
      signalFinding(
        "provider_unavailable_pattern",
        "warning",
        "provider_unavailable",
        signals.providerUnavailableCount,
        thresholds.providerUnavailableThreshold,
        "Provider unavailable pattern",
        "Provider unavailability reached the configured incident threshold.",
        "Pause live-provider expansion until provider health is understood.",
      ),
    );
  }

  for (const summary of [...guardianSummaries].sort(compareGuardianSummaries)) {
    if (summary.criticalFindings === 0) {
      continue;
    }
    findings.push(highSeverityGuardianFinding(summary));
  }

  return Object.freeze(
    findings.map((candidate, index) =>
      Object.freeze({
        ...candidate,
        findingId: `incident-guardian:${String(index + 1).padStart(3, "0")}:${candidate.category}`,
      }),
    ),
  );
}

function signalFinding(
  category: IncidentGuardianFindingCategory,
  severity: IncidentGuardianSeverity,
  signal: IncidentGuardianSignalName,
  signalCount: number,
  threshold: number,
  title: string,
  message: string,
  recommendation: string,
): IncidentGuardianFinding {
  return finding(category, severity, {
    affectedSignals: [signal],
    message,
    recommendation,
    signalCount,
    threshold,
    title,
  });
}

function highSeverityGuardianFinding(
  summary: IncidentGuardianSourceSummary,
): IncidentGuardianFinding {
  const categoryByGuardian: Record<
    IncidentGuardianSourceGuardian,
    IncidentGuardianFindingCategory
  > = {
    backup: "high_severity_backup_findings",
    cost: "high_severity_cost_findings",
    security: "high_severity_security_findings",
  };
  const titleByGuardian: Record<IncidentGuardianSourceGuardian, string> = {
    backup: "High-severity Backup Guardian findings",
    cost: "High-severity Cost Guardian findings",
    security: "High-severity Security Guardian findings",
  };
  return finding(categoryByGuardian[summary.guardian], "critical", {
    message:
      "A supplied guardian summary contains high-severity findings.",
    recommendation:
      "Review the source guardian report before continuing operational expansion.",
    signalCount: summary.criticalFindings,
    sourceGuardians: [summary.guardian],
    title: titleByGuardian[summary.guardian],
  });
}

function finding(
  category: IncidentGuardianFindingCategory,
  severity: IncidentGuardianSeverity,
  input: {
    readonly affectedSignals?: readonly IncidentGuardianSignalName[];
    readonly message: string;
    readonly recommendation: string;
    readonly signalCount: number;
    readonly sourceGuardians?: readonly IncidentGuardianSourceGuardian[];
    readonly threshold?: number;
    readonly title: string;
  },
): IncidentGuardianFinding {
  return {
    category,
    contractVersion: INCIDENT_GUARDIAN_CONTRACT_VERSION,
    evidence: {
      ...(input.affectedSignals === undefined
        ? {}
        : { affectedSignals: Object.freeze([...input.affectedSignals]) }),
      signalCount: input.signalCount,
      ...(input.sourceGuardians === undefined
        ? {}
        : { sourceGuardians: Object.freeze([...input.sourceGuardians]) }),
      ...(input.threshold === undefined ? {} : { threshold: input.threshold }),
    },
    findingId: "incident-guardian:pending",
    message: input.message,
    recommendation: input.recommendation,
    severity,
    title: input.title,
  };
}

function normalizeThresholds(
  thresholds: IncidentGuardianEvaluationInput["thresholds"],
): IncidentGuardianThresholds {
  return {
    backupRestoreVerificationFailureThreshold:
      thresholds?.backupRestoreVerificationFailureThreshold ?? 1,
    budgetBlockThreshold: thresholds?.budgetBlockThreshold ?? 2,
    invalidConfigurationAttemptThreshold:
      thresholds?.invalidConfigurationAttemptThreshold ?? 2,
    modelFailureThreshold: thresholds?.modelFailureThreshold ?? 3,
    operationLimitBlockThreshold:
      thresholds?.operationLimitBlockThreshold ?? 2,
    providerUnavailableThreshold:
      thresholds?.providerUnavailableThreshold ?? 2,
  };
}

function compareGuardianSummaries(
  left: IncidentGuardianSourceSummary,
  right: IncidentGuardianSourceSummary,
): number {
  const order: Record<IncidentGuardianSourceGuardian, number> = {
    backup: 3,
    cost: 1,
    security: 2,
  };
  return order[left.guardian] - order[right.guardian];
}

function highestSeverity(
  findings: readonly IncidentGuardianFinding[],
): IncidentGuardianSeverity {
  if (findings.some(({ severity }) => severity === "critical")) {
    return "critical";
  }
  if (findings.some(({ severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}
