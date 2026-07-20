import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryConflictError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import type {
  ReferenceBrief,
  ReferenceBriefCommandSummary,
  ReferenceVaultCommandEntityRef,
  ReferenceVaultCommandResponse,
  ReferenceVaultOperation,
} from "./reference-vault.js";
import type { ReferenceVaultIdentity, ReferenceVaultRepository, ReferenceVaultTransactionRunner } from "./reference-vault-repository.js";
import {
  REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION,
  REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE,
  type ReferenceVaultApprovalAuthority,
} from "./reference-vault-approval-authority.js";
import { ReferenceVaultService } from "./reference-vault-service.js";
import {
  deepFreezeReference,
  referenceFingerprint,
  ReferenceVaultAuditEventValidator,
  ReferenceVaultCommandReceiptValidator,
  ReferenceVaultCommandResultValidator,
  ReferenceVaultCommandResponseValidator,
  ReferenceVaultCommandValidator,
} from "./reference-vault-validator.js";

export interface ReferenceVaultCommandBoundaryDependencies {
  readonly actorId: string;
  readonly approvalAuthority?: ReferenceVaultApprovalAuthority;
  readonly workspaceId: string;
  readonly clock: Clock;
  readonly repositories: ReferenceVaultTransactionRunner;
}

export class ReferenceVaultCommandBoundary {
  readonly #service: ReferenceVaultService;
  readonly #commandValidator = new ReferenceVaultCommandValidator();
  readonly #responseValidator = new ReferenceVaultCommandResponseValidator();
  readonly #receiptValidator = new ReferenceVaultCommandReceiptValidator();
  readonly #resultValidator = new ReferenceVaultCommandResultValidator();
  readonly #auditValidator = new ReferenceVaultAuditEventValidator();

  public constructor(private readonly dependencies: ReferenceVaultCommandBoundaryDependencies) {
    if (dependencies.approvalAuthority !== undefined && !validApprovalAuthority(dependencies.approvalAuthority, dependencies.workspaceId)) throw new RepositoryConflictError("Reference Vault approval authority confirmation is invalid");
    this.#service = new ReferenceVaultService(dependencies);
  }

