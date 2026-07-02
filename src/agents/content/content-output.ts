import type { JsonObject } from "../../contracts/json.js";

export type ContentOutput = JsonObject & {
  readonly contentType: string;
  readonly title?: string;
  readonly summary: string;
  readonly body: JsonObject;
  readonly audience: string;
  readonly tone: string;
  readonly language: string;
  readonly callToAction?: string;
  readonly assumptions: readonly string[];
  readonly warnings: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly memoryRefs: readonly string[];
  readonly delivery?: JsonObject;
  readonly metadata: JsonObject;
};
