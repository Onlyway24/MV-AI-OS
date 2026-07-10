import { describe, expect, it } from "vitest";

import {
  DEFAULT_FOUNDER_MISSION_BRIEF,
  FOUNDER_MISSION_TYPES,
  METODO_VELOCE_BRAND_PROFILE,
  MV_AI_OS_BRAND_PROFILE,
  FounderMissionBriefValidator,
  type FounderMissionBrief,
  type MissionUnknownClassification,
  type ValidationResult,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

describe("Founder Intent / Mission Brief Foundation", () => {
  it("accepts the default founder mission brief", () => {
    expect(validate(DEFAULT_FOUNDER_MISSION_BRIEF)).toEqual({
      ok: true,
      value: DEFAULT_FOUNDER_MISSION_BRIEF,
    });
  });

  it.each(FOUNDER_MISSION_TYPES)("accepts the %s mission type", (missionType) => {
    const brief = cloneBrief();
    brief.missionType = missionType;

    expect(validate(brief).ok).toBe(true);
  });

  it("rejects a missing objective", () => {
    const brief = cloneBrief();
    brief.objective.statement = "";

    expectIssue(validate(brief), "invalid_type", "objective.statement");
  });

  it("rejects a mission with no desired deliverable", () => {
    const brief = cloneBrief();
    brief.deliverables = [];

    expectIssue(validate(brief), "required", "deliverables");
  });

  it("accepts a known bounded budget", () => {
    const brief = cloneBrief();
    brief.budget = {
      currency: "EUR",
      maximumAmount: 250,
      status: "known",
    };

    expect(validate(brief).ok).toBe(true);
  });

  it("rejects an invalid or invented budget", () => {
    const known = cloneBrief();
    known.budget = {
      currency: "EUR",
      maximumAmount: -1,
      status: "known",
    };
    expectIssue(validate(known), "invalid_number", "budget.maximumAmount");

    const unknown = cloneBrief();
    unknown.budget = {
      currency: "USD",
      maximumAmount: 20,
      status: "unknown",
    };
    expectIssue(validate(unknown), "invalid_value", "budget");
  });

  it("accepts an RFC 3339 deadline and rejects an invalid deadline", () => {
    const valid = cloneBrief();
    valid.deadline = {
      dueAt: "2026-08-01T10:00:00Z",
      status: "known",
      timezone: "Europe/Rome",
    };
    expect(validate(valid).ok).toBe(true);

    const invalid = cloneBrief();
    invalid.deadline = {
      dueAt: "tomorrow",
      status: "known",
      timezone: "Europe/Rome",
    };
    expectIssue(validate(invalid), "invalid_timestamp", "deadline.dueAt");
  });

  it("rejects contradictory non-negotiable and forbidden actions", () => {
    const brief = cloneBrief();
    brief.constraints = [
      {
        constraintId: "publish-result",
        description: "Publish the result",
        kind: "non_negotiable",
      },
    ];
    brief.forbiddenActions = [
      {
        actionId: "forbid-publishing",
        category: "publishing",
        description: "Publish the result",
      },
    ];

    expectIssue(validate(brief), "contradiction", "constraints");
  });

  it("requires Fabio approval for proposed external actions", () => {
    const brief = withExternalPublication();
    brief.approvalPolicy.approvalRequiredFor = [];

    expectIssue(
      validate(brief),
      "approval_required",
      "approvalPolicy.approvalRequiredFor",
    );
  });

  it("accepts an approval-gated external proposal without executing it", () => {
    const brief = withExternalPublication();

    expect(validate(brief).ok).toBe(true);
    expect(brief.externalActionRequests[0]?.status).toBe("proposal_only");
    expect(brief.nonExecuting).toBe(true);
  });

  it("rejects an external action that is also forbidden", () => {
    const brief = withExternalPublication();
    brief.forbiddenActions.push({
      actionId: "no-publishing",
      category: "publishing",
      description: "Do not publish without a later explicit decision.",
    });

    expectIssue(validate(brief), "contradiction", "externalActionRequests");
  });

  it("requires one clarification question for a decision-blocking unknown", () => {
    const brief = withUnknown("DECISION_BLOCKING");
    brief.clarificationQuestions = [];

    expectIssue(validate(brief), "clarification_required");

    brief.clarificationQuestions = [
      {
        question: "Which audience must the offer serve?",
        questionId: "target-audience-question",
        sourceUnknownId: "target-audience",
        whyDecisionBlocking: "The answer changes the offer and evidence plan.",
      },
    ];
    expect(validate(brief).ok).toBe(true);
  });

  it.each([
    "MATERIAL_BUT_ASSUMABLE",
    "LOW_IMPACT",
  ] as const satisfies readonly MissionUnknownClassification[])(
    "continues with one explicit conservative assumption for %s unknowns",
    (classification) => {
      const brief = withUnknown(classification);
      brief.assumptions = [
        {
          assumptionId: "target-audience-assumption",
          rationale: "A conservative default preserves progress without external action.",
          sourceUnknownId: "target-audience",
          statement: "Assume a narrow founder-operated small-business audience.",
        },
      ];

      expect(validate(brief).ok).toBe(true);
      expect(brief.clarificationQuestions).toEqual([]);
    },
  );

  it("rejects unnecessary questions for non-blocking unknowns", () => {
    const brief = withUnknown("LOW_IMPACT");
    brief.assumptions = [
      {
        assumptionId: "target-audience-assumption",
        rationale: "The assumption is low-risk.",
        sourceUnknownId: "target-audience",
        statement: "Assume a narrow founder audience.",
      },
    ];
    brief.clarificationQuestions = [
      {
        question: "Which audience?",
        questionId: "target-audience-question",
        sourceUnknownId: "target-audience",
        whyDecisionBlocking: "It is not actually decision blocking.",
      },
    ];

    expectIssue(validate(brief), "unnecessary_clarification");
  });

  it("supports separate MV AI OS and Metodo Veloce brand profiles", () => {
    const engineering = cloneBrief();
    engineering.missionType = "software_development";
    engineering.brandProfile = structuredClone(
      MV_AI_OS_BRAND_PROFILE,
    ) as DeepMutable<typeof MV_AI_OS_BRAND_PROFILE>;
    engineering.styleProfile.visualDirection = ["dark control-room identity"];
    expect(validate(engineering).ok).toBe(true);

    const content = cloneBrief();
    content.missionType = "content_strategy";
    content.brandProfile = structuredClone(
      METODO_VELOCE_BRAND_PROFILE,
    ) as DeepMutable<typeof METODO_VELOCE_BRAND_PROFILE>;
    content.styleProfile.visualDirection = ["black yellow and white"];
    expect(validate(content).ok).toBe(true);

    expect(engineering.brandProfile.visualDirection).not.toEqual(
      content.brandProfile.visualDirection,
    );
  });

  it("accepts a custom versioned brand profile", () => {
    const brief = cloneBrief();
    brief.brandProfile = {
      applicationScopes: ["offer"],
      brandId: "custom-brand@1.0.0",
      communicationTraits: ["clear", "trustworthy"],
      displayName: "Custom Brand",
      version: "1.0.0",
    };

    expect(validate(brief).ok).toBe(true);
  });

  it("rejects style references to missing deliverables", () => {
    const brief = cloneBrief();
    brief.styleProfile.applicableDeliverableIds = ["missing-deliverable"];

    expectIssue(validate(brief), "not_found");
  });

  it("rejects nondeterministic collection ordering", () => {
    const brief = cloneBrief();
    brief.deliverables.push({
      acceptanceCriteria: ["A result exists."],
      deliverableId: "a-first-deliverable",
      description: "A deliberately out-of-order deliverable.",
      format: "structured_json",
      title: "First",
    });

    expectIssue(validate(brief), "not_deterministic", "deliverables");
  });

  it("rejects unknown public fields", () => {
    const brief = {
      ...cloneBrief(),
      executeImmediately: true,
    };

    expectIssue(validate(brief), "unknown_field", "executeImmediately");
  });

  it("rejects sensitive material at the public boundary", () => {
    const brief = cloneBrief();
    brief.objective.statement = "Read sk-private-value from /Users/private/source.";

    const result = validate(brief);
    expectIssue(result, "sensitive_content");
    expect(JSON.stringify(result)).not.toContain("sk-private-value");
  });

  it("keeps default contracts deeply immutable", () => {
    expect(Object.isFrozen(DEFAULT_FOUNDER_MISSION_BRIEF)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FOUNDER_MISSION_BRIEF.objective)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FOUNDER_MISSION_BRIEF.deliverables)).toBe(true);
    expect(Object.isFrozen(DEFAULT_FOUNDER_MISSION_BRIEF.brandProfile)).toBe(true);
  });

  it("returns a deeply immutable validated copy", () => {
    const candidate = cloneBrief();
    const result = validate(candidate);
    if (!result.ok) {
      throw new Error("expected valid mission brief fixture");
    }

    expect(result.value).not.toBe(candidate);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.objective)).toBe(true);
    expect(Object.isFrozen(result.value.deliverables)).toBe(true);
  });
});

