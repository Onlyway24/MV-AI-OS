import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { BusinessMissionDossier } from "../business/business-mission.js";
import type { ContentEvidence, MetodoVeloceContentProductionBrief } from "../content-production/metodo-veloce-content-production.js";
import type { MetodoVeloceContentProductionRecord } from "../content-production/metodo-veloce-content-production-record.js";
import { MetodoVeloceContentProductionBriefValidator, MetodoVeloceContentProductionRecordValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { EvidencePack } from "../operational-planes/operational-plane.js";
import { evidencePackFingerprint } from "../operational-planes/evidence-pack-fingerprint.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { LocalWorkflowCommandBoundary } from "../runtime/local-workflow-command.js";
import {
  type OracleCreativeAgentStage,
  type OracleCreativeCapability,
  type OracleCreativeDeliverable,
  type OracleCreativePromptProposal,
  type OracleCreativePromptReceipt,
  type OracleCreativePromptRequest,
  type OracleCreativeReasonCode,
  ORACLE_LOCAL_CONTENT_BUNDLE,
} from "./oracle-creative-prompt.js";
import { OracleCreativePromptConfirmationValidator, OracleCreativePromptRequestValidator } from "./oracle-creative-prompt-validator.js";

const DEFAULT_PROPOSAL_TTL_MS = 5 * 60_000;
type OracleCreativeProposalPlan = Omit<OracleCreativePromptProposal, "confirmationToken" | "expiresAt" | "proposalId">;

interface PreparedOracleCreativePlan {
  readonly brief?: MetodoVeloceContentProductionBrief;
  readonly plan: OracleCreativeProposalPlan;
  readonly selectedEvidencePackId?: string;
}

interface StoredOracleCreativeProposal {
  readonly confirmationToken: string;
  readonly expiresAt: string;
  readonly promptFingerprint: string;
  readonly proposalFingerprint: string;
  readonly request: Omit<OracleCreativePromptRequest, "prompt">;
}

export class OracleCreativePromptService {
  readonly #actorId: string;
  readonly #briefValidator = new MetodoVeloceContentProductionBriefValidator();
  readonly #clock: Clock;
  readonly #commands: LocalWorkflowCommandBoundary;
  readonly #confirmationValidator = new OracleCreativePromptConfirmationValidator();
  readonly #proposalTtlMs: number;
  readonly #proposals = new Map<string, StoredOracleCreativeProposal>();
  readonly #recordValidator = new MetodoVeloceContentProductionRecordValidator();
  readonly #repositories: RepositoryTransactionRunner;
  readonly #requestValidator = new OracleCreativePromptRequestValidator();
  readonly #workspaceId: string;

  public constructor(input: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly commands: LocalWorkflowCommandBoundary;
    readonly proposalTtlMs?: number;
    readonly repositories: RepositoryTransactionRunner;
    readonly workspaceId: string;
  }) {
    this.#actorId = input.actorId;
    this.#clock = input.clock;
    this.#commands = input.commands;
    this.#proposalTtlMs = boundedTtl(input.proposalTtlMs);
    this.#repositories = input.repositories;
    this.#workspaceId = input.workspaceId;
  }

  public async proposeForOperator(input: unknown): Promise<OracleCreativePromptProposal> {
    const request = validate(input, this.#requestValidator, "Oracle creative prompt request");
    this.#clearExpired();
    const prepared = await this.#prepare(request);
    const proposalId = `oracle-proposal-${randomUUID()}`;
    const confirmationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(this.#clock.now().getTime() + this.#proposalTtlMs).toISOString();
    const proposal = freeze({ ...prepared.plan, confirmationToken, expiresAt, proposalId });
    const safeRequest: Omit<OracleCreativePromptRequest, "prompt"> = {
      businessMissionId: request.businessMissionId,
      contractVersion: request.contractVersion,
      deliverables: request.deliverables,
      objective: request.objective,
      platforms: request.platforms,
      promptId: request.promptId,
    };
    this.#proposals.set(proposalId, freeze({ confirmationToken, expiresAt, promptFingerprint: proposal.promptFingerprint, proposalFingerprint: proposal.proposalFingerprint, request: safeRequest }));
    return proposal;
  }

  public async confirmForOperator(input: unknown): Promise<OracleCreativePromptReceipt> {
    const confirmation = validate(input, this.#confirmationValidator, "Oracle creative prompt confirmation");
    this.#clearExpired();
    const stored = this.#proposals.get(confirmation.proposalId);
    if (stored === undefined || !sameHex(stored.confirmationToken, confirmation.confirmationToken)) throw new RepositoryConflictError("ORACLE_CONFIRMATION_INVALID_OR_EXPIRED");
    this.#proposals.delete(confirmation.proposalId);
    const receivedPromptFingerprint = promptFingerprint(confirmation.prompt);
    if (!sameHex(stored.promptFingerprint, confirmation.promptFingerprint) || !sameHex(stored.promptFingerprint, receivedPromptFingerprint) || !sameHex(stored.proposalFingerprint, confirmation.proposalFingerprint)) throw new RepositoryConflictError("ORACLE_CONFIRMATION_BINDING_MISMATCH");
    const request: OracleCreativePromptRequest = { ...stored.request, prompt: confirmation.prompt };
    const prepared = await this.#prepare(request);
    if (!sameHex(stored.proposalFingerprint, prepared.plan.proposalFingerprint)) throw new RepositoryConflictError("ORACLE_CONTEXT_CHANGED_NEW_PROPOSAL_REQUIRED");
    if (!prepared.plan.canConfirm || prepared.brief === undefined || prepared.selectedEvidencePackId === undefined) throw new RepositoryConflictError(`ORACLE_PIPELINE_BLOCKED_${prepared.plan.reasonCode}`);
    const commandId = `oracle-prompt-${request.promptId}`;
    const command = await this.#commands.execute({
      actorId: this.#actorId,
      commandId,
      contractVersion: "1",
      input: { brief: prepared.brief, evidencePackId: prepared.selectedEvidencePackId, generationContextFingerprint: prepared.plan.proposalFingerprint },
      operation: "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK",
      workspaceId: this.#workspaceId,
    });
    const production = validate(command.result, this.#recordValidator, "Oracle content production result");
    if (production.generationContextFingerprint !== prepared.plan.proposalFingerprint) throw new RepositoryConflictError("ORACLE_DURABLE_CONTEXT_BINDING_MISMATCH");
    return receipt(commandId, command.replayed, prepared.plan, production);
  }

  async #prepare(request: OracleCreativePromptRequest): Promise<PreparedOracleCreativePlan> {
    const requestPromptFingerprint = promptFingerprint(request.prompt);
    const productionId = `oracle-${request.promptId}`;
    const capabilities = capabilitiesFor(request.deliverables);
    const dossier = await this.#repositories.transaction(({ businessMissions }) => businessMissions.getById(request.businessMissionId));
    if (dossier?.workspaceId !== this.#workspaceId || dossier.actorId !== this.#actorId) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "BUSINESS_MISSION_REQUIRED", "business-agent");
    if (dossier.status !== "APPROVED") return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "BUSINESS_MISSION_NOT_APPROVED", "business-agent", dossier);
    if (dossier.gates.some(({ status }) => status !== "PASSED")) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "BUSINESS_GATES_NOT_PASSED", "business-agent", dossier);
    if (dossier.evidencePackIds.length !== 3 || new Set(dossier.evidencePackIds).size !== 3) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "ORACLE_EVIDENCE_SET_INVALID", "research-agent", dossier);
    const packs = await this.#repositories.transaction(({ operationalPlanes }) => Promise.all(dossier.evidencePackIds.map((packId) => operationalPlanes.getEvidencePackById(packId))));
    if (packs.some((pack) => pack?.workspaceId !== this.#workspaceId || pack.actorId !== this.#actorId)) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "ORACLE_EVIDENCE_REQUIRED", "research-agent", dossier, ownedPacks(packs, this.#actorId, this.#workspaceId));
    const owned = packs as readonly EvidencePack[];
    if (owned.some(({ minFreshnessExpiresAt }) => Date.parse(minFreshnessExpiresAt) <= this.#clock.now().getTime())) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "ORACLE_EVIDENCE_STALE", "research-agent", dossier, owned);
    if (!dossierEvidenceMatches(dossier, owned)) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "ORACLE_EVIDENCE_FINGERPRINT_MISMATCH", "research-agent", dossier, owned);
    const selectedOpportunityId = dossier.selectedOpportunityId;
    const selected = selectedOpportunityId === undefined ? undefined : dossier.candidates.find(({ opportunityId }) => opportunityId === selectedOpportunityId);
    if (selected === undefined) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "BUSINESS_OPPORTUNITY_NOT_SELECTED", "business-agent", dossier, owned);
    if (!ORACLE_LOCAL_CONTENT_BUNDLE.every((deliverable) => request.deliverables.includes(deliverable))) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "SUPPORTED_LOCAL_DELIVERABLE_REQUIRED", "content-producer", dossier, owned, selected.evidencePackId);
    const selectedPack = owned.find(({ packId }) => packId === selected.evidencePackId);
    if (selectedPack === undefined) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "ORACLE_EVIDENCE_FINGERPRINT_MISMATCH", "research-agent", dossier, owned);
    const brief: MetodoVeloceContentProductionBrief = {
      audience: normalizedText(selected.customer || dossier.commercialPlan.offer.idealCustomer),
      callToAction: normalizedText(dossier.commercialPlan.acquisition.landingCopy.callToAction),
      contractVersion: "1",
      evidence: contentEvidence(selectedPack),
      language: "it",
      missionReference: dossier.mission.missionId,
      objective: request.objective,
      offer: normalizedText(dossier.commercialPlan.offer.positioning || dossier.commercialPlan.offer.promisedOutcome),
      productionId,
      topic: normalizedText(request.prompt),
    };
    if (!this.#briefValidator.validate(brief).ok) return blockedPlan(request, requestPromptFingerprint, productionId, capabilities, "FORGE_BRIEF_INVALID", "content-producer", dossier, owned, selectedPack.packId);
    const plan = readyPlan(request, requestPromptFingerprint, productionId, capabilities, dossier, owned, selectedPack.packId);
    return freeze({ brief, plan, selectedEvidencePackId: selectedPack.packId });
  }

  #clearExpired(): void {
    const now = this.#clock.now().getTime();
    for (const [proposalId, proposal] of this.#proposals) if (Date.parse(proposal.expiresAt) <= now) this.#proposals.delete(proposalId);
  }
}

