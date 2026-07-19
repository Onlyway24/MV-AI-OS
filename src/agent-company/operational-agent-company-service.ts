import { createHash } from "node:crypto";

import type { BusinessMissionDossier } from "../business/business-mission.js";
import { BusinessMissionService } from "../business/business-mission-service.js";
import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { JsonObject, JsonValue } from "../contracts/json.js";
import { DeterministicMetodoVeloceContentProductionLine } from "../content-production/deterministic-metodo-veloce-content-production-line.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import { OperationalPlaneService } from "../operational-planes/operational-plane-service.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import {
  OPERATIONAL_AGENT_COMPANY_CATALOG,
  type AgentCompanyWorkItem,
  type AgentCompanyWorkItemBlocker,
  type AgentCompanyWorkday,
  type AgentCompanyWorkdayInput,
  type OperationalAgentGate,
  type OperationalAgentId,
  type OperationalAgentMetrics,
} from "./operational-agent-company.js";
import {
  AgentCompanyWorkdayInputValidator,
  createAgentCompanyInputFingerprint,
  createAgentCompanyOutputFingerprint,
} from "./operational-agent-company-validator.js";
import {
  OPERATIONAL_EVENT_SEMANTICS,
  type OperationalEventType,
} from "../operations-runtime/operational-event.js";

const DEPENDENCIES: Readonly<Record<OperationalAgentId, readonly OperationalAgentId[]>> = Object.freeze({
  "onlyway-assistant": [],
  "research-agent": ["onlyway-assistant"],
  "business-agent": ["research-agent"],
  "content-director": ["business-agent"],
  "content-producer": ["content-director"],
  "sales-agent": ["business-agent"],
  "customer-delivery-agent": ["business-agent"],
  "knowledge-curator": ["research-agent", "business-agent", "content-producer"],
  "developer-agent": ["onlyway-assistant"],
  "finance-cost-analyst": ["business-agent"],
  "legal-risk-reviewer": ["business-agent", "content-producer"],
  "quality-guardian": ["business-agent", "content-producer", "sales-agent", "customer-delivery-agent"],
  "risk-guardian": ["legal-risk-reviewer"],
  "cost-guardian": ["finance-cost-analyst"],
  "security-guardian": ["developer-agent", "publisher-agent"],
  "backup-guardian": ["knowledge-curator"],
  "publisher-agent": ["content-producer", "legal-risk-reviewer"],
});

