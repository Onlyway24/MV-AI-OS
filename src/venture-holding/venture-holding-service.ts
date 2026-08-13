import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import { OnlywayVenture001Factory, type OnlywayVenture001Package } from "./onlyway-venture-001.js";
import { VentureCommandBoundary, ventureCommandFingerprint, type VentureCommandResult } from "./venture-command-boundary.js";
import type { VentureCommand } from "./venture-domain.js";
import type { VentureHoldingTransactionRunner } from "./venture-repository.js";

export interface Venture001RunResult {
  readonly package: OnlywayVenture001Package;
  readonly command: VentureCommandResult;
  readonly evidencePackCount: number;
  readonly externalEffects: "ZERO";
}

export class VentureHoldingService {
  readonly #boundary: VentureCommandBoundary;
  readonly #factory = new OnlywayVenture001Factory();

  public constructor(private readonly dependencies: { readonly actorId: string; readonly clock: Clock; readonly coreRepositories: RepositoryTransactionRunner; readonly repositories: VentureHoldingTransactionRunner; readonly workspaceId: string }) {
    this.#boundary = new VentureCommandBoundary({ actorId: dependencies.actorId, clock: dependencies.clock, repositories: dependencies.repositories, workspaceId: dependencies.workspaceId });
  }

  public async runOnlywayVenture001(): Promise<Venture001RunResult> {
    const evidencePacks = await this.dependencies.coreRepositories.transaction(({ operationalPlanes }) => operationalPlanes.listEvidencePacksByWorkspaceId(this.dependencies.workspaceId, 100));
    const ownedPacks = evidencePacks.filter(({ actorId, workspaceId }) => actorId === this.dependencies.actorId && workspaceId === this.dependencies.workspaceId);
    if (ownedPacks.length !== evidencePacks.length) throw new RepositoryValidationError("Venture Evidence Pack query returned cross-identity data");
    const package_ = this.#factory.create({ actorId: this.dependencies.actorId, evidencePacks: ownedPacks, now: this.dependencies.clock.now().toISOString(), workspaceId: this.dependencies.workspaceId });
    const recordsFingerprint = canonicalSha256(package_.records.map(({ type, record, expectedPreviousVersion }) => ({ type, record, ...(expectedPreviousVersion === undefined ? {} : { expectedPreviousVersion }) })));
    const base = {
      actorId: this.dependencies.actorId,
      commandId: "onlyway-venture-001-run-v1",
      contractVersion: "1" as const,
      expectedVersion: "NOT_EXISTS" as const,
      idempotencyKey: "onlyway-venture-001-run-v1",
      input: Object.freeze({ recordsFingerprint }),
      operation: "RUN_VENTURE_001" as const,
      targetFingerprint: "NOT_AVAILABLE" as const,
      targetId: package_.policy.policyId,
      targetType: "FOUNDER_VENTURE_POLICY" as const,
      workspaceId: this.dependencies.workspaceId,
    };
    const command: VentureCommand = Object.freeze({ ...base, requestFingerprint: ventureCommandFingerprint(base) });
    const result = await this.#boundary.execute(command, package_.records);
    return Object.freeze({ command: result, evidencePackCount: ownedPacks.length, externalEffects: "ZERO", package: package_ });
  }
}
