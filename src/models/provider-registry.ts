import type { ModelProvider } from "./model-provider.js";

export interface ProviderRegistry {
  get(providerId: string): ModelProvider | undefined;
}
