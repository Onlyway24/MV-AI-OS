import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import type { BusinessMissionDossier, BusinessMissionExecutionInput, BusinessScoreCriterion } from "../../src/business/business-mission.js";
import { BusinessMissionDossierValidator, dossierFingerprint } from "../../src/business/business-mission-validator.js";
import { DeterministicBusinessEconomicsEngine } from "../../src/business/deterministic-economics-engine.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";
import { CommandCenterActionService } from "../../src/command-center/command-center-action-service.js";

describe("Business Mission V1 vertical slice", () => {
  it("selects one of three evidence-backed opportunities, builds deterministic economics and persists the commercial dossier across restart", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-14T12:00:00.000Z");
    const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedEvidence(first, clock);
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: first, workspaceId: "onlyway" });
    const created = await boundary.execute({ actorId: "fabio", commandId: "business-create-001", contractVersion: "1", input: { mission: missionInput() }, operation: "CREATE_BUSINESS_MISSION_DOSSIER", workspaceId: "onlyway" });
    expect(created).toMatchObject({
      replayed: false,
      result: {
        artifacts: { length: 10 },
        externalActionsExecuted: false,
        selectedOpportunityId: "opportunity-a",
        status: "PENDING_FABIO_APPROVAL",
      },
      unauthorizedExternalEffectOccurred: false,
    });
    const dossier = created.result as { readonly artifacts: readonly { readonly kind: string }[]; readonly economics: readonly { readonly contributionMarginCents: { readonly status: string } }[]; readonly scorecards: readonly { readonly totalScore: number }[] };
    expect(dossier.scorecards.map(({ totalScore }) => totalScore)).toEqual([90, 70, 50]);
    expect(dossier.economics.every(({ contributionMarginCents }) => contributionMarginCents.status === "CALCULATED")).toBe(true);
    expect(dossier.artifacts.map(({ kind }) => kind)).toContain("ECONOMICS_SHEET");
    const tampered = structuredClone(created.result) as BusinessMissionDossier;
    const scorecard = tampered.scorecards[0] as { totalScore?: number };
    scorecard.totalScore = 99;
    const forged = { ...tampered, fingerprint: dossierFingerprint(tampered) };
    expect(new BusinessMissionDossierValidator().validate(forged).ok).toBe(false);
    await first.close();

    const restarted = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const restartedBoundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: restarted, workspaceId: "onlyway" });
    const inspected = await restartedBoundary.execute({ actorId: "fabio", commandId: "business-inspect-001", contractVersion: "1", input: { missionId: "business-mission-001" }, operation: "INSPECT_BUSINESS_MISSION_DOSSIER", workspaceId: "onlyway" });
    const recovered = inspected.result as { readonly fingerprint: string; readonly selectedOpportunityId: string; readonly version: number };
    expect(recovered.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(recovered).toMatchObject({ selectedOpportunityId: "opportunity-a", version: 0 });
    const actions = new CommandCenterActionService({ actorId: "fabio", clock, commands: restartedBoundary, repositories: restarted, workspaceId: "onlyway" });
    const proposal = await actions.proposeBusinessReview({ action: "REQUEST_BUSINESS_REVISION", missionId: "business-mission-001" });
    expect(proposal.summary).toMatchObject({ evidencePackIds: ["business-pack-a", "business-pack-b", "business-pack-c"], selectedOpportunityId: "opportunity-a", version: 0 });
    const review = await actions.confirmReview({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint });
    expect(review).toMatchObject({ action: "REQUEST_BUSINESS_REVISION", command: { result: { status: "REVISION_REQUESTED", version: 1 }, unauthorizedExternalEffectOccurred: false } });
    await expect(actions.confirmReview({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint })).rejects.toThrow(/scaduta|utilizzata/iu);
    await restarted.close();
  }));

  it("does not fabricate an economic result when an input is missing", () => {
    const scenario = new DeterministicBusinessEconomicsEngine().calculate({
      acquisitionCostCents: 12_000,
      deliveryCostCents: 8_000,
      fixedCostsCents: 10_000,
      hourlyCostCents: 3_000,
      humanHoursPerClient: 4,
      monthlyVolume: 5,
      name: "BASE",
      provenance: [],
      refundRateBps: 0,
      toolCostsCents: 5_000,
    });
    expect(scenario.revenueCents).toEqual(expect.objectContaining({ status: "NOT_AVAILABLE" }));
    expect(scenario.revenueCents).not.toHaveProperty("value");
  });
});

async function seedEvidence(repositories: SqliteRepositoryTransactionRunner, clock: FixedClock): Promise<void> {
  const service = new OperationalPlaneService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
  await service.registerSource({ canonicalReference: "https://example.org/business/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Business source fixture", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "business-source", status: "AUTHORIZED" });
  for (const suffix of ["a", "b", "c"]) {
    const evidenceId = `business-evidence-${suffix}`;
    await service.recordEvidence({ claimMappings: [{ claimId: `business-claim-${suffix}`, statement: `Segnale verificabile per opportunità ${suffix}.` }], contentPublishedAt: "2026-07-10T00:00:00.000Z", corroboratingEvidenceIds: [], evidenceId, excerpt: `Estratto strutturato per l'opportunità ${suffix}.`, fingerprint: suffix.repeat(64), freshnessExpiresAt: "2026-08-01T00:00:00.000Z", limitations: ["Fixture di collaudo; non rappresenta una Business Mission reale."], riskDomain: "GENERAL", sourceId: "business-source", sourceReference: `https://example.org/business/${suffix}`, status: "VERIFIED" });
    await service.createEvidencePack({ evidenceIds: [evidenceId], packId: `business-pack-${suffix}` });
  }
}

