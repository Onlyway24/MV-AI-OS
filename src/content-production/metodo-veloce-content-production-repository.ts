import type { MetodoVeloceContentProductionRecord } from "./metodo-veloce-content-production-record.js";

export interface MetodoVeloceContentProductionUpdateExpectation {
  readonly version: number;
}

export interface MetodoVeloceContentProductionRepository {
  getById(productionId: string): Promise<MetodoVeloceContentProductionRecord | undefined>;
  insert(record: MetodoVeloceContentProductionRecord): Promise<void>;
  listByWorkspaceId(workspaceId: string, limit: number): Promise<readonly MetodoVeloceContentProductionRecord[]>;
  update(record: MetodoVeloceContentProductionRecord, expectation: MetodoVeloceContentProductionUpdateExpectation): Promise<void>;
}
