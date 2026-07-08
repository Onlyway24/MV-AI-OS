import { describe, expect, it } from "vitest";

import {
  DeterministicQualityGuardian,
  QualityGuardianEvaluationInputValidator,
  QualityGuardianReportValidator,
  QualityGuardianValidationError,
  type QualityGuardianEvaluationInput,
  type QualityGuardianQualityState,
} from "../../src/index.js";

const GENERATED_AT = "2026-07-08T15:00:00.000Z";

describe("Quality Guardian Foundation", () => {
  it("accepts valid sanitized quality input", () => {
    const input = createEvaluationInput();

    expect(new QualityGuardianEvaluationInputValidator().validate(input)).toEqual(
      {
        ok: true,
        value: input,
      },
    );
  });

  it("rejects invalid input and unsafe raw fields", () => {
    const input = {
      ...createEvaluationInput(),
      state: {
        ...createQualityState(),
        completion: "raw completion",
        generatedContent: "raw generated content",
        knowledgeContent: "raw knowledge",
        memoryContent: "raw memory",
        prompt: "raw prompt",
        providerPayload: { raw: "payload" },
        secretRef: "env:OPENAI_API_KEY",
        transcriptText: "raw transcript",
      },
    };

    const result = new QualityGuardianEvaluationInputValidator().validate(input);

    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.issues.map(({ code, path }) => ({ code, path })),
    ).toEqual(
      expect.arrayContaining([
        { code: "unexpected", path: "state.completion" },
        { code: "unexpected", path: "state.generatedContent" },
        { code: "unexpected", path: "state.knowledgeContent" },
        { code: "unexpected", path: "state.memoryContent" },
        { code: "unexpected", path: "state.prompt" },
        { code: "unexpected", path: "state.providerPayload" },
        { code: "unexpected", path: "state.secretRef" },
        { code: "unexpected", path: "state.transcriptText" },
      ]),
    );
  });

  it("returns a healthy deterministic report without findings", () => {
    const guardian = new DeterministicQualityGuardian();
    const input = createEvaluationInput();

    expect(guardian.evaluate(input)).toEqual({
      contractVersion: "1",
      findings: [],
      generatedAt: GENERATED_AT,
      summary: {
        criticalFindings: 0,
        highestSeverity: "info",
        totalFindings: 0,
        warningFindings: 0,
      },
    });
    expect(guardian.evaluate(input)).toEqual(guardian.evaluate(input));
  });

  it("reports missing and malformed output in deterministic order", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          finalResponsePresent: false,
          resultWellFormed: false,
          taskResultComplete: false,
        }),
      }),
    );

    expect(report.findings.map(({ category, severity }) => ({
      category,
      severity,
    }))).toEqual([
      { category: "missing_final_response", severity: "critical" },
      { category: "malformed_result", severity: "critical" },
      { category: "incomplete_task_result", severity: "warning" },
    ]);
    expect(report.findings.map(({ findingId }) => findingId)).toEqual([
      "quality-guardian:001:missing_final_response",
      "quality-guardian:002:malformed_result",
      "quality-guardian:003:incomplete_task_result",
    ]);
  });

  it("reports missing evidence, sources, and human review", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          evidenceReferencesPresent: false,
          evidenceRequired: true,
          humanReviewCompleted: false,
          humanReviewRequired: true,
          outputClaimsEvidence: true,
          sourceReferencesPresent: false,
        }),
      }),
    );

    expect(report.findings.map(({ category, evidence }) => ({
      category,
      evidence,
    }))).toEqual([
      {
        category: "missing_evidence_references",
        evidence: {
          affectedSignals: ["evidence_references"],
          signalCount: 1,
        },
      },
      {
        category: "missing_source_references",
        evidence: {
          affectedSignals: ["source_references"],
          signalCount: 1,
        },
      },
      {
        category: "missing_human_review",
        evidence: {
          affectedSignals: ["human_review"],
          signalCount: 1,
        },
      },
    ]);
  });

  it("reports validation and readiness failures when represented", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          minimumReadinessScore: 90,
          modelOutputRejected: true,
          readinessScore: 72,
          rejectedOutputCount: 3,
          rejectedOutputThreshold: 2,
          validationFailureCount: 2,
          validationFailureThreshold: 2,
        }),
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "model_output_rejected",
        severity: "critical",
      },
      {
        category: "low_readiness_score",
        evidence: {
          affectedSignals: ["readiness_score"],
          readinessScore: 72,
          signalCount: 1,
          threshold: 90,
        },
        severity: "warning",
      },
      {
        category: "repeated_rejected_outputs",
        evidence: {
          affectedSignals: ["rejected_outputs"],
          signalCount: 3,
          threshold: 2,
        },
        severity: "warning",
      },
      {
        category: "validation_failure_threshold_exceeded",
        evidence: {
          affectedSignals: ["validation_failures"],
          signalCount: 2,
          threshold: 2,
        },
        severity: "warning",
      },
    ]);
    expect(report.summary).toEqual({
      criticalFindings: 1,
      highestSeverity: "critical",
      totalFindings: 4,
      warningFindings: 3,
    });
  });

  it("reports unsafe content pipeline state as critical", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          unsafeContentPipelineDetected: true,
        }),
      }),
    );

    expect(report.findings).toMatchObject([
      {
        category: "unsafe_content_pipeline_state",
        evidence: {
          affectedSignals: ["content_pipeline"],
          signalCount: 1,
        },
        severity: "critical",
      },
    ]);
  });

  it("rejects invalid generated reports", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          evidenceReferencesPresent: false,
          evidenceRequired: true,
        }),
      }),
    );

    expect(
      new QualityGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              generatedContent: "raw content must not be reportable",
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "unexpected",
          path: "findings[0].evidence.generatedContent",
        },
      ],
      ok: false,
    });
  });

  it("keeps findings redaction-safe", () => {
    const guardian = new DeterministicQualityGuardian();
    const unsafeInput = {
      ...createEvaluationInput(),
      generatedContent: "private generated content",
    };

    expect(() => guardian.evaluate(unsafeInput)).toThrow(
      QualityGuardianValidationError,
    );

    const report = guardian.evaluate(
      createEvaluationInput({
        state: createQualityState({
          evidenceReferencesPresent: false,
          evidenceRequired: true,
          humanReviewCompleted: false,
          humanReviewRequired: true,
          modelOutputRejected: true,
        }),
      }),
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("private generated content");
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("providerPayload");
    expect(serialized).not.toContain("transcript");
    expect(serialized).not.toContain("knowledgeContent");
  });

  it("rejects duplicate affected signals in report evidence", () => {
    const report = new DeterministicQualityGuardian().evaluate(
      createEvaluationInput({
        state: createQualityState({
          unsafeContentPipelineDetected: true,
        }),
      }),
    );

    expect(
      new QualityGuardianReportValidator().validate({
        ...report,
        findings: [
          {
            ...report.findings[0],
            evidence: {
              ...report.findings[0]?.evidence,
              affectedSignals: ["content_pipeline", "content_pipeline"],
            },
          },
        ],
      }),
    ).toMatchObject({
      issues: [
        {
          code: "duplicate",
          path: "findings[0].evidence.affectedSignals[1]",
        },
      ],
      ok: false,
    });
  });
});

function createEvaluationInput(
  overrides: Partial<QualityGuardianEvaluationInput> = {},
): QualityGuardianEvaluationInput {
  return {
    contractVersion: "1",
    generatedAt: GENERATED_AT,
    state: createQualityState(),
    ...overrides,
  };
}

function createQualityState(
  overrides: Partial<QualityGuardianQualityState> = {},
): QualityGuardianQualityState {
  return {
    evidenceReferencesPresent: true,
    evidenceRequired: false,
    finalResponsePresent: true,
    humanReviewCompleted: true,
    humanReviewRequired: false,
    minimumReadinessScore: 80,
    modelOutputRejected: false,
    outputClaimsEvidence: false,
    readinessScore: 100,
    rejectedOutputCount: 0,
    rejectedOutputThreshold: 2,
    resultWellFormed: true,
    sourceReferencesPresent: true,
    taskResultComplete: true,
    unsafeContentPipelineDetected: false,
    validationFailureCount: 0,
    validationFailureThreshold: 2,
    ...overrides,
  };
}
