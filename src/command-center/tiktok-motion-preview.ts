export const TIKTOK_MOTION_PREVIEW_CONTRACT_VERSION = "1" as const;
export const TIKTOK_MOTION_PREVIEW_MARKER = "PREVIEW_ONLY_NOT_RENDERED_VIDEO" as const;

export interface TikTokMotionPreviewBeat {
  readonly durationMs: number;
  readonly effect: "FADE" | "PAN" | "TEXT_STAGGER" | "ZOOM";
  readonly onScreenText: string;
  readonly order: number;
}

export interface TikTokMotionPreviewContract {
  readonly aspectRatio: "9:16";
  readonly beats: readonly TikTokMotionPreviewBeat[];
  readonly contractVersion: typeof TIKTOK_MOTION_PREVIEW_CONTRACT_VERSION;
  readonly marker: typeof TIKTOK_MOTION_PREVIEW_MARKER;
  readonly providerCalls: 0;
  readonly publication: "LOCKED";
  readonly renderedVideo: false;
}

/** Deterministic UI preview metadata. It cannot represent or request an MP4. */
export function createTikTokMotionPreview(onScreenText: readonly string[]): TikTokMotionPreviewContract {
  const effects = ["PAN", "ZOOM", "TEXT_STAGGER", "FADE"] as const;
  const beats = onScreenText.slice(0, 6).map((text, index): TikTokMotionPreviewBeat => Object.freeze({ durationMs: 900, effect: effects[index % effects.length] ?? "FADE", onScreenText: text.trim().slice(0, 120), order: index + 1 }));
  return Object.freeze({ aspectRatio: "9:16", beats: Object.freeze(beats), contractVersion: "1", marker: TIKTOK_MOTION_PREVIEW_MARKER, providerCalls: 0, publication: "LOCKED", renderedVideo: false });
}
