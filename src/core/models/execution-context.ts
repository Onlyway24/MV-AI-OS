import type { JsonObject } from "../../contracts/json.js";
import type { RequestContractVersion } from "../../contracts/request-envelope.js";

export type SupplementalContextSource =
  | "conversation"
  | "knowledge"
  | "memory";

export interface SupplementalContextItem {
  readonly referenceId: string;
  readonly source: SupplementalContextSource;
  readonly content: JsonObject;
}

export interface ExecutionContext {
  readonly contractVersion: RequestContractVersion;
  readonly contextId: string;
  readonly taskId: string;
  readonly requestId: string;
  readonly correlationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly sessionId?: string;
  readonly taskType: string;
  readonly instruction: string;
  readonly input?: JsonObject;
  readonly constraints?: JsonObject;
  readonly requestedOutput: JsonObject;
  readonly requestedWorkflow?: JsonObject;
  readonly supplementalContext: readonly SupplementalContextItem[];
  readonly createdAt: string;
}
