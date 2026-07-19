import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentCompanyWorkday, AgentCompanyWorkdayInput } from "../../src/agent-company/operational-agent-company.js";
import { AgentCompanyWorkdayValidator, createAgentCompanyOutputFingerprint } from "../../src/agent-company/operational-agent-company-validator.js";
import type { BusinessMissionExecutionInput, BusinessScoreCriterion } from "../../src/business/business-mission.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import type { RestrictedHttpsAcquisition } from "../../src/research/authorized-research.js";
import { AuthorizedResearchService } from "../../src/research/authorized-research-service.js";
import type { RestrictedHttpsClient } from "../../src/research/restricted-https-client.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";

describe("Onlyway Agent Company Operational V1", () => {
  it("runs one shared durable workday across 17 executable departments and recovers it after restart", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const first = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(first, clock);
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: first, workspaceId: "onlyway" });
    const command = { actorId: "fabio", commandId: "agent-company-day-one-command", contractVersion: "1" as const, input: { workday: workdayInput() }, operation: "RUN_AGENT_COMPANY_WORKDAY" as const, workspaceId: "onlyway" };
    const completed = await boundary.execute(command);
    expect(completed).toMatchObject({ replayed: false, result: { externalActionsExecuted: false, status: "BLOCKED", workdayId: "onlyway-workday-001" }, unauthorizedExternalEffectOccurred: false });
    const workday = completed.result as { readonly tasks: readonly { readonly agentId: string; readonly blocker?: { readonly reasonCode: string }; readonly costCents: number; readonly gates: readonly { readonly status: string }[]; readonly output?: Record<string, unknown>; readonly status: string }[]; readonly version: number };
    expect(workday.tasks).toHaveLength(17);
    expect(workday.tasks.filter(({ status }) => status === "COMPLETED")).toHaveLength(16);
    expect(workday.tasks.find(({ agentId }) => agentId === "backup-guardian")).toMatchObject({ blocker: { reasonCode: "BACKUP_RESTORE_RECEIPT_REQUIRED" }, status: "BLOCKED" });
    expect(workday.tasks.filter(({ status }) => status === "COMPLETED").every(({ gates }) => gates.length === 3 && gates.every(({ status }) => status === "PASSED"))).toBe(true);
    expect(workday.tasks.every(({ costCents }) => costCents === 0)).toBe(true);
    expect(workday.tasks.find(({ agentId }) => agentId === "research-agent")?.output).toMatchObject({ acquisitionMode: "RESTRICTED_AUTHORIZED_HTTPS", researchMissionId: "authorized-research-day-one", unrestrictedWebAccess: false });
    expect(workday.tasks.find(({ agentId }) => agentId === "publisher-agent")?.output).toMatchObject({ dryRun: true, externalActionsExecuted: false });
    expect(workday.tasks.find(({ agentId }) => agentId === "developer-agent")?.output).toMatchObject({ implementationExecuted: false, mergeExecuted: false, scope: "CHANGE_PLAN_ONLY" });
    expect(workday.version).toBeGreaterThan(30);
    const durableWorkday = completed.result as AgentCompanyWorkday;
    const oversizedOutput = { payload: "x".repeat(65_537) };
    const oversizedWorkday = {
      ...durableWorkday,
      tasks: durableWorkday.tasks.map((task) => task.status === "COMPLETED" && task.agentId === "onlyway-assistant"
        ? { ...task, output: oversizedOutput, outputFingerprint: createAgentCompanyOutputFingerprint(oversizedOutput) }
        : task),
    };
    expect(new AgentCompanyWorkdayValidator().validate(oversizedWorkday).ok).toBe(false);
    const cyclicOutput: Record<string, unknown> = {};
    cyclicOutput.self = cyclicOutput;
    const cyclicWorkday = {
      ...durableWorkday,
      tasks: durableWorkday.tasks.map((task) => task.status === "COMPLETED" && task.agentId === "onlyway-assistant"
        ? { ...task, output: cyclicOutput }
        : task),
    };
    expect(new AgentCompanyWorkdayValidator().validate(cyclicWorkday).ok).toBe(false);
    const state = await first.transaction(async ({ businessMissions, contentProductions, operationalPlanes }) => ({ business: await businessMissions.getById("business-day-one"), content: await contentProductions.getById("content-day-one"), packs: await Promise.all(["day-one-pack-a", "day-one-pack-b", "day-one-pack-c"].map((id) => operationalPlanes.getEvidencePackById(id))) }));
    expect(state.business).toMatchObject({ selectedOpportunityId: "opportunity-a", status: "PENDING_FABIO_APPROVAL" });
    expect(state.content).toMatchObject({ evidencePack: { packId: "day-one-pack-a" }, status: "PENDING_FABIO_APPROVAL" });
    if (state.content === undefined) throw new Error("Expected a durable content package");
    expect(workday.tasks.find(({ agentId }) => agentId === "publisher-agent")?.output).toMatchObject({ packageFingerprint: canonicalSha256(state.content.package) });
    expect(state.packs.every((pack) => pack?.status === "READY")).toBe(true);
    await first.close();

    const restarted = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    const restartedBoundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: restarted, workspaceId: "onlyway" });
    const inspected = await restartedBoundary.execute({ actorId: "fabio", commandId: "agent-company-inspect-after-restart", contractVersion: "1", input: { workdayId: "onlyway-workday-001" }, operation: "INSPECT_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    expect(inspected).toMatchObject({ result: { status: "BLOCKED", tasks: { length: 17 } } });
    const replay = await restartedBoundary.execute(command);
    expect(replay).toMatchObject({ replayed: true, result: { status: "BLOCKED" } });
    const metrics = await restartedBoundary.execute({ actorId: "fabio", commandId: "agent-company-metrics-after-restart", contractVersion: "1", input: {}, operation: "GET_AGENT_COMPANY_METRICS", workspaceId: "onlyway" });
    const measured = metrics.result as readonly { readonly blockedTasks: number; readonly completedTasks: number; readonly measuredCostCents: number }[];
    expect(measured).toHaveLength(17);
    expect(measured.filter(({ completedTasks }) => completedTasks === 1)).toHaveLength(16);
    expect(measured.filter(({ blockedTasks }) => blockedTasks === 1)).toHaveLength(1);
    expect(measured.every((entry) => entry.measuredCostCents === 0)).toBe(true);
    const commandCenter = await new CommandCenterQueryService({ clock, repositories: restarted, workspaceId: "onlyway" }).snapshot();
    expect(commandCenter.agentCompany).toHaveLength(1);
    expect(commandCenter.agents).toHaveLength(17);
    expect(commandCenter.agents.filter(({ completedTasks }) => completedTasks === 1)).toHaveLength(16);
    expect(commandCenter.agents.find(({ agentId }) => agentId === "backup-guardian")).toMatchObject({ blockedTasks: 1, state: "DEGRADED" });
    expect(commandCenter.overview).toMatchObject({
      decisionsRequired: 3,
      dailyBrief: { decision: "Una giornata Agent Company è bloccata" },
    });
    await restarted.close();
  }));

  it("blocks reuse of a production ID when the exact content brief no longer matches", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
    const original = workdayInput();
    await boundary.execute({ actorId: "fabio", commandId: "agent-company-original-content", contractVersion: "1", input: { workday: original }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const originalRecord = await repositories.transaction(({ contentProductions }) => contentProductions.getById(original.content.brief.productionId));
    if (originalRecord === undefined) throw new Error("Expected the original durable content package");
    const originalFingerprint = canonicalSha256(originalRecord.package);
    const conflicting: AgentCompanyWorkdayInput = {
      ...original,
      content: { ...original.content, brief: { ...original.content.brief, callToAction: "Prenota una consulenza diversa" } },
      workdayId: "onlyway-workday-002",
    };

    const result = await boundary.execute({ actorId: "fabio", commandId: "agent-company-conflicting-content", contractVersion: "1", input: { workday: conflicting }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    expect(result).toMatchObject({ result: { status: "BLOCKED" } });
    const blocked = result.result as AgentCompanyWorkday;
    const contentTask = blocked.tasks.find(({ agentId }) => agentId === "content-producer");
    expect(contentTask).toMatchObject({
      blocker: { reasonCode: "EXECUTOR_OUTPUT_UNVERIFIED" },
      status: "BLOCKED",
    });
    expect(contentTask?.gates.find(({ gate }) => gate === "QUALITY")).toMatchObject({ findings: ["Existing content package does not match the workday"], status: "BLOCKED" });
    const preserved = await repositories.transaction(({ contentProductions }) => contentProductions.getById(original.content.brief.productionId));
    expect(preserved === undefined ? undefined : canonicalSha256(preserved.package)).toBe(originalFingerprint);
    await repositories.close();
  }));
});