function readyPlan(request: OracleCreativePromptRequest, requestPromptFingerprint: string, productionId: string, capabilities: readonly OracleCreativeCapability[], dossier: BusinessMissionDossier, packs: readonly EvidencePack[], selectedPackId: string): OracleCreativeProposalPlan {
  return plan({
    businessMission: missionSummary(dossier),
    canConfirm: true,
    capabilities,
    evidencePacks: packSummaries(packs, selectedPackId),
    productionId,
    promptFingerprint: requestPromptFingerprint,
    promptId: request.promptId,
    reasonCode: "READY_FOR_DRAFT_CONFIRMATION",
    route: route(),
    status: "READY_TO_CREATE_DRAFT",
  });
}

function blockedPlan(request: OracleCreativePromptRequest, requestPromptFingerprint: string, productionId: string, capabilities: readonly OracleCreativeCapability[], reasonCode: OracleCreativeReasonCode, blockedAgentId: OracleCreativeAgentStage["agentId"], dossier?: BusinessMissionDossier, packs: readonly EvidencePack[] = [], selectedPackId?: string): PreparedOracleCreativePlan {
  const value = plan({
    ...(dossier?.selectedOpportunityId === undefined ? {} : { businessMission: missionSummary(dossier) }),
    canConfirm: false,
    capabilities,
    evidencePacks: packSummaries(packs, selectedPackId),
    productionId,
    promptFingerprint: requestPromptFingerprint,
    promptId: request.promptId,
    reasonCode,
    route: route(blockedAgentId, reasonCode),
    status: "BLOCKED",
  });
  return freeze({ plan: value });
}

