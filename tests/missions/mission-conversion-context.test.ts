import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  FOUNDER_MISSION_BRIEF_FIELD_SOURCES,
  METODO_VELOCE_BRAND_PROFILE,
  MV_AI_OS_BRAND_PROFILE,
  DeterministicFounderMissionConverter,
  ImmutableMissionConversionProfileRegistry,
  type MissionBrandProfile,
  type TelegramMissionDraft,
} from "../../src/index.js";

const NOW = "2026-07-12T12:00:00.000Z";
const hash = "a".repeat(64);

describe("Versioned Founder Mission conversion context", () => {
  it("documents exactly one explicit source category for every FounderMissionBrief field", () => {
    expect(Object.keys(FOUNDER_MISSION_BRIEF_FIELD_SOURCES).sort()).toEqual([
      "approvalPolicy", "assumptions", "audience", "brandProfile", "briefId", "budget",
      "clarificationQuestions", "constraints", "contractVersion", "deadline", "deliverables",
      "evidenceExpectation", "externalActionRequests", "forbiddenActions", "founderPreferences",
      "knownFacts", "missionType", "nonExecuting", "objective", "originalityStandard", "priority",
      "qualityStandard", "riskTolerance", "styleProfile", "successMetrics", "unknowns",
    ]);
    for (const sources of Object.values(FOUNDER_MISSION_BRIEF_FIELD_SOURCES)) {
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) => ["FOUNDER_PROFILE", "BRAND_PROFILE", "MISSION_TYPE_PROFILE", "TELEGRAM_MISSION_DRAFT"].includes(source))).toBe(true);
    }
  });

  it("resolves exact founder and brand profiles with a deterministic context fingerprint", () => {
    const registry = new ImmutableMissionConversionProfileRegistry();
    const first = registry.resolveContext(completeDraft(), NOW);
    const second = registry.resolveContext(completeDraft(), NOW);

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.founderProfile).toMatchObject({ id: "only-way-founder-preferences@1.0.0", version: "1.0.0" });
    expect(first.value.brandProfile).toMatchObject({ id: "mv-ai-os@1.0.0", version: "1.0.0" });
    expect(registry.verify(first.value)).toBe(true);
  });

  it("fails closed for wrong profile versions, missing profiles, and registry substitution", () => {
    const selection = {
      brandProfileId: "mv-ai-os@1.0.0",
      brandProfileVersion: "1.0.0",
      founderProfileId: "only-way-founder-preferences@1.0.0",
      founderProfileVersion: "1.0.0",
    };
    const wrongFounder = completeDraft({ profileSelection: { ...selection, founderProfileVersion: "9.9.9" } });
    const wrongBrand = completeDraft({ profileSelection: { ...selection, brandProfileVersion: "9.9.9" } });
    const registry = new ImmutableMissionConversionProfileRegistry();
    expect(registry.resolveContext(wrongFounder, NOW).ok).toBe(false);
    expect(registry.resolveContext(wrongBrand, NOW).ok).toBe(false);

    const original = registry.resolveContext(completeDraft(), NOW);
    expect(original.ok).toBe(true);
    if (!original.ok) return;
    const substituted: MissionBrandProfile = { ...MV_AI_OS_BRAND_PROFILE, communicationTraits: ["changed"] };
    const substitutedRegistry = new ImmutableMissionConversionProfileRegistry({ brands: [substituted, METODO_VELOCE_BRAND_PROFILE] });
    expect(substitutedRegistry.verify(original.value)).toBe(false);
  });

  it("does not infer a brand from objective text and reports one exact missing material field at a time", () => {
    const draft = { ...completeDraft({ objective: "Create a Metodo Veloce offer strategy." }) };
    delete draft.profileSelection;
    const readiness = new DeterministicFounderMissionConverter().evaluateReadiness(draft, NOW);
    expect(readiness).toEqual({
      findings: [{ code: "PROFILE_RESOLUTION_FAILED", field: "profileSelection", telegramField: "PROFILE_SELECTION" }],
      status: "INCOMPLETE",
    });

    const draftWithoutMetric = { ...completeDraft() };
    delete draftWithoutMetric.successMetrics;
    const missingMetric = new DeterministicFounderMissionConverter().evaluateReadiness(draftWithoutMetric, NOW);
    expect(missingMetric).toEqual({
      findings: [{ code: "MISSING_MATERIAL_FIELD", field: "successMetrics", telegramField: "SUCCESS_METRICS" }],
      status: "INCOMPLETE",
    });
  });

  it("retains explicit unknown deadlines and budgets without inventing metrics, evidence, approval, or external authorization", () => {
    const converter = new DeterministicFounderMissionConverter();
    const ready = converter.evaluateReadiness(completeDraft(), NOW);
    expect(ready.status).toBe("READY");
    if (ready.status !== "READY" || ready.context === undefined) return;
    const conversion = converter.convert(completeDraft(), ready.context);
    expect(conversion.ok).toBe(true);
    if (!conversion.ok) return;
    expect(conversion.value.brief.budget).toEqual({ status: "unknown" });
    expect(conversion.value.brief.deadline).toEqual({ status: "unknown", timezone: "Europe/Rome" });
    expect(conversion.value.brief.successMetrics).toEqual(completeDraft().successMetrics);
    expect(conversion.value.brief.evidenceExpectation.sourceRequirements).toEqual(["Separate known facts from assumptions."]);
    expect(conversion.value.brief.externalActionRequests).toEqual([]);
    expect(conversion.value.brief.approvalPolicy.approvalRequiredFor).toEqual([]);
    expect(conversion.value.expandedReview.noHiddenDefaultsNotice).toContain("No hidden defaults were applied");
    expect(conversion.value.expandedReview.appliedRules).toHaveProperty("founderProfile");
    expect(conversion.value.expandedReview.appliedRules).toHaveProperty("brandProfile");
  });

  it("binds conversion to the exact draft version and context fingerprint", () => {
    const converter = new DeterministicFounderMissionConverter();
    const draft = completeDraft();
    const readiness = converter.evaluateReadiness(draft, NOW);
    expect(readiness.status).toBe("READY");
    if (readiness.status !== "READY" || readiness.context === undefined) return;
    expect(converter.convert({ ...draft, version: 1 }, readiness.context).ok).toBe(false);
    expect(converter.convert({ ...draft, actorId: "different-actor" }, readiness.context).ok).toBe(false);
  });

  it("remains local and does not import Telegram personal metadata, model, provider, network, tool, or workflow boundaries", async () => {
    const source = await readFile(new URL("../../src/missions/mission-conversion-context.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/telegram[-_ ]?(?:profile|user|metadata)|username|phone/iu);
    expect(source).not.toMatch(/from\s+"(?:[^"\n]*model|[^"\n]*provider|[^"\n]*workflow|[^"\n]*tool|[^"\n]*telegram-bot|[^"\n]*network)\.js"/u);
  });
});

