export const BRAND_MEDIA_FACTORY_CONTRACT_VERSION = "1" as const;

export type BrandMediaFactoryProviderErrorCode =
  | "image_response_invalid"
  | "image_transport_timeout"
  | "image_transport_failed";

export interface BrandMediaFactoryProviderError {
  readonly code: BrandMediaFactoryProviderErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
}

export interface MediaGenerationRequest {
  readonly clientRequestId?: string;
  readonly contractVersion: typeof BRAND_MEDIA_FACTORY_CONTRACT_VERSION;
  readonly maxEstimatedCostUsd: number;
  readonly modelId: string;
  readonly outputFormat: "png";
  readonly prompt: string;
  readonly quality: "low" | "medium" | "high";
  readonly requestId: string;
  readonly size: "1024x1024" | "1024x1536" | "1536x1024";
}

export interface MediaGenerationProviderReceipt {
  readonly createdAtEpochSeconds?: number;
  readonly usage?: {
    readonly inputImageTokens?: number;
    readonly inputTextTokens?: number;
    readonly inputTokens: number;
    readonly outputImageTokens?: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly xClientRequestId: string;
  readonly xRequestId?: string;
}

export interface GeneratedMasterImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly mimeType: "image/png";
  readonly sha256: string;
  readonly width: number;
}

export type MediaGenerationResponse =
  | {
      readonly image: GeneratedMasterImage;
      readonly modelId: string;
      readonly providerReceipt?: MediaGenerationProviderReceipt;
      readonly providerId: string;
      readonly status: "succeeded";
    }
  | {
      readonly error: BrandMediaFactoryProviderError;
      readonly modelId: string;
      readonly providerReceipt?: MediaGenerationProviderReceipt;
      readonly providerId: string;
      readonly status: "failed";
    };

/** Provider-neutral port: the factory never imports a provider SDK or HTTP API. */
export interface MediaGenerationProvider {
  readonly providerId: string;
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
}

export class MediaGenerationProviderError extends Error {
  public readonly code: BrandMediaFactoryProviderErrorCode;
  public readonly providerReceipt: MediaGenerationProviderReceipt | undefined;

  public constructor(
    code: BrandMediaFactoryProviderErrorCode,
    message: string,
    providerReceipt?: MediaGenerationProviderReceipt,
  ) {
    super(message);
    this.code = code;
    this.providerReceipt = providerReceipt;
  }
}
