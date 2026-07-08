import type { SecretReference } from "./secret-reference.js";
import type { SecretResolutionResult } from "./secret-value.js";

export interface SecretResolver {
  resolve(reference: SecretReference): Promise<SecretResolutionResult>;
}
