import type { TaskResponse } from "../contracts/task-response.js";

export const STORED_REQUEST_SCHEMA_VERSION = "1" as const;

export interface StoredRequest {
  readonly schemaVersion: typeof STORED_REQUEST_SCHEMA_VERSION;
  readonly requestId: string;
  readonly taskId: string;
  readonly requestFingerprint: string;
  readonly response?: TaskResponse;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RequestRepository {
  getById(requestId: string): Promise<StoredRequest | undefined>;
  insert(request: StoredRequest): Promise<void>;
  saveResponse(
    requestId: string,
    taskId: string,
    response: TaskResponse,
    updatedAt: string,
  ): Promise<void>;
}
