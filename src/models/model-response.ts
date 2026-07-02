import type { JsonObject } from "../contracts/json.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { ModelError } from "./model-error.js";
import type { ModelUsage } from "./model-usage.js";

export interface ModelProviderReference {
  readonly providerId: string;
  readonly modelId: string;
}

export type ModelOutput =
  | {
      readonly format: "json";
      readonly value: JsonObject;
    }
  | {
      readonly format: "text";
      readonly text: string;
    };

interface ModelResponseBase {
  readonly contractVersion: RequestContractVersion;
  readonly modelRequestId: string;
  readonly completedAt: string;
}

export interface SuccessfulModelResponse extends ModelResponseBase {
  readonly status: "succeeded";
  readonly provider: ModelProviderReference;
  readonly output: ModelOutput;
  readonly usage: ModelUsage;
}

export interface FailedModelResponse extends ModelResponseBase {
  readonly status: "failed";
  readonly provider?: ModelProviderReference;
  readonly error: ModelError;
  readonly usage?: ModelUsage;
}

export type ModelResponse =
  | FailedModelResponse
  | SuccessfulModelResponse;
