import { describe, expect, it } from "vitest";

import { OPERATIONAL_AGENT_COMPANY_CATALOG, type OperationalAgentId } from "../../src/agent-company/operational-agent-company.js";
import { buildCommandCenterVentureView, EMPTY_COMMAND_CENTER_VENTURE_VIEW } from "../../src/command-center/command-center-venture-view.js";
import type { Clock } from "../../src/ports/clock.js";
import type { FounderPortfolioBrief } from "../../src/venture-holding/venture-domain.js";
import type { VentureHoldingRepository, VentureHoldingTransactionRunner } from "../../src/venture-holding/venture-repository.js";
import { VentureBriefService } from "../../src/venture-holding/venture-brief-service.js";
import { VentureCellService, type VentureCellExecutor, type VentureCellRecord, type VentureCellRepository } from "../../src/venture-holding/venture-cell-service.js";

const clock: Clock = { now: () => new Date("2026-07-23T08:00:00.000Z") };
const fingerprint = "a".repeat(64);

describe("Venture Holding UI and local runtime contracts", () => {
  it("projects an immutable Venture Studio view with founder decisions and external actions locked", () => {
    const view = buildCommandCenterVentureView({
      artifacts: [],
      briefs: [],
      capital: { approvedCents: "NOT_AVAILABLE", proposedCents: "NOT_AVAILABLE" },
      capitalProposals: [],
      coverage: "COMPLETE",
      decisions: [{ decisionId: "decision-1", entityFingerprint: fingerprint, entityId: "venture-1", entityType: "VENTURE", entityVersion: 0, priority: "HIGH", question: "Fabio approva il passaggio alla validazione?", reasonCode: "FOUNDER_APPROVAL_REQUIRED", updatedAt: "2026-07-23T08:00:00.000Z" }],
      experiments: [],
      health: { nextAction: "Attendi la decisione di Fabio.", reasonCode: "FOUNDER_APPROVAL_REQUIRED", status: "FOUNDER_INPUT_REQUIRED" },
      opportunities: [],
      portfolio: { entityId: "portfolio-1", fingerprint, title: "Onlyway Venture Portfolio", updatedAt: "2026-07-23T08:00:00.000Z", version: 0 },
      summaries: { blockedVentures: 0, capacity: "FOUNDER_INPUT_REQUIRED", founderDecisions: 1, portfolioRiskCount: 0, readyExperiments: 0, venturesInProgress: 1 },
      ventures: [{ blockerCodes: [], entityId: "venture-1", fingerprint, stage: "AWAITING_FABIO", title: "Venture controllata", updatedAt: "2026-07-23T08:00:00.000Z", version: 0 }],
    });

    expect(view).toMatchObject({ externalActions: "LOCKED", publication: "LOCKED", summaries: { founderDecisions: 1 } });
    expect(Object.isFrozen(view)).toBe(true);
    expect(EMPTY_COMMAND_CENTER_VENTURE_VIEW).toMatchObject({ capital: { approvedCents: "NOT_AVAILABLE" }, coverage: "NOT_AVAILABLE", externalActions: "LOCKED", publication: "LOCKED" });
    expect(() => buildCommandCenterVentureView({ ...view, decisions: [], summaries: { ...view.summaries, founderDecisions: 1 } })).toThrow("decision count");
  });

  it("reads only canonical durable briefs and never converts missing capital into zero", async () => {
    const older = portfolioBrief({ briefId: "brief-daily-v0", updatedAt: "2026-07-22T08:00:00.000Z", version: 0 });
    const latest = portfolioBrief({ briefId: "brief-daily-v1", updatedAt: "2026-07-23T08:00:00.000Z", version: 1 });
    const weekly = portfolioBrief({ briefId: "brief-weekly-v0", kind: "WEEKLY", updatedAt: "2026-07-21T08:00:00.000Z", version: 0 });
    const repository = new MemoryVentureRunner([older, latest, weekly]);
    const service = new VentureBriefService({
      actorId: "fabio",
      repositories: repository,
      workspaceId: "workspace",
    });

    await expect(service.readLatest("DAILY")).resolves.toEqual(latest);
    await expect(service.readLatest("WEEKLY")).resolves.toEqual(weekly);
    await expect(service.inspect(latest.briefId)).resolves.toEqual(latest);
    expect(repository.appendCalls).toBe(0);
    expect(latest.costStatus).toBe("NOT_AVAILABLE");
  });

  it("recovers an interrupted Venture Cell and runs the existing seventeen executor identities to Fabio review", async () => {
    const repository = new MemoryCellRepository();
    const controller = new AbortController();
    let interruptOnce = true;
    const executors = Object.fromEntries(OPERATIONAL_AGENT_COMPANY_CATALOG.map(({ agentId }) => [agentId, {
      execute: () => {
        if (agentId === "onlyway-assistant" && interruptOnce) {
          interruptOnce = false;
          controller.abort();
        }
        return Promise.resolve({ costCents: 0, externalActionsExecuted: false as const, output: { evidence: `${agentId}:LOCAL` }, providerCalls: 0 as const, status: "COMPLETED" as const, toolCalls: 1 });
      },
    } satisfies VentureCellExecutor])) as Partial<Record<OperationalAgentId, VentureCellExecutor>>;
    const service = new VentureCellService({ actorId: "fabio", clock, executors, repository, workspaceId: "workspace" });
    const input = { cellId: "cell-1", evidenceRefs: ["evidence-1"], externalActions: "LOCKED" as const, maxBudgetCents: 0, objective: "Preparare una proposta di venture verificabile.", thesisFingerprint: fingerprint, thesisId: "thesis-1", thesisVersion: 0, ventureId: "venture-1" };

    await expect(service.run(input, controller.signal)).rejects.toThrow();
    expect(repository.record?.tasks.find(({ agentId }) => agentId === "onlyway-assistant")?.status).toBe("RUNNING");
    const recovered = await service.run(input);
    expect(recovered).toMatchObject({ externalActionsExecuted: false, publication: "LOCKED", status: "AWAITING_FABIO" });
    expect(recovered.tasks).toHaveLength(17);
    expect(new Set(recovered.tasks.map(({ agentId }) => agentId))).toEqual(new Set(OPERATIONAL_AGENT_COMPANY_CATALOG.map(({ agentId }) => agentId)));
    expect(recovered.tasks.every(({ receipt, status }) => status === "COMPLETED" && receipt?.providerCalls === 0)).toBe(true);
    expect(recovered.tasks.find(({ agentId }) => agentId === "onlyway-assistant")?.attempts).toBe(2);
  });

  it("stops the Venture Cell on a precise real blocker without running downstream agents", async () => {
    const repository = new MemoryCellRepository();
    const calls: OperationalAgentId[] = [];
    const executors = Object.fromEntries(OPERATIONAL_AGENT_COMPANY_CATALOG.map(({ agentId }) => [agentId, {
      execute: () => {
        calls.push(agentId);
        if (agentId === "research-agent") return Promise.resolve({ blocker: { evidence: [], missingInput: "Manca un Evidence Pack registrato.", nextAction: "Registra una fonte ammessa e ripeti la valutazione.", owner: "FABIO" as const, reasonCode: "VENTURE_EVIDENCE_COVERAGE_REQUIRED" }, costCents: 0, externalActionsExecuted: false as const, providerCalls: 0 as const, status: "BLOCKED" as const, toolCalls: 0 });
        return Promise.resolve({ costCents: 0, externalActionsExecuted: false as const, output: { evidence: `${agentId}:LOCAL` }, providerCalls: 0 as const, status: "COMPLETED" as const, toolCalls: 1 });
      },
    } satisfies VentureCellExecutor])) as Partial<Record<OperationalAgentId, VentureCellExecutor>>;
    const service = new VentureCellService({ actorId: "fabio", clock, executors, repository, workspaceId: "workspace" });
    const blocked = await service.run({ cellId: "cell-blocked", evidenceRefs: [], externalActions: "LOCKED", maxBudgetCents: 0, objective: "Valutare senza inventare evidenze.", thesisFingerprint: fingerprint, thesisId: "thesis-2", thesisVersion: 0, ventureId: "venture-2" });

    expect(blocked).toMatchObject({ publication: "LOCKED", status: "BLOCKED" });
    expect(blocked.tasks.find(({ agentId }) => agentId === "research-agent")).toMatchObject({ blocker: { reasonCode: "VENTURE_EVIDENCE_COVERAGE_REQUIRED" }, receipt: { costCents: 0, externalActionsExecuted: false, providerCalls: 0 }, status: "BLOCKED" });
    expect(calls).toEqual(["onlyway-assistant", "research-agent"]);
  });
});

