import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  OPERATIONAL_AGENT_COMPANY_CATALOG,
  type AgentCompanyWorkday,
  type AgentCompanyWorkdayInput,
} from "../../src/agent-company/operational-agent-company.js";
import {
  createAgentCompanyInputFingerprint,
  createAgentCompanyOutputFingerprint,
} from "../../src/agent-company/operational-agent-company-validator.js";
import type { BusinessMissionExecutionInput, BusinessScoreCriterion } from "../../src/business/business-mission.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import {
  PrivateProductionIntakeValidator,
  PrivateProductionStartService,
  type PrivateProductionIntake,
} from "../../src/production/private-production-start.js";
import type { AuthorizedResearchMission } from "../../src/research/authorized-research.js";
import { researchInputFingerprint } from "../../src/research/authorized-research-validator.js";
import type {
  LocalWorkflowCommand,
  LocalWorkflowCommandResponse,
} from "../../src/runtime/local-workflow-command.js";

const NOW = "2026-08-02T10:00:00.000Z";

describe("private production start", () => {
  it("locks publication and produces the evidence-backed internal Agent Company workday", async () => withDatabase(async (repositories) => {
    const intake = validIntake();
    const operations: string[] = [];
    const commands = {
      async execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
        operations.push(command.operation);
        if (command.operation === "SET_PUBLICATION_KILL_SWITCH") {
          await persistPublicationLock(repositories);
          return response(command, { enabled: true });
        }
        if (command.operation === "REGISTER_EVIDENCE_SOURCE") {
          return Promise.resolve(response(command, { sourceId: "source-official" }));
        }
        if (command.operation === "RUN_AUTHORIZED_RESEARCH_MISSION") {
          return Promise.resolve(response(command, readyResearch(intake)));
        }
        if (command.operation === "RUN_AGENT_COMPANY_WORKDAY") {
          return Promise.resolve(response(command, completedWorkday(intake.workday)));
        }
        return Promise.reject(new Error("Unexpected operation"));
      },
    };
    const result = await new PrivateProductionStartService({
      actorId: "fabio",
      commands,
      repositories,
      workspaceId: "onlyway",
    }).run(intake);

    expect(result).toMatchObject({
      completedTaskCount: 17,
      evidenceCount: 3,
      externalActionsExecuted: false,
      packCount: 3,
      providerCallsExecuted: 0,
      publicationLocked: true,
      spendCents: 0,
      status: "READY",
      workdayStatus: "AWAITING_FABIO",
    });
    expect(operations).toEqual([
      "SET_PUBLICATION_KILL_SWITCH",
      "REGISTER_EVIDENCE_SOURCE",
      "RUN_AUTHORIZED_RESEARCH_MISSION",
      "RUN_AGENT_COMPANY_WORKDAY",
    ]);
  }));

  it("stops before downstream production when attributable research is blocked", async () => withDatabase(async (repositories) => {
    const intake = validIntake();
    const operations: string[] = [];
    const commands = {
      async execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
        operations.push(command.operation);
        if (command.operation === "SET_PUBLICATION_KILL_SWITCH") { await persistPublicationLock(repositories); return response(command, { enabled: true }); }
        if (command.operation === "REGISTER_EVIDENCE_SOURCE") return Promise.resolve(response(command, { sourceId: "source-official" }));
        if (command.operation === "RUN_AUTHORIZED_RESEARCH_MISSION") return Promise.resolve(response(command, blockedResearch(intake)));
        return Promise.reject(new Error("Downstream production must not run"));
      },
    };
    const result = await new PrivateProductionStartService({ actorId: "fabio", commands, repositories, workspaceId: "onlyway" }).run(intake);
    expect(result).toMatchObject({ status: "NOT_READY", workdayStatus: "NOT_STARTED" });
    expect(operations).not.toContain("RUN_AGENT_COMPANY_WORKDAY");
  }));

  it("rejects budget, source-boundary and Evidence Pack drift before changing state", () => {
    const validator = new PrivateProductionIntakeValidator();
    const original = validIntake();
    const budget = { ...original, workday: { ...original.workday, maxBudgetCents: 1 } };
    expect(() => validator.validate(budget)).toThrow(/zero-budget/iu);

    const sourceDrift = { ...original, researchMission: { ...original.researchMission, targets: original.researchMission.targets.map((target, index) => index === 0 ? { ...target, url: "https://attacker.example/research/a" } : target) } };
    expect(() => validator.validate(sourceDrift)).toThrow(/source policy/iu);

    const packDrift = { ...original, workday: { ...original.workday, researchPacks: [{ evidenceIds: ["evidence-b"], packId: "pack-a" }, original.workday.researchPacks[1], original.workday.researchPacks[2]] } };
    expect(() => validator.validate(packDrift)).toThrow(/three acquired Evidence Packs/iu);
  });

  it("keeps the operator intake example synchronized with the strict contract", async () => {
    const example = JSON.parse(await readFile("ops/production/private-production-intake.example.json", "utf8")) as unknown;
    expect(new PrivateProductionIntakeValidator().validate(example)).toMatchObject({ contractVersion: "1", safety: { maxProviderCalls: 0, maxSpendCents: 0, publicationEnabled: false } });
  });

  it("reuses an identical durable source policy across versioned production days", async () => withDatabase(async (repositories) => {
    const intake = validIntake();
    const planes = new OperationalPlaneService({ actorId: "fabio", clock: { now: () => new Date(NOW) }, repositories, workspaceId: "onlyway" });
    const source = intake.sources[0];
    if (source === undefined) throw new Error("Test source is missing");
    await planes.registerSource(source);
    await planes.setPublicationKillSwitch({ enabled: true, expectedVersion: 0 });
    const operations: string[] = [];
    const commands = {
      execute(command: LocalWorkflowCommand): Promise<LocalWorkflowCommandResponse> {
        operations.push(command.operation);
        if (command.operation === "RUN_AUTHORIZED_RESEARCH_MISSION") return Promise.resolve(response(command, readyResearch(intake)));
        if (command.operation === "RUN_AGENT_COMPANY_WORKDAY") return Promise.resolve(response(command, completedWorkday(intake.workday)));
        return Promise.reject(new Error("Existing safety state must be reused"));
      },
    };
    await expect(new PrivateProductionStartService({ actorId: "fabio", commands, repositories, workspaceId: "onlyway" }).run(intake)).resolves.toMatchObject({ status: "READY" });
    expect(operations).toEqual(["RUN_AUTHORIZED_RESEARCH_MISSION", "RUN_AGENT_COMPANY_WORKDAY"]);
  }));
});