function plan(input: Omit<OracleCreativeProposalPlan, "contractVersion" | "estimatedCostUsd" | "externalActionsAllowed" | "providerCalls" | "proposalFingerprint" | "publication">): OracleCreativeProposalPlan {
  const base = freeze({ contractVersion: "1" as const, estimatedCostUsd: 0 as const, externalActionsAllowed: false as const, providerCalls: 0 as const, publication: "LOCKED" as const, ...input });
  return freeze({ ...base, proposalFingerprint: fingerprint(base) });
}

function capabilitiesFor(deliverables: readonly OracleCreativeDeliverable[]): readonly OracleCreativeCapability[] {
  return freeze(deliverables.map((deliverable): OracleCreativeCapability => {
    if (deliverable === "IMAGE_MASTER") return { deliverable, providerCalls: 0, reasonCode: "IMAGE_GENERATION_SEPARATE_AUTHORIZATION_REQUIRED", status: "SEPARATE_AUTHORIZATION_REQUIRED" };
    if (deliverable === "VIDEO_RENDER") return { deliverable, providerCalls: 0, reasonCode: "VIDEO_PROVIDER_NOT_CONFIGURED", status: "DISABLED_PROVIDER_NOT_CONFIGURED" };
    return { deliverable, providerCalls: 0, reasonCode: "LOCAL_GENERATION_READY", status: "READY_LOCAL" };
  }));
}

