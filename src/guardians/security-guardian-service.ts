import {
  SECURITY_GUARDIAN_CONTRACT_VERSION,
  type SecurityGuardian,
  type SecurityGuardianControlName,
  type SecurityGuardianEvaluationInput,
  type SecurityGuardianFinding,
  type SecurityGuardianFindingCategory,
  type SecurityGuardianReport,
  type SecurityGuardianSafetyState,
  type SecurityGuardianSeverity,
} from "./security-guardian.js";
import {
  SecurityGuardianEvaluationInputValidator,
  SecurityGuardianReportValidator,
} from "./security-guardian-validator.js";

export class SecurityGuardianValidationError extends Error {
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

export class DeterministicSecurityGuardian implements SecurityGuardian {
  readonly #inputValidator = new SecurityGuardianEvaluationInputValidator();
  readonly #reportValidator = new SecurityGuardianReportValidator();

  public evaluate(input: SecurityGuardianEvaluationInput): SecurityGuardianReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new SecurityGuardianValidationError(
        "Security Guardian input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const findings = buildFindings(validInput.state);
    const report: SecurityGuardianReport = {
      contractVersion: SECURITY_GUARDIAN_CONTRACT_VERSION,
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
      throw new SecurityGuardianValidationError(
        "Security Guardian generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function buildFindings(
  state: SecurityGuardianSafetyState,
): readonly SecurityGuardianFinding[] {
  const findings: SecurityGuardianFinding[] = [];

  if (state.unsafeSecretMaterialDetected) {
    findings.push(
      finding(
        "unsafe_secret_material",
        "critical",
        {
          affectedControls: ["secret_reference"],
          liveProviderEnabled: state.liveProviderEnabled,
        },
        {
          message:
            "Unsafe secret-like material was detected in supplied configuration signals.",
          recommendation:
            "Remove raw secret material and use controlled secret references only.",
          title: "Unsafe secret material detected",
        },
      ),
    );
  }

  if (
    state.liveProviderEnabled &&
    !state.controlledSecretReferenceConfigured
  ) {
    findings.push(
      finding(
        "missing_secret_reference",
        "critical",
        {
          affectedControls: ["secret_reference"],
          liveProviderEnabled: true,
        },
        {
          message:
            "Live provider mode is enabled without a controlled secret reference.",
          recommendation:
            "Configure a validated secret reference before live provider use.",
          title: "Missing controlled secret reference",
        },
      ),
    );
  }

  if (state.invalidSecretReferenceDetected) {
    findings.push(
      finding(
        "invalid_secret_reference",
        "warning",
        {
          affectedControls: ["secret_reference"],
          liveProviderEnabled: state.liveProviderEnabled,
        },
        {
          message:
            "A supplied secret-reference signal is invalid or suspicious.",
          recommendation:
            "Use only validated environment or local-file secret-reference contracts.",
          title: "Invalid secret reference signal",
        },
      ),
    );
  }

  if (state.liveProviderEnabled) {
    findings.push(
      finding(
        "live_provider_mode_enabled",
        "warning",
        {
          liveProviderEnabled: true,
        },
        {
          message:
            "Live provider mode is enabled and should remain explicitly controlled.",
          recommendation:
            "Keep operation limits, accounting, budgets, and redaction checks enabled.",
          title: "Live provider mode enabled",
        },
      ),
    );
  }

  if (!state.operationLimitsConfigured) {
    findings.push(
      missingControlFinding(
        "missing_operation_limits",
        "critical",
        "operation_limits",
        "Missing model operation limits",
        "Model operation limits are not configured.",
        "Configure operation limits before expanding live provider usage.",
      ),
    );
  }

  if (!state.usageAccountingConfigured) {
    findings.push(
      missingControlFinding(
        "missing_usage_accounting",
        "warning",
        "usage_accounting",
        "Missing model usage accounting",
        "Model usage accounting is not configured.",
        "Configure explicit usage accounting before scaling model usage.",
      ),
    );
  }

  if (!state.budgetEnforcementConfigured) {
    findings.push(
      missingControlFinding(
        "missing_budget_enforcement",
        "critical",
        "budget_enforcement",
        "Missing model budget enforcement",
        "Model budget enforcement is not configured.",
        "Configure explicit model budget enforcement before live expansion.",
      ),
    );
  }

  if (!state.backupRestoreAvailable) {
    findings.push(
      missingControlFinding(
        "missing_backup_restore",
        "warning",
        "backup_restore",
        "Missing backup and restore control",
        "Backup and restore capability is not represented as available.",
        "Verify local SQLite backup and restore before 24/7 or cloud operation.",
      ),
    );
  }

  if (!state.costGuardianAvailable) {
    findings.push(
      missingControlFinding(
        "missing_cost_guardian",
        "warning",
        "cost_guardian",
        "Missing Cost Guardian signal",
        "Cost Guardian availability is not represented in the supplied state.",
        "Include Cost Guardian reporting before broader live model operation.",
      ),
    );
  }

  const missingToolControls = toolControlGaps(state);
  if (state.toolExecutionEnabled && missingToolControls.length > 0) {
    findings.push(
      finding(
        "tool_execution_enabled_without_approval",
        "critical",
        {
          affectedControls: missingToolControls,
        },
        {
          message:
            "Tool execution is represented as enabled without all approval and audit controls.",
          recommendation:
            "Disable tool execution until approval and audit controls are explicit.",
          title: "Unsafe tool execution posture",
        },
      ),
    );
  }

  const cloudReadinessGaps = cloudControlGaps(state);
  if (
    state.cloudOrVpsReadinessTargeted &&
    cloudReadinessGaps.length > 0
  ) {
    findings.push(
      finding(
        "unsafe_cloud_readiness",
        "warning",
        {
          affectedControls: cloudReadinessGaps,
          liveProviderEnabled: state.liveProviderEnabled,
        },
        {
          message:
            "The supplied state targets VPS or cloud readiness before safety controls are complete.",
          recommendation:
            "Finish control-plane safety foundations before moving toward cloud or 24/7 operation.",
          title: "Unsafe cloud readiness posture",
        },
      ),
    );
  }

  return Object.freeze(
    findings.map((candidate, index) =>
      Object.freeze({
        ...candidate,
        findingId: `security-guardian:${String(index + 1).padStart(3, "0")}:${candidate.category}`,
      }),
    ),
  );
}

function missingControlFinding(
  category: SecurityGuardianFindingCategory,
  severity: SecurityGuardianSeverity,
  control: SecurityGuardianControlName,
  title: string,
  message: string,
  recommendation: string,
): SecurityGuardianFinding {
  return finding(
    category,
    severity,
    {
      affectedControls: [control],
    },
    {
      message,
      recommendation,
      title,
    },
  );
}

function finding(
  category: SecurityGuardianFindingCategory,
  severity: SecurityGuardianSeverity,
  evidence: {
    readonly affectedControls?: readonly SecurityGuardianControlName[];
    readonly liveProviderEnabled?: boolean;
  },
  text: {
    readonly message: string;
    readonly recommendation: string;
    readonly title: string;
  },
): SecurityGuardianFinding {
  return {
    category,
    contractVersion: SECURITY_GUARDIAN_CONTRACT_VERSION,
    evidence: {
      ...(evidence.affectedControls === undefined
        ? {}
        : { affectedControls: Object.freeze([...evidence.affectedControls]) }),
      ...(evidence.liveProviderEnabled === undefined
        ? {}
        : { liveProviderEnabled: evidence.liveProviderEnabled }),
      signalCount: 1,
    },
    findingId: "security-guardian:pending",
    message: text.message,
    recommendation: text.recommendation,
    severity,
    title: text.title,
  };
}

function cloudControlGaps(
  state: SecurityGuardianSafetyState,
): readonly SecurityGuardianControlName[] {
  const gaps: SecurityGuardianControlName[] = [];
  if (!state.operationLimitsConfigured) {
    gaps.push("operation_limits");
  }
  if (!state.usageAccountingConfigured) {
    gaps.push("usage_accounting");
  }
  if (!state.budgetEnforcementConfigured) {
    gaps.push("budget_enforcement");
  }
  if (!state.backupRestoreAvailable) {
    gaps.push("backup_restore");
  }
  if (!state.costGuardianAvailable) {
    gaps.push("cost_guardian");
  }
  if (
    state.liveProviderEnabled &&
    !state.controlledSecretReferenceConfigured
  ) {
    gaps.push("secret_reference");
  }
  return Object.freeze(gaps);
}

function toolControlGaps(
  state: SecurityGuardianSafetyState,
): readonly SecurityGuardianControlName[] {
  const gaps: SecurityGuardianControlName[] = [];
  if (!state.toolExecutionApprovalRequired) {
    gaps.push("tool_approval");
  }
  if (!state.toolExecutionAudited) {
    gaps.push("tool_audit");
  }
  return Object.freeze(gaps);
}

function highestSeverity(
  findings: readonly SecurityGuardianFinding[],
): SecurityGuardianSeverity {
  if (findings.some(({ severity }) => severity === "critical")) {
    return "critical";
  }
  if (findings.some(({ severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}