function validIntake(): PrivateProductionIntake {
  const researchMission: PrivateProductionIntake["researchMission"] = {
    claims: (["a", "b", "c"] as const).map((suffix) => ({
      claimId: `claim-${suffix}`,
      contradictionPhrases: ["segnale smentito"],
      requiredPhrases: [`segnale verificato ${suffix}`],
      riskDomain: "GENERAL",
      statement: `Segnale verificato per opportunità ${suffix}.`,
    })),
    maxBytesPerSource: 50_000,
    maxRedirects: 1,
    missionId: "research-production-001",
    packs: (["a", "b", "c"] as const).map((suffix) => ({ evidenceIds: [`evidence-${suffix}`], opportunityId: `opportunity-${suffix}`, packId: `pack-${suffix}` })),
    targets: (["a", "b", "c"] as const).map((suffix) => ({ claimIds: [`claim-${suffix}`], evidenceId: `evidence-${suffix}`, limitations: ["Verificare nuovamente alla scadenza della fonte."], sourceId: "source-official", url: `https://example.org/research/${suffix}` })),
    timeoutMs: 5_000,
  };
  const businessMission = businessMissionInput();
  const workday: AgentCompanyWorkdayInput = {
    businessMission,
    content: { brief: { audience: "Piccoli business italiani", callToAction: "Richiedi una valutazione privata", contractVersion: "1", evidence: [{ evidenceId: "evidence-a", sourceRef: "source-official", statement: "Segnale verificato per opportunità a." }], language: "it", missionReference: "onlyway-production-001", objective: "lead_generation", offer: "pilota operativo evidence-led", productionId: "content-production-001", topic: "validare una opportunità AI con evidenze verificabili" }, evidencePackId: "pack-a" },
    developer: { acceptanceChecks: ["lint", "typecheck", "test", "build"], filesInScope: ["src"], isolatedBranch: "feature/telegram-operator-console", objective: "Preparare solo il piano tecnico interno senza merge o deploy" },
    maxBudgetCents: 0,
    missionId: "onlyway-production-001",
    objective: "Produrre internamente offerta, contenuti, vendita, delivery e controlli basati su evidenze",
    publisher: { platforms: ["instagram", "tiktok"], scheduledFor: "2026-08-10T09:00:00.000Z" },
    researchMissionId: researchMission.missionId,
    researchPacks: [{ evidenceIds: ["evidence-a"], packId: "pack-a" }, { evidenceIds: ["evidence-b"], packId: "pack-b" }, { evidenceIds: ["evidence-c"], packId: "pack-c" }],
    workdayId: "workday-production-001",
  };
  return {
    contractVersion: "1",
    intakeId: "private-production-001",
    researchMission,
    safety: { externalActionsAllowed: false, maxProviderCalls: 0, maxSpendCents: 0, publicationEnabled: false },
    sources: [{ canonicalReference: "https://example.org/research/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Fonte ufficiale autorizzata", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "source-official", status: "AUTHORIZED" }],
    workday,
  };
}

