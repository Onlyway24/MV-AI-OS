import type {
  ReferenceAsset,
  ReferenceVaultAuditEvent,
  ReferenceVaultCommandReceipt,
  ReferenceVaultRecordMap,
  ReferenceVaultRecordType,
} from "./reference-vault.js";

export interface ReferenceVaultIdentity {
  readonly workspaceId: string;
  readonly actorId: string;
}

export interface ReferenceVaultRecordQuery<K extends ReferenceVaultRecordType> extends ReferenceVaultIdentity {
  readonly type: K;
  readonly entityId: string;
  readonly version?: number;
}

export interface ReferenceVaultListQuery<K extends ReferenceVaultRecordType> extends ReferenceVaultIdentity {
  readonly type: K;
  readonly limit: number;
}

export interface ReferenceVaultAppendExpectation {
  readonly previousVersion?: number;
}

export interface ReferenceVaultBlob extends ReferenceVaultIdentity {
  readonly sha256: string;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly storedAt: string;
  readonly bytes: Uint8Array;
}

export interface ReferenceVaultStorageUsage {
  readonly blobCount: number;
  readonly totalBytes: number;
}

export interface AuthoritativeContentPackageRef {
  readonly packageId: string;
  readonly version: number;
  readonly fingerprint: string;
}

/** Every lookup is actor-and-workspace scoped; no workspace-only read API exists. */
export interface ReferenceVaultRepository {
  getRecord<K extends ReferenceVaultRecordType>(query: ReferenceVaultRecordQuery<K>): Promise<ReferenceVaultRecordMap[K] | undefined>;
  listRecords<K extends ReferenceVaultRecordType>(query: ReferenceVaultListQuery<K>): Promise<readonly ReferenceVaultRecordMap[K][]>;
  findAssetBySha256(identity: ReferenceVaultIdentity, sha256: string): Promise<ReferenceAsset | undefined>;
  getAuthoritativeContentPackageRef(identity: ReferenceVaultIdentity, packageId: string): Promise<AuthoritativeContentPackageRef | undefined>;
  appendRecord<K extends ReferenceVaultRecordType>(type: K, entityId: string, record: ReferenceVaultRecordMap[K], expectation?: ReferenceVaultAppendExpectation): Promise<void>;
  getBlob(identity: ReferenceVaultIdentity, sha256: string): Promise<ReferenceVaultBlob | undefined>;
  putBlob(blob: ReferenceVaultBlob): Promise<void>;
  deleteBlobAfterRetentionTombstone(identity: ReferenceVaultIdentity, sha256: string): Promise<void>;
  getStorageUsage(identity: ReferenceVaultIdentity): Promise<ReferenceVaultStorageUsage>;
  getCommandReceipt(identity: ReferenceVaultIdentity, idempotencyKey: string): Promise<ReferenceVaultCommandReceipt | undefined>;
  getCommandReceiptByCommandId(identity: ReferenceVaultIdentity, commandId: string): Promise<ReferenceVaultCommandReceipt | undefined>;
  insertCommandReceipt(receipt: ReferenceVaultCommandReceipt): Promise<void>;
  appendAudit(event: ReferenceVaultAuditEvent): Promise<void>;
  listAudit(identity: ReferenceVaultIdentity, limit: number): Promise<readonly ReferenceVaultAuditEvent[]>;
}

export interface ReferenceVaultTransactionRunner {
  transaction<T>(operation: (repository: ReferenceVaultRepository) => Promise<T>): Promise<T>;
}

export function referenceVaultEntityId<K extends ReferenceVaultRecordType>(type: K, record: ReferenceVaultRecordMap[K]): string {
  switch (type) {
    case "REFERENCE_ASSET": return (record as ReferenceVaultRecordMap["REFERENCE_ASSET"]).assetId;
    case "REFERENCE_COLLECTION": return (record as ReferenceVaultRecordMap["REFERENCE_COLLECTION"]).collectionId;
    case "REFERENCE_COMMAND_RESULT": return (record as ReferenceVaultRecordMap["REFERENCE_COMMAND_RESULT"]).resultId;
    case "CREATIVE_FINGERPRINT": return (record as ReferenceVaultRecordMap["CREATIVE_FINGERPRINT"]).creativeFingerprintId;
    case "CREATIVE_DECISION": return (record as ReferenceVaultRecordMap["CREATIVE_DECISION"]).decisionId;
    case "BUSINESS_CONTEXT": return (record as ReferenceVaultRecordMap["BUSINESS_CONTEXT"]).businessContextId;
    case "REFERENCE_BLOB_TOMBSTONE": return (record as ReferenceVaultRecordMap["REFERENCE_BLOB_TOMBSTONE"]).tombstoneId;
    case "AUDIENCE_SIGNAL": return (record as ReferenceVaultRecordMap["AUDIENCE_SIGNAL"]).audienceSignalId;
    case "OFFER_REFERENCE": return (record as ReferenceVaultRecordMap["OFFER_REFERENCE"]).offerReferenceId;
    case "CUSTOMER_LANGUAGE_REFERENCE": return (record as ReferenceVaultRecordMap["CUSTOMER_LANGUAGE_REFERENCE"]).customerLanguageReferenceId;
    case "OUTCOME_LINK": return (record as ReferenceVaultRecordMap["OUTCOME_LINK"]).outcomeLinkId;
    case "REFERENCE_REVIEW": return (record as ReferenceVaultRecordMap["REFERENCE_REVIEW"]).reviewId;
    case "NEGATIVE_REFERENCE": return (record as ReferenceVaultRecordMap["NEGATIVE_REFERENCE"]).negativeReferenceId;
    case "REFERENCE_IMPORT_RECEIPT": return (record as ReferenceVaultRecordMap["REFERENCE_IMPORT_RECEIPT"]).receiptId;
  }
}
