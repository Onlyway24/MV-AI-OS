import {
  QUALITY_GUARDIAN_CONTRACT_VERSION,
  type QualityGuardian,
  type QualityGuardianEvaluationInput,
  type QualityGuardianFinding,
  type QualityGuardianFindingCategory,
  type QualityGuardianQualityState,
  type QualityGuardianReport,
  type QualityGuardianSeverity,
  type QualityGuardianSignalName,
} from "./quality-guardian.js";
import {
  QualityGuardianEvaluationInputValidator,
  QualityGuardianReportValidator,
} from "./quality-guardian-validator.js";

export class QualityGuardianValidationError extends Error {
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

export class DeterministicQualityGuardian implements QualityGuardian {
  readonly #inputValidator = new QualityGuardianEvaluationInputValidator();
  readonly #reportValidator = new QualityGuardianReportValidator();

  public evaluate(input: QualityGuardianEvaluationInput): QualityGuardianReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new QualityGuardianValidationError(
        "Quality Guardian input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const findings = buildFindings(validInput.state);
    const report: QualityGuardianReport = {
      contractVersion: QUALITY_GUARDIAN_CONTRACT_VERSION,
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
      throw new QualityGuardianValidationError(
        "Quality Guardian generated an invalid report",
        reportValidation.issues,
      );
    }
    return reportValidation.value;
  }
}

function buildFindings(
  state: QualityGuardianQualityState,
): readonly QualityGuardianFinding[] {
  const findings: QualityGuardianFinding[] = [];

  if (!state.finalResponsePresent) {
    findings.push(
      signalFinding(
        "missing_final_response",
        "critical",
        "final_response",
        "Missing final response",
        "The supplied quality state does not include a final response.",
        "Do not publish or hand off the result until a final response exists.",
      ),
    );
  }

  if (!state.resultWellFormed) {
    findings.push(
      signalFinding(
        "malformed_result",
        "critical",
        "result_shape",
        "Malformed result",
        "The supplied quality state marks the result shape as malformed.",
        "Repair result validation before presenting output to an operator.",
      ),
    );
  }

  if (!state.taskResultComplete) {
    findings.push(
      signalFinding(
        "incomplete_task_result",
        "warning",
        "task_completion",
        "Incomplete task result",
        "The supplied quality state marks the task result as incomplete.",
        "Complete the task result before promotion or publication.",
      ),
    );
  }

  if (state.modelOutputRejected) {
    findings.push(
      signalFinding(
        "model_output_rejected",
        "critical",
        "model_output_validation",
        "Model-backed output rejected",
        "A model-backed output was rejected by validation.",
        "Inspect the structured-output contract before retrying or publishing.",
      ),
    );
  }

  if (state.evidenceRequired && !state.evidenceReferencesPresent) {
    findings.push(
      signalFinding(
        "missing_evidence_references",
        "warning",
        "evidence_references",
        "Missing evidence references",
        "Evidence references are required but are not represented as present.",
        "Attach safe evidence references before relying on the output.",
      ),
    );
  }

  if (state.outputClaimsEvidence && !state.sourceReferencesPresent) {
    findings.push(
      signalFinding(
        "missing_source_references",
        "warning",
        "source_references",
        "Missing source references",
        "The output claims evidence, but source references are not represented as present.",
        "Add safe source references or remove unsupported evidence claims.",
      ),
    );
  }

  if (state.humanReviewRequired && !state.humanReviewCompleted) {
    findings.push(
      signalFinding(
        "missing_human_review",
        "warning",
        "human_review",
        "Human review required",
        "Human review is required but is not represented as complete.",
        "Have Fabio or an approved reviewer inspect the output before use.",
      ),
    );
  }

  if (state.readinessScore < state.minimumReadinessScore) {
    findings.push(
      finding(
        "low_readiness_score",
        "warning",
        {
          affectedSignals: ["readiness_score"],
          readinessScore: state.readinessScore,
          signalCount: 1,
          threshold: state.minimumReadinessScore,
        },
        {
          message:
            "The supplied readiness score is below the configured minimum.",
          recommendation:
            "Improve validation, evidence, and review posture before promotion.",
          title: "Low readiness score",
        },
      ),
    );
  }

  if (state.rejectedOutputCount >= state.rejectedOutputThreshold) {
    findings.push(
      finding(
        "repeated_rejected_outputs",
        "warning",
        {
          affectedSignals: ["rejected_outputs"],
          signalCount: state.rejectedOutputCount,
          threshold: state.rejectedOutputThreshold,
        },
        {
          message:
            "Rejected outputs reached the configured quality threshold.",
          recommendation:
            "Review generation constraints before retrying the same workflow.",
          title: "Repeated rejected outputs",
        },
      ),
    );
  }

  if (state.validationFailureCount >= state.validationFailureThreshold) {
    findings.push(
      finding(
        "validation_failure_threshold_exceeded",
        "warning",
        {
          affectedSignals: ["validation_failures"],
          signalCount: state.validationFailureCount,
          threshold: state.validationFailureThreshold,
        },
        {
          message:
            "Validation failures reached the configured quality threshold.",
          recommendation:
            "Inspect validators and output contracts before further promotion.",
          title: "Validation failure threshold exceeded",
        },
      ),
    );
  }

  if (state.unsafeContentPipelineDetected) {
    findings.push(
      signalFinding(
        "unsafe_content_pipeline_state",
        "critical",
        "content_pipeline",
        "Unsafe content pipeline state",
        "The supplied quality state marks the content pipeline as unsafe.",
        "Stop publication or handoff until the unsafe pipeline state is resolved.",
      ),
    );
  }

  return Object.freeze(
    findings.map((candidate, index) =>
      Object.freeze({
        ...candidate,
        findingId: `quality-guardian:${String(index + 1).padStart(3, "0")}:${candidate.category}`,
      }),
    ),
  );
}

function signalFinding(
  category: QualityGuardianFindingCategory,
  severity: QualityGuardianSeverity,
  signal: QualityGuardianSignalName,
  title: string,
  message: string,
  recommendation: string,
): QualityGuardianFinding {
  return finding(
    category,
    severity,
    {
      affectedSignals: [signal],
      signalCount: 1,
    },
    {
      message,
      recommendation,
      title,
    },
  );
}

function finding(
  category: QualityGuardianFindingCategory,
  severity: QualityGuardianSeverity,
  evidence: {
    readonly affectedSignals?: readonly QualityGuardianSignalName[];
    readonly readinessScore?: number;
    readonly signalCount: number;
    readonly threshold?: number;
  },
  text: {
    readonly message: string;
    readonly recommendation: string;
    readonly title: string;
  },
): QualityGuardianFinding {
  return {
    category,
    contractVersion: QUALITY_GUARDIAN_CONTRACT_VERSION,
    evidence: {
      ...(evidence.affectedSignals === undefined
        ? {}
        : { affectedSignals: Object.freeze([...evidence.affectedSignals]) }),
      ...(evidence.readinessScore === undefined
        ? {}
        : { readinessScore: evidence.readinessScore }),
      signalCount: evidence.signalCount,
      ...(evidence.threshold === undefined ? {} : { threshold: evidence.threshold }),
    },
    findingId: "quality-guardian:pending",
    message: text.message,
    recommendation: text.recommendation,
    severity,
    title: text.title,
  };
}

function highestSeverity(
  findings: readonly QualityGuardianFinding[],
): QualityGuardianSeverity {
  if (findings.some(({ severity }) => severity === "critical")) {
    return "critical";
  }
  if (findings.some(({ severity }) => severity === "warning")) {
    return "warning";
  }
  return "info";
}
