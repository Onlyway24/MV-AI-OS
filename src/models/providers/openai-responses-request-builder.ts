import { createHash } from "node:crypto";

export const OPENAI_RESPONSES_REQUEST_BUILDER_VERSION = "1" as const;
export const OPENAI_RESPONSES_SDK_TRANSPORT_VERSION = "fetch-native-v1" as const;

export type OpenAiResponsesRequestMode =
  | "PLAIN_TEXT_V1"
  | "STRUCTURED_OUTPUT_V1"
  | "MEDIA_DIRECTION_V1";

export interface OpenAiResponsesRequestShapeManifest {
  readonly adapterVersion: typeof OPENAI_RESPONSES_REQUEST_BUILDER_VERSION;
  readonly contentType: "application/json";
  readonly endpoint: "/v1/responses";
  readonly fieldNames: readonly string[];
  readonly fieldTypes: Readonly<Record<string, string>>;
  readonly fingerprint: string;
  readonly headerNames: readonly string[];
  readonly method: "POST";
  readonly operationType: OpenAiResponsesRequestMode;
  readonly sdkTransportVersion: typeof OPENAI_RESPONSES_SDK_TRANSPORT_VERSION;
}

export interface OpenAiResponsesCanonicalRequest {
  /** Never persist this value. It is used only for the immediate transport. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly manifest: OpenAiResponsesRequestShapeManifest;
  /** Deterministic serialization of the allowlisted body only. */
  readonly serializedBody: string;
}

export class OpenAiResponsesRequestConformanceError extends Error {
  public readonly code:
    | "RESPONSES_REQUEST_FIELD_NOT_ALLOWED"
    | "RESPONSES_REQUEST_INVALID"
    | "RESPONSES_REQUEST_NULL_NOT_ALLOWED"
    | "RESPONSES_REQUEST_UNKNOWN_FIELD";
  public readonly field?: string;

  public constructor(
    code: OpenAiResponsesRequestConformanceError["code"],
    field?: string,
  ) {
    super("OpenAI Responses request did not meet the canonical contract");
    this.code = code;
    if (field !== undefined) this.field = field;
  }
}

const FORBIDDEN_CHAT_COMPLETIONS_FIELDS = new Set([
  "function_call",
  "functions",
  "logprobs",
  "max_completion_tokens",
  "max_tokens",
  "messages",
  "n",
  "response_format",
]);

const STRUCTURED_STATUS_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: Object.freeze({
    status: Object.freeze({ enum: Object.freeze(["OK"]), type: "string" }),
    title: Object.freeze({ type: "string" }),
  }),
  required: Object.freeze(["status", "title"]),
  type: "object",
});

const MEDIA_DIRECTION_SCHEMA = Object.freeze({
  additionalProperties: false,
  properties: Object.freeze({
    editorialAngle: Object.freeze({ type: "string" }),
    hook: Object.freeze({ type: "string" }),
    negativeRules: Object.freeze({
      items: Object.freeze({ type: "string" }),
      type: "array",
    }),
    requiredObjects: Object.freeze({
      items: Object.freeze({ type: "string" }),
      type: "array",
    }),
    title: Object.freeze({ type: "string" }),
    visualMood: Object.freeze({ type: "string" }),
    visualScene: Object.freeze({ type: "string" }),
  }),
  required: Object.freeze([
    "title",
    "hook",
    "editorialAngle",
    "visualScene",
    "visualMood",
    "requiredObjects",
    "negativeRules",
  ]),
  type: "object",
});

/**
 * Creates the only live-eligible Responses request: model plus string input.
 * Input remains transient; manifests carry shape only, never its value.
 */
export function buildOpenAiResponsesPlainTextRequest(
  candidate: Readonly<Record<string, unknown>>,
): OpenAiResponsesCanonicalRequest {
  return build(candidate, "PLAIN_TEXT_V1");
}

/**
 * This mode is deliberately usable offline only. The caller must not route it
 * to a live operation until a separately authorized milestone exists.
 */
export function buildOpenAiResponsesStructuredOutputRequest(
  candidate: Readonly<Record<string, unknown>>,
): OpenAiResponsesCanonicalRequest {
  return build(candidate, "STRUCTURED_OUTPUT_V1");
}

