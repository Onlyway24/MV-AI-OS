import type { BackupGuardianFinding } from "./backup-guardian.js";
import type { CostGuardianFinding } from "./cost-guardian.js";
import type { IncidentGuardianFinding } from "./incident-guardian.js";
import {
  OPERATOR_SAFETY_REPORT_CONTRACT_VERSION,
  type OperatorRecommendedAction,
  type OperatorSafetyAutonomyDecision,
  type OperatorSafetyDomain,
  type OperatorSafetyEvaluationInput,
  type OperatorSafetyFindingSummary,
  type OperatorSafetyGuardianReports,
  type OperatorSafetyGuardianSummary,
  type OperatorSafetyReport,
  type OperatorSafetyReporter,
  type OperatorSafetySeverity,
  type OperatorSafetyStatus,
} from "./operator-safety-report.js";
import {
  OperatorSafetyEvaluationInputValidator,
  OperatorSafetyReportValidator,
} from "./operator-safety-report-validator.js";
import type { QualityGuardianFinding } from "./quality-guardian.js";
import type { SecurityGuardianFinding } from "./security-guardian.js";

const DOMAIN_ORDER: readonly OperatorSafetyDomain[] = [
  "cost",
  "security",
  "backup",
  "incident",
  "quality",
];

const ATTENTION_DOMAIN_ORDER: readonly OperatorSafetyDomain[] = [
  "security",
  "backup",
  "cost",
  "incident",
  "quality",
];

interface SafeFindingInput {
  readonly affectedAreas: readonly string[];
  readonly category: string;
  readonly findingId: string;
  readonly severity: OperatorSafetySeverity;
  readonly title: string;
}

interface ActionCandidate {
  readonly domain?: OperatorSafetyDomain;
  readonly recommendation: string;
  readonly severity: OperatorSafetySeverity;
  readonly slug: string;
  readonly title: string;
}

