import { createHash } from "node:crypto";

export type SocialExternalActionOperation =
  | "DISCONNECT"
  | "IDENTITY_READ"
  | "INSIGHTS_READ"
  | "OAUTH_CALLBACK"
  | "OAUTH_START"
  | "PERMISSION_READ"
  | "REVOKE"
  | "TIKTOK_CREATOR_INFO_READ"
  | "TOKEN_REFRESH";
export type ForbiddenSocialPublicationOperation =
  | "COMMENT"
  | "DRAFT_UPLOAD"
  | "MESSAGE"
  | "PHOTO_POST_INIT"
  | "PRIVATE_POST"
  | "PUBLIC_POST"
  | "PUBLISH_CONTAINER"
  | "SCHEDULE"
  | "VIDEO_POST_INIT";

export interface SocialExternalActionReceipt {
  readonly externalPublicationOccurred: false;
  readonly operation: SocialExternalActionOperation;
  readonly operationIdFingerprint: string;
  readonly publication: "LOCKED";
  readonly status: "AUTHORIZED";
}

/** Narrow External Action Plane. It has no publication capability. */
export class SocialExternalActionPlane {
  readonly #operationFingerprints = new Set<string>();

  public authorize(input: {
    readonly operation: SocialExternalActionOperation;
    readonly operationId: string;
  }): SocialExternalActionReceipt {
    const operationIdFingerprint = createHash("sha256").update(input.operationId).digest("hex");
    if (this.#operationFingerprints.has(operationIdFingerprint)) throw new Error("DUPLICATE_EXTERNAL_ACTION");
    this.#operationFingerprints.add(operationIdFingerprint);
    return {
      externalPublicationOccurred: false,
      operation: input.operation,
      operationIdFingerprint,
      publication: "LOCKED",
      status: "AUTHORIZED",
    };
  }

  public denyPublication(operation: ForbiddenSocialPublicationOperation): {
    readonly operation: ForbiddenSocialPublicationOperation;
    readonly publication: "LOCKED";
    readonly reasonCode: "PUBLICATION_LOCKED";
    readonly status: "DENIED";
  } {
    return { operation, publication: "LOCKED", reasonCode: "PUBLICATION_LOCKED", status: "DENIED" };
  }
}

export type InstagramContainerState =
  | "CONTAINER_CREATED"
  | "ERROR"
  | "FINISHED"
  | "LOCAL_DRY_RUN"
  | "MEDIA_URL_REQUIRED"
  | "PUBLICATION_LOCKED"
  | "UNCERTAIN";
export type TikTokPostState =
  | "AUDIT_REQUIRED"
  | "CREATOR_INFO_REQUIRED"
  | "DOMAIN_VERIFICATION_REQUIRED"
  | "LOCAL_DRY_RUN"
  | "PRIVATE_ONLY"
  | "PUBLIC_POST_LOCKED"
  | "STATUS_POLLING_DISABLED"
  | "UNCERTAIN";

export function instagramContainerDryRun(input: {
  readonly contentApproved?: boolean;
  readonly hasHttpsMediaUrl: boolean;
}): { readonly externalCalls: 0; readonly state: InstagramContainerState } {
  if (!input.hasHttpsMediaUrl) return { externalCalls: 0, state: "MEDIA_URL_REQUIRED" };
  return { externalCalls: 0, state: "PUBLICATION_LOCKED" };
}

export function tiktokDirectPostDryRun(input: {
  readonly audited: boolean;
  readonly contentApproved?: boolean;
  readonly creatorInfoAvailable: boolean;
  readonly domainVerified: boolean;
}): { readonly externalCalls: 0; readonly state: TikTokPostState } {
  if (!input.creatorInfoAvailable) return { externalCalls: 0, state: "CREATOR_INFO_REQUIRED" };
  if (!input.domainVerified) return { externalCalls: 0, state: "DOMAIN_VERIFICATION_REQUIRED" };
  if (!input.audited) return { externalCalls: 0, state: "PRIVATE_ONLY" };
  return { externalCalls: 0, state: "PUBLIC_POST_LOCKED" };
}

export function tiktokPhotoPostDryRun(input: Parameters<typeof tiktokDirectPostDryRun>[0]): ReturnType<typeof tiktokDirectPostDryRun> {
  return tiktokDirectPostDryRun(input);
}