export class OperationalAgentCompanyService {
  readonly #inputValidator = new AgentCompanyWorkdayInputValidator();
  readonly #contentLine: DeterministicMetodoVeloceContentProductionLine;

  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly businessMissions: BusinessMissionService;
    readonly clock: Clock;
    readonly operationalPlanes: OperationalPlaneService;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) { this.#contentLine = new DeterministicMetodoVeloceContentProductionLine(dependencies.clock); }

  public async run(input: unknown): Promise<AgentCompanyWorkday> {
    const checked = validateInput(input, this.#inputValidator);
    const inputFingerprint = createAgentCompanyInputFingerprint(checked);
    let record = await this.dependencies.repositories.transaction(({ agentCompanyWorkdays }) => agentCompanyWorkdays.getById(checked.workdayId));
    if (record === undefined) {
      const initial = this.#initial(checked, inputFingerprint);
      await this.dependencies.repositories.transaction(async ({ agentCompanyWorkdays, operationalEvents }) => {
        await agentCompanyWorkdays.insert(initial);
        await operationalEvents.append(event("AGENT_COMPANY_TASK_CHANGED", initial.workdayId, initial.version, initial.workspaceId, initial.createdAt));
      });
      record = initial;
    } else if (record.workspaceId !== this.dependencies.workspaceId || record.actorId !== this.dependencies.actorId || record.inputFingerprint !== inputFingerprint) throw new RepositoryConflictError("Agent Company workday identity conflicts with durable state");
    if (record.status === "AWAITING_FABIO" || record.status === "BLOCKED") return record;

    for (const catalogEntry of OPERATIONAL_AGENT_COMPANY_CATALOG) {
      const currentRecord: AgentCompanyWorkday = record;
      const task: AgentCompanyWorkItem | undefined = currentRecord.tasks.find(({ agentId }) => agentId === catalogEntry.agentId);
      if (task === undefined) throw new RepositoryValidationError("Agent Company workday task is missing");
      if (task.status === "COMPLETED") continue;
      if (!task.dependencies.every((dependencyId: OperationalAgentId) => currentRecord.tasks.find((candidate) => candidate.agentId === dependencyId)?.status === "COMPLETED")) {
        record = await this.#block(currentRecord, task.agentId, dependencyBlocker(task, currentRecord));
        return record;
      }
      record = await this.#markRunning(currentRecord, task.agentId);
      const started = this.dependencies.clock.now().getTime();
      try {
        const output = await this.#execute(task.agentId, checked, record);
        const gates = this.#gates(task.agentId, output, checked);
        const blocker = gates.find(({ status }) => status === "BLOCKED");
        const durationMs = elapsed(started, this.dependencies.clock.now().getTime());
        record = blocker === undefined
          ? await this.#complete(record, task.agentId, output, gates, durationMs)
          : await this.#block(record, task.agentId, gateBlocker(task.agentId, blocker), gates, durationMs);
        if (record.status === "BLOCKED") return record;
      } catch (error) {
        record = await this.#block(record, task.agentId, executorBlocker(task.agentId, error), blockedGates(error), elapsed(started, this.dependencies.clock.now().getTime()));
        return record;
      }
    }
    return this.#awaitFabio(record);
  }

  public inspect(workdayId: string): Promise<AgentCompanyWorkday> { return this.dependencies.repositories.transaction(async ({ agentCompanyWorkdays }) => this.#owned(await agentCompanyWorkdays.getById(workdayId))); }
  public list(limit: number): Promise<readonly AgentCompanyWorkday[]> { if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new RepositoryValidationError("Agent Company workday list limit is invalid"); return this.dependencies.repositories.transaction(({ agentCompanyWorkdays }) => agentCompanyWorkdays.listByWorkspaceId(this.dependencies.workspaceId, limit)); }

  public async metrics(): Promise<readonly OperationalAgentMetrics[]> {
    const workdays = await this.list(25);
    return Object.freeze(OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry) => {
      const tasks = workdays.flatMap(({ tasks: items }) => items.filter(({ agentId }) => agentId === entry.agentId));
      const qualityScores = tasks.flatMap(({ gates }) => gates.filter(({ gate }) => gate === "QUALITY").map(({ score }) => score));
      const completedTasks = tasks.filter(({ status }) => status === "COMPLETED").length;
      return Object.freeze({ agentId: entry.agentId, acceptedFirstPassTasks: tasks.filter(({ attempts, gates, status }) => status === "COMPLETED" && attempts === 1 && gates.every(({ status: gateStatus }) => gateStatus === "PASSED")).length, averageQualityScore: qualityScores.length === 0 ? "NOT_AVAILABLE" as const : Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length), blockedTasks: tasks.filter(({ status }) => status === "BLOCKED").length, completedTasks, measuredCostCents: tasks.reduce((sum, task) => sum + task.costCents, 0), measuredDurationMs: tasks.reduce((sum, task) => sum + task.durationMs, 0), revisionsRequired: tasks.reduce((sum, { attempts }) => sum + Math.max(0, attempts - 1), 0), state: tasks.some(({ status }) => status === "RUNNING") ? "ACTIVE" as const : tasks.some(({ status }) => status === "BLOCKED") ? "DEGRADED" as const : entry.state, validationErrors: tasks.filter(({ status }) => status === "BLOCKED").length });
    }));
  }

  #initial(input: AgentCompanyWorkdayInput, inputFingerprint: string): AgentCompanyWorkday {
    const createdAt = this.dependencies.clock.now().toISOString();
    return freeze({ actorId: this.dependencies.actorId, contractVersion: "1", createdAt, externalActionsExecuted: false, input, inputFingerprint, status: "RUNNING", tasks: OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry) => ({ agentId: entry.agentId, attempts: 0, costCents: 0, dependencies: DEPENDENCIES[entry.agentId], durationMs: 0, executorId: entry.executorId, gates: [], status: "QUEUED", taskType: entry.supportedTasks[0] ?? "unsupported", workItemId: `${input.workdayId}-${entry.agentId}` })), updatedAt: createdAt, version: 0, workdayId: input.workdayId, workspaceId: this.dependencies.workspaceId });
  }

  async #execute(agentId: OperationalAgentId, input: AgentCompanyWorkdayInput, record: AgentCompanyWorkday): Promise<JsonObject> {
    switch (agentId) {
      case "onlyway-assistant": return json({ approvalRequired: true, assignments: OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry) => ({ agentId: entry.agentId, taskType: entry.supportedTasks[0] })), missionId: input.missionId, objective: input.objective, workflow: "agent-company-workday-v1" });
      case "research-agent": return this.#research(input);
      case "business-agent": return this.#business(input);
      case "content-director": return this.#contentDirection(input);
      case "content-producer": return this.#contentProduction(input);
      case "sales-agent": { const dossier = await this.#dossier(input); return json({ contactExecuted: false, emailSequence: dossier.commercialPlan.acquisition.emailSequence, faq: dossier.commercialPlan.acquisition.faq, icp: dossier.commercialPlan.offer.idealCustomer, outreachScript: dossier.commercialPlan.acquisition.outreachScript }); }
      case "customer-delivery-agent": { const offer = (await this.#dossier(input)).commercialPlan.offer; return json({ checklist: offer.deliverables.map((deliverable, index) => ({ complete: false, deliverable, order: index + 1 })), customerExclusions: offer.customerExclusions, deliveryExecuted: false, limits: offer.limits, milestones: offer.deliverables }); }
      case "knowledge-curator": { const dossier = await this.#dossier(input); const content = await this.#contentRecord(input); return json({ contradictionsDetected: [], freshnessReviewRequiredAt: minFreshness(await this.#packs(input)), index: { businessDossier: { fingerprint: dossier.fingerprint, missionId: dossier.mission.missionId }, contentPackage: { productionId: content.productionId, version: content.version }, evidencePacks: dossier.evidencePackIds }, knowledgeBaseWrite: "WORKDAY_DURABLE_INDEX" }); }
      case "developer-agent": return json({ acceptanceChecks: input.developer.acceptanceChecks, branch: input.developer.isolatedBranch, filesInScope: input.developer.filesInScope, implementationExecuted: false, mergeExecuted: false, objective: input.developer.objective, scope: "CHANGE_PLAN_ONLY", verificationRequired: ["lint", "typecheck", "tests", "build"] });
      case "finance-cost-analyst": { const dossier = await this.#dossier(input); return json({ budgetCents: input.maxBudgetCents, economics: dossier.economics.map((scenario) => ({ contributionMarginCents: scenario.contributionMarginCents, grossMarginCents: scenario.grossMarginCents, name: scenario.name, revenueCents: scenario.revenueCents })), gate: dossier.gates.find(({ name }) => name === "COST") ?? null, spendingExecuted: false }); }
      case "legal-risk-reviewer": { const dossier = await this.#dossier(input); return json({ assumptions: dossier.candidates.flatMap(({ assumptions }) => assumptions), certainty: "NOT_LEGAL_ADVICE", claims: input.content.brief.evidence.map((evidence) => ({ evidenceId: evidence.evidenceId, statement: evidence.statement, type: "EVIDENCE_BACKED" })), limits: dossier.commercialPlan.offer.limits, reviewRequired: dossier.gates.find(({ name }) => name === "RISK")?.findings ?? [] }); }
      case "quality-guardian": { const completed = record.tasks.filter((task) => task.status === "COMPLETED"); return json({ checkedOutputFingerprints: completed.flatMap(({ outputFingerprint }) => outputFingerprint === undefined ? [] : [outputFingerprint]), completedTaskCount: completed.length, failedGateCount: completed.flatMap(({ gates }) => gates).filter(({ status }) => status === "BLOCKED").length, verification: "DURABLE_OUTPUT_FINGERPRINTS_AND_GATES", verdict: "PASS" }); }
      case "risk-guardian": { const completed = record.tasks.filter((task) => task.status === "COMPLETED"); return json({ checkedTaskCount: completed.length, externalEffectDeclarationsFound: completed.filter(({ output }) => output !== undefined && containsExternalEffect(output)).map(({ agentId: value }) => value), legalAdviceClaimed: false, verification: "STRUCTURED_OUTPUT_RISK_SCAN", verdict: "PASS" }); }
      case "cost-guardian": return json({ attestation: "NO_SPEND_AND_BUDGET_WITHIN_POLICY", measuredCostCents: measuredCost(record), policyBudgetCents: input.maxBudgetCents, spendingExecuted: false });
      case "security-guardian": { const completed = record.tasks.filter((task) => task.status === "COMPLETED"); return json({ checkedOutputFingerprints: completed.flatMap(({ outputFingerprint }) => outputFingerprint === undefined ? [] : [outputFingerprint]), checkedTaskCount: completed.length, externalEffectDeclarationsFound: completed.filter(({ output }) => output !== undefined && containsExternalEffect(output)).map(({ agentId: value }) => value), verification: "DURABLE_OUTPUT_EXTERNAL_EFFECT_SCAN", verdict: "PASS" }); }
      case "backup-guardian": throw new RepositoryConflictError("BACKUP_RESTORE_RECEIPT_REQUIRED");
      case "publisher-agent": { const content = await this.#contentRecord(input); const packageFingerprint = canonicalSha256(content.package); return json({ account: "NOT_SELECTED", dryRun: true, externalActionsExecuted: false, idempotencyKey: fingerprint({ packageFingerprint, platforms: input.publisher.platforms, scheduledFor: input.publisher.scheduledFor }), packageFingerprint, platforms: input.publisher.platforms, productionId: content.productionId, scheduledFor: input.publisher.scheduledFor, version: content.version }); }
    }
  }

  async #research(input: AgentCompanyWorkdayInput): Promise<JsonObject> {
    if (input.researchMissionId !== undefined) {
      const researchMissionId = input.researchMissionId;
      const mission = await this.dependencies.repositories.transaction(({ authorizedResearch }) => authorizedResearch.getMissionById(researchMissionId));
      if (mission?.workspaceId !== this.dependencies.workspaceId || mission.actorId !== this.dependencies.actorId || mission.status !== "READY") throw new RepositoryConflictError("Authorized Research Mission is not ready for the Agent Company workday");
      const requestedPackIds = input.researchPacks.map(({ packId }) => packId);
      if (!sameIds(mission.packIds, requestedPackIds)) throw new RepositoryConflictError("Authorized Research Mission Evidence Packs do not match the workday");
      const packs = await this.#packs(input);
      return json({ acquisitionMode: "RESTRICTED_AUTHORIZED_HTTPS", claimResults: mission.claimResults, evidencePacks: packs.map((pack) => ({ evidenceCount: pack.evidenceIds.length, fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, status: pack.status })), missionFingerprint: mission.inputFingerprint, researchMissionId: mission.input.missionId, unrestrictedWebAccess: false });
    }
    const packs = [];
    for (const request of input.researchPacks) {
      const existing = await this.dependencies.repositories.transaction(({ operationalPlanes }) => operationalPlanes.getEvidencePackById(request.packId));
      const pack = existing ?? await this.dependencies.operationalPlanes.createEvidencePack(request);
      if (!sameIds(pack.evidenceIds, request.evidenceIds)) throw new RepositoryConflictError("Existing Evidence Pack does not match the Research task");
      packs.push({ evidenceCount: pack.evidenceIds.length, fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, status: pack.status });
    }
    return json({ acquisitionMode: "PRE_ACQUIRED_AUTHORIZED_EVIDENCE", evidencePacks: packs, missingInformation: [], unrestrictedWebAccess: false });
  }

  async #business(input: AgentCompanyWorkdayInput): Promise<JsonObject> {
    const existing = await this.dependencies.repositories.transaction(({ businessMissions }) => businessMissions.getById(input.businessMission.mission.missionId));
    const dossier = existing ?? await this.dependencies.businessMissions.create(input.businessMission);
    if (JSON.stringify(dossier.mission) !== JSON.stringify(input.businessMission.mission)) throw new RepositoryConflictError("Existing Business dossier does not match the workday");
    return businessSummary(dossier);
  }

  async #contentDirection(input: AgentCompanyWorkdayInput): Promise<JsonObject> {
    const dossier = await this.#dossier(input);
    const selected = dossier.candidates.find(({ opportunityId }) => opportunityId === dossier.selectedOpportunityId);
    if (selected === undefined) throw new RepositoryConflictError("Business selection is unavailable for content direction");
    return json({ angle: `Dal problema ${selected.problem} alla decisione verificabile`, approvalSensitiveElements: ["claim", "pricing", "external publication"], audience: input.content.brief.audience, callToAction: input.content.brief.callToAction, evidencePackId: input.content.evidencePackId, hierarchy: [selected.problem, dossier.commercialPlan.offer.promisedOutcome, input.content.brief.callToAction], hook: `Prima le evidenze, poi ${input.content.brief.topic}`, objective: input.content.brief.objective });
  }

  async #contentProduction(input: AgentCompanyWorkdayInput): Promise<JsonObject> {
    const existing = await this.dependencies.repositories.transaction(({ contentProductions }) => contentProductions.getById(input.content.brief.productionId));
    const record = existing ?? await this.dependencies.repositories.transaction(async ({ contentProductions, operationalEvents, operationalPlanes }) => {
      const pack = await this.dependencies.operationalPlanes.assertEvidencePackForContentInTransaction(operationalPlanes, input.content.evidencePackId, input.content.brief.evidence);
      const contentPackage = this.#contentLine.produce(input.content.brief);
      const candidate: MetodoVeloceContentProductionRecord = { actorId: this.dependencies.actorId, contractVersion: "1", createdAt: contentPackage.generatedAt, evidencePack: { fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, verifiedAt: this.dependencies.clock.now().toISOString() }, package: contentPackage, productionId: input.content.brief.productionId, status: contentPackage.status === "BLOCKED" ? "BLOCKED" : "PENDING_FABIO_APPROVAL", updatedAt: contentPackage.generatedAt, version: 0, workspaceId: this.dependencies.workspaceId };
      await contentProductions.insert(candidate);
      await operationalEvents.append(event("PRODUCTION_STATUS_CHANGED", candidate.productionId, candidate.version, candidate.workspaceId, candidate.updatedAt));
      await operationalEvents.append(event("GATE_DECIDED", candidate.productionId, candidate.version, candidate.workspaceId, candidate.updatedAt));
      if (candidate.status === "PENDING_FABIO_APPROVAL") await operationalEvents.append(event("APPROVAL_REQUESTED", candidate.productionId, candidate.version, candidate.workspaceId, candidate.updatedAt));
      return candidate;
    });
    const expectedPackage = new DeterministicMetodoVeloceContentProductionLine({ now: () => new Date(record.package.generatedAt) }).produce(input.content.brief);
    if (record.actorId !== this.dependencies.actorId || record.evidencePack?.packId !== input.content.evidencePackId || record.workspaceId !== this.dependencies.workspaceId || canonicalSha256(record.package) !== canonicalSha256(expectedPackage)) throw new RepositoryConflictError("Existing content package does not match the workday");
    return json({ assets: { carouselSlides: record.package.assets?.carousel.length ?? 0, hasInstagram: record.package.assets !== undefined, hasTikTok: record.package.assets !== undefined }, evidencePackId: record.evidencePack.packId, externalActionsExecuted: false, productionId: record.productionId, qualityScore: record.package.quality.readinessScore, riskStatus: record.package.risk.status, status: record.status, version: record.version });
  }

  #gates(agentId: OperationalAgentId, output: JsonObject, input: AgentCompanyWorkdayInput): readonly OperationalAgentGate[] {
    const qualityFindings: string[] = Object.keys(output).length === 0 ? ["Output strutturato assente."] : [];
    if (agentId === "developer-agent" && output.implementationExecuted !== false) qualityFindings.push("Il task Developer ha dichiarato un'implementazione non verificata.");
    if (agentId === "business-agent" && output.status === "BLOCKED") qualityFindings.push("Il dossier Business è bloccato.");
    if (agentId === "content-producer" && output.status === "BLOCKED") qualityFindings.push("Il pacchetto contenuto è bloccato.");
    const riskFindings = containsExternalEffect(output) ? ["L'output dichiara un effetto esterno non autorizzato."] : [];
    const costFindings = measuredCostValue(output) > input.maxBudgetCents ? ["Il costo misurato supera il budget della Missione."] : [];
    return Object.freeze([gate("QUALITY", qualityFindings), gate("RISK", riskFindings), gate("COST", costFindings)]);
  }

  async #dossier(input: AgentCompanyWorkdayInput): Promise<BusinessMissionDossier> { return this.#ownedDossier(await this.dependencies.repositories.transaction(({ businessMissions }) => businessMissions.getById(input.businessMission.mission.missionId))); }
  async #contentRecord(input: AgentCompanyWorkdayInput): Promise<MetodoVeloceContentProductionRecord> { const value = await this.dependencies.repositories.transaction(({ contentProductions }) => contentProductions.getById(input.content.brief.productionId)); if (value?.workspaceId !== this.dependencies.workspaceId || value.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Content package is unavailable"); return value; }
  async #packs(input: AgentCompanyWorkdayInput) { return Promise.all(input.researchPacks.map(({ packId }) => this.dependencies.repositories.transaction(async ({ operationalPlanes }) => { const pack = await operationalPlanes.getEvidencePackById(packId); if (pack === undefined) throw new RepositoryConflictError("Evidence Pack is unavailable"); return pack; }))); }
  #ownedDossier(value: BusinessMissionDossier | undefined): BusinessMissionDossier { if (value?.workspaceId !== this.dependencies.workspaceId || value.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Business dossier is unavailable"); return value; }
  #owned(value: AgentCompanyWorkday | undefined): AgentCompanyWorkday { if (value?.workspaceId !== this.dependencies.workspaceId || value.actorId !== this.dependencies.actorId) throw new RepositoryConflictError("Agent Company workday is unavailable"); return value; }

  async #markRunning(record: AgentCompanyWorkday, agentId: OperationalAgentId): Promise<AgentCompanyWorkday> { const now = this.dependencies.clock.now().toISOString(); return this.#update(record, { status: "RUNNING", tasks: record.tasks.map((task) => task.agentId === agentId ? { ...task, attempts: task.attempts + 1, gates: [], startedAt: now, status: "RUNNING" as const } : task), updatedAt: now }); }
  async #complete(record: AgentCompanyWorkday, agentId: OperationalAgentId, output: JsonObject, gates: readonly OperationalAgentGate[], durationMs: number): Promise<AgentCompanyWorkday> { const now = this.dependencies.clock.now().toISOString(); return this.#update(record, { tasks: record.tasks.map((task) => task.agentId === agentId ? { ...task, completedAt: now, costCents: 0, durationMs, gates, output, outputFingerprint: createAgentCompanyOutputFingerprint(output), status: "COMPLETED" as const } : task), updatedAt: now }); }
  async #block(record: AgentCompanyWorkday, agentId: OperationalAgentId, blocker: AgentCompanyWorkItemBlocker, gates: readonly OperationalAgentGate[] = blockedGates(), durationMs = 0): Promise<AgentCompanyWorkday> { const now = this.dependencies.clock.now().toISOString(); return this.#update(record, { status: "BLOCKED", tasks: record.tasks.map((task) => task.agentId === agentId ? { ...task, blocker, completedAt: now, costCents: 0, durationMs, gates, status: "BLOCKED" as const } : task), updatedAt: now }); }
  async #awaitFabio(record: AgentCompanyWorkday): Promise<AgentCompanyWorkday> { const now = this.dependencies.clock.now().toISOString(); return this.#update(record, { status: "AWAITING_FABIO", updatedAt: now }); }
  async #update(record: AgentCompanyWorkday, changes: Partial<AgentCompanyWorkday>): Promise<AgentCompanyWorkday> { const next = freeze({ ...record, ...changes, version: record.version + 1 }); await this.dependencies.repositories.transaction(async ({ agentCompanyWorkdays, operationalEvents }) => { await agentCompanyWorkdays.update(next, { version: record.version }); await operationalEvents.append(event("AGENT_COMPANY_TASK_CHANGED", next.workdayId, next.version, next.workspaceId, next.updatedAt)); if (next.status === "AWAITING_FABIO" && record.status !== "AWAITING_FABIO") await operationalEvents.append(event("APPROVAL_REQUESTED", next.workdayId, next.version, next.workspaceId, next.updatedAt)); }); return next; }
}