function route(blockedAgentId?: OracleCreativeAgentStage["agentId"], reasonCode = "DEPENDENCY_READY", completed = false): readonly OracleCreativeAgentStage[] {
  const definitions = [
    ["onlyway-assistant", "NEXUS"],
    ["research-agent", "ORACLE"],
    ["business-agent", "VECTOR"],
    ["content-director", "PRISM"],
    ["content-producer", "FORGE"],
  ] as const;
  const blockedIndex = blockedAgentId === undefined ? -1 : definitions.findIndex(([agentId]) => agentId === blockedAgentId);
  return freeze(definitions.map(([agentId, callSign], index): OracleCreativeAgentStage => {
    const status: OracleCreativeAgentStage["status"] = completed
      ? "COMPLETED"
      : blockedIndex === -1
        ? index === definitions.length - 1 ? "QUEUED" : "COMPLETED"
        : index < blockedIndex ? "COMPLETED" : index === blockedIndex ? "BLOCKED" : "IDLE";
    return {
      agentId,
      callSign,
      reasonCode: blockedIndex === -1 || index < blockedIndex ? "DEPENDENCY_READY" : index === blockedIndex ? reasonCode : "UPSTREAM_DEPENDENCY_BLOCKED",
      status,
    };
  }));
}

function missionSummary(dossier: BusinessMissionDossier): NonNullable<OracleCreativePromptProposal["businessMission"]> {
  if (dossier.selectedOpportunityId === undefined) throw new RepositoryValidationError("Oracle Business Mission selected opportunity is invalid");
  return freeze({ dossierFingerprint: dossier.fingerprint, missionId: dossier.mission.missionId, selectedOpportunityId: dossier.selectedOpportunityId, version: dossier.version });
}

function packSummaries(packs: readonly EvidencePack[], selectedPackId?: string): OracleCreativePromptProposal["evidencePacks"] {
  return freeze(packs.map((pack) => ({ fingerprint: pack.fingerprint, minFreshnessExpiresAt: pack.minFreshnessExpiresAt, packId: pack.packId, selectedForContent: pack.packId === selectedPackId })));
}

function dossierEvidenceMatches(dossier: BusinessMissionDossier, packs: readonly EvidencePack[]): boolean {
  if (dossier.candidates.length !== 3 || dossier.scorecards.length !== 3) return false;
  const expectedIds = new Set(dossier.evidencePackIds);
  if (packs.some(({ packId }) => !expectedIds.has(packId))) return false;
  return dossier.candidates.every((candidate) => {
    const pack = packs.find(({ packId }) => packId === candidate.evidencePackId);
    const scorecard = dossier.scorecards.find(({ opportunityId }) => opportunityId === candidate.opportunityId);
    return pack !== undefined && scorecard !== undefined && scorecard.complete && scorecard.evidencePackId === pack.packId && scorecard.evidencePackFingerprint === pack.fingerprint && evidencePackFingerprint(pack) === pack.fingerprint;
  });
}