function completeDraft(overrides: Partial<TelegramMissionDraft> = {}): TelegramMissionDraft {
  return {
    actorId: "actor-fabio",
    assumptions: [],
    audience: { description: "Founder-operated service businesses", segments: ["founders"] },
    authorizedIdentityHash: hash,
    budget: { status: "unknown" },
    constraints: [],
    contractVersion: "1",
    createdAt: "2026-07-12T11:00:00.000Z",
    currentField: "OBJECTIVE",
    deadline: { status: "unknown", timezone: "Europe/Rome" },
    deliverables: [{ acceptanceCriteria: ["Specific and reviewable"], deliverableId: "content-direction", description: "A bounded content direction.", format: "markdown", title: "Content direction" }],
    draftId: "mission-draft-001",
    expiresAt: "2026-07-12T13:00:00.000Z",
    knownFacts: [],
    missionType: "content_strategy",
    objective: "Prepare a specific content direction for founder review.",
    objectiveDetails: {
      businessValues: ["improve_quality", "save_fabio_time"],
      desiredOutcome: "Fabio can review one specific content direction.",
      purpose: "Prepare a bounded, non-executing content strategy.",
      statement: "Prepare a specific content direction for founder review.",
    },
    profileSelection: {
      brandProfileId: "mv-ai-os@1.0.0",
      brandProfileVersion: "1.0.0",
      founderProfileId: "only-way-founder-preferences@1.0.0",
      founderProfileVersion: "1.0.0",
    },
    proposedExternalActions: [],
    sessionId: "telegram-session-001",
    status: "COLLECTING",
    successMetrics: [{ evidenceRequired: "Fabio reviews the complete direction.", measurement: "review readiness", metricId: "review-readiness", target: "one complete content direction" }],
    unknowns: [],
    updatedAt: "2026-07-12T11:00:00.000Z",
    version: 0,
    workspaceId: "workspace-local",
    ...overrides,
  };
}