async function seedAuthorizedEvidence(repositories: SqliteRepositoryTransactionRunner, clock: FixedClock): Promise<void> {
  const service = new OperationalPlaneService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" });
  await service.registerSource({ canonicalReference: "https://example.org/authorized-business/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Authorized day-one test source", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "day-one-source", status: "AUTHORIZED" });
  const research = new AuthorizedResearchService({ actorId: "fabio", clock, https: new DayOneHttpsClient(), operationalPlanes: service, repositories, workspaceId: "onlyway" });
  const mission = await research.run({
    claims: (["a", "b", "c"] as const).map((suffix) => ({ claimId: `day-one-claim-${suffix}`, contradictionPhrases: ["segnale smentito"], requiredPhrases: [`segnale verificato per opportunità ${suffix}`], riskDomain: "GENERAL" as const, statement: `Segnale verificato per opportunità ${suffix}.` })),
    maxBytesPerSource: 50_000,
    maxRedirects: 1,
    missionId: "authorized-research-day-one",
    packs: (["a", "b", "c"] as const).map((suffix) => ({ evidenceIds: [`day-one-evidence-${suffix}`], opportunityId: `opportunity-${suffix}`, packId: `day-one-pack-${suffix}` })),
    targets: (["a", "b", "c"] as const).map((suffix) => ({ claimIds: [`day-one-claim-${suffix}`], evidenceId: `day-one-evidence-${suffix}`, limitations: ["Fixture E2E controllata; non è ricerca di mercato reale."], sourceId: "day-one-source", url: `https://example.org/authorized-business/${suffix}` })),
    timeoutMs: 2_000,
  });
  expect(mission.status).toBe("READY");
}