function portfolioBrief(overrides: Partial<FounderPortfolioBrief> = {}): FounderPortfolioBrief { return { actorId: "fabio", blockerCodes: [], briefId: "brief-daily-v0", contractVersion: "1", costStatus: "NOT_AVAILABLE", createdAt: "2026-07-22T08:00:00.000Z", experimentIds: [], externalEffects: "ZERO", fingerprint, founderDecisionIds: [], kind: "DAILY", nextActions: [], opportunityIds: [], portfolioId: "portfolio-1", riskCount: 0, updatedAt: "2026-07-22T08:00:00.000Z", ventureReportIds: [], version: 0, workspaceId: "workspace", ...overrides }; }

class MemoryVentureRunner implements VentureHoldingTransactionRunner {
  public appendCalls = 0;
  public constructor(private readonly briefs: readonly FounderPortfolioBrief[]) {}
  public transaction<T>(operation: (repository: VentureHoldingRepository) => Promise<T>): Promise<T> {
    const repository = {
      appendRecord: () => { this.appendCalls += 1; return Promise.resolve(); },
      getRecord: (query: { readonly entityId: string }) => Promise.resolve(this.briefs.find(({ briefId }) => briefId === query.entityId)),
      listRecords: () => Promise.resolve(this.briefs),
    } as unknown as VentureHoldingRepository;
    return operation(repository);
  }
  public close(): Promise<void> { return Promise.resolve(); }
}

class MemoryCellRepository implements VentureCellRepository {
  public record: VentureCellRecord | undefined;
  public getByOwner(input: Readonly<{ readonly actorId: string; readonly cellId: string; readonly workspaceId: string }>): Promise<VentureCellRecord | undefined> { return Promise.resolve(this.record?.actorId === input.actorId && this.record.cellId === input.cellId && this.record.workspaceId === input.workspaceId ? this.record : undefined); }
  public insert(record: VentureCellRecord): Promise<void> { if (this.record !== undefined) throw new Error("duplicate"); this.record = record; return Promise.resolve(); }
  public update(record: VentureCellRecord, expected: Readonly<{ readonly version: number }>): Promise<void> { if (this.record?.version !== expected.version) throw new Error("conflict"); this.record = record; return Promise.resolve(); }
}
