import { describe, expect, it } from "vitest";

import { DeterministicMetodoVeloceContentProductionLine, MetodoVeloceContentProductionBriefValidator, MetodoVeloceContentProductionPackageValidator, type MetodoVeloceContentProductionBrief } from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

const line = new DeterministicMetodoVeloceContentProductionLine(new FixedClock("2026-07-14T12:00:00.000Z"));

describe("Metodo Veloce content production line", () => {
  it("produces a complete preparation-only TikTok, Instagram, and carousel package from declared evidence", () => {
    const result = line.produce(brief());

    expect(result).toMatchObject({ approval: { required: true, status: "PENDING_FABIO" }, externalActionsAllowed: false, status: "READY_FOR_FABIO_APPROVAL", risk: { findings: [], status: "CLEAR" }, quality: { readinessScore: 88 } });
    expect(result.assets?.carousel).toHaveLength(6);
    expect(result.assets?.tiktok.beats).toHaveLength(5);
    expect(result.assets?.instagram.hashtags).toHaveLength(6);
    expect(result.metrics.measures).toEqual(["contenuti prodotti", "percentuale approvata", "tempo di produzione", "costo per contenuto", "salvataggi", "visualizzazioni", "lead", "conversioni"]);
    expect(result.evidence.limitations[0]).toContain("non sono state cercate sul web");
    expect(result.quality.report.findings.some(({ category }) => category === "missing_human_review")).toBe(true);
    expect(new MetodoVeloceContentProductionPackageValidator().validate(result)).toMatchObject({ ok: true });
  });

  it("blocks prohibited claims before it creates any publishable assets", () => {
    const result = line.produce({ ...brief(), offer: "Guadagno garantito di 1000 euro in una settimana" });

    expect(result).toMatchObject({ approval: { status: "NOT_ELIGIBLE" }, externalActionsAllowed: false, risk: { status: "BLOCKED" }, status: "BLOCKED" });
    expect(result.assets).toBeUndefined();
    expect(result.quality.report.summary.criticalFindings).toBeGreaterThan(0);
  });

  it("rejects underspecified, secret-shaped, or ungrounded inputs before production", () => {
    const validator = new MetodoVeloceContentProductionBriefValidator();
    expect(validator.validate({ ...brief(), evidence: [] })).toMatchObject({ ok: false });
    expect(validator.validate({ ...brief(), topic: "Use sk-abcdefghijklmnop" })).toMatchObject({ ok: false });
    expect(validator.validate({ ...brief(), missionReference: "bad reference with spaces" })).toMatchObject({ ok: false });
  });

  it("is deterministic for the same brief and clock", () => {
    expect(line.produce(brief())).toEqual(line.produce(brief()));
  });

  it("rejects a package with an altered Quality Guardian report", () => {
    const result = line.produce(brief());
    expect(new MetodoVeloceContentProductionPackageValidator().validate({ ...result, quality: { ...result.quality, report: { ...result.quality.report, summary: { ...result.quality.report.summary, providerPayload: "not allowed" } } } }).ok).toBe(false);
  });
});

function brief(): MetodoVeloceContentProductionBrief {
  return {
    audience: "Persone che vogliono testare un'offerta prima di investire budget.",
    callToAction: "Salva il post e scegli un test piccolo per questa settimana.",
    contractVersion: "1",
    evidence: [{ evidenceId: "customer-note-1", sourceRef: "interview-2026-07", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }],
    language: "it",
    missionReference: "mission-draft-1",
    objective: "educate",
    offer: "un percorso per validare offerte digitali",
    productionId: "mv-content-20260714-001",
    topic: "come validare un'offerta prima di promuoverla",
  };
}
