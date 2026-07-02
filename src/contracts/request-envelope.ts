import type { JsonObject } from "./json.js";

export const REQUEST_CONTRACT_VERSION = "1" as const;

export type RequestContractVersion = typeof REQUEST_CONTRACT_VERSION;

export type RequestSource =
  | "api"
  | "dashboard"
  | "local"
  | "schedule"
  | "webhook";

export interface RequestEnvelope {
  readonly contractVersion: RequestContractVersion;
  readonly requestId: string;
  readonly correlationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly sessionId?: string;
  readonly receivedAt: string;
  readonly source: RequestSource;
  readonly taskType: string;
  readonly instruction: string;
  readonly input?: JsonObject;
  readonly constraints?: JsonObject;
  readonly requestedOutput: JsonObject;
  readonly requestedWorkflow?: JsonObject;
}
