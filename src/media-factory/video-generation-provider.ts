import { createHash } from "node:crypto";

import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

export const VIDEO_GENERATION_PROVIDER_CONTRACT_VERSION = "1" as const;

export type VideoGenerationOperationStatus = "COMPLETED" | "FAILED" | "QUEUED" | "RUNNING" | "UNCERTAIN";

export interface VideoGenerationProviderCapability {
  readonly providerId: string;
  readonly reasonCode: "READY" | "VIDEO_PROVIDER_NOT_CONFIGURED";
  readonly status: "DISABLED" | "READY";
}

export interface VideoGenerationRequest {
  readonly aspectRatio: "9:16";
  readonly clientRequestId: string;
  readonly contractVersion: typeof VIDEO_GENERATION_PROVIDER_CONTRACT_VERSION;
  readonly durationSeconds: number;
  readonly idempotencyKey: string;
  readonly maxCostUsd: number;
  readonly modelId: string;
  readonly promptFingerprint: string;
  readonly retryCount: 0;
}

export interface VideoGenerationSubmission {
  readonly clientRequestId: string;
  readonly estimatedCostUsd: number;
  readonly idempotencyKey: string;
  readonly modelId: string;
  readonly operationId: string;
  readonly promptFingerprint: string;
  readonly providerId: string;
  readonly providerRequestId?: string;
  readonly status: Extract<VideoGenerationOperationStatus, "QUEUED" | "RUNNING">;
}

interface VideoGenerationOperationBase {
  readonly actualCostUsd?: number;
  readonly clientRequestId: string;
  readonly idempotencyKey: string;
  readonly modelId: string;
  readonly operationId: string;
  readonly promptFingerprint: string;
  readonly providerId: string;
  readonly providerRequestId?: string;
}

export type VideoGenerationOperation =
  | VideoGenerationOperationBase & {
    readonly status: Exclude<VideoGenerationOperationStatus, "COMPLETED">;
    readonly video?: never;
  }
  | VideoGenerationOperationBase & {
    readonly actualCostUsd: number;
    readonly status: "COMPLETED";
    readonly video: {
    readonly bytes: Uint8Array;
    readonly mediaType: "video/mp4";
    readonly sha256: string;
  };
};

/**
 * Provider-neutral asynchronous boundary. ORACLE may prepare requests for this
 * port, but only an explicitly configured and separately authorized runtime may
 * submit or reconcile a paid video generation operation.
 */
export interface VideoGenerationProvider {
  capability(): VideoGenerationProviderCapability;
  inspect(operationId: string): Promise<VideoGenerationOperation>;
  submit(request: VideoGenerationRequest): Promise<VideoGenerationSubmission>;
}

export class VideoGenerationProviderError extends Error {
  public constructor(public readonly code: "video_provider_disabled" | "video_request_invalid" | "video_response_invalid" | "video_transport_failed", message = "Video generation provider failed") {
    super(message);
    this.name = "VideoGenerationProviderError";
  }
}

export class VideoGenerationRequestValidator implements Validator<VideoGenerationRequest> {
  public validate(value: unknown): ValidationResult<VideoGenerationRequest> {
    if (!record(value) || !keys(value, ["aspectRatio", "clientRequestId", "contractVersion", "durationSeconds", "idempotencyKey", "maxCostUsd", "modelId", "promptFingerprint", "retryCount"]) || value.contractVersion !== "1" || value.aspectRatio !== "9:16" || !identifier(value.clientRequestId) || !identifier(value.idempotencyKey) || !identifier(value.modelId) || !sha256(value.promptFingerprint) || !integer(value.durationSeconds, 1, 180) || !cost(value.maxCostUsd) || value.retryCount !== 0) return invalid("Video generation request is invalid");
    return valid(value as unknown as VideoGenerationRequest);
  }
}

export class VideoGenerationSubmissionValidator implements Validator<VideoGenerationSubmission> {
  public validate(value: unknown): ValidationResult<VideoGenerationSubmission> {
    const fields = ["clientRequestId", "estimatedCostUsd", "idempotencyKey", "modelId", "operationId", "promptFingerprint", "providerId", "status", ...(record(value) && value.providerRequestId !== undefined ? ["providerRequestId"] : [])];
    if (!record(value) || !keys(value, fields) || !identifier(value.clientRequestId) || !identifier(value.idempotencyKey) || !identifier(value.modelId) || !identifier(value.operationId) || !identifier(value.providerId) || (value.providerRequestId !== undefined && !identifier(value.providerRequestId)) || !sha256(value.promptFingerprint) || !cost(value.estimatedCostUsd) || !["QUEUED", "RUNNING"].includes(String(value.status))) return invalid("Video generation submission is invalid");
    return valid(value as unknown as VideoGenerationSubmission);
  }
}

