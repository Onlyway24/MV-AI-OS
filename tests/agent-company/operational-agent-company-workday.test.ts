import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AgentCompanyWorkday, AgentCompanyWorkdayInput } from "../../src/agent-company/operational-agent-company.js";
import { AgentCompanyWorkdayValidator, createAgentCompanyInputFingerprint, createAgentCompanyOutputFingerprint } from "../../src/agent-company/operational-agent-company-validator.js";
import type { BusinessMissionExecutionInput, BusinessScoreCriterion } from "../../src/business/business-mission.js";
import { BusinessMissionService } from "../../src/business/business-mission-service.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import type { RepositoryTransaction, RepositoryTransactionRunner } from "../../src/persistence/repository-transaction.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import type { ReferenceBrief, ReferenceBriefAsset, ReferenceRole } from "../../src/reference-vault/reference-vault.js";
import type { ReferenceVaultBriefQuery } from "../../src/reference-vault/reference-vault-query-agent.js";
import { referenceFingerprint } from "../../src/reference-vault/reference-vault-validator.js";
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
    const referenceAwareAgents = ["onlyway-assistant", "research-agent", "business-agent", "content-director", "content-producer", "sales-agent", "knowledge-curator", "customer-delivery-agent", "quality-guardian", "risk-guardian"];
    expect(referenceAwareAgents.every((agentId) => {
      const output = workday.tasks.find((task) => task.agentId === agentId)?.output;
      return output?.referenceContextStatus === "NOT_AVAILABLE"
        && output.referenceDataTrust === "UNTRUSTED_REFERENCE_DATA"
        && Array.isArray(output.referenceIdsAvailable)
        && output.referenceIdsAvailable.length === 0
        && Array.isArray(output.referenceIdsUsed)
        && output.referenceIdsUsed.length === 0;
    })).toBe(true);
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
    const intruderInput: AgentCompanyWorkdayInput = { ...durableWorkday.input, workdayId: "intruder-workday-001" };
    const intruderWorkday: AgentCompanyWorkday = {
      ...durableWorkday,
      actorId: "intruder",
      input: intruderInput,
      inputFingerprint: createAgentCompanyInputFingerprint(intruderInput),
      tasks: durableWorkday.tasks.map((task) => ({ ...task, workItemId: `intruder-workday-001-${task.agentId}` })),
      version: 0,
      workdayId: intruderInput.workdayId,
    };
    expect(new AgentCompanyWorkdayValidator().validate(intruderWorkday).ok).toBe(true);
    await restarted.transaction(({ agentCompanyWorkdays }) => agentCompanyWorkdays.insert(intruderWorkday));
    const ownerScope = await restarted.transaction(async ({ agentCompanyWorkdays }) => ({
      intruderAsFabio: await agentCompanyWorkdays.getByOwner({ actorId: "fabio", workspaceId: "onlyway" }, intruderWorkday.workdayId),
      intruderAsOwner: await agentCompanyWorkdays.getByOwner({ actorId: "intruder", workspaceId: "onlyway" }, intruderWorkday.workdayId),
      ownerRows: await agentCompanyWorkdays.listByOwner({ actorId: "fabio", workspaceId: "onlyway" }, 25),
    }));
    expect(ownerScope.intruderAsFabio).toBeUndefined();
    expect(ownerScope.intruderAsOwner).toMatchObject({ actorId: "intruder", workdayId: "intruder-workday-001" });
    expect(ownerScope.ownerRows.map(({ actorId, workdayId }) => ({ actorId, workdayId }))).toEqual([{ actorId: "fabio", workdayId: "onlyway-workday-001" }]);
    const metrics = await restartedBoundary.execute({ actorId: "fabio", commandId: "agent-company-metrics-after-restart", contractVersion: "1", input: {}, operation: "GET_AGENT_COMPANY_METRICS", workspaceId: "onlyway" });
    const measured = metrics.result as readonly { readonly blockedTasks: number; readonly completedTasks: number; readonly measuredCostCents: number }[];
    expect(measured).toHaveLength(17);
    expect(measured.filter(({ completedTasks }) => completedTasks === 1)).toHaveLength(16);
    expect(measured.filter(({ blockedTasks }) => blockedTasks === 1)).toHaveLength(1);
    expect(measured.every((entry) => entry.measuredCostCents === 0)).toBe(true);
    const commandCenter = await new CommandCenterQueryService({ actorId: "fabio", clock, repositories: restarted, workspaceId: "onlyway" }).snapshot();
    expect(commandCenter.agentCompany).toHaveLength(1);
    expect(commandCenter.agents).toHaveLength(17);
    expect(commandCenter.agents.filter(({ completedTasks }) => completedTasks === 1)).toHaveLength(16);
    expect(commandCenter.agents.find(({ agentId }) => agentId === "backup-guardian")).toMatchObject({ blockedTasks: 1, state: "DEGRADED" });
    expect(commandCenter.overview).toMatchObject({
      decisionsRequired: 3,
      dailyBrief: { decision: "Una giornata Agent Company è bloccata" },
    });
    const leakingRepositories: RepositoryTransactionRunner = {
      transaction: <T>(operation: (repositories: RepositoryTransaction) => Promise<T>): Promise<T> => restarted.transaction((repositories) => operation({
        ...repositories,
        agentCompanyWorkdays: {
          getByOwner: (identity, workdayId) => repositories.agentCompanyWorkdays.getByOwner(identity, workdayId),
          insert: (record) => repositories.agentCompanyWorkdays.insert(record),
          listByOwner: () => Promise.resolve([intruderWorkday]),
          update: (record, expectation) => repositories.agentCompanyWorkdays.update(record, expectation),
        },
      })),
    };
    await expect(new CommandCenterQueryService({ actorId: "fabio", clock, repositories: leakingRepositories, workspaceId: "onlyway" }).snapshot()).rejects.toThrow("cross-identity");
    const leakingBoundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: leakingRepositories, workspaceId: "onlyway" });
    await expect(leakingBoundary.execute({ actorId: "fabio", commandId: "agent-company-cross-actor-metrics", contractVersion: "1", input: {}, operation: "GET_AGENT_COMPANY_METRICS", workspaceId: "onlyway" })).rejects.toThrow("cross-identity");
    await restarted.close();
  }));

  it("fails closed before persisting agent output on cross-actor Evidence Pack and Business Mission ID collisions", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);

    const crossActorPackRepositories: RepositoryTransactionRunner = {
      transaction: <T>(operation: (transaction: RepositoryTransaction) => Promise<T>): Promise<T> => repositories.transaction((transaction) => operation({
        ...transaction,
        operationalPlanes: new Proxy(transaction.operationalPlanes, {
          get(target, property): unknown {
            if (property === "getEvidencePackById") return async (packId: string) => {
              const pack = await target.getEvidencePackById(packId);
              return pack === undefined ? undefined : { ...pack, actorId: "intruder" };
            };
            const member = Reflect.get(target, property, target) as unknown;
            return typeof member === "function" ? member.bind(target) : member;
          },
        }),
      })),
    };
    const crossActorPackBoundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: crossActorPackRepositories, workspaceId: "onlyway" });
    const packCollisionInput = { ...workdayInput(), workdayId: "cross-actor-pack-collision-workday" };
    const packCollision = await crossActorPackBoundary.execute({ actorId: "fabio", commandId: "agent-company-cross-actor-pack-collision", contractVersion: "1", input: { workday: packCollisionInput }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const packCollisionWorkday = packCollision.result as AgentCompanyWorkday;
    expect(packCollisionWorkday.status).toBe("BLOCKED");
    const blockedResearchTask = packCollisionWorkday.tasks.find(({ agentId }) => agentId === "research-agent");
    expect(blockedResearchTask).toMatchObject({
      blocker: { reasonCode: "EXECUTOR_OUTPUT_UNVERIFIED" },
      status: "BLOCKED",
    });
    expect(blockedResearchTask).not.toHaveProperty("output");
    expect(blockedResearchTask?.gates[0]?.findings).toEqual(["Evidence Pack is unavailable"]);
    expect(packCollisionWorkday.tasks.find(({ agentId }) => agentId === "business-agent")).toMatchObject({ status: "QUEUED" });

    const ownedDossier = await new BusinessMissionService({ actorId: "fabio", clock, repositories, workspaceId: "onlyway" }).create(workdayInput().businessMission);
    const crossActorBusinessRepositories: RepositoryTransactionRunner = {
      transaction: <T>(operation: (transaction: RepositoryTransaction) => Promise<T>): Promise<T> => repositories.transaction((transaction) => operation({
        ...transaction,
        businessMissions: new Proxy(transaction.businessMissions, {
          get(target, property): unknown {
            if (property === "getById") return (missionId: string) => Promise.resolve(missionId === ownedDossier.mission.missionId ? { ...ownedDossier, actorId: "intruder" } : undefined);
            const member = Reflect.get(target, property, target) as unknown;
            return typeof member === "function" ? member.bind(target) : member;
          },
        }),
      })),
    };
    const crossActorBusinessBoundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, repositories: crossActorBusinessRepositories, workspaceId: "onlyway" });
    const businessCollisionInput = { ...workdayInput(), workdayId: "cross-actor-business-collision-workday" };
    const businessCollision = await crossActorBusinessBoundary.execute({ actorId: "fabio", commandId: "agent-company-cross-actor-business-collision", contractVersion: "1", input: { workday: businessCollisionInput }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const businessCollisionWorkday = businessCollision.result as AgentCompanyWorkday;
    expect(businessCollisionWorkday.status).toBe("BLOCKED");
    expect(businessCollisionWorkday.tasks.find(({ agentId }) => agentId === "research-agent")).toMatchObject({ status: "COMPLETED" });
    const blockedBusinessTask = businessCollisionWorkday.tasks.find(({ agentId }) => agentId === "business-agent");
    expect(blockedBusinessTask).toMatchObject({
      blocker: { reasonCode: "EXECUTOR_OUTPUT_UNVERIFIED" },
      status: "BLOCKED",
    });
    expect(blockedBusinessTask).not.toHaveProperty("output");
    expect(blockedBusinessTask?.gates[0]?.findings).toEqual(["Business dossier is unavailable"]);
    await repositories.close();
  }));

  it("resolves bounded reference guidance before execution and records truthful provenance", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);
    const queries: ReferenceVaultBriefQuery[] = [];
    let businessDossierExistedAtBriefQuery: boolean | undefined;
    const referenceVault = {
      async getBrief(query?: ReferenceVaultBriefQuery): Promise<ReferenceBrief> {
        if (query === undefined) throw new Error("Expected an explicit bounded Reference Vault query");
        queries.push(query);
        if (query.purpose === "INTERNAL_ANALYSIS" && queries.filter(({ purpose }) => purpose === "INTERNAL_ANALYSIS").length === 2) {
          businessDossierExistedAtBriefQuery = await repositories.transaction(async ({ businessMissions }) => (await businessMissions.getById("business-day-one")) !== undefined);
        }
        return referenceBrief(query);
      },
    };
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, referenceVault, repositories, workspaceId: "onlyway" });
    const completed = await boundary.execute({ actorId: "fabio", commandId: "agent-company-reference-guidance", contractVersion: "1", input: { workday: workdayInput() }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const workday = completed.result as AgentCompanyWorkday;

    expect(workday).toMatchObject({ status: "BLOCKED", workdayId: "onlyway-workday-001" });
    expect(businessDossierExistedAtBriefQuery).toBe(false);
    expect(await repositories.transaction(({ businessMissions }) => businessMissions.getById("business-day-one"))).toBeDefined();
    expect(queries).toHaveLength(20);
    expect(queries.filter(({ purpose }) => purpose === "CREATIVE_DIRECTION")).toHaveLength(10);
    expect(queries.filter(({ purpose }) => purpose === "INTERNAL_ANALYSIS")).toHaveLength(10);
    expect(queries.map(({ purpose }) => purpose)).toEqual([
      "CREATIVE_DIRECTION", "CREATIVE_DIRECTION",
      "INTERNAL_ANALYSIS", "INTERNAL_ANALYSIS",
      "INTERNAL_ANALYSIS", "INTERNAL_ANALYSIS",
      "CREATIVE_DIRECTION", "CREATIVE_DIRECTION",
      "CREATIVE_DIRECTION", "CREATIVE_DIRECTION",
      "CREATIVE_DIRECTION", "CREATIVE_DIRECTION",
      "CREATIVE_DIRECTION", "CREATIVE_DIRECTION",
      "INTERNAL_ANALYSIS", "INTERNAL_ANALYSIS",
      "INTERNAL_ANALYSIS", "INTERNAL_ANALYSIS",
      "INTERNAL_ANALYSIS", "INTERNAL_ANALYSIS",
    ]);
    expect(queries.map(({ platform }) => platform)).toEqual(Array.from({ length: 10 }, () => ["INSTAGRAM", "TIKTOK"]).flat());
    expect(queries.every((query) => query.limit === 8 && query.roles !== undefined && query.roles.length > 0 && !query.roles.includes("COMPETITOR_REFERENCE") && (query.platform === "INSTAGRAM" || query.platform === "TIKTOK"))).toBe(true);

    const guidancePurposes: ReadonlyMap<string, { readonly domainField: string; readonly purpose: string }> = new Map([
      ["onlyway-assistant", { domainField: "missionReferenceConstraints", purpose: "MISSION_COORDINATION" }],
      ["research-agent", { domainField: "researchReferenceConstraints", purpose: "RESEARCH_SCOPING" }],
      ["business-agent", { domainField: "businessComparisonConstraints", purpose: "BUSINESS_COMPARISON" }],
      ["content-director", { domainField: "contentDirectionConstraints", purpose: "CONTENT_DIRECTION" }],
      ["content-producer", { domainField: "contentProductionConstraints", purpose: "CONTENT_PRODUCTION" }],
      ["sales-agent", { domainField: "salesEnablementConstraints", purpose: "SALES_ENABLEMENT" }],
      ["customer-delivery-agent", { domainField: "customerDeliveryConstraints", purpose: "CUSTOMER_DELIVERY" }],
      ["knowledge-curator", { domainField: "knowledgeIndexConstraints", purpose: "KNOWLEDGE_INDEX" }],
      ["quality-guardian", { domainField: "qualityReviewConstraints", purpose: "QUALITY_REVIEW" }],
      ["risk-guardian", { domainField: "riskReviewConstraints", purpose: "RISK_REVIEW" }],
    ]);
    const internalReferenceAgents = new Set(["research-agent", "business-agent", "knowledge-curator", "quality-guardian", "risk-guardian"]);
    let referenceQueryIndex = 0;
    for (const [agentId, { domainField, purpose }] of guidancePurposes) {
      const output = workday.tasks.find((task) => task.agentId === agentId)?.output;
      const requestedRoles = queries[referenceQueryIndex]?.roles;
      const secondPlatformRoles = queries[referenceQueryIndex + 1]?.roles;
      referenceQueryIndex += 2;
      if (requestedRoles === undefined) throw new Error(`Missing Reference Vault role query for ${agentId}`);
      expect(secondPlatformRoles).toEqual(requestedRoles);
      expect(output).toMatchObject({
        referenceAssetRefsAvailable: [{ assetId: "reference-approved", fingerprint: REFERENCE_ASSET_FINGERPRINT, version: 0 }],
        referenceAssetRefsUsed: [{ assetId: "reference-approved", fingerprint: REFERENCE_ASSET_FINGERPRINT, version: 0 }],
        referenceBriefFingerprint: REFERENCE_BRIEF_FINGERPRINTS[internalReferenceAgents.has(agentId) ? "INTERNAL_ANALYSIS" : "CREATIVE_DIRECTION"],
        referenceContextStatus: "AVAILABLE",
        referenceDataTrust: "UNTRUSTED_REFERENCE_DATA",
        referenceGuidance: {
          items: [{
            businessObjective: "Mantenere una direzione evidence-led.",
            referenceId: "reference-approved",
            roles: requestedRoles,
            whatNotToCopy: ["Claim non verificati"],
            whatToLearn: ["Gerarchia chiara", "CTA esplicita"],
          }],
          purpose,
        },
        referenceIdsAvailable: ["reference-approved"],
        referenceIdsUsed: ["reference-approved"],
      });
      expect(output?.[domainField]).toEqual({
        applicationMode: "BOUNDED_REFERENCE_DATA_ONLY",
        businessObjectives: [{ referenceId: "reference-approved", value: "Mantenere una direzione evidence-led." }],
        constraints: [{ referenceId: "reference-approved", value: "Claim non verificati" }],
        instructionExecution: "DISABLED",
        patterns: [{ referenceId: "reference-approved", value: "Gerarchia chiara" }, { referenceId: "reference-approved", value: "CTA esplicita" }],
        purpose,
        roleSignals: [{ referenceId: "reference-approved", values: requestedRoles }],
      });
    }
    for (const task of workday.tasks.filter(({ agentId }) => !guidancePurposes.has(agentId))) {
      if (task.output === undefined) continue;
      expect(task.output).not.toHaveProperty("referenceIdsAvailable");
      expect(task.output).not.toHaveProperty("referenceIdsUsed");
      expect(task.output).not.toHaveProperty("referenceAssetRefsAvailable");
      expect(task.output).not.toHaveProperty("referenceAssetRefsUsed");
    }
    await repositories.close();
  }));

  it("applies a deterministic reference subset and changes business and content constraints with guidance", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);
    let variant: "ALPHA" | "BETA" = "ALPHA";
    const referenceVault = { getBrief: (query: ReferenceVaultBriefQuery): Promise<ReferenceBrief> => Promise.resolve(multiReferenceBrief(query, variant)) };
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, referenceVault, repositories, workspaceId: "onlyway" });
    const alpha = await boundary.execute({ actorId: "fabio", commandId: "agent-company-reference-alpha", contractVersion: "1", input: { workday: { ...workdayInput(), workdayId: "reference-alpha-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    variant = "BETA";
    const beta = await boundary.execute({ actorId: "fabio", commandId: "agent-company-reference-beta", contractVersion: "1", input: { workday: { ...workdayInput(), workdayId: "reference-beta-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const alphaWorkday = alpha.result as AgentCompanyWorkday;
    const betaWorkday = beta.result as AgentCompanyWorkday;
    const alphaBusiness = alphaWorkday.tasks.find(({ agentId }) => agentId === "business-agent");
    const betaBusiness = betaWorkday.tasks.find(({ agentId }) => agentId === "business-agent");
    const alphaContent = alphaWorkday.tasks.find(({ agentId }) => agentId === "content-producer");
    const betaContent = betaWorkday.tasks.find(({ agentId }) => agentId === "content-producer");
    const expectedAvailable = ["reference-d", "reference-b", "reference-a", "reference-c"];
    const expectedUsed = ["reference-a", "reference-b", "reference-c"];

    for (const task of [alphaBusiness, alphaContent]) {
      expect(task?.output).toMatchObject({ referenceIdsAvailable: expectedAvailable, referenceIdsUsed: expectedUsed });
      expect((task?.output?.referenceGuidance as { readonly items?: readonly { readonly referenceId?: string }[] } | undefined)?.items?.map(({ referenceId }) => referenceId)).toEqual(expectedUsed);
    }
    expect(alphaBusiness?.output?.businessComparisonConstraints).toMatchObject({
      applicationMode: "BOUNDED_REFERENCE_DATA_ONLY",
      businessObjectives: expectedUsed.map((referenceId) => ({ referenceId, value: `ALPHA objective ${referenceId}` })),
      constraints: expectedUsed.map((referenceId) => ({ referenceId, value: `ALPHA constraint ${referenceId}` })),
      patterns: expectedUsed.map((referenceId) => ({ referenceId, value: `ALPHA pattern ${referenceId}` })),
      purpose: "BUSINESS_COMPARISON",
    });
    expect(betaBusiness?.output?.businessComparisonConstraints).toMatchObject({
      constraints: expectedUsed.map((referenceId) => ({ referenceId, value: `BETA constraint ${referenceId}` })),
      patterns: expectedUsed.map((referenceId) => ({ referenceId, value: `BETA pattern ${referenceId}` })),
    });
    expect(alphaContent?.output?.contentProductionConstraints).toMatchObject({
      constraints: expectedUsed.map((referenceId) => ({ referenceId, value: `ALPHA constraint ${referenceId}` })),
      patterns: expectedUsed.map((referenceId) => ({ referenceId, value: `ALPHA pattern ${referenceId}` })),
      purpose: "CONTENT_PRODUCTION",
    });
    expect(betaContent?.output?.contentProductionConstraints).toMatchObject({
      constraints: expectedUsed.map((referenceId) => ({ referenceId, value: `BETA constraint ${referenceId}` })),
      patterns: expectedUsed.map((referenceId) => ({ referenceId, value: `BETA pattern ${referenceId}` })),
    });
    expect(alphaBusiness?.output?.businessComparisonConstraints).not.toEqual(betaBusiness?.output?.businessComparisonConstraints);
    expect(alphaContent?.output?.contentProductionConstraints).not.toEqual(betaContent?.output?.contentProductionConstraints);
    expect(alphaBusiness?.outputFingerprint).not.toBe(betaBusiness?.outputFingerprint);
    expect(alphaContent?.outputFingerprint).not.toBe(betaContent?.outputFingerprint);
    expect({ gates: alphaBusiness?.output?.gates, scorecards: alphaBusiness?.output?.scorecards, selectedOpportunityId: alphaBusiness?.output?.selectedOpportunityId }).toEqual({ gates: betaBusiness?.output?.gates, scorecards: betaBusiness?.output?.scorecards, selectedOpportunityId: betaBusiness?.output?.selectedOpportunityId });
    expect({ evidencePackId: alphaContent?.output?.evidencePackId, qualityScore: alphaContent?.output?.qualityScore, riskStatus: alphaContent?.output?.riskStatus, status: alphaContent?.output?.status }).toEqual({ evidencePackId: betaContent?.output?.evidencePackId, qualityScore: betaContent?.output?.qualityScore, riskStatus: betaContent?.output?.riskStatus, status: betaContent?.output?.status });
    expect(alphaBusiness?.gates).toEqual(betaBusiness?.gates);
    expect(alphaContent?.gates).toEqual(betaContent?.gates);
    await repositories.close();
  }));

  it("uses only references eligible for every requested publication platform", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);
    const queriedPlatforms: ReferenceVaultBriefQuery["platform"][] = [];
    const referenceVault = {
      getBrief(query: ReferenceVaultBriefQuery): Promise<ReferenceBrief> {
        queriedPlatforms.push(query.platform);
        if (query.platform !== "INSTAGRAM" && query.platform !== "TIKTOK") throw new Error("Expected a platform-scoped brief");
        const shared = referenceBrief(query).assets[0];
        if (shared === undefined) throw new Error("Expected the shared reference fixture");
        const scopedId = query.platform === "INSTAGRAM" ? "reference-instagram-only" : "reference-tiktok-only";
        const scoped: ReferenceBriefAsset = {
          ...shared,
          assetRef: { assetId: scopedId, fingerprint: canonicalSha256({ scopedId }), version: 0 },
          platforms: [query.platform],
          referenceId: scopedId,
          title: `${query.platform} only`,
        };
        return Promise.resolve(referenceBriefFromAssets(query, [shared, scoped]));
      },
    };
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, referenceVault, repositories, workspaceId: "onlyway" });
    const result = await boundary.execute({ actorId: "fabio", commandId: "agent-company-platform-intersection", contractVersion: "1", input: { workday: { ...workdayInput(), workdayId: "platform-intersection-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const workday = result.result as AgentCompanyWorkday;
    expect(queriedPlatforms).toEqual(Array.from({ length: 10 }, () => ["INSTAGRAM", "TIKTOK"]).flat());
    for (const task of workday.tasks.filter(({ output }) => output?.referenceIdsAvailable !== undefined)) {
      expect(task.output).toMatchObject({ referenceIdsAvailable: ["reference-approved"], referenceIdsUsed: ["reference-approved"] });
    }
    await repositories.close();
  }));

  it("preserves a platform-specific reference for a single-platform workday", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    await seedAuthorizedEvidence(repositories, clock);
    const queriedPlatforms: ReferenceVaultBriefQuery["platform"][] = [];
    const referenceVault = {
      getBrief(query: ReferenceVaultBriefQuery): Promise<ReferenceBrief> {
        queriedPlatforms.push(query.platform);
        if (query.platform !== "INSTAGRAM") throw new Error("Expected the Instagram-scoped brief");
        const shared = referenceBrief(query).assets[0];
        if (shared === undefined) throw new Error("Expected the shared reference fixture");
        const scopedId = "reference-instagram-only";
        return Promise.resolve(referenceBriefFromAssets(query, [shared, {
          ...shared,
          assetRef: { assetId: scopedId, fingerprint: canonicalSha256({ scopedId }), version: 0 },
          platforms: ["INSTAGRAM"],
          referenceId: scopedId,
          title: "Instagram only",
        }]));
      },
    };
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, referenceVault, repositories, workspaceId: "onlyway" });
    const input = workdayInput();
    const result = await boundary.execute({ actorId: "fabio", commandId: "agent-company-single-platform", contractVersion: "1", input: { workday: { ...input, publisher: { ...input.publisher, platforms: ["instagram"] }, workdayId: "single-platform-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const assistant = (result.result as AgentCompanyWorkday).tasks.find(({ agentId }) => agentId === "onlyway-assistant");
    expect(queriedPlatforms).toEqual(Array.from({ length: 10 }, () => "INSTAGRAM"));
    expect(assistant?.output).toMatchObject({ referenceIdsAvailable: ["reference-approved", "reference-instagram-only"], referenceIdsUsed: ["reference-approved", "reference-instagram-only"] });
    await repositories.close();
  }));

  it("fails closed on forged fingerprints and oversized untrusted reference guidance", async () => withDatabase(async (path) => {
    const clock = new FixedClock("2026-07-15T08:00:00.000Z");
    const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
    let mode: "FORGED_FINGERPRINT" | "OVERSIZED_GUIDANCE" = "FORGED_FINGERPRINT";
    const referenceVault = {
      getBrief(query: ReferenceVaultBriefQuery): Promise<ReferenceBrief> {
        const valid = referenceBrief(query);
        if (mode === "FORGED_FINGERPRINT") return Promise.resolve({ ...valid, fingerprint: "f".repeat(64) });
        const payload: Record<string, unknown> = {
          ...valid,
          assets: [{ ...valid.assets[0], whatToLearn: Array.from({ length: 51 }, () => "Guidance bounded") }],
        };
        delete payload.fingerprint;
        return Promise.resolve({ ...payload, fingerprint: referenceFingerprint(payload) } as unknown as ReferenceBrief);
      },
    };
    const boundary = createLocalWorkflowCommandBoundary({ actorId: "fabio", clock, referenceVault, repositories, workspaceId: "onlyway" });
    const forged = await boundary.execute({ actorId: "fabio", commandId: "agent-company-forged-reference", contractVersion: "1", input: { workday: { ...workdayInput(), workdayId: "forged-reference-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const forgedTask = (forged.result as AgentCompanyWorkday).tasks.find(({ agentId }) => agentId === "onlyway-assistant");
    expect(forgedTask).toMatchObject({
      blocker: { reasonCode: "EXECUTOR_OUTPUT_UNVERIFIED" },
      status: "BLOCKED",
    });
    expect(forgedTask?.gates).toContainEqual(expect.objectContaining({ findings: ["Reference brief fingerprint is not canonically bound to its payload"], gate: "QUALITY", status: "BLOCKED" }));

    mode = "OVERSIZED_GUIDANCE";
    const oversized = await boundary.execute({ actorId: "fabio", commandId: "agent-company-oversized-reference", contractVersion: "1", input: { workday: { ...workdayInput(), workdayId: "oversized-reference-workday" } }, operation: "RUN_AGENT_COMPANY_WORKDAY", workspaceId: "onlyway" });
    const oversizedTask = (oversized.result as AgentCompanyWorkday).tasks.find(({ agentId }) => agentId === "onlyway-assistant");
    expect(oversizedTask).toMatchObject({
      blocker: { reasonCode: "EXECUTOR_OUTPUT_UNVERIFIED" },
      status: "BLOCKED",
    });
    expect(oversizedTask?.gates).toContainEqual(expect.objectContaining({ findings: ["Reference brief asset is outside the requested bounded role set"], gate: "QUALITY", status: "BLOCKED" }));
    await repositories.close();
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

const REFERENCE_ASSET_FINGERPRINT = "b".repeat(64);
const SAFE_REFERENCE_ROLES = Object.freeze([
  "BRAND_REFERENCE",
  "LOGO_ASSET",
  "VISUAL_STYLE",
  "PHOTOGRAPHY_REFERENCE",
  "COMPOSITION_REFERENCE",
  "TYPOGRAPHY_REFERENCE",
  "HOOK_REFERENCE",
  "CAROUSEL_STRUCTURE",
  "CTA_REFERENCE",
  "OFFER_REFERENCE",
  "PRICING_REFERENCE",
  "CUSTOMER_LANGUAGE",
  "ANALYTICS_EVIDENCE",
  "NEGATIVE_REFERENCE",
] as const satisfies readonly Exclude<ReferenceRole, "COMPETITOR_REFERENCE">[]);

function referenceBrief(query: ReferenceVaultBriefQuery): ReferenceBrief {
  return referenceBriefFromAssets(query, [{
    assetRef: { assetId: "reference-approved", fingerprint: REFERENCE_ASSET_FINGERPRINT, version: 0 },
    audience: ["Piccoli business italiani"],
    businessObjective: "Mantenere una direzione evidence-led.",
    platforms: ["GENERAL"],
    referenceId: "reference-approved",
    roles: SAFE_REFERENCE_ROLES,
    title: "Reference guidance approvata",
    whatNotToCopy: ["Claim non verificati"],
    whatToLearn: ["Gerarchia chiara", "CTA esplicita"],
  }]);
}

function referenceBriefFromAssets(query: ReferenceVaultBriefQuery, assets: readonly ReferenceBriefAsset[]): ReferenceBrief {
  const brief = {
    actorId: "fabio",
    assets,
    businessContext: { reasonCode: "REFERENCE_BUSINESS_CONTEXT_NOT_AVAILABLE", status: "NOT_AVAILABLE" },
    competitorOutputPolicy: "BLOCKED",
    contractVersion: "1",
    decisions: [],
    excludedCompetitorCount: 0,
    externalEffectsExecuted: false,
    generatedAt: "2026-07-15T08:00:00.000Z",
    ...(query.platform === undefined ? {} : { platform: query.platform }),
    outcomes: [],
    purpose: query.purpose,
    workspaceId: "onlyway",
  } satisfies Omit<ReferenceBrief, "fingerprint">;
  return { ...brief, fingerprint: referenceFingerprint(brief) };
}

function multiReferenceBrief(query: ReferenceVaultBriefQuery, variant: "ALPHA" | "BETA"): ReferenceBrief {
  const assets = (["d", "b", "a", "c"] as const).map((suffix): ReferenceBriefAsset => {
    const referenceId = `reference-${suffix}`;
    return {
      assetRef: { assetId: referenceId, fingerprint: canonicalSha256({ referenceId, variant }), version: 0 },
      audience: ["Piccoli business italiani"],
      businessObjective: `${variant} objective ${referenceId}`,
      platforms: ["GENERAL"],
      referenceId,
      roles: SAFE_REFERENCE_ROLES,
      title: `${variant} ${referenceId}`,
      whatNotToCopy: [`${variant} constraint ${referenceId}`],
      whatToLearn: [`${variant} pattern ${referenceId}`],
    };
  });
  return referenceBriefFromAssets(query, assets);
}

const REFERENCE_BRIEF_FINGERPRINTS = Object.freeze({
  CREATIVE_DIRECTION: multiPlatformReferenceFingerprint("CREATIVE_DIRECTION"),
  INTERNAL_ANALYSIS: multiPlatformReferenceFingerprint("INTERNAL_ANALYSIS"),
});

function multiPlatformReferenceFingerprint(purpose: ReferenceVaultBriefQuery["purpose"]): string {
  const briefs = (["INSTAGRAM", "TIKTOK"] as const).map((platform) => referenceBrief({ platform, purpose }));
  return canonicalSha256({ mode: "ALL_REQUESTED_PLATFORMS", platformBriefs: briefs.map(({ fingerprint, platform }) => ({ fingerprint, platform })) });
}

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
