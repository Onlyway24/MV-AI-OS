import type { ModelProfile } from "./model-profile.js";
import type { ModelRequest } from "./model-request.js";

export interface ModelSelectionPolicy {
  select(request: ModelRequest): Promise<ModelProfile>;
}