export function openAiResponsesStructuredStatusSchema(): Readonly<Record<string, unknown>> {
  return STRUCTURED_STATUS_SCHEMA;
}

/**
 * Creates the sole live-eligible content-direction request for the controlled
 * Media Factory closure. The schema is fixed here so callers cannot weaken it.
 */
export function buildOpenAiResponsesMediaDirectionRequest(
  candidate: Readonly<Record<string, unknown>>,
): OpenAiResponsesCanonicalRequest {
  return build(candidate, "MEDIA_DIRECTION_V1");
}

export function openAiResponsesMediaDirectionSchema(): Readonly<Record<string, unknown>> {
  return MEDIA_DIRECTION_SCHEMA;
}

function build(
  candidate: Readonly<Record<string, unknown>>,
  operationType: OpenAiResponsesRequestMode,
): OpenAiResponsesCanonicalRequest {
  const sanitized = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined),
  );
  const allowed = operationType === "PLAIN_TEXT_V1"
    ? new Set(["model", "input"])
    : new Set(["model", "input", "text"]);

  for (const [field, value] of Object.entries(sanitized)) {
    if (FORBIDDEN_CHAT_COMPLETIONS_FIELDS.has(field)) {
      throw new OpenAiResponsesRequestConformanceError(
        "RESPONSES_REQUEST_FIELD_NOT_ALLOWED",
        field,
      );
    }
    if (!allowed.has(field)) {
      throw new OpenAiResponsesRequestConformanceError(
        "RESPONSES_REQUEST_UNKNOWN_FIELD",
        field,
      );
    }
    if (value === null) {
      throw new OpenAiResponsesRequestConformanceError(
        "RESPONSES_REQUEST_NULL_NOT_ALLOWED",
        field,
      );
    }
  }

  const model = sanitized.model;
  const input = sanitized.input;
  if (typeof model !== "string" || model.length === 0) {
    throw new OpenAiResponsesRequestConformanceError(
      "RESPONSES_REQUEST_INVALID",
      "model",
    );
  }
  if (typeof input !== "string" || input.length === 0) {
    throw new OpenAiResponsesRequestConformanceError(
      "RESPONSES_REQUEST_INVALID",
      "input",
    );
  }

  const body: Record<string, unknown> = { model, input };
  if (operationType !== "PLAIN_TEXT_V1") {
    const expected = operationType === "STRUCTURED_OUTPUT_V1"
      ? structuredStatusFormat()
      : mediaDirectionFormat();
    if (sanitized.text !== undefined && JSON.stringify(sanitized.text) !== JSON.stringify(expected)) {
      throw new OpenAiResponsesRequestConformanceError(
        "RESPONSES_REQUEST_INVALID",
        "text",
      );
    }
    body.text = expected;
  }

  const serializedBody = JSON.stringify(body);
  const fieldNames = Object.freeze(Object.keys(body));
  const fieldTypes = Object.freeze(Object.fromEntries(
    fieldNames.map((field) => [field, field === "text" ? "object" : "string"]),
  ));
  const manifestWithoutFingerprint = {
    adapterVersion: OPENAI_RESPONSES_REQUEST_BUILDER_VERSION,
    contentType: "application/json" as const,
    endpoint: "/v1/responses" as const,
    fieldNames,
    fieldTypes,
    headerNames: Object.freeze(["Authorization", "Content-Type", "Idempotency-Key"]),
    method: "POST" as const,
    operationType,
    sdkTransportVersion: OPENAI_RESPONSES_SDK_TRANSPORT_VERSION,
  };
  const manifest: OpenAiResponsesRequestShapeManifest = Object.freeze({
    ...manifestWithoutFingerprint,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(manifestWithoutFingerprint))
      .digest("hex"),
  });
  return Object.freeze({ body: Object.freeze(body), manifest, serializedBody });
}

function structuredStatusFormat(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    format: Object.freeze({
      name: "onlyway_provider_status",
      schema: STRUCTURED_STATUS_SCHEMA,
      strict: true,
      type: "json_schema",
    }),
  });
}

function mediaDirectionFormat(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    format: Object.freeze({
      name: "metodo_veloce_media_direction",
      schema: MEDIA_DIRECTION_SCHEMA,
      strict: true,
      type: "json_schema",
    }),
  });
}
