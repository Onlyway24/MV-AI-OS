import type { ErrorRecord } from "../contracts/error-record.js";
import type { JsonObject } from "../contracts/json.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";

interface ToolResultBase {
  readonly contractVersion: RequestContractVersion;
  readonly toolInvocationId: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly completedAt: string;
}

export interface SuccessfulToolResult extends ToolResultBase {
  readonly status: "succeeded";
  readonly output: JsonObject;
}

export interface FailedToolResult extends ToolResultBase {
  readonly status: "failed";
  readonly error: ErrorRecord;
}

export type ToolResult = FailedToolResult | SuccessfulToolResult;
