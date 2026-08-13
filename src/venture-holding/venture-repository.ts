import type { VentureAuditEvent, VentureCommandReceipt, VentureEvent, VentureKillSwitch, VentureRecordMap, VentureRecordType } from "./venture-domain.js";

export interface VentureIdentity { readonly actorId: string; readonly workspaceId: string; }
export interface VentureRecordQuery<K extends VentureRecordType> extends VentureIdentity { readonly type: K; readonly entityId: string; readonly version?: number; }
export interface VentureRecordListQuery<K extends VentureRecordType> extends VentureIdentity { readonly type: K; readonly limit: number; }

export interface VentureHoldingRepository {
  getRecord<K extends VentureRecordType>(query: VentureRecordQuery<K>): Promise<VentureRecordMap[K] | undefined>;
  listRecords<K extends VentureRecordType>(query: VentureRecordListQuery<K>): Promise<readonly VentureRecordMap[K][]>;
  appendRecord<K extends VentureRecordType>(type: K, entityId: string, record: VentureRecordMap[K], expectedPreviousVersion?: number): Promise<void>;
  getCommandReceipt(identity: VentureIdentity, idempotencyKey: string): Promise<VentureCommandReceipt | undefined>;
  getCommandReceiptByCommandId(identity: VentureIdentity, commandId: string): Promise<VentureCommandReceipt | undefined>;
  insertCommandReceipt(receipt: VentureCommandReceipt): Promise<void>;
  appendAudit(event: VentureAuditEvent): Promise<void>;
  listAudit(identity: VentureIdentity, limit: number): Promise<readonly VentureAuditEvent[]>;
  appendEvent(event: VentureEvent): Promise<void>;
  listEvents(identity: VentureIdentity, afterSequence: number, limit: number): Promise<readonly (VentureEvent & { readonly sequence: number })[]>;
  getKillSwitch(identity: VentureIdentity): Promise<VentureKillSwitch | undefined>;
  setKillSwitch(value: VentureKillSwitch, expectedVersion: number | "NOT_EXISTS"): Promise<void>;
}

export interface VentureHoldingTransactionRunner {
  transaction<T>(operation: (repository: VentureHoldingRepository) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