function businessMissionInput(): BusinessMissionExecutionInput {
  return {
    candidates: [candidate("a", 90), candidate("b", 70), candidate("c", 50)],
    commercialPlan: {
      acquisition: {
        channels: [{ channel: "Outreach manuale", message: "Bozza privata, nessun invio automatico.", priority: 1 }],
        emailSequence: [{ body: "Bozza non inviata per presentare il pilota.", subject: "Pilota Onlyway" }],
        faq: [{ answer: "Misuriamo segnali prima di investire.", question: "Perché un pilota?" }],
        landingCopy: { callToAction: "Richiedi il pilota", headline: "Valida prima di scalare", proof: "Evidenze e assunzioni restano separate.", subheadline: "Un esperimento controllato per una decisione verificabile." },
        outreachScript: "Bozza locale; nessun contatto eseguito.",
        socialSupport: ["Contenuto interno con CTA misurabile, non pubblicato."],
      },
      economics: [scenario("PRUDENT", 3), scenario("BASE", 5), scenario("AMBITIOUS", 8)],
      offer: { bonuses: ["Report finale"], customerExclusions: ["Richieste di promesse di ricavo"], differentiation: "Evidenze e gate riproducibili", deliverables: ["Audit", "Piano", "Pacchetto"], guarantee: "Consegna dei deliverable dichiarati", idealCustomer: "Piccoli business con offerta da validare", limits: ["Nessuna promessa di ricavo"], mechanism: "Ricerca autorizzata e validazione controllata", objections: [{ objection: "Mancano dati storici", response: "Si parte con un esperimento limitato." }], opportunityId: "opportunity-a", positioning: "Servizio operativo evidence-led", primaryProblem: "Decisioni commerciali non verificate", promisedOutcome: "Decisione commerciale supportata da evidenze", tiers: [{ deliverables: ["Audit", "Piano"], name: "Pilota", priceCents: 250_000 }] },
      validation: [{ assetNeeded: "Landing locale", audience: "10 piccoli business", authorizationRequired: true, durationDays: 10, experimentId: "validation-production-001", hypothesis: "Almeno due prospect richiedono una call", maxCostCents: 0, method: "MANUAL_OUTREACH", minimumThreshold: "2 risposte qualificate", nextDecision: "Continuare o fermare", primaryMetric: "Risposte qualificate", sampleSize: 10, stopCondition: "0 risposte dopo 10 contatti" }],
    },
    mission: { assets: ["MV-AI-OS", "Metodo Veloce"], availableDays: 60, competencies: ["AI", "contenuti", "workflow"], customerModel: "B2B", forbiddenActions: ["spesa", "email automatica", "pubblicazione"], geography: "Italia", maxCapitalCents: 0, minimumThresholds: { maxValidationDays: 30, minGrossMarginBps: 5_000, minOpportunityScore: 65 }, missionId: "business-production-001", objective: "Confrontare tre servizi AI lanciabili entro 60 giorni", revenueModels: ["servizio a progetto"], riskTolerance: "MEDIUM" },
  };
}

function candidate(suffix: "a" | "b" | "c", score: number): BusinessMissionExecutionInput["candidates"][number] {
  const criteria: readonly BusinessScoreCriterion[] = ["VERIFIED_DEMAND", "VALIDATION_SPEED", "CAPITAL_EFFICIENCY", "MARGIN_POTENTIAL", "CUSTOMER_ACCESS", "FABIO_ADVANTAGE", "RISK_CONTROL"];
  return { assumptions: ["Il CAC è una assunzione."], capitalRequiredCents: 50_000, competition: "Competizione dichiarata", customer: "Piccoli business", demand: "Domanda collegata all'Evidence Pack", entryBarrier: "Capacità operativa", evidencePackId: `pack-${suffix}`, marginPotentialBps: 7_000, missingInformation: [], operationalComplexity: "LOW", opportunityId: `opportunity-${suffix}`, problem: "Validazione commerciale insufficiente", risk: "LOW", scoreInputs: criteria.map((criterion) => ({ confidence: "HIGH", criterion, dataKind: "REAL", evidenceId: `evidence-${suffix}`, formula: "Punteggio normalizzato 0-100 dal dato dichiarato", value: score })), title: `Opportunità ${suffix.toUpperCase()}`, validationSpeedDays: 10 };
}