  public execute(candidate: unknown): Promise<ReferenceVaultCommandResponse> {
    const command = validate(candidate, this.#commandValidator, "Reference Vault command");
    if (command.actorId !== this.dependencies.actorId || command.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Reference Vault command identity is unauthorized");
    if (AUTHORITY_OPERATIONS.has(command.operation) && !isConfirmedApprovalAuthority(this.dependencies.approvalAuthority, command.actorId, command.workspaceId)) throw new RepositoryConflictError("Reference Vault command requires explicit configured Fabio approval authority confirmation");
    const identity = { actorId: command.actorId, workspaceId: command.workspaceId };
    const requestFingerprint = canonicalSha256(command);
    return this.dependencies.repositories.transaction(async (repository) => {
      const [byIdempotency, byCommandId] = await Promise.all([
        repository.getCommandReceipt(identity, command.idempotencyKey),
        repository.getCommandReceiptByCommandId(identity, command.commandId),
      ]);
      const existing = byIdempotency ?? byCommandId;
      if (existing !== undefined) {
        if (byIdempotency !== undefined && byCommandId !== undefined && byIdempotency.fingerprint !== byCommandId.fingerprint) throw new RepositoryConflictError("Reference Vault command identity resolves to conflicting receipts");
        if (existing.requestFingerprint !== requestFingerprint || existing.idempotencyKeyFingerprint !== canonicalSha256(command.idempotencyKey) || existing.commandId !== command.commandId) throw new RepositoryConflictError("Reference Vault idempotency key or command ID conflicts with prior input");
        const replayResult = await repository.getRecord({ ...identity, entityId: existing.resultRecordId, type: "REFERENCE_COMMAND_RESULT" });
        if (replayResult?.commandId !== command.commandId || replayResult.operation !== command.operation || replayResult.resultFingerprint !== existing.resultFingerprint) throw new RepositoryConflictError("Reference Vault replay result is unavailable or inconsistent");
        const replayedResult = replayResult.replay.mode === "REDACTED_SUMMARY"
          ? replayResult.replay.result
          : await loadAuthoritativeResult(repository, identity, replayResult.replay.entityRef, existing.resultFingerprint);
        return validate({
          commandId: command.commandId,
          contractVersion: "1" as const,
          nextAction: nextAction(command.operation),
          operation: command.operation,
          replayed: true,
          result: replayedResult,
          status: "ok" as const,
          unauthorizedExternalEffectOccurred: false as const,
        }, this.#responseValidator, "Reference Vault replay response");
      }
      const result = await this.#service.executeInTransaction(repository, command);
      const responseResult = redactReadResult(command.operation, result);
      const response = validate({
        commandId: command.commandId,
        contractVersion: "1" as const,
        nextAction: nextAction(command.operation),
        operation: command.operation,
        replayed: false,
        result: responseResult,
        status: "ok" as const,
        unauthorizedExternalEffectOccurred: false as const,
      }, this.#responseValidator, "Reference Vault command response");
      const now = this.dependencies.clock.now().toISOString();
      const resultHash = resultFingerprint(responseResult);
      const durableEntityRefs = entityRefs(result, command.targetId);
      const readOnly = command.operation === "GET_REFERENCE_BRIEF" || command.operation === "PREVIEW_REFERENCE_IMPORT";
      if (!readOnly && durableEntityRefs.length !== 1) throw new RepositoryConflictError("Reference Vault mutation result has no authoritative entity locator");
      const resultId = `reference-command-result-${command.commandId}`;
      const resultBase = {
        actorId: command.actorId,
        commandId: command.commandId,
        contractVersion: "1" as const,
        operation: command.operation,
        recordedAt: now,
        replay: readOnly
          ? { mode: "REDACTED_SUMMARY" as const, result: responseResult }
          : { entityRef: durableEntityRefs[0], mode: "AUTHORITATIVE_ENTITY" as const },
        resultFingerprint: resultHash,
        resultId,
        sensitivity: "PRIVATE_REPLAY_RESULT" as const,
        version: 0 as const,
        workspaceId: command.workspaceId,
      };
      const durableResult = validate({ ...resultBase, fingerprint: referenceFingerprint(resultBase) }, this.#resultValidator, "Reference Vault command result");
      const receiptBase = {
        actorId: command.actorId,
        commandId: command.commandId,
        contractVersion: "1" as const,
        entityRefs: readOnly ? entityRefs(responseResult, command.targetId) : durableEntityRefs,
        idempotencyKeyFingerprint: canonicalSha256(command.idempotencyKey),
        inputFingerprint: command.inputFingerprint,
        operation: command.operation,
        recordedAt: now,
        requestFingerprint,
        reasonCode: "REFERENCE_COMMAND_COMPLETED" as const,
        resultFingerprint: resultHash,
        resultRecordId: durableResult.resultId,
        targetFingerprint: command.targetFingerprint,
        targetId: command.targetId,
        unauthorizedExternalEffectOccurred: false as const,
        workspaceId: command.workspaceId,
      };
      const receipt = validate({ ...receiptBase, fingerprint: referenceFingerprint(receiptBase) }, this.#receiptValidator, "Reference Vault command receipt");
      const auditBase = {
        actorId: command.actorId,
        commandId: command.commandId,
        contractVersion: "1" as const,
        eventId: `rv-audit-${requestFingerprint.slice(0, 48)}`,
        eventType: "REFERENCE_VAULT_COMMAND_COMPLETED" as const,
        externalEffectsExecuted: false as const,
        idempotencyKeyFingerprint: canonicalSha256(command.idempotencyKey),
        occurredAt: now,
        operation: command.operation,
        outcome: "SUCCESS" as const,
        subjectFingerprint: resultHash,
        workspaceId: command.workspaceId,
      };
      const audit = validate({ ...auditBase, fingerprint: referenceFingerprint(auditBase) }, this.#auditValidator, "Reference Vault audit event");
      await repository.appendRecord("REFERENCE_COMMAND_RESULT", durableResult.resultId, durableResult);
      await repository.insertCommandReceipt(receipt);
      await repository.appendAudit(audit);
      return deepFreezeReference(response);
    });
  }
}

function resultFingerprint(value: unknown): string {
  return canonicalSha256(value);
}

async function loadAuthoritativeResult(
  repository: ReferenceVaultRepository,
  identity: ReferenceVaultIdentity,
  reference: ReferenceVaultCommandEntityRef,
  expectedResultFingerprint: string,
): Promise<unknown> {
  if (reference.entityType === "REFERENCE_BRIEF" || reference.entityType === "REFERENCE_IMPORT_PREVIEW" || reference.version === undefined) throw new RepositoryConflictError("Reference Vault replay locator is invalid");
  const result = reference.entityType === "REFERENCE_ASSET"
    ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "REFERENCE_ASSET", version: reference.version })
    : reference.entityType === "REFERENCE_COLLECTION"
      ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "REFERENCE_COLLECTION", version: reference.version })
      : reference.entityType === "CREATIVE_FINGERPRINT"
        ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "CREATIVE_FINGERPRINT", version: reference.version })
        : reference.entityType === "CREATIVE_DECISION"
          ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "CREATIVE_DECISION", version: reference.version })
          : reference.entityType === "BUSINESS_CONTEXT"
            ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "BUSINESS_CONTEXT", version: reference.version })
            : reference.entityType === "OUTCOME_LINK"
              ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "OUTCOME_LINK", version: reference.version })
              : reference.entityType === "REFERENCE_IMPORT_RECEIPT"
                ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "REFERENCE_IMPORT_RECEIPT", version: reference.version })
                : reference.entityType === "REFERENCE_BLOB_TOMBSTONE"
                  ? await repository.getRecord({ ...identity, entityId: reference.entityId, type: "REFERENCE_BLOB_TOMBSTONE", version: reference.version })
                : undefined;
  if (result?.fingerprint !== reference.fingerprint || resultFingerprint(result) !== expectedResultFingerprint) throw new RepositoryConflictError("Reference Vault authoritative replay entity is unavailable or inconsistent");
  return result;
}