function contentEvidence(pack: EvidencePack): readonly ContentEvidence[] {
  return freeze(pack.evidence.map((item) => {
    const claim = item.claimMappings[0];
    if (claim === undefined) throw new RepositoryConflictError("ORACLE_EVIDENCE_CLAIM_REQUIRED");
    return { evidenceId: item.evidenceId, limitations: item.limitations, sourceRef: item.source.sourceId, statement: claim.statement };
  }));
}

function receipt(commandId: string, replayed: boolean, planValue: OracleCreativeProposalPlan, production: MetodoVeloceContentProductionRecord): OracleCreativePromptReceipt {
  const ready = production.status === "PENDING_FABIO_APPROVAL";
  const deferred = planValue.capabilities.filter(({ status }) => status !== "READY_LOCAL");
  const completed = planValue.capabilities.filter(({ status }) => status === "READY_LOCAL").map(({ deliverable }) => deliverable);
  const businessMission = planValue.businessMission;
  if (businessMission === undefined) throw new RepositoryConflictError("ORACLE_DURABLE_CONTEXT_BINDING_MISMATCH");
  return freeze({
    businessMission,
    commandId,
    completedDeliverables: completed,
    contractVersion: "1",
    deferredDeliverables: deferred,
    estimatedCostUsd: 0,
    externalActionsAllowed: false,
    evidencePacks: planValue.evidencePacks,
    gates: { cost: "PASS", quality: ready ? "PASS" : "BLOCKED", risk: ready ? "PASS" : "BLOCKED", visual: "NOT_RUN_RENDERED_MEDIA_REQUIRED" },
    packageFingerprint: fingerprint(production.package),
    generationContextFingerprint: planValue.proposalFingerprint,
    productionId: production.productionId,
    promptFingerprint: planValue.promptFingerprint,
    providerCalls: 0,
    publication: "LOCKED",
    reasonCode: ready ? "READY_FOR_FABIO_REVIEW" : "CONTENT_RISK_GATE_BLOCKED",
    replayed,
    route: ready ? route(undefined, "DEPENDENCY_READY", true) : route("content-producer", "CONTENT_RISK_GATE_BLOCKED"),
    status: ready ? "READY_FOR_FABIO_REVIEW" : "BLOCKED",
    unauthorizedExternalEffectOccurred: false,
  });
}

function ownedPacks(packs: readonly (EvidencePack | undefined)[], actorId: string, workspaceId: string): readonly EvidencePack[] { return packs.filter((pack): pack is EvidencePack => pack?.actorId === actorId && pack.workspaceId === workspaceId); }
function promptFingerprint(prompt: string): string { return createHash("sha256").update(prompt.trim().replace(/\s+/gu, " "), "utf8").digest("hex"); }
function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function normalizedText(value: string): string { return value.trim().replace(/\s+/gu, " "); }
function sameHex(expected: string, received: string): boolean { if (!/^[a-f0-9]{64}$/u.test(received)) return false; const trusted = Buffer.from(expected, "hex"); const candidate = Buffer.from(received, "hex"); return trusted.length === candidate.length && timingSafeEqual(trusted, candidate); }
function boundedTtl(value: number | undefined): number { const ttl = value ?? DEFAULT_PROPOSAL_TTL_MS; if (!Number.isSafeInteger(ttl) || ttl < 1_000 || ttl > 15 * 60_000) throw new RepositoryValidationError("Oracle creative proposal TTL is invalid"); return ttl; }
function validate<T>(value: unknown, validator: { validate(candidate: unknown): { readonly ok: boolean; readonly value?: T; readonly issues?: readonly unknown[] } }, label: string): T { const checked = validator.validate(value); if (!checked.ok || checked.value === undefined) throw new RepositoryValidationError(`${label} failed validation`, { issueCount: checked.issues?.length ?? 1 }); return checked.value; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
