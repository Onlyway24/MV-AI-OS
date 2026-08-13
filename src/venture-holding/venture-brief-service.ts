import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { FounderPortfolioBrief } from "./venture-domain.js";
import type { VentureHoldingTransactionRunner } from "./venture-repository.js";

export type FounderPortfolioBriefRecord = FounderPortfolioBrief;
export type VentureBriefKind = FounderPortfolioBrief["kind"];

/** Read-only projection over the canonical append-only Venture Holding aggregate. */
export class VentureBriefService {
  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly repositories: VentureHoldingTransactionRunner;
    readonly workspaceId: string;
  }) {
    assertId(dependencies.actorId, "Venture brief actor");
    assertId(dependencies.workspaceId, "Venture brief workspace");
  }

  public readLatest(kind: VentureBriefKind): Promise<FounderPortfolioBrief> {
    return this.dependencies.repositories.transaction(async (repository) => {
      const records = await repository.listRecords({ actorId: this.dependencies.actorId, limit: 250, type: "FOUNDER_PORTFOLIO_BRIEF", workspaceId: this.dependencies.workspaceId });
      const latest = records.filter((record) => record.kind === kind).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || right.version - left.version)[0];
      if (latest === undefined) throw new RepositoryConflictError("Venture brief is unavailable");
      return latest;
    });
  }

  public inspect(briefId: string): Promise<FounderPortfolioBrief> {
    assertId(briefId, "Venture brief ID");
    return this.dependencies.repositories.transaction(async (repository) => {
      const value = await repository.getRecord({ actorId: this.dependencies.actorId, entityId: briefId, type: "FOUNDER_PORTFOLIO_BRIEF", workspaceId: this.dependencies.workspaceId });
      if (value?.actorId !== this.dependencies.actorId || value.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Venture brief is unavailable");
      return value;
    });
  }
}

function assertId(value: string, label: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value)) throw new RepositoryValidationError(`${label} is invalid`); }