function redactReadResult(operation: ReferenceVaultOperation, value: unknown): unknown {
  if (operation !== "GET_REFERENCE_BRIEF") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RepositoryConflictError("Reference Vault brief result is invalid");
  const brief = value as ReferenceBrief;
  const summary: ReferenceBriefCommandSummary = {
    actorId: brief.actorId,
    assetCount: brief.assets.length,
    businessContextStatus: brief.businessContext.status,
    competitorOutputPolicy: "BLOCKED",
    contractVersion: "1",
    creativeFingerprintStatus: brief.creativeFingerprint === undefined ? "NOT_AVAILABLE" : "AVAILABLE",
    decisionCount: brief.decisions.length,
    excludedCompetitorCount: brief.excludedCompetitorCount,
    externalEffectsExecuted: false,
    generatedAt: brief.generatedAt,
    kind: "REFERENCE_BRIEF_SUMMARY",
    outcomeCount: brief.outcomes.length,
    ...(brief.platform === undefined ? {} : { platform: brief.platform }),
    purpose: brief.purpose,
    sourceBriefFingerprint: brief.fingerprint,
    workspaceId: brief.workspaceId,
  };
  return summary;
}

const AUTHORITY_OPERATIONS = new Set<ReferenceVaultOperation>([
  "APPROVE_REFERENCE_ASSET",
  "IMPORT_REFERENCE_ASSET",
  "RECORD_CREATIVE_DECISION",
  "REJECT_REFERENCE_ASSET",
  "REVIEW_REFERENCE_ASSET",
  "PURGE_EXPIRED_REFERENCE_CONTENT",
  "UPDATE_CREATIVE_FINGERPRINT",
]);

function isConfirmedApprovalAuthority(
  authority: ReferenceVaultApprovalAuthority | undefined,
  actorId: string,
  workspaceId: string,
): boolean {
  return authority !== undefined &&
    validApprovalAuthority(authority, workspaceId) &&
    authority.authorityId === actorId;
}