export class OperatorSafetyReportValidationError extends Error {
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

export class DeterministicOperatorSafetyReporter
  implements OperatorSafetyReporter
{
  readonly #inputValidator = new OperatorSafetyEvaluationInputValidator();
  readonly #reportValidator = new OperatorSafetyReportValidator();

  public evaluate(input: OperatorSafetyEvaluationInput): OperatorSafetyReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new OperatorSafetyReportValidationError(
        "Operator Safety Report input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const expectedGuardians = sortDomains(validInput.expectedGuardians);
    const includedGuardians = sortDomains(
      providedDomains(validInput.guardianReports),
    );
    const missingGuardians = sortDomains(
      expectedGuardians.filter(
        (domain) => !includedGuardians.includes(domain),
      ),
    );
    const domains = sortDomains([...expectedGuardians, ...includedGuardians]);
    const guardianSummaries = Object.freeze(
      domains.map((domain) =>
        buildGuardianSummary(domain, validInput.guardianReports),
      ),
    );
    const summary = buildReportSummary(
      expectedGuardians,
      includedGuardians,
      missingGuardians,
      guardianSummaries,
    );
    const recommendedActions = buildRecommendedActions(guardianSummaries);
    const report: OperatorSafetyReport = {
      contractVersion: OPERATOR_SAFETY_REPORT_CONTRACT_VERSION,
      generatedAt: validInput.generatedAt,
      guardianSummaries,
      recommendedActions,
      summary,
    };

    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new OperatorSafetyReportValidationError(
        "Operator Safety Report generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function providedDomains(
  reports: OperatorSafetyGuardianReports,
): readonly OperatorSafetyDomain[] {
  const domains: OperatorSafetyDomain[] = [];
  for (const domain of DOMAIN_ORDER) {
    if (reportForDomain(domain, reports) !== undefined) {
      domains.push(domain);
    }
  }
  return domains;
}

function buildGuardianSummary(
  domain: OperatorSafetyDomain,
  reports: OperatorSafetyGuardianReports,
): OperatorSafetyGuardianSummary {
  switch (domain) {
    case "backup": {
      const report = reports.backup;
      return report === undefined
        ? missingSummary(domain)
        : includedSummary(
            domain,
            report.summary.highestSeverity,
            report.summary.totalFindings,
            report.summary.warningFindings,
            report.summary.criticalFindings,
            report.findings.map(backupFinding),
          );
    }
    case "cost": {
      const report = reports.cost;
      return report === undefined
        ? missingSummary(domain)
        : includedSummary(
            domain,
            report.summary.highestSeverity,
            report.findings.length,
            report.summary.warningFindings,
            report.summary.criticalFindings,
            report.findings.map(costFinding),
          );
    }
    case "incident": {
      const report = reports.incident;
      return report === undefined
        ? missingSummary(domain)
        : includedSummary(
            domain,
            report.summary.highestSeverity,
            report.summary.totalFindings,
            report.summary.warningFindings,
            report.summary.criticalFindings,
            report.findings.map(incidentFinding),
          );
    }
    case "quality": {
      const report = reports.quality;
      return report === undefined
        ? missingSummary(domain)
        : includedSummary(
            domain,
            report.summary.highestSeverity,
            report.summary.totalFindings,
            report.summary.warningFindings,
            report.summary.criticalFindings,
            report.findings.map(qualityFinding),
          );
    }
    case "security": {
      const report = reports.security;
      return report === undefined
        ? missingSummary(domain)
        : includedSummary(
            domain,
            report.summary.highestSeverity,
            report.summary.totalFindings,
            report.summary.warningFindings,
            report.summary.criticalFindings,
            report.findings.map(securityFinding),
          );
    }
  }
}

function reportForDomain(
  domain: OperatorSafetyDomain,
  reports: OperatorSafetyGuardianReports,
): unknown {
  switch (domain) {
    case "backup":
      return reports.backup;
    case "cost":
      return reports.cost;
    case "incident":
      return reports.incident;
    case "quality":
      return reports.quality;
    case "security":
      return reports.security;
  }
}

function missingSummary(
  domain: OperatorSafetyDomain,
): OperatorSafetyGuardianSummary {
  return {
    affectedAreas: [],
    criticalFindings: 0,
    domain,
    highestSeverity: "info",
    included: false,
    status: "unknown",
    totalFindings: 0,
    warningFindings: 0,
  };
}

function includedSummary(
  domain: OperatorSafetyDomain,
  highestSeverity: OperatorSafetySeverity,
  totalFindings: number,
  warningFindings: number,
  criticalFindings: number,
  findings: readonly SafeFindingInput[],
): OperatorSafetyGuardianSummary {
  const topFinding = selectTopFinding(domain, findings);
  return {
    affectedAreas: uniqueSorted(
      findings.flatMap(({ affectedAreas }) => affectedAreas),
    ),
    criticalFindings,
    domain,
    highestSeverity,
    included: true,
    status: statusFromSeverity(highestSeverity),
    ...(topFinding === undefined ? {} : { topFinding }),
    totalFindings,
    warningFindings,
  };
}

function selectTopFinding(
  domain: OperatorSafetyDomain,
  findings: readonly SafeFindingInput[],
): OperatorSafetyFindingSummary | undefined {
  const [topFinding] = [...findings].sort(compareFindings);
  if (topFinding === undefined) {
    return undefined;
  }
  return {
    affectedAreas: uniqueSorted(topFinding.affectedAreas),
    category: topFinding.category,
    domain,
    findingId: topFinding.findingId,
    severity: topFinding.severity,
    title: topFinding.title,
  };
}

function costFinding(finding: CostGuardianFinding): SafeFindingInput {
  return {
    affectedAreas: [],
    category: finding.category,
    findingId: finding.findingId,
    severity: finding.severity,
    title: finding.title,
  };
}

function securityFinding(
  finding: SecurityGuardianFinding,
): SafeFindingInput {
  return {
    affectedAreas: finding.evidence.affectedControls ?? [],
    category: finding.category,
    findingId: finding.findingId,
    severity: finding.severity,
    title: finding.title,
  };
}

function backupFinding(finding: BackupGuardianFinding): SafeFindingInput {
  return {
    affectedAreas: finding.evidence.affectedControls ?? [],
    category: finding.category,
    findingId: finding.findingId,
    severity: finding.severity,
    title: finding.title,
  };
}

function incidentFinding(
  finding: IncidentGuardianFinding,
): SafeFindingInput {
  return {
    affectedAreas: [
      ...(finding.evidence.affectedSignals ?? []),
      ...(finding.evidence.sourceGuardians ?? []),
    ],
    category: finding.category,
    findingId: finding.findingId,
    severity: finding.severity,
    title: finding.title,
  };
}

function qualityFinding(finding: QualityGuardianFinding): SafeFindingInput {
  return {
    affectedAreas: finding.evidence.affectedSignals ?? [],
    category: finding.category,
    findingId: finding.findingId,
    severity: finding.severity,
    title: finding.title,
  };
}

function buildReportSummary(
  expectedGuardians: readonly OperatorSafetyDomain[],
  includedGuardians: readonly OperatorSafetyDomain[],
  missingGuardians: readonly OperatorSafetyDomain[],
  guardianSummaries: readonly OperatorSafetyGuardianSummary[],
): OperatorSafetyReport["summary"] {
  const criticalDomains = domainsWithStatus(guardianSummaries, "critical");
  const warningDomains = domainsWithStatus(
    guardianSummaries,
    "attention_required",
  );
  const unknownDomains = domainsWithStatus(guardianSummaries, "unknown");
  const status = overallStatus(
    criticalDomains.length,
    warningDomains.length,
    unknownDomains.length,
  );
  const primaryAttentionDomain = selectPrimaryAttentionDomain(
    criticalDomains,
    warningDomains,
    unknownDomains,
  );

  return {
    coverage: {
      expectedGuardians,
      includedGuardians,
      missingGuardians,
    },
    criticalDomains,
    healthyDomains: domainsWithStatus(guardianSummaries, "healthy"),
    highestSeverity: highestSeverity(guardianSummaries),
    ...(primaryAttentionDomain === undefined
      ? {}
      : { primaryAttentionDomain }),
    safetyToAutonomy: safetyDecision(
      criticalDomains.length,
      warningDomains.length,
      missingGuardians.length,
    ),
    status,
    totalCriticalFindings: sum(
      guardianSummaries.map(({ criticalFindings }) => criticalFindings),
    ),
    totalFindings: sum(
      guardianSummaries.map(({ totalFindings }) => totalFindings),
    ),
    totalWarningFindings: sum(
      guardianSummaries.map(({ warningFindings }) => warningFindings),
    ),
    unknownDomains,
    warningDomains,
  };
}

function buildRecommendedActions(
  summaries: readonly OperatorSafetyGuardianSummary[],
): readonly OperatorRecommendedAction[] {
  const candidates: ActionCandidate[] = [];
  for (const summary of sortSummariesForAttention(summaries)) {
    if (summary.status === "critical") {
      candidates.push(criticalAction(summary.domain));
    } else if (summary.status === "attention_required") {
      candidates.push(warningAction(summary.domain));
    } else if (summary.status === "unknown") {
      candidates.push(missingAction(summary.domain));
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      recommendation:
        "Continue operating within the current controlled boundaries and keep guardian reports current.",
      severity: "info",
      slug: "continue-current-operation",
      title: "Continue controlled operation",
    });
  }

  return Object.freeze(
    candidates.map((candidate, index) =>
      Object.freeze({
        actionId: `operator-safety:${String(index + 1).padStart(3, "0")}:${candidate.slug}`,
        ...(candidate.domain === undefined ? {} : { domain: candidate.domain }),
        recommendation: candidate.recommendation,
        severity: candidate.severity,
        title: candidate.title,
      }),
    ),
  );
}

function criticalAction(domain: OperatorSafetyDomain): ActionCandidate {
  switch (domain) {
    case "backup":
      return {
        domain,
        recommendation:
          "Verify backup and restore safety before cloud, 24/7 operation, or risky changes.",
        severity: "critical",
        slug: "review-critical-backup",
        title: "Review critical backup findings",
      };
    case "cost":
      return {
        domain,
        recommendation:
          "Inspect budget and usage findings before enabling more model activity.",
        severity: "critical",
        slug: "review-critical-cost",
        title: "Review critical cost findings",
      };
    case "incident":
      return {
        domain,
        recommendation:
          "Inspect repeated incident signals before external integrations or more autonomy.",
        severity: "critical",
        slug: "review-critical-incident",
        title: "Review critical incident findings",
      };
    case "quality":
      return {
        domain,
        recommendation:
          "Review quality findings before publishing, handoff, or workflow expansion.",
        severity: "critical",
        slug: "review-critical-quality",
        title: "Review critical quality findings",
      };
    case "security":
      return {
        domain,
        recommendation:
          "Review critical security findings before tools, cloud, dashboards, or external access.",
        severity: "critical",
        slug: "review-critical-security",
        title: "Review critical security findings",
      };
  }
}

function warningAction(domain: OperatorSafetyDomain): ActionCandidate {
  switch (domain) {
    case "backup":
      return {
        domain,
        recommendation:
          "Check backup readiness and restore verification before increasing operational reliance.",
        severity: "warning",
        slug: "review-backup-warnings",
        title: "Review backup warnings",
      };
    case "cost":
      return {
        domain,
        recommendation:
          "Review cost and budget warnings before increasing model usage.",
        severity: "warning",
        slug: "review-cost-warnings",
        title: "Review cost warnings",
      };
    case "incident":
      return {
        domain,
        recommendation:
          "Inspect incident patterns before adding schedulers, alerts, or external integrations.",
        severity: "warning",
        slug: "review-incident-warnings",
        title: "Review incident warnings",
      };
    case "quality":
      return {
        domain,
        recommendation:
          "Review quality findings before publication or operator handoff.",
        severity: "warning",
        slug: "review-quality-warnings",
        title: "Review quality warnings",
      };
    case "security":
      return {
        domain,
        recommendation:
          "Review security warnings before exposing new surfaces or expanding provider access.",
        severity: "warning",
        slug: "review-security-warnings",
        title: "Review security warnings",
      };
  }
}

function missingAction(domain: OperatorSafetyDomain): ActionCandidate {
  switch (domain) {
    case "backup":
      return {
        domain,
        recommendation:
          "Provide a Backup Guardian report before cloud, 24/7, or recovery-sensitive operation.",
        severity: "warning",
        slug: "provide-backup-report",
        title: "Provide Backup Guardian report",
      };
    case "cost":
      return {
        domain,
        recommendation:
          "Provide a Cost Guardian report before increasing model activity.",
        severity: "warning",
        slug: "provide-cost-report",
        title: "Provide Cost Guardian report",
      };
    case "incident":
      return {
        domain,
        recommendation:
          "Provide an Incident Guardian report before expanding external integrations or autonomy.",
        severity: "warning",
        slug: "provide-incident-report",
        title: "Provide Incident Guardian report",
      };
    case "quality":
      return {
        domain,
        recommendation:
          "Provide a Quality Guardian report before publishing or workflow expansion.",
        severity: "warning",
        slug: "provide-quality-report",
        title: "Provide Quality Guardian report",
      };
    case "security":
      return {
        domain,
        recommendation:
          "Provide a Security Guardian report before tools, cloud, dashboards, or external access.",
        severity: "warning",
        slug: "provide-security-report",
        title: "Provide Security Guardian report",
      };
  }
}

function statusFromSeverity(
  severity: OperatorSafetySeverity,
): OperatorSafetyStatus {
  if (severity === "critical") {
    return "critical";
  }
  if (severity === "warning") {
    return "attention_required";
  }
  return "healthy";
}

function overallStatus(
  criticalCount: number,
  warningCount: number,
  unknownCount: number,
): OperatorSafetyStatus {
  if (criticalCount > 0) {
    return "critical";
  }
  if (warningCount > 0) {
    return "attention_required";
  }
  if (unknownCount > 0) {
    return "unknown";
  }
  return "healthy";
}

function safetyDecision(
  criticalCount: number,
  warningCount: number,
  missingCount: number,
): OperatorSafetyAutonomyDecision {
  if (criticalCount > 0) {
    return "do_not_increase_autonomy";
  }
  if (missingCount > 0) {
    return "unknown";
  }
  if (warningCount > 0) {
    return "continue_with_attention";
  }
  return "safe_to_continue";
}

function domainsWithStatus(
  summaries: readonly OperatorSafetyGuardianSummary[],
  status: OperatorSafetyStatus,
): readonly OperatorSafetyDomain[] {
  return sortDomains(
    summaries
      .filter((summary) => summary.status === status)
      .map(({ domain }) => domain),
  );
}

function highestSeverity(
  summaries: readonly OperatorSafetyGuardianSummary[],
): OperatorSafetySeverity {
  if (summaries.some(({ highestSeverity: severity }) => severity === "critical")) {
    return "critical";
  }
  if (summaries.some(({ highestSeverity: severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}

function selectPrimaryAttentionDomain(
  criticalDomains: readonly OperatorSafetyDomain[],
  warningDomains: readonly OperatorSafetyDomain[],
  unknownDomains: readonly OperatorSafetyDomain[],
): OperatorSafetyDomain | undefined {
  return (
    firstByAttentionPriority(criticalDomains) ??
    firstByAttentionPriority(warningDomains) ??
    firstByAttentionPriority(unknownDomains)
  );
}

function firstByAttentionPriority(
  domains: readonly OperatorSafetyDomain[],
): OperatorSafetyDomain | undefined {
  return [...domains].sort(compareAttentionDomains)[0];
}

function sortSummariesForAttention(
  summaries: readonly OperatorSafetyGuardianSummary[],
): readonly OperatorSafetyGuardianSummary[] {
  return [...summaries]
    .filter(({ status }) => status !== "healthy")
    .sort((left, right) => {
      const statusOrder =
        statusPriority(left.status) - statusPriority(right.status);
      return statusOrder === 0
        ? compareAttentionDomains(left.domain, right.domain)
        : statusOrder;
    });
}

function compareFindings(
  left: SafeFindingInput,
  right: SafeFindingInput,
): number {
  const severityOrder =
    severityPriority(left.severity) - severityPriority(right.severity);
  if (severityOrder !== 0) {
    return severityOrder;
  }
  return left.findingId.localeCompare(right.findingId);
}

function sortDomains(
  domains: readonly OperatorSafetyDomain[],
): readonly OperatorSafetyDomain[] {
  const unique = new Set(domains);
  return Object.freeze(
    DOMAIN_ORDER.filter((domain) => unique.has(domain)),
  );
}

function compareAttentionDomains(
  left: OperatorSafetyDomain,
  right: OperatorSafetyDomain,
): number {
  return (
    ATTENTION_DOMAIN_ORDER.indexOf(left) -
    ATTENTION_DOMAIN_ORDER.indexOf(right)
  );
}

function severityPriority(severity: OperatorSafetySeverity): number {
  switch (severity) {
    case "critical":
      return 0;
    case "warning":
      return 1;
    case "info":
      return 2;
  }
}

function statusPriority(status: OperatorSafetyStatus): number {
  switch (status) {
    case "critical":
      return 0;
    case "attention_required":
      return 1;
    case "unknown":
      return 2;
    case "healthy":
      return 3;
  }
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((left, right) =>
    left.localeCompare(right),
  ));
}