function workdayInput(): AgentCompanyWorkdayInput {
  return {
    businessMission: businessMission(),
    content: { brief: { audience: "Piccoli business italiani", callToAction: "Richiedi il pilota", contractVersion: "1", evidence: [{ evidenceId: "day-one-evidence-a", sourceRef: "day-one-source", statement: "Segnale verificato per opportunità a." }], language: "it", missionReference: "onlyway-mission-001", objective: "lead_generation", offer: "servizio evidence-led", productionId: "content-day-one", topic: "validare un'offerta AI con evidenze" }, evidencePackId: "day-one-pack-a" },
    developer: { acceptanceChecks: ["lint", "typecheck", "tests", "build"], filesInScope: ["src/agent-company"], isolatedBranch: "codex/agent-company-operational-v1", objective: "Preparare il change plan della Agent Company operativa" },
    maxBudgetCents: 300_000,
    missionId: "onlyway-mission-001",
    objective: "Selezionare un'opportunità Onlyway e preparare offerta, contenuti, vendita, delivery e controlli",
    publisher: { platforms: ["instagram", "tiktok"], scheduledFor: "2026-07-20T09:00:00.000Z" },
    researchMissionId: "authorized-research-day-one",
    researchPacks: [{ evidenceIds: ["day-one-evidence-a"], packId: "day-one-pack-a" }, { evidenceIds: ["day-one-evidence-b"], packId: "day-one-pack-b" }, { evidenceIds: ["day-one-evidence-c"], packId: "day-one-pack-c" }],
    workdayId: "onlyway-workday-001",
  };
}