function validApprovalAuthority(
  authority: unknown,
  workspaceId: string,
): authority is ReferenceVaultApprovalAuthority {
  if (typeof authority !== "object" || authority === null || Array.isArray(authority)) return false;
  const record = authority as Readonly<Record<string, unknown>>;
  return validId(record.authorityId) &&
    record.confirmedByFabio === true &&
    record.contractVersion === REFERENCE_VAULT_APPROVAL_AUTHORITY_CONTRACT_VERSION &&
    record.scope === REFERENCE_VAULT_APPROVAL_AUTHORITY_SCOPE &&
    record.workspaceId === workspaceId;
}

function entityRefs(value: unknown, fallbackId: string): readonly ReferenceVaultCommandEntityRef[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const item = value as Readonly<Record<string, unknown>>;
  const fingerprint = typeof item.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(item.fingerprint)
    ? item.fingerprint
    : typeof item.sourceBriefFingerprint === "string" && /^[a-f0-9]{64}$/u.test(item.sourceBriefFingerprint)
      ? item.sourceBriefFingerprint
      : undefined;
  if (fingerprint === undefined) return [];
  const candidates: readonly [string, ReferenceVaultCommandEntityRef["entityType"]][] = [
    ["assetId", "REFERENCE_ASSET"],
    ["collectionId", "REFERENCE_COLLECTION"],
    ["creativeFingerprintId", "CREATIVE_FINGERPRINT"],
    ["decisionId", "CREATIVE_DECISION"],
    ["businessContextId", "BUSINESS_CONTEXT"],
    ["outcomeLinkId", "OUTCOME_LINK"],
    ["receiptId", "REFERENCE_IMPORT_RECEIPT"],
    ["tombstoneId", "REFERENCE_BLOB_TOMBSTONE"],
  ];
  for (const [key, entityType] of candidates) {
    if (typeof item[key] === "string" && validId(item[key])) return [{ entityId: item[key], entityType, fingerprint, ...(typeof item.version === "number" ? { version: item.version } : {}) }];
  }
  if ("competitorOutputPolicy" in item) return [{ entityId: fallbackId, entityType: "REFERENCE_BRIEF", fingerprint }];
  if ("batchId" in item) return [{ entityId: fallbackId, entityType: "REFERENCE_IMPORT_PREVIEW", fingerprint }];
  return [];
}

function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value);
}

function nextAction(operation: ReferenceVaultOperation): string {
  switch (operation) {
    case "PREVIEW_REFERENCE_IMPORT": return "Review blockers, rights, freshness, detected MIME, dimensions, and fingerprint before import.";
    case "IMPORT_REFERENCE_ASSET": return "Review imported references in the private approval center; no asset is approved automatically.";
    case "REVIEW_REFERENCE_ASSET": return "Resolve any rights or freshness blocker, then request an explicit Fabio decision.";
    case "APPROVE_REFERENCE_ASSET": return "The approved reference may be queried by authorized internal agents; publication remains locked.";
    case "REJECT_REFERENCE_ASSET": return "Keep the immutable original for audit and use the rejection only as decision memory.";
    case "ARCHIVE_REFERENCE_ASSET": return "The archived reference is excluded from active briefs.";
    case "RECORD_CREATIVE_DECISION": return "Use the decision as durable creative memory after evidence review.";
    case "UPDATE_CREATIVE_FINGERPRINT": return "Inspect sample count and confidence before using the fingerprint in a production brief.";
    case "UPDATE_BUSINESS_CONTEXT": return "Review every NOT_AVAILABLE field; no missing business value was inferred.";
    case "LINK_REFERENCE_OUTCOME": return "Use the outcome link as evidence, not as automatic causation.";
    case "GET_REFERENCE_BRIEF": return "Consume this read-only brief with competitor output blocked and publication locked.";
    case "PURGE_EXPIRED_REFERENCE_CONTENT": return "Byte content is purged after retention expiry; immutable metadata and the tombstone remain private and auditable.";
  }
}

function validate<T>(value: unknown, validator: { validate(candidate: unknown): { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly unknown[] } }, label: string): T {
  const checked = validator.validate(value);
  if (!checked.ok) throw new RepositoryConflictError(`${label} is invalid`, { issueCount: checked.issues.length });
  return checked.value;
}
