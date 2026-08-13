import { describe, expect, it } from "vitest";

import type { BusinessMissionDossier } from "../../src/business/business-mission.js";
import { buildCommandCenterRevenueView } from "../../src/command-center/command-center-revenue-view.js";
import type { CommandCenterBusinessContextView } from "../../src/command-center/reference-vault-view.js";
import type { EvidencePack } from "../../src/operational-planes/operational-plane.js";

describe("Command Center Revenue View", () => {
  it("shows an honest setup state when only one Evidence Pack exists", () => {
    const view = buildCommandCenterRevenueView(input({ evidencePacks: [pack("evidence-one")] }));

    expect(view).toMatchObject({
      externalActions: "LOCKED",
      nextAction: { href: "#evidence", label: "Completa le evidenze" },
      reasonCode: "BUSINESS_MISSION_REQUIRED",
      state: "SETUP_REQUIRED",
      targetMonthlyRevenueCents: { reasonCode: "BUSINESS_CONTEXT_REQUIRED", status: "NOT_AVAILABLE" },
      verifiedPipelineCents: { reasonCode: "PIPELINE_AGGREGATE_NOT_AVAILABLE", status: "NOT_AVAILABLE" },
    });
    expect(view.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "THREE_EVIDENCE_PACKS_REQUIRED" }),
      expect.objectContaining({ reasonCode: "BUSINESS_MISSION_REQUIRED" }),
      expect.objectContaining({ reasonCode: "EXTERNAL_ACTION_LOCKED" }),
    ]));
    expect(view.stages.find(({ id }) => id === "EVIDENCE")).toMatchObject({ status: "BLOCKED", value: "1/3 pack" });
    expect(view.stages.find(({ id }) => id === "SALES")).toMatchObject({ status: "NOT_AVAILABLE" });
    expect(view.stages.find(({ id }) => id === "DELIVERY")).toMatchObject({ status: "NOT_AVAILABLE" });
  });

  it("labels complete economics as a plan and never as verified pipeline", () => {
    const view = buildCommandCenterRevenueView(input({
      businessContext: context(1_500_000),
      businessMissions: [mission("APPROVED", true)],
      evidencePacks: [pack("evidence-one"), pack("evidence-two"), pack("evidence-three")],
    }));

    expect(view).toMatchObject({
      contributionMarginCents: { classification: "CALCULATED_PLAN", status: "AVAILABLE", valueCents: 220_000 },
      plannedRevenueCents: { classification: "CALCULATED_PLAN", status: "AVAILABLE", valueCents: 500_000 },
      reasonCode: "VALIDATION_NOT_EXECUTED",
      state: "VALIDATION_PLANNED",
      targetMonthlyRevenueCents: { classification: "FABIO_TARGET", status: "AVAILABLE", valueCents: 1_500_000 },
      verifiedPipelineCents: { status: "NOT_AVAILABLE" },
    });
    expect(view.stages.find(({ id }) => id === "ACQUISITION")).toMatchObject({ status: "PLANNED" });
    expect(view.stages.find(({ id }) => id === "ECONOMICS")).toMatchObject({ status: "READY" });
  });

  it("routes Fabio to the exact Business review without authorizing execution", () => {
    const view = buildCommandCenterRevenueView(input({
      businessMissions: [mission("PENDING_FABIO_APPROVAL", true)],
      evidencePacks: [pack("evidence-one"), pack("evidence-two"), pack("evidence-three")],
    }));

    expect(view).toMatchObject({
      externalActions: "LOCKED",
      nextAction: { href: "#business", label: "Revisiona il dossier" },
      reasonCode: "FABIO_REVIEW_REQUIRED",
      state: "REVIEW_REQUIRED",
    });
    expect(view.readiness.find(({ id }) => id === "OFFER")).toMatchObject({ status: "REVIEW_REQUIRED" });
  });

  it("fails coverage closed instead of presenting totals as global", () => {
    const view = buildCommandCenterRevenueView(input({
      businessMissions: [mission("APPROVED", true)],
      coverage: "LIMIT_REACHED",
      evidencePacks: [pack("evidence-one"), pack("evidence-two"), pack("evidence-three")],
    }));
    expect(view.coverage).toBe("LIMIT_REACHED");
    expect(view.reasonCode).toBe("CONTROL_PLANE_COVERAGE_LIMITED");
    expect(view.state).toBe("BLOCKED");
    expect(view.blockers[0]).toMatchObject({ reasonCode: "CONTROL_PLANE_COVERAGE_LIMITED" });
  });

  it("counts only Evidence Packs referenced by the selected mission", () => {
    const view = buildCommandCenterRevenueView(input({
      businessMissions: [mission("APPROVED", true)],
      evidencePacks: [pack("unrelated-one"), pack("unrelated-two"), pack("unrelated-three")],
    }));

    expect(view.state).toBe("BLOCKED");
    expect(view.reasonCode).toBe("THREE_EVIDENCE_PACKS_REQUIRED");
    expect(view.stages.find(({ id }) => id === "EVIDENCE")).toMatchObject({ status: "BLOCKED", value: "0/3 pack" });
  });

  it("does not render zero when BASE economics are incomplete", () => {
    const view = buildCommandCenterRevenueView(input({ businessMissions: [mission("APPROVED", false)] }));
    expect(view.state).toBe("BLOCKED");
    expect(view.plannedRevenueCents).toMatchObject({ reasonCode: "ECONOMICS_INPUT_REQUIRED", status: "NOT_AVAILABLE" });
    expect(view.contributionMarginCents).toMatchObject({ reasonCode: "ECONOMICS_INPUT_REQUIRED", status: "NOT_AVAILABLE" });
  });

  it("rejects revenue targets with undeclared fields", () => {
    const revenueTargets = {
      contractVersion: "1",
      currency: "EUR",
      monthlyTargetCents: 1_500_000,
      sourceRef: "fabio.revenue-target.v1",
      untrustedActualRevenueCents: 999_999,
    } as const;
    const view = buildCommandCenterRevenueView(input({
      businessContext: { ...context(1_500_000), revenueTargets },
    }));

    expect(view.targetMonthlyRevenueCents).toEqual({
      reasonCode: "BUSINESS_CONTEXT_REQUIRED",
      status: "NOT_AVAILABLE",
    });
  });
});

