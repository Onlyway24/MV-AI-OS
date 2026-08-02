import { createHash } from "node:crypto";

import type {
  AgentCompanyWorkday,
  AgentCompanyWorkdayInput,
} from "../agent-company/operational-agent-company.js";
import {
  AgentCompanyWorkdayInputValidator,
  AgentCompanyWorkdayValidator,
} from "../agent-company/operational-agent-company-validator.js";
import type { SourceRegistrationRequest } from "../operational-planes/operational-plane.js";
import { SourceRegistrationRequestValidator } from "../operational-planes/operational-plane-validator.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type {
  AuthorizedResearchMission,
  AuthorizedResearchMissionInput,
} from "../research/authorized-research.js";
import {
  AuthorizedResearchMissionInputValidator,
  AuthorizedResearchMissionValidator,
} from "../research/authorized-research-validator.js";
import type {
  LocalWorkflowCommandBoundary,
  LocalWorkflowOperation,
} from "../runtime/local-workflow-command.js";

export const MAX_PRIVATE_PRODUCTION_INTAKE_BYTES = 524_288;

export interface PrivateProductionIntake {
  readonly contractVersion: "1";
  readonly intakeId: string;
  readonly researchMission: AuthorizedResearchMissionInput;
  readonly safety: {
    readonly externalActionsAllowed: false;
    readonly maxProviderCalls: 0;
    readonly maxSpendCents: 0;
    readonly publicationEnabled: false;
  };
  readonly sources: readonly SourceRegistrationRequest[];
  readonly workday: AgentCompanyWorkdayInput;
}

export interface PrivateProductionStartResult {
  readonly completedTaskCount: number;
  readonly contractVersion: "1";
  readonly evidenceCount: number;
  readonly externalActionsExecuted: false;
  readonly intakeId: string;
  readonly kind: "PRIVATE_PRODUCTION_START";
  readonly nextAction: string;
  readonly packCount: number;
  readonly providerCallsExecuted: 0;
  readonly publicationLocked: true;
  readonly researchMissionId: string;
  readonly researchStatus: AuthorizedResearchMission["status"];
  readonly sourceCount: number;
  readonly spendCents: 0;
  readonly status: "NOT_READY" | "READY";
  readonly workdayId: string;
  readonly workdayStatus: AgentCompanyWorkday["status"] | "NOT_STARTED";
  readonly [key: string]: unknown;
}

interface PrivateProductionStartDependencies {
  readonly actorId: string;
  readonly commands: Pick<LocalWorkflowCommandBoundary, "execute">;
  readonly repositories: RepositoryTransactionRunner;
  readonly workspaceId: string;
}

export class PrivateProductionIntakeValidator {
  readonly #research = new AuthorizedResearchMissionInputValidator();
  readonly #source = new SourceRegistrationRequestValidator();
  readonly #workday = new AgentCompanyWorkdayInputValidator();

  public validate(value: unknown): PrivateProductionIntake {
    if (!record(value) || !exactKeys(value, [
      "contractVersion",
      "intakeId",
      "researchMission",
      "safety",
      "sources",
      "workday",
    ]) || value.contractVersion !== "1" || !identifier(value.intakeId)) {
      throw new Error("Private Production intake envelope is invalid");
    }
    if (!safety(value.safety)) {
      throw new Error("Private Production intake safety policy is invalid");
    }
    if (
      !Array.isArray(value.sources) ||
      value.sources.length < 1 ||
      value.sources.length > 18 ||
      !value.sources.every((source) => this.#source.validate(source).ok)
    ) {
      throw new Error("Private Production intake sources are invalid");
    }
    const sourceIds = value.sources.map((source) =>
      (source as SourceRegistrationRequest).sourceId
    );
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error("Private Production intake source IDs must be unique");
    }
    const research = this.#research.validate(value.researchMission);
    const workday = this.#workday.validate(value.workday);
    if (!research.ok || !workday.ok) {
      throw new Error("Private Production intake execution input is invalid");
    }
    const intake = structuredClone(value) as unknown as PrivateProductionIntake;
    this.#crossValidate(intake);
    return deepFreeze(intake);
  }