function scenario(name: "AMBITIOUS" | "BASE" | "PRUDENT", volume: number): BusinessMissionExecutionInput["commercialPlan"]["economics"][number] {
  const values = { acquisitionCostCents: 12_000, conversionRateBps: 1_000, deliveryCostCents: 8_000, fixedCostsCents: 10_000, hourlyCostCents: 3_000, humanHoursPerClient: 4, monthlyVolume: volume, priceCents: 250_000, refundRateBps: 0, toolCostsCents: 5_000 };
  return { ...values, name, provenance: Object.keys(values).map((field) => ({ dataKind: "ASSUMPTION" as const, field: field as keyof typeof values, note: "Assunzione dichiarata, non autorizzazione di spesa." })) };
}

function readyResearch(intake: PrivateProductionIntake): AuthorizedResearchMission {
  return research(intake, "READY");
}

function blockedResearch(intake: PrivateProductionIntake): AuthorizedResearchMission {
  return research(intake, "BLOCKED");
}

function research(intake: PrivateProductionIntake, status: "BLOCKED" | "READY"): AuthorizedResearchMission {
  const ready = status === "READY";
  return {
    actorId: "fabio",
    blockers: ready ? [] : ["Claim claim-a: INSUFFICIENT; fonti indipendenti 0/1."],
    claimResults: ready ? intake.researchMission.targets.map((target) => {
      const claim = intake.researchMission.claims.find(({ claimId }) => target.claimIds.includes(claimId));
      if (claim === undefined) throw new Error("Test fixture claim is missing");
      return { claimId: claim.claimId, evidenceIds: [target.evidenceId], independentSourceCount: 1, requiredSourceCount: 1, statement: claim.statement, status: "VERIFIED" };
    }) : [],
    contractVersion: "1",
    createdAt: NOW,
    evidenceIds: ready ? intake.researchMission.targets.map(({ evidenceId }) => evidenceId) : [],
    input: intake.researchMission,
    inputFingerprint: researchInputFingerprint(intake.researchMission),
    packIds: ready ? intake.researchMission.packs.map(({ packId }) => packId) : [],
    snapshotIds: ready ? intake.researchMission.targets.map(({ evidenceId }) => `snapshot-${evidenceId}`) : [],
    status,
    updatedAt: NOW,
    version: 1,
    workspaceId: "onlyway",
  };
}

function completedWorkday(input: AgentCompanyWorkdayInput): AgentCompanyWorkday {
  const output = Object.freeze({ result: "durable-internal-output" });
  return {
    actorId: "fabio",
    contractVersion: "1",
    createdAt: NOW,
    externalActionsExecuted: false,
    input,
    inputFingerprint: createAgentCompanyInputFingerprint(input),
    status: "AWAITING_FABIO",
    tasks: OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry, index) => ({ agentId: entry.agentId, attempts: 1, completedAt: NOW, costCents: 0, dependencies: [], durationMs: index, executorId: entry.executorId, gates: [{ findings: [], gate: "COST" as const, score: 100, status: "PASSED" as const }, { findings: [], gate: "QUALITY" as const, score: 100, status: "PASSED" as const }, { findings: [], gate: "RISK" as const, score: 100, status: "PASSED" as const }], output, outputFingerprint: createAgentCompanyOutputFingerprint(output), startedAt: NOW, status: "COMPLETED" as const, taskType: entry.supportedTasks[0] ?? "unsupported", workItemId: `${input.workdayId}-${entry.agentId}` })),
    updatedAt: NOW,
    version: 36,
    workdayId: input.workdayId,
    workspaceId: "onlyway",
  };
}

function response(command: LocalWorkflowCommand, result: unknown): LocalWorkflowCommandResponse {
  return { commandId: command.commandId, contractVersion: "1", nextAction: "continue", operation: command.operation, replayed: false, result, status: "ok", unauthorizedExternalEffectOccurred: false };
}

async function persistPublicationLock(repositories: SqliteRepositoryTransactionRunner): Promise<void> {
  await repositories.transaction(({ operationalPlanes }) => operationalPlanes.upsertPublicationKillSwitch({ enabled: true, updatedAt: NOW, updatedBy: "fabio", version: 1, workspaceId: "onlyway" }, { version: 0 }));
}

async function withDatabase(test: (repositories: SqliteRepositoryTransactionRunner) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-private-production-start-"));
  const repositories = new SqliteRepositoryTransactionRunner({ path: join(directory, "runtime.sqlite"), timeoutMs: 1_000 });
  try { await test(repositories); }
  finally { await repositories.close(); await rm(directory, { force: true, recursive: true }); }
}