function missionInput(): BusinessMissionExecutionInput {
  return {
    candidates: [candidate("a", 90), candidate("b", 70), candidate("c", 50)],
    commercialPlan: {
      acquisition: {
        channels: [{ channel: "Outreach manuale", message: "Proposta pilota basata su evidenze.", priority: 1 }],
        emailSequence: [{ body: "Presentazione della proposta pilota e richiesta di risposta.", subject: "Proposta pilota Onlyway" }],
        faq: [{ answer: "Il pilota misura segnali prima di qualsiasi espansione.", question: "Perché iniziare con un pilota?" }],
        landingCopy: { callToAction: "Richiedi il pilota", headline: "Validazione evidence-led", proof: "Evidenze e assunzioni sono separate nel dossier.", subheadline: "Una proposta misurabile prima dell'investimento." },
        outreachScript: "Contatto manuale in bozza; nessun invio automatico.",
        socialSupport: ["Contenuto di supporto con CTA misurabile."],
      },
      economics: [scenario("PRUDENT", 3), scenario("BASE", 5), scenario("AMBITIOUS", 8)],
      offer: {
        bonuses: ["Report finale"], customerExclusions: ["Clienti che richiedono promesse di risultato"], differentiation: "Evidenze, gate e calcoli riproducibili", deliverables: ["Audit", "Piano", "Pacchetto"], guarantee: "Garanzia limitata al completamento dei deliverable dichiarati", idealCustomer: "Piccoli business con un'offerta da validare", limits: ["Nessuna promessa di ricavo"], mechanism: "Ricerca autorizzata e validazione controllata", objections: [{ objection: "Mancano dati storici", response: "Il piano parte con un esperimento limitato." }], opportunityId: "opportunity-a", positioning: "Servizio operativo evidence-led", primaryProblem: "Decisioni commerciali non verificate", promisedOutcome: "Una decisione commerciale supportata da evidenze", tiers: [{ deliverables: ["Audit", "Piano"], name: "Pilota", priceCents: 250_000 }],
      },
      validation: [{ assetNeeded: "Landing locale", audience: "10 piccoli business", authorizationRequired: true, durationDays: 10, experimentId: "validation-001", hypothesis: "Almeno 2 prospect richiedono una call", maxCostCents: 20_000, method: "MANUAL_OUTREACH", minimumThreshold: "2 risposte qualificate", nextDecision: "Continuare con il pilota o fermare", primaryMetric: "Risposte qualificate", sampleSize: 10, stopCondition: "0 risposte dopo 10 contatti" }],
    },
    mission: { assets: ["MV-AI-OS", "Metodo Veloce"], availableDays: 60, competencies: ["AI", "contenuti", "workflow"], customerModel: "B2B", forbiddenActions: ["spesa non autorizzata", "email automatica", "pubblicazione"], geography: "Italia", maxCapitalCents: 300_000, minimumThresholds: { maxValidationDays: 30, minGrossMarginBps: 5_000, minOpportunityScore: 65 }, missionId: "business-mission-001", objective: "Confrontare tre servizi AI lanciabili entro 60 giorni", revenueModels: ["servizio a progetto"], riskTolerance: "MEDIUM" },
  };
}

function candidate(suffix: "a" | "b" | "c", score: number): BusinessMissionExecutionInput["candidates"][number] {
  const evidenceId = `business-evidence-${suffix}`;
  const criteria: readonly BusinessScoreCriterion[] = ["VERIFIED_DEMAND", "VALIDATION_SPEED", "CAPITAL_EFFICIENCY", "MARGIN_POTENTIAL", "CUSTOMER_ACCESS", "FABIO_ADVANTAGE", "RISK_CONTROL"];
  return { assumptions: ["Il CAC è ancora una stima."], capitalRequiredCents: 50_000, competition: "Competizione dichiarata", customer: "Piccoli business", demand: "Domanda collegata all'Evidence Pack", entryBarrier: "Capacità operativa", evidencePackId: `business-pack-${suffix}`, marginPotentialBps: 7_000, missingInformation: [], operationalComplexity: "LOW", opportunityId: `opportunity-${suffix}`, problem: "Validazione commerciale insufficiente", risk: "LOW", scoreInputs: criteria.map((criterion) => ({ confidence: "HIGH", criterion, dataKind: "REAL", evidenceId, formula: "Punteggio normalizzato 0-100 dal dato dichiarato", value: score })), title: `Opportunità ${suffix.toUpperCase()}`, validationSpeedDays: 10 };
}

function scenario(name: "AMBITIOUS" | "BASE" | "PRUDENT", volume: number): BusinessMissionExecutionInput["commercialPlan"]["economics"][number] {
  const values = { acquisitionCostCents: 12_000, conversionRateBps: 1_000, deliveryCostCents: 8_000, fixedCostsCents: 10_000, hourlyCostCents: 3_000, humanHoursPerClient: 4, monthlyVolume: volume, priceCents: 250_000, refundRateBps: 0, toolCostsCents: 5_000 };
  return { ...values, name, provenance: Object.keys(values).map((field) => ({ dataKind: "ASSUMPTION" as const, field: field as keyof typeof values, note: "Input dichiarato per il collaudo deterministico." })) };
}

async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-business-mission-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
class FixedClock { public constructor(private readonly value: string) {} public now(): Date { return new Date(this.value); } }
