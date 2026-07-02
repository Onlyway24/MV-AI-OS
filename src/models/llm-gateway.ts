import type { ModelRequest } from "./model-request.js";
import type { ModelResponse } from "./model-response.js";

export interface LlmGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
}
