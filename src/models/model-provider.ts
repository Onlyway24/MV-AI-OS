import type { ModelProfile } from "./model-profile.js";
import type { ModelRequest } from "./model-request.js";

export interface ModelProvider {
  readonly providerId: string;
  generate(request: ModelRequest, profile: ModelProfile): Promise<unknown>;
}
