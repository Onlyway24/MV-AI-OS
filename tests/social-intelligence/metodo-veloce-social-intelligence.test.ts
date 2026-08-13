import { describe, expect, it } from "vitest";

import {
  DeterministicMetodoVeloceSocialIntelligenceEngine,
  MetodoVeloceSocialIntelligenceRequestValidator,
  SOCIAL_OPPORTUNITY_CRITERIA,
  SocialPublishingPackValidator,
  type MetodoVeloceSocialIntelligenceRequest,
  type SocialDataKind,
  type SocialOpportunityCriterion,
} from "../../src/index.js";
import { FixedClock } from "../support/fixtures.js";

const NOW = "2026-07-15T08:00:00.000Z";
const engine = new DeterministicMetodoVeloceSocialIntelligenceEngine(new FixedClock(NOW));

describe("Metodo Veloce Social Intelligence", () => {
  it("builds a fingerprinted, approval-only Social Publishing Pack from declared real signals", () => {
    const pack = engine.analyze(request(), carousel());

    expect(pack).toMatchObject({
      audioPlan: { status: "AUDIO_AUTORIZZATO" },
      decision: "PRODURRE_ORA",
      externalActionsAllowed: false,
      hashtagSets: { status: "VERIFIED" },
      opportunity: { completeness: 100, score: 90 },
      publicationWindows: { mode: "DYNAMIC", status: "DATA_SUFFICIENT" },
      status: "READY_FOR_FABIO_APPROVAL",
      trendAnalysis: { phase: "IN_CRESCITA", status: "ACTIVE" },
    });
    expect(pack.carousel).toHaveLength(6);
    expect(pack.hashtagSets.main.length).toBeGreaterThan(0);
    expect(pack.hashtagSets.alternate.length).toBeGreaterThan(0);
    expect(pack.hashtagSets.experimental.length).toBeGreaterThan(0);
    expect(pack.sequence.map(({ role }) => role)).toEqual(["PROBLEMA", "ERRORI", "METODO", "CASO_PRATICO", "CHECKLIST", "CTA_OFFERTA"]);
    expect(pack.measurement.snapshots.map(({ status }) => status)).toEqual(Array(5).fill("AWAITING_REAL_IMPORT"));
    expect(pack.visualDirection).toMatchObject({ canvas: "1080x1350", imageStyle: "ULTRAREALISTIC_CINEMATIC", palette: ["#050505", "#FFD400", "#F7F7F4"] });
    expect(pack.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(new SocialPublishingPackValidator().validate(pack)).toMatchObject({ ok: true });
  });

  it("requests more research instead of inventing a score when one criterion is missing", () => {
    const input = request();
    const criterionInputs = input.criterionInputs.map((criterion) => criterion.criterion === "AUDIENCE_DEMAND"
      ? criterionInput("AUDIENCE_DEMAND", "MISSING")
      : criterion);
    const pack = engine.analyze({ ...input, criterionInputs }, carousel());

    expect(pack).toMatchObject({ decision: "RICHIEDE_RICERCA", opportunity: { completeness: 91.67 }, status: "REQUIRES_RESEARCH" });
    expect(pack.opportunity.score).toBeUndefined();
  });

  it("blocks an expired trend and preserves the prepared draft without authorizing publication", () => {
    const input = request();
    if (input.trend === undefined) throw new Error("Trend fixture missing");
    const pack = engine.analyze({ ...input, trend: { ...input.trend, expiresAt: "2026-07-15T07:59:59.000Z", phase: "SCADUTO", publishBy: "2026-07-15T07:59:59.000Z" } }, carousel());

    expect(pack).toMatchObject({ decision: "SCARTARE", externalActionsAllowed: false, status: "BLOCKED", trendAnalysis: { status: "EXPIRED" } });
    expect(pack.blockingReasons[0]).toContain("Trend scaduto");
    expect(pack.carousel).toHaveLength(6);
  });

  it("marks audio and timing as unavailable or experimental when rights and analytics are insufficient", () => {
    const input = request();
    const pack = engine.analyze({
      ...input,
      audioCandidates: input.audioCandidates.map((audio) => ({ ...audio, accountAvailable: false, rightsStatus: "UNKNOWN" as const })),
      scheduling: { audienceSampleCount: 0, candidateWindows: [], historicalPostCount: 0 },
    }, carousel());

    expect(pack.audioPlan).toMatchObject({ status: "AUDIO_NON_AUTORIZZATO" });
    expect(pack.publicationWindows).toMatchObject({ mode: "EXPERIMENTAL", status: "DATI_INSUFFICIENTI", windows: [] });
    expect(pack.publicationWindows.testPlan).toContain("Nessun orario è definito ottimale");
  });

  it("rejects malformed provenance and duplicate criteria before analysis", () => {
    const validator = new MetodoVeloceSocialIntelligenceRequestValidator();
    const input = request();
    expect(validator.validate({ ...input, criterionInputs: [...input.criterionInputs.slice(0, 11), input.criterionInputs[0]] })).toMatchObject({ ok: false });
    expect(validator.validate({ ...input, audienceSignals: [{ ...input.audienceSignals[0], dataKind: "MEASURED", sourceId: undefined }] })).toMatchObject({ ok: false });
  });

  it("is deterministic for identical signals and clock", () => {
    expect(engine.analyze(request(), carousel())).toEqual(engine.analyze(request(), carousel()));
  });
});

function request(): MetodoVeloceSocialIntelligenceRequest {
  const measured = (note: string) => ({ dataKind: "MEASURED" as const, note, observedAt: NOW, sourceId: "instagram-analytics-20260715" });
  const evidence = (evidenceId: string, note: string) => ({ dataKind: "EVIDENCE" as const, evidenceId, note, observedAt: NOW });
  return {
    audienceSignals: [
      { ...measured("Query osservata nel campione autorizzato."), intent: "PROBLEMA", query: "come vendere oggetti usati senza svendere", strength: 88 },
      { ...measured("Salvataggi osservati su contenuti pratici."), intent: "APPRENDIMENTO", query: "prezzo giusto usato", strength: 82 },
    ],
    audioCandidates: [{ ...evidence("rights-audio-1", "Licenza commerciale verificata per l'account target."), accountAvailable: true, audioId: "original-mv-001", rightsStatus: "COMMERCIAL_ALLOWED", title: "Originale Metodo Veloce" }],
    brandChecks: ["CTA", "FONT", "LOGO", "PALETTE", "STRUCTURE", "TONE", "VISUAL_DIRECTION"].map((component) => ({ component: component as "CTA", score: 90 })),
    competitorSignals: [
      { ...evidence("competitor-observation-1", "Formato pubblico autorizzato alla comparazione."), authorized: true, competitorId: "competitor-a", format: "carosello", observedGap: "Manca una checklist finale verificabile." },
      { ...evidence("competitor-observation-2", "Formato pubblico autorizzato alla comparazione."), authorized: true, competitorId: "competitor-b", format: "slideshow", observedGap: "Claim non collegati a evidenze dichiarate." },
    ],
    contractVersion: "1",
    conversionIntent: { commercialStep: "Preparare una futura guida pratica sulla rivendita.", doNext: "Salva il post e usa la checklist.", feel: "Capace di agire senza fretta.", understand: "Il prezzo nasce da confronto, stato reale e prova documentata." },
    criterionInputs: SOCIAL_OPPORTUNITY_CRITERIA.map((criterion) => criterionInput(criterion, "MEASURED", 90)),
    culturalRisks: [],
    hashtagCandidates: ["#metodoveloce", "#rivendita", "#usato", "#microbusiness", "#vendereonline", "#prezzogiusto", "#secondhand", "#testhashtag"].map((tag, index) => ({ ...evidence(`hashtag-evidence-${String(index + 1)}`, "Pertinenza osservata in fonte autorizzata."), cluster: index === 7 ? "EXPERIMENTAL" as const : index === 0 ? "BRAND" as const : "TOPIC" as const, relevance: 95 - index, saturation: 50, tag })),
    mode: "TREND_REACTIVE",
    observedAt: NOW,
    platforms: ["INSTAGRAM", "TIKTOK"],
    portfolioRole: "DISCOVERY",
    productionId: "mv-social-20260715-001",
    recentContents: [],
    scheduling: {
      audienceSampleCount: 4,
      candidateWindows: [{ ...measured("Intervallo derivato da analytics importati."), endAt: "2026-07-15T18:30:00.000Z", label: "Finestra primaria misurata", startAt: "2026-07-15T17:30:00.000Z" }],
      historicalPostCount: 18,
    },
    topic: "vendere oggetti usati senza svendere",
    trend: { expiresAt: "2026-07-17T08:00:00.000Z", phase: "IN_CRESCITA", phrase: "rivendita oggetti usati", provenance: [measured("Crescita osservata nel dataset autorizzato.")], publishBy: "2026-07-16T08:00:00.000Z" },
  };
}

function criterionInput(criterion: SocialOpportunityCriterion, dataKind: SocialDataKind, value?: number) {
  return dataKind === "MISSING"
    ? { criterion, dataKind, note: "Dato non disponibile.", observedAt: NOW }
    : { criterion, dataKind, note: "Valore normalizzato da analytics importati.", observedAt: NOW, sourceId: "instagram-analytics-20260715", ...(value === undefined ? {} : { value }) };
}

function carousel() {
  return [
    { body: "Cinque categorie da controllare prima di vendere.", slide: 1, title: "5 oggetti che puoi vendere" },
    { body: "Controlla modello, memoria, batteria, accessori e difetti reali.", slide: 2, title: "Elettronica usata" },
    { body: "Brand, taglia, stato e foto pulite influenzano la domanda.", slide: 3, title: "Streetwear e sneakers" },
    { body: "Marca, condizioni, misure e dettagli originali cambiano la valutazione.", slide: 4, title: "Orologi e gioielli" },
    { body: "Scatola, certificati e accessori possono sostenere il prezzo dichiarato.", slide: 5, title: "Corredo e accessori" },
    { body: "Cerca modello, fotografa i difetti, confronta venduti reali e resta realistico. Salva il post.", slide: 6, title: "Fai questi 4 passaggi" },
  ];
}