function businessSummary(dossier: BusinessMissionDossier): JsonObject { return json({ artifacts: dossier.artifacts.map(({ artifactId, fingerprint: value, kind }) => ({ artifactId, fingerprint: value, kind })), dossierFingerprint: dossier.fingerprint, economics: dossier.economics.map(({ contributionMarginCents, name, revenueCents }) => ({ contributionMarginCents, name, revenueCents })), externalActionsExecuted: false, gates: dossier.gates, missionId: dossier.mission.missionId, scorecards: dossier.scorecards.map(({ confidenceAdjustedScore, opportunityId, totalScore }) => ({ confidenceAdjustedScore: confidenceAdjustedScore ?? null, opportunityId, totalScore: totalScore ?? null })), selectedOpportunityId: dossier.selectedOpportunityId ?? null, status: dossier.status }); }
function gate(name: OperationalAgentGate["gate"], findings: readonly string[]): OperationalAgentGate { return Object.freeze({ findings: Object.freeze([...findings]), gate: name, score: findings.length === 0 ? 100 : 0, status: findings.length === 0 ? "PASSED" as const : "BLOCKED" as const }); }
function blockedGates(error?: unknown): readonly OperationalAgentGate[] { return Object.freeze([gate("QUALITY", [safeBlocker(error)]), gate("RISK", []), gate("COST", [])]); }
function safeBlocker(error: unknown): string { return error instanceof RepositoryConflictError || error instanceof RepositoryValidationError ? error.message : "L'executor non ha completato il task in modo verificabile."; }
function containsExternalEffect(output: JsonObject): boolean { const serialized = JSON.stringify(output); return /"(externalActionsExecuted|contactExecuted|deliveryExecuted|spendingExecuted|mergeExecuted|deployExecuted)":true/u.test(serialized); }
function measuredCostValue(output: JsonObject): number { return typeof output.measuredCostCents === "number" ? output.measuredCostCents : 0; }
function measuredCost(record: AgentCompanyWorkday): number { return record.tasks.reduce((sum, task) => sum + task.costCents, 0); }
function dependencyBlocker(task: AgentCompanyWorkItem, record: AgentCompanyWorkday): AgentCompanyWorkItemBlocker {
  const incomplete = task.dependencies.filter((dependencyId) => record.tasks.find(({ agentId }) => agentId === dependencyId)?.status !== "COMPLETED");
  return freeze({ evidence: incomplete.map((dependencyId) => `${dependencyId}:${record.tasks.find(({ agentId }) => agentId === dependencyId)?.status ?? "MISSING"}`), missingInput: "Manca una receipt COMPLETED per ogni dipendenza dichiarata.", nextAction: "Completare o correggere la dipendenza indicata, quindi rieseguire la stessa workday identity.", owner: "OPERATIONS_RUNTIME", reasonCode: "DEPENDENCY_NOT_COMPLETED", remediation: "Non saltare la dependency graph e non creare output sostitutivi senza executor e receipt durevole." });
}
function gateBlocker(agentId: OperationalAgentId, gate_: OperationalAgentGate): AgentCompanyWorkItemBlocker {
  return freeze({ evidence: gate_.findings.length === 0 ? [`${gate_.gate}:BLOCKED`] : gate_.findings, missingInput: `Manca un risultato che superi il ${gate_.gate} Gate.`, nextAction: "Correggere l'output bounded dell'executor e rieseguire il Gate sulla stessa workday identity.", owner: agentId, reasonCode: `${gate_.gate}_GATE_BLOCKED`, remediation: "Conservare il risultato bloccato e non avanzare i task dipendenti finché il Gate non è PASSED." });
}
function executorBlocker(agentId: OperationalAgentId, error: unknown): AgentCompanyWorkItemBlocker {
  const backupReceiptMissing = error instanceof RepositoryConflictError && error.message === "BACKUP_RESTORE_RECEIPT_REQUIRED";
  return freeze({
    evidence: [backupReceiptMissing ? "backup_restore_verification:receipt_missing" : `executor:${agentId}:output_unverified`],
    missingInput: backupReceiptMissing ? "Manca una receipt reale di backup e restore verification collegata a questa workday." : "Manca un output executor verificabile e conforme al contratto del task.",
    nextAction: backupReceiptMissing ? "Eseguire il backup verifier locale, verificare il restore e collegare la receipt durevole prima di rieseguire la workday." : "Correggere l'input o l'executor indicato e rieseguire la stessa workday identity.",
    owner: backupReceiptMissing ? "OPERATIONS_RUNTIME" : agentId,
    reasonCode: backupReceiptMissing ? "BACKUP_RESTORE_RECEIPT_REQUIRED" : "EXECUTOR_OUTPUT_UNVERIFIED",
    remediation: backupReceiptMissing ? "Non dichiarare recuperabilità senza un restore effettivo e una receipt verificabile." : "Non sostituire l'output mancante con attestazioni nominali o metriche inventate.",
  });
}
function minFreshness(packs: readonly { readonly minFreshnessExpiresAt: string }[]): string { return packs.map(({ minFreshnessExpiresAt }) => minFreshnessExpiresAt).sort()[0] ?? "NOT_AVAILABLE"; }
function sameIds(left: readonly string[], right: readonly string[]): boolean { return [...left].sort().join("\n") === [...right].sort().join("\n"); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function event(eventType: OperationalEventType, entityId: string, entityVersion: number, workspaceId: string, occurredAt: string) { const semantics = OPERATIONAL_EVENT_SEMANTICS[eventType]; return { aggregateType: semantics.aggregateType, contractVersion: "1" as const, entityId, entityVersion, eventId: `evt-${fingerprint(`${eventType}\n${entityId}\n${String(entityVersion)}`).slice(0, 48)}`, eventType, occurredAt, safeSummaryCode: semantics.safeSummaryCode, workspaceId }; }
function elapsed(start: number, end: number): number { return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round(end - start)) : 0; }
function validateInput(value: unknown, validator: AgentCompanyWorkdayInputValidator): AgentCompanyWorkdayInput { const result = validator.validate(value); if (!result.ok) throw new RepositoryValidationError("Agent Company workday input failed validation", { issueCount: result.issues.length }); return result.value; }
function json(value: unknown): JsonObject { const cloned = JSON.parse(JSON.stringify(value)) as JsonValue; if (typeof cloned !== "object" || cloned === null || Array.isArray(cloned)) throw new RepositoryValidationError("Agent Company executor output is not a JSON object"); return freeze(cloned as JsonObject); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
