import { RepositoryValidationError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import { REFERENCE_VAULT_LIMITS, type ReferenceAsset } from "../reference-vault/reference-vault.js";
import type { ReferenceVaultTransactionRunner } from "../reference-vault/reference-vault-repository.js";
import { buildCommandCenterReferenceVaultView, type CommandCenterReferenceVaultView } from "./reference-vault-view.js";

const COMMAND_CENTER_REFERENCE_LIMIT = 500;
const COMMAND_CENTER_REFERENCE_SCAN_LIMIT = REFERENCE_VAULT_LIMITS.maxRecordScan;
const COMMAND_CENTER_CONTEXT_LIMIT = 50;
const COMMAND_CENTER_CONTEXT_SCAN_LIMIT = COMMAND_CENTER_CONTEXT_LIMIT + 1;

export class ReferenceVaultCommandCenterQuery {
  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly repositories: ReferenceVaultTransactionRunner;
    readonly workspaceId: string;
  }) {}

  public snapshot(): Promise<CommandCenterReferenceVaultView> {
    const identity = { actorId: this.dependencies.actorId, workspaceId: this.dependencies.workspaceId };
    return this.dependencies.repositories.transaction(async (repository) => {
      const [assets, businessContexts, collections, decisions, fingerprints, outcomes] = await Promise.all([
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_REFERENCE_SCAN_LIMIT, type: "REFERENCE_ASSET" }),
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_CONTEXT_SCAN_LIMIT, type: "BUSINESS_CONTEXT" }),
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_REFERENCE_SCAN_LIMIT, type: "REFERENCE_COLLECTION" }),
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_REFERENCE_SCAN_LIMIT, type: "CREATIVE_DECISION" }),
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_CONTEXT_SCAN_LIMIT, type: "CREATIVE_FINGERPRINT" }),
        repository.listRecords({ ...identity, limit: COMMAND_CENTER_REFERENCE_SCAN_LIMIT, type: "OUTCOME_LINK" }),
      ]);
      const records = [...assets, ...businessContexts, ...collections, ...decisions, ...fingerprints, ...outcomes];
      if (records.some((record) => record.actorId !== identity.actorId || record.workspaceId !== identity.workspaceId)) {
        throw new RepositoryValidationError("Reference Vault Command Center query returned cross-identity data");
      }
      const boundedAssets = assets.slice(0, COMMAND_CENTER_REFERENCE_LIMIT);
      const casUnavailableAssetKeys = new Set<string>();
      for (const asset of latestAssets(boundedAssets)) {
        const blob = await repository.getBlob(identity, asset.sha256);
        if (blob?.sha256 !== asset.sha256 || blob.byteLength !== asset.byteLength || blob.mimeType !== asset.mimeType) {
          casUnavailableAssetKeys.add(assetKey(asset));
        }
      }
      const coverage = [assets, collections, decisions, outcomes].some((items) => items.length > COMMAND_CENTER_REFERENCE_LIMIT)
        || businessContexts.length > COMMAND_CENTER_CONTEXT_LIMIT
        || fingerprints.length > COMMAND_CENTER_CONTEXT_LIMIT
        ? "LIMIT_REACHED" as const
        : "COMPLETE" as const;
      return buildCommandCenterReferenceVaultView({
        actorId: identity.actorId,
        assets: boundedAssets,
        businessContexts: businessContexts.slice(0, COMMAND_CENTER_CONTEXT_LIMIT),
        casUnavailableAssetKeys,
        collections: collections.slice(0, COMMAND_CENTER_REFERENCE_LIMIT),
        coverage,
        decisions: decisions.slice(0, COMMAND_CENTER_REFERENCE_LIMIT),
        fingerprints: fingerprints.slice(0, COMMAND_CENTER_CONTEXT_LIMIT),
        now: this.dependencies.clock.now(),
        outcomes: outcomes.slice(0, COMMAND_CENTER_REFERENCE_LIMIT),
        workspaceId: identity.workspaceId,
      });
    });
  }
}

function latestAssets(records: readonly ReferenceAsset[]): readonly ReferenceAsset[] {
  const current = new Map<string, ReferenceAsset>();
  for (const record of records) {
    const existing = current.get(record.assetId);
    if (existing === undefined || record.version > existing.version) current.set(record.assetId, record);
  }
  return [...current.values()];
}

function assetKey(asset: Pick<ReferenceAsset, "assetId" | "fingerprint" | "version">): string {
  return `${asset.assetId}:${String(asset.version)}:${asset.fingerprint}`;
}
