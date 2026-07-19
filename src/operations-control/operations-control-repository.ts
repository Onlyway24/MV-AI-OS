import type {
  ControlActionProposal,
  ControlActionReceipt,
  OperationsIncidentRecord,
  ProductionControlRecord,
} from "./operations-control.js";

export interface OperationsControlRepository {
  getIncident(incidentId: string): Promise<OperationsIncidentRecord | undefined>;
  getProductionControl(productionId: string): Promise<ProductionControlRecord | undefined>;
  getProposal(proposalId: string): Promise<ControlActionProposal | undefined>;
  getProposalByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<ControlActionProposal | undefined>;
  getReceiptByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<ControlActionReceipt | undefined>;
  insertIncident(record: OperationsIncidentRecord): Promise<void>;
  insertProductionControl(record: ProductionControlRecord): Promise<void>;
  insertProposal(proposal: ControlActionProposal): Promise<void>;
  insertReceipt(receipt: ControlActionReceipt): Promise<void>;
  listIncidents(workspaceId: string, limit: number): Promise<readonly OperationsIncidentRecord[]>;
  listProductionControls(workspaceId: string, limit: number): Promise<readonly ProductionControlRecord[]>;
  listReceipts(workspaceId: string, limit: number): Promise<readonly ControlActionReceipt[]>;
  updateIncident(record: OperationsIncidentRecord, expectation: { readonly version: number }): Promise<void>;
  updateProductionControl(record: ProductionControlRecord, expectation: { readonly version: number }): Promise<void>;
  updateProposal(proposal: ControlActionProposal, expectation: { readonly version: number }): Promise<void>;
}