  #crossValidate(intake: PrivateProductionIntake): void {
    if (
      intake.workday.maxBudgetCents !== 0 ||
      intake.workday.researchMissionId !== intake.researchMission.missionId ||
      intake.workday.businessMission.mission.maxCapitalCents !== 0 ||
      intake.workday.businessMission.commercialPlan.validation.some(
        ({ maxCostCents }) => maxCostCents !== 0,
      )
    ) {
      throw new Error("Private Production intake must remain zero-budget and research-bound");
    }
    const sourceById = new Map(intake.sources.map((source) => [source.sourceId, source]));
    const usedSourceIds = new Set(intake.researchMission.targets.map(({ sourceId }) => sourceId));
    if (
      sourceById.size !== usedSourceIds.size ||
      [...sourceById.keys()].some((sourceId) => !usedSourceIds.has(sourceId))
    ) {
      throw new Error("Private Production intake must register exactly the sources it acquires");
    }
    const claimById = new Map(intake.researchMission.claims.map((claim) => [claim.claimId, claim]));
    for (const target of intake.researchMission.targets) {
      const source = sourceById.get(target.sourceId);
      if (source === undefined) {
        throw new Error("Private Production research source is unavailable");
      }
      if (
        source.status !== "AUTHORIZED" ||
        source.category === "FORBIDDEN" ||
        !source.publicCitationAllowed ||
        !isWithinCanonicalSource(target.url, source.canonicalReference) ||
        target.claimIds.some((claimId) => {
          const claim = claimById.get(claimId);
          return claim === undefined || !source.permittedRiskDomains.includes(claim.riskDomain);
        })
      ) {
        throw new Error("Private Production research target is outside its authorized source policy");
      }
    }
    const researchPacks = canonicalPacks(intake.researchMission.packs);
    const workdayPacks = canonicalPacks(intake.workday.researchPacks);
    if (researchPacks !== workdayPacks || intake.researchMission.packs.length !== 3) {
      throw new Error("Private Production workday must use exactly the three acquired Evidence Packs");
    }
    const packEvidence = new Map(intake.researchMission.packs.map((pack) => [pack.packId, new Set(pack.evidenceIds)]));
    const opportunityByPack = new Map(intake.researchMission.packs.map((pack) => [pack.packId, pack.opportunityId]));
    const targetByEvidence = new Map(intake.researchMission.targets.map((target) => [target.evidenceId, target]));
    const candidatePackIds = new Set(intake.workday.businessMission.candidates.map(({ evidencePackId }) => evidencePackId));
    if (
      candidatePackIds.size !== packEvidence.size ||
      [...packEvidence.keys()].some((packId) => !candidatePackIds.has(packId))
    ) {
      throw new Error("Private Production candidates must cover the three acquired Evidence Packs");
    }
    for (const candidate of intake.workday.businessMission.candidates) {
      const allowedEvidence = packEvidence.get(candidate.evidencePackId);
      if (
        allowedEvidence === undefined ||
        opportunityByPack.get(candidate.evidencePackId) !== candidate.opportunityId ||
        !candidate.scoreInputs.some(({ dataKind }) => dataKind === "REAL") ||
        candidate.scoreInputs.some(({ evidenceId }) =>
          evidenceId !== undefined && !allowedEvidence.has(evidenceId)
        )
      ) {
        throw new Error("Private Production business score is not bound to its Evidence Pack");
      }
    }
    const contentEvidenceIds = packEvidence.get(intake.workday.content.evidencePackId);
    if (contentEvidenceIds === undefined) {
      throw new Error("Private Production content Evidence Pack is unavailable");
    }
    const declaredContentEvidenceIds = new Set(intake.workday.content.brief.evidence.map(({ evidenceId }) => evidenceId));
    if (
      declaredContentEvidenceIds.size !== contentEvidenceIds.size ||
      [...contentEvidenceIds].some((evidenceId) => !declaredContentEvidenceIds.has(evidenceId)) ||
      intake.workday.content.brief.evidence.some((item) => {
        const target = targetByEvidence.get(item.evidenceId);
        return !contentEvidenceIds.has(item.evidenceId) ||
          target?.sourceId !== item.sourceRef ||
          !target.claimIds.some((claimId) => claimById.get(claimId)?.statement === item.statement);
      })
    ) {
      throw new Error("Private Production content is not exactly claim-bound to its Evidence Pack");
    }
  }
}