export class VideoGenerationOperationValidator implements Validator<VideoGenerationOperation> {
  public validate(value: unknown): ValidationResult<VideoGenerationOperation> {
    if (!record(value)) return invalid("Video generation operation is invalid");
    const completed = value.status === "COMPLETED";
    const fields = ["clientRequestId", "idempotencyKey", "modelId", "operationId", "promptFingerprint", "providerId", "status", ...(value.actualCostUsd === undefined ? [] : ["actualCostUsd"]), ...(value.providerRequestId === undefined ? [] : ["providerRequestId"]), ...(completed ? ["video"] : [])];
    if (!keys(value, fields) || !identifier(value.clientRequestId) || !identifier(value.idempotencyKey) || !identifier(value.modelId) || !identifier(value.operationId) || !identifier(value.providerId) || (value.providerRequestId !== undefined && !identifier(value.providerRequestId)) || !sha256(value.promptFingerprint) || !["COMPLETED", "FAILED", "QUEUED", "RUNNING", "UNCERTAIN"].includes(String(value.status)) || (value.actualCostUsd !== undefined && !cost(value.actualCostUsd)) || (completed && (value.actualCostUsd === undefined || !video(value.video))) || (!completed && value.video !== undefined)) return invalid("Video generation operation is invalid");
    return valid(value as unknown as VideoGenerationOperation);
  }
}

export function bindVideoGenerationSubmission(requestCandidate: unknown, submissionCandidate: unknown): VideoGenerationSubmission {
  const request = checked(requestCandidate, new VideoGenerationRequestValidator());
  const submission = checked(submissionCandidate, new VideoGenerationSubmissionValidator());
  if (!sameBinding(request, submission) || submission.estimatedCostUsd > request.maxCostUsd) throw new VideoGenerationProviderError("video_response_invalid");
  return submission;
}

export function bindVideoGenerationOperation(requestCandidate: unknown, operationCandidate: unknown): VideoGenerationOperation {
  const request = checked(requestCandidate, new VideoGenerationRequestValidator());
  const operation = checked(operationCandidate, new VideoGenerationOperationValidator());
  if (!sameBinding(request, operation)) throw new VideoGenerationProviderError("video_response_invalid");
  return operation;
}

export class DisabledVideoGenerationProvider implements VideoGenerationProvider {
  public capability(): VideoGenerationProviderCapability {
    return Object.freeze({ providerId: "disabled-video-provider", reasonCode: "VIDEO_PROVIDER_NOT_CONFIGURED", status: "DISABLED" });
  }

  public inspect(operationId: string): Promise<VideoGenerationOperation> {
    void operationId;
    return Promise.reject(new VideoGenerationProviderError("video_provider_disabled"));
  }

  public submit(request: VideoGenerationRequest): Promise<VideoGenerationSubmission> {
    void request;
    return Promise.reject(new VideoGenerationProviderError("video_provider_disabled"));
  }
}

function video(value: unknown): boolean { return record(value) && keys(value, ["bytes", "mediaType", "sha256"]) && value.bytes instanceof Uint8Array && value.bytes.byteLength > 0 && value.bytes.byteLength <= 1_073_741_824 && value.mediaType === "video/mp4" && sha256(value.sha256) && createHash("sha256").update(value.bytes).digest("hex") === value.sha256; }
function sameBinding(request: VideoGenerationRequest, candidate: Pick<VideoGenerationSubmission, "clientRequestId" | "idempotencyKey" | "modelId" | "promptFingerprint">): boolean { return request.clientRequestId === candidate.clientRequestId && request.idempotencyKey === candidate.idempotencyKey && request.modelId === candidate.modelId && request.promptFingerprint === candidate.promptFingerprint; }
function checked<T>(value: unknown, validator: Validator<T>): T { const result = validator.validate(value); if (!result.ok) throw new VideoGenerationProviderError("video_response_invalid"); return result.value; }
function valid<T>(value: T): ValidationResult<T> { return validationSuccess(freeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function identifier(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value); }
function sha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function integer(value: unknown, minimum: number, maximum: number): boolean { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function cost(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100; }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value) || ArrayBuffer.isView(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
