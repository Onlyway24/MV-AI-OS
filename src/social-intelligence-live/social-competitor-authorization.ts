import { RepositoryValidationError } from "../errors/core-error.js";
import type { SocialLiveImportBatchReceipt } from "./social-intelligence-live.js";
import type { SocialIntelligenceLiveService } from "./social-intelligence-live-service.js";

export const EXACT_COMPETITOR_AUTHORIZATION_TEXT = "AUTORIZZO_ESATTAMENTE_QUESTI_6_PROFILI" as const;
export const EXACT_COMPETITOR_REPLACEMENT_TEXT = "AUTORIZZO_SOSTITUZIONE_COMPETITOR" as const;

export const INITIAL_SOCIAL_COMPETITOR_CANDIDATES = Object.freeze([
  Object.freeze({ accountRef: "maert.ens", evidenceUrl: "https://www.vice.com/it/article/vinted-come-funziona/", recordId: "competitor-instagram-maert-ens", role: "DIRECT_RESALE" }),
  Object.freeze({ accountRef: "telotrovosu", evidenceUrl: "https://www.vanityfair.it/article/te-lo-trovo-su-vinted-segreti-shopping-moda-vintage-occasioni", recordId: "competitor-instagram-telotrovosu", role: "DIRECT_RESALE" }),
  Object.freeze({ accountRef: "imprenditore.it", evidenceUrl: "https://socialblade.com/instagram/user/imprenditore.it", recordId: "competitor-instagram-imprenditore-it", role: "ADJACENT_ENTREPRENEURSHIP" }),
  Object.freeze({ accountRef: "marcelloascani", evidenceUrl: "https://www.ing.it/vocearancio/soldi/leconomia-sui-social-5-profili-da-seguire.html", recordId: "competitor-instagram-marcelloascani", role: "ADJACENT_ENTREPRENEURSHIP" }),
  Object.freeze({ accountRef: "leonpinn", evidenceUrl: "https://www.ing.it/vocearancio/soldi/leconomia-sui-social-5-profili-da-seguire.html", recordId: "competitor-instagram-leonpinn", role: "VISUAL_REFERENCE" }),
  Object.freeze({ accountRef: "pillole.di.economia", evidenceUrl: "https://www.ing.it/vocearancio/soldi/leconomia-sui-social-5-profili-da-seguire.html", recordId: "competitor-instagram-pillole-di-economia", role: "CAROUSEL_STRUCTURE" }),
] as const);

export interface InitialSocialCompetitorAuthorizationRequest {
  readonly authorizationId: string;
  readonly authorizedAt: string;
  readonly confirmationText: typeof EXACT_COMPETITOR_AUTHORIZATION_TEXT;
}

export interface SocialCompetitorReplacementRequest {
  readonly accountRef: string;
  readonly authorizationId: string;
  readonly authorizedAt: string;
  readonly confirmationText: typeof EXACT_COMPETITOR_REPLACEMENT_TEXT;
  readonly recordId: string;
  readonly replacementReason: string;
  readonly replacesCompetitorRecordId: string;
  readonly role: "FORMAT_REFERENCE" | "VISUAL_REFERENCE";
  readonly subrole: string;
}

export async function authorizeSocialCompetitorReplacement(input: {
  readonly actorId: string;
  readonly request: unknown;
  readonly service: SocialIntelligenceLiveService;
}): Promise<SocialLiveImportBatchReceipt> {
  const request = validateReplacement(input.request);
  const record = input.service.createRecord({
    accountRef: request.accountRef,
    authorizedAt: request.authorizedAt,
    authorizedBy: input.actorId,
    categories: [request.role, request.subrole],
    kind: "COMPETITOR",
    platform: "INSTAGRAM",
    publicObservationOnly: true,
    recordId: request.recordId,
    replacementReason: request.replacementReason,
    replacesCompetitorRecordId: request.replacesCompetitorRecordId,
    status: "AUTHORIZED",
  });
  return input.service.importBatch({ batchId: request.authorizationId, records: [record] });
}

export async function authorizeInitialSocialCompetitors(input: {
  readonly actorId: string;
  readonly request: unknown;
  readonly service: SocialIntelligenceLiveService;
}): Promise<SocialLiveImportBatchReceipt> {
  const request = validateRequest(input.request);
  const records = INITIAL_SOCIAL_COMPETITOR_CANDIDATES.map((candidate) => input.service.createRecord({
    accountRef: candidate.accountRef,
    authorizedAt: request.authorizedAt,
    authorizedBy: input.actorId,
    categories: [candidate.role],
    kind: "COMPETITOR",
    platform: "INSTAGRAM",
    publicObservationOnly: true,
    recordId: candidate.recordId,
    status: "AUTHORIZED",
  }));
  return input.service.importBatch({ batchId: request.authorizationId, records });
}

function validateRequest(value: unknown): InitialSocialCompetitorAuthorizationRequest {
  if (!record(value) || Object.keys(value).length !== 3 || !safeId(value.authorizationId) || value.confirmationText !== EXACT_COMPETITOR_AUTHORIZATION_TEXT || !timestamp(value.authorizedAt)) throw new RepositoryValidationError("Initial Social competitor authorization is invalid");
  return Object.freeze(structuredClone(value as unknown as InitialSocialCompetitorAuthorizationRequest));
}

function validateReplacement(value: unknown): SocialCompetitorReplacementRequest {
  if (!record(value) || Object.keys(value).length !== 9 || !safeId(value.accountRef) || !safeId(value.authorizationId) || !safeId(value.recordId) || !safeId(value.replacesCompetitorRecordId) || value.confirmationText !== EXACT_COMPETITOR_REPLACEMENT_TEXT || !timestamp(value.authorizedAt) || !["FORMAT_REFERENCE", "VISUAL_REFERENCE"].includes(String(value.role)) || typeof value.subrole !== "string" || value.subrole.length < 3 || value.subrole.length > 120 || typeof value.replacementReason !== "string" || value.replacementReason.length < 8 || value.replacementReason.length > 500) throw new RepositoryValidationError("Social competitor replacement authorization is invalid");
  return Object.freeze(structuredClone(value as unknown as SocialCompetitorReplacementRequest));
}

function record(value: unknown): value is Readonly<Record<string, unknown>> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9@._:-]{1,128}$/u.test(value); }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