export class PrivateProductionStartService {
  readonly #validator = new PrivateProductionIntakeValidator();

  public constructor(private readonly dependencies: PrivateProductionStartDependencies) {}

  public async run(value: unknown): Promise<PrivateProductionStartResult> {
    const intake = this.#validator.validate(value);
    await this.#lockPublication(intake.intakeId);
    for (const source of intake.sources) {
      await this.#ensureSource(intake.intakeId, source);
    }
    const researchResponse = await this.#execute(
      intake.intakeId,
      "research",
      "RUN_AUTHORIZED_RESEARCH_MISSION",
      { mission: intake.researchMission },
    );
    const researchValidation = new AuthorizedResearchMissionValidator().validate(
      researchResponse.result,
    );
    if (!researchValidation.ok) {
      throw new Error("Private Production research result is invalid");
    }
    const research = researchValidation.value;
    if (research.status !== "READY") {
      await this.#assertPublicationLocked();
      return result(intake, research, undefined);
    }
    const workdayResponse = await this.#execute(
      intake.intakeId,
      "workday",
      "RUN_AGENT_COMPANY_WORKDAY",
      { workday: intake.workday },
    );
    const workdayValidation = new AgentCompanyWorkdayValidator().validate(
      workdayResponse.result,
    );
    if (!workdayValidation.ok) {
      throw new Error("Private Production workday result is invalid");
    }
    await this.#assertPublicationLocked();
    return result(intake, research, workdayValidation.value);
  }

  async #lockPublication(intakeId: string): Promise<void> {
    const current = await this.dependencies.repositories.transaction(
      ({ operationalPlanes }) => operationalPlanes.getPublicationKillSwitch(
        this.dependencies.workspaceId,
      ),
    );
    if (current?.enabled === true) return;
    const response = await this.#execute(
      intakeId,
      `publication-lock-${String(current?.version ?? 0)}`,
      "SET_PUBLICATION_KILL_SWITCH",
      { enabled: true, expectedVersion: current?.version ?? 0 },
    );
    if (!record(response.result) || response.result.enabled !== true) {
      throw new Error("Private Production publication lock was not established");
    }
  }

  async #ensureSource(
    intakeId: string,
    source: SourceRegistrationRequest,
  ): Promise<void> {
    const existing = await this.dependencies.repositories.transaction(
      ({ operationalPlanes }) => operationalPlanes.getSourceById(source.sourceId),
    );
    if (existing !== undefined) {
      if (
        existing.actorId !== this.dependencies.actorId ||
        existing.workspaceId !== this.dependencies.workspaceId ||
        sourceRegistrationFingerprint(existing) !== sourceRegistrationFingerprint(source)
      ) {
        throw new Error("Private Production source conflicts with durable registry state");
      }
      return;
    }
    await this.#execute(
      intakeId,
      `source-${source.sourceId}`,
      "REGISTER_EVIDENCE_SOURCE",
      source as unknown as Readonly<Record<string, unknown>>,
    );
  }

  async #assertPublicationLocked(): Promise<void> {
    const current = await this.dependencies.repositories.transaction(
      ({ operationalPlanes }) => operationalPlanes.getPublicationKillSwitch(
        this.dependencies.workspaceId,
      ),
    );
    if (current?.enabled !== true) {
      throw new Error("Private Production publication lock changed during execution");
    }
  }

  #execute(
    intakeId: string,
    step: string,
    operation: LocalWorkflowOperation,
    input: Readonly<Record<string, unknown>>,
  ) {
    return this.dependencies.commands.execute({
      actorId: this.dependencies.actorId,
      commandId: commandId(intakeId, step),
      contractVersion: "1",
      input,
      operation,
      workspaceId: this.dependencies.workspaceId,
    });
  }
}