function validate(value: unknown): ValidationResult<FounderMissionBrief> {
  return new FounderMissionBriefValidator().validate(value);
}

function cloneBrief(): DeepMutable<FounderMissionBrief> {
  return structuredClone(
    DEFAULT_FOUNDER_MISSION_BRIEF,
  ) as DeepMutable<FounderMissionBrief>;
}

function withUnknown(
  classification: MissionUnknownClassification,
): DeepMutable<FounderMissionBrief> {
  const brief = cloneBrief();
  brief.unknowns = [
    {
      classification,
      ...(classification === "DECISION_BLOCKING"
        ? {}
        : {
            conservativeAssumption:
              "Assume a narrow founder-operated small-business audience.",
          }),
      impact: "Audience selection affects positioning and evidence needs.",
      topic: "Target audience",
      unknownId: "target-audience",
    },
  ];
  if (classification === "DECISION_BLOCKING") {
    brief.clarificationQuestions = [
      {
        question: "Which audience must the offer serve?",
        questionId: "target-audience-question",
        sourceUnknownId: "target-audience",
        whyDecisionBlocking: "The answer changes the offer and evidence plan.",
      },
    ];
  }
  return brief;
}

function withExternalPublication(): DeepMutable<FounderMissionBrief> {
  const brief = cloneBrief();
  brief.approvalPolicy.approvalRequiredFor = [
    "external_side_effect",
    "publish_or_send",
  ];
  brief.externalActionRequests = [
    {
      actionId: "publication-proposal",
      actionType: "publication",
      approvalRequired: true,
      purpose: "Prepare a future publication proposal for Fabio review.",
      status: "proposal_only",
    },
  ];
  return brief;
}

function expectIssue(
  result: ValidationResult<FounderMissionBrief>,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code,
        ...(path === undefined ? {} : { path }),
      }),
    ]),
  );
}