function input(overrides: Partial<Parameters<typeof buildCommandCenterRevenueView>[0]> = {}): Parameters<typeof buildCommandCenterRevenueView>[0] {
  return {
    agentCompany: [],
    businessContext: null,
    businessMissions: [],
    coverage: "COMPLETE",
    evidencePacks: [],
    productions: [],
    ...overrides,
  };
}

function pack(packId: string): EvidencePack {
  return { actorId: "fabio", createdAt: "2026-07-21T08:00:00.000Z", evidence: [], evidenceIds: [], fingerprint: "a".repeat(64), minFreshnessExpiresAt: "2026-08-21T08:00:00.000Z", packId, status: "READY", version: 0, workspaceId: "onlyway" };
}

function context(monthlyTargetCents: number): CommandCenterBusinessContextView {
  return {
    activeExperiments: "NOT_AVAILABLE",
    audience: "NOT_AVAILABLE",
    availableTime: "NOT_AVAILABLE",
    budget: "NOT_AVAILABLE",
    channels: "NOT_AVAILABLE",
    commercialExclusions: "NOT_AVAILABLE",
    currentAssets: "NOT_AVAILABLE",
    customerJourney: "NOT_AVAILABLE",
    deliveryCapacity: "NOT_AVAILABLE",
    founderConstraints: "NOT_AVAILABLE",
    offers: "NOT_AVAILABLE",
    pricing: "NOT_AVAILABLE",
    revenueTargets: { contractVersion: "1", currency: "EUR", monthlyTargetCents, sourceRef: "fabio.revenue-target.v1" },
    riskTolerance: "NOT_AVAILABLE",
    successMetrics: "NOT_AVAILABLE",
    unitEconomics: "NOT_AVAILABLE",
    version: 0,
  };
}

function mission(status: BusinessMissionDossier["status"], completeEconomics: boolean): BusinessMissionDossier {
  const metric = (value: number): Readonly<{ formula: string; status: "CALCULATED"; value: number }> => ({ formula: "fixture", status: "CALCULATED", value });
  const unavailable = Object.freeze({ formula: "Input mancanti", status: "NOT_AVAILABLE" as const });
  return {
    commercialPlan: {
      acquisition: { channels: [{ channel: "Manuale", message: "Draft locale", priority: 1 }] },
      offer: { tiers: [{ name: "Pilota" }] },
      validation: [{ experimentId: "validation-one" }],
    },
    economics: [{
      contributionMarginCents: completeEconomics ? metric(220_000) : unavailable,
      name: "BASE",
      revenueCents: completeEconomics ? metric(500_000) : unavailable,
    }],
    evidencePackIds: ["evidence-one", "evidence-two", "evidence-three"],
    mission: { missionId: "business-mission-one" },
    status,
    updatedAt: "2026-07-21T08:00:00.000Z",
  } as unknown as BusinessMissionDossier;
}