function result(
  intake: PrivateProductionIntake,
  research: AuthorizedResearchMission,
  workday: AgentCompanyWorkday | undefined,
): PrivateProductionStartResult {
  const completedTaskCount = workday?.tasks.filter(({ status }) => status === "COMPLETED").length ?? 0;
  const ready = research.status === "READY" && workday?.status === "AWAITING_FABIO";
  return deepFreeze({
    completedTaskCount,
    contractVersion: "1",
    evidenceCount: research.evidenceIds.length,
    externalActionsExecuted: false,
    intakeId: intake.intakeId,
    kind: "PRIVATE_PRODUCTION_START",
    nextAction: ready
      ? "Fabio reviews the durable Business Mission and internal content package; publication remains locked."
      : research.status !== "READY"
        ? "Resolve the attributable research blockers with a new versioned intake; no downstream work was started."
        : "Resolve the durable Agent Company blockers; no external action was executed.",
    packCount: research.packIds.length,
    providerCallsExecuted: 0,
    publicationLocked: true,
    researchMissionId: research.input.missionId,
    researchStatus: research.status,
    sourceCount: intake.sources.length,
    spendCents: 0,
    status: ready ? "READY" : "NOT_READY",
    workdayId: intake.workday.workdayId,
    workdayStatus: workday?.status ?? "NOT_STARTED",
  });
}

function canonicalPacks(packs: readonly { readonly evidenceIds: readonly string[]; readonly packId: string }[]): string {
  return JSON.stringify([...packs]
    .map(({ evidenceIds, packId }) => ({ evidenceIds: [...evidenceIds].sort(), packId }))
    .sort((left, right) => left.packId.localeCompare(right.packId)));
}

function isWithinCanonicalSource(targetValue: string, canonicalValue: string): boolean {
  try {
    const target = new URL(targetValue);
    const canonical = new URL(canonicalValue);
    const canonicalPath = canonical.pathname.endsWith("/")
      ? canonical.pathname
      : `${canonical.pathname}/`;
    return target.protocol === "https:" &&
      canonical.protocol === "https:" &&
      canonical.username === "" &&
      canonical.password === "" &&
      canonical.search === "" &&
      canonical.hash === "" &&
      target.origin === canonical.origin &&
      (target.pathname === canonical.pathname || target.pathname.startsWith(canonicalPath));
  } catch {
    return false;
  }
}

function commandId(intakeId: string, step: string): string {
  const fingerprint = createHash("sha256")
    .update(`${intakeId}\n${step}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `production-start-${fingerprint}`;
}

function sourceRegistrationFingerprint(source: SourceRegistrationRequest): string {
  return createHash("sha256").update(JSON.stringify({
    canonicalReference: source.canonicalReference,
    category: source.category,
    maxFreshnessDays: source.maxFreshnessDays,
    name: source.name,
    permittedRiskDomains: [...source.permittedRiskDomains],
    publicCitationAllowed: source.publicCitationAllowed,
    reliability: source.reliability,
    requiresSecondSource: source.requiresSecondSource,
    sourceId: source.sourceId,
    status: source.status,
  }), "utf8").digest("hex");
}

function safety(value: unknown): boolean {
  return record(value) &&
    exactKeys(value, [
      "externalActionsAllowed",
      "maxProviderCalls",
      "maxSpendCents",
      "publicationEnabled",
    ]) &&
    value.externalActionsAllowed === false &&
    value.maxProviderCalls === 0 &&
    value.maxSpendCents === 0 &&
    value.publicationEnabled === false;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9@._:-]{1,128}$/u.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