function businessMission(): BusinessMissionExecutionInput {
  return { candidates: [candidate("a", 90), candidate("b", 70), candidate("c", 50)], commercialPlan: { acquisition: { channels: [{ channel: "Outreach manuale", message: "Proposta pilota evidence-led", priority: 1 }], emailSequence: [{ body: "Bozza non inviata per presentare il pilota.", subject: "Pilota Onlyway" }], faq: [{ answer: "Misuriamo segnali prima di investire.", question: "Perché un pilota?" }], landingCopy: { callToAction: "Richiedi il pilota", headline: "Valida prima di scalare", proof: "Evidenze e assunzioni restano separate.", subheadline: "Un esperimento controllato per una decisione verificabile." }, outreachScript: "Bozza locale; nessun contatto eseguito.", socialSupport: ["Contenuto con CTA misurabile, non pubblicato."] }, economics: [scenario("PRUDENT", 3), scenario("BASE", 5), scenario("AMBITIOUS", 8)], offer: { bonuses: ["Report finale"], customerExclusions: ["Richieste di promesse di ricavo"], differentiation: "Evidenze e gate riproducibili", deliverables: ["Audit", "Piano", "Pacchetto"], guarantee: "Consegna dei deliverable dichiarati", idealCustomer: "Piccoli business con offerta da validare", limits: ["Nessuna promessa di ricavo"], mechanism: "Ricerca autorizzata e validazione controllata", objections: [{ objection: "Mancano dati storici", response: "Si parte con un esperimento limitato." }], opportunityId: "opportunity-a", positioning: "Servizio operativo evidence-led", primaryProblem: "Decisioni commerciali non verificate", promisedOutcome: "Decisione commerciale supportata da evidenze", tiers: [{ deliverables: ["Audit", "Piano"], name: "Pilota", priceCents: 250_000 }] }, validation: [{ assetNeeded: "Landing locale", audience: "10 piccoli business", authorizationRequired: true, durationDays: 10, experimentId: "validation-day-one", hypothesis: "Almeno due prospect richiedono una call", maxCostCents: 20_000, method: "MANUAL_OUTREACH", minimumThreshold: "2 risposte qualificate", nextDecision: "Continuare o fermare", primaryMetric: "Risposte qualificate", sampleSize: 10, stopCondition: "0 risposte dopo 10 contatti" }] }, mission: { assets: ["MV-AI-OS", "Metodo Veloce"], availableDays: 60, competencies: ["AI", "contenuti", "workflow"], customerModel: "B2B", forbiddenActions: ["spesa non autorizzata", "email automatica", "pubblicazione"], geography: "Italia", maxCapitalCents: 300_000, minimumThresholds: { maxValidationDays: 30, minGrossMarginBps: 5_000, minOpportunityScore: 65 }, missionId: "business-day-one", objective: "Confrontare tre servizi AI lanciabili entro 60 giorni", revenueModels: ["servizio a progetto"], riskTolerance: "MEDIUM" } };
}

function candidate(suffix: "a" | "b" | "c", score: number): BusinessMissionExecutionInput["candidates"][number] { const criteria: readonly BusinessScoreCriterion[] = ["VERIFIED_DEMAND", "VALIDATION_SPEED", "CAPITAL_EFFICIENCY", "MARGIN_POTENTIAL", "CUSTOMER_ACCESS", "FABIO_ADVANTAGE", "RISK_CONTROL"]; return { assumptions: ["Il CAC è una assunzione."], capitalRequiredCents: 50_000, competition: "Competizione dichiarata", customer: "Piccoli business", demand: "Domanda collegata all'Evidence Pack", entryBarrier: "Capacità operativa", evidencePackId: `day-one-pack-${suffix}`, marginPotentialBps: 7_000, missingInformation: [], operationalComplexity: "LOW", opportunityId: `opportunity-${suffix}`, problem: "Validazione commerciale insufficiente", risk: "LOW", scoreInputs: criteria.map((criterion) => ({ confidence: "HIGH", criterion, dataKind: "REAL", evidenceId: `day-one-evidence-${suffix}`, formula: "Punteggio normalizzato 0-100 dal dato dichiarato", value: score })), title: `Opportunità ${suffix.toUpperCase()}`, validationSpeedDays: 10 }; }
function scenario(name: "AMBITIOUS" | "BASE" | "PRUDENT", volume: number): BusinessMissionExecutionInput["commercialPlan"]["economics"][number] { const values = { acquisitionCostCents: 12_000, conversionRateBps: 1_000, deliveryCostCents: 8_000, fixedCostsCents: 10_000, hourlyCostCents: 3_000, humanHoursPerClient: 4, monthlyVolume: volume, priceCents: 250_000, refundRateBps: 0, toolCostsCents: 5_000 }; return { ...values, name, provenance: Object.keys(values).map((field) => ({ dataKind: "ASSUMPTION" as const, field: field as keyof typeof values, note: "Input dichiarato per il collaudo deterministico." })) }; }
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-agent-company-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
class FixedClock { public constructor(private readonly value: string) {} public now(): Date { return new Date(this.value); } }
class DayOneHttpsClient implements RestrictedHttpsClient {
  public acquire(input: { readonly url: string }): Promise<RestrictedHttpsAcquisition> {
    const suffix = input.url.split("/").at(-1);
    if (suffix !== "a" && suffix !== "b" && suffix !== "c") return Promise.reject(new Error("Unexpected Authorized Research URL"));
    const body = `<html><head><title>Segnale ${suffix}</title><meta name="author" content="Onlyway test publisher"><meta property="article:published_time" content="2026-07-14T00:00:00.000Z"></head><body>Segnale verificato per opportunità ${suffix}. Evidenza strutturata per il collaudo operativo della giornata condivisa.</body></html>`;
    return Promise.resolve(Object.freeze({ body, byteLength: new TextEncoder().encode(body).byteLength, contentType: "text/html", finalUrl: input.url, redirectChain: [] }));
  }
}
