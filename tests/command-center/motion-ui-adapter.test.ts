import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  createMotionUiAdapter,
  installCommandCenterMotion,
  type MotionControl,
  type MotionDriver,
} from "../../src/command-center/motion-ui-adapter.js";
import { createTikTokMotionPreview, TIKTOK_MOTION_PREVIEW_MARKER } from "../../src/command-center/tiktok-motion-preview.js";
import { COMMAND_CENTER_CLIENT_JS, COMMAND_CENTER_CSS, COMMAND_CENTER_RESPONSIVE_CSS } from "../../src/command-center/command-center-assets.js";
import { DisabledVideoGenerationProvider } from "../../src/media-factory/video-generation-provider.js";

describe("governed Command Center Motion UI", () => {
  it("uses the vanilla Motion package without React and exposes every bounded adapter operation", async () => {
    const source = await readFile(new URL("../../src/command-center/motion-ui-adapter.ts", import.meta.url), "utf8");
    expect(source).toContain('import { animate, inView, stagger } from "motion"');
    expect(source).not.toContain("motion/react");
    const adapter = createMotionUiAdapter({ driver: fakeDriver().driver });
    expect(Object.keys(adapter).sort()).toEqual([
      "animateMetricChange", "animatePanelEnter", "animatePanelExit", "animateReviewOpen", "animateStatusTransition", "animateSuccessReceipt", "animateTikTokPreview", "animateValidationFailure", "animateWorkflowProgress", "observePanels", "stopAllMotion",
    ]);
  });

  it("honors dynamic reduced motion and bounds concurrent animation cleanup", () => {
    let reduced = true;
    const fake = fakeDriver();
    const adapter = createMotionUiAdapter({ driver: fake.driver, maxConcurrentAnimations: 2, reducedMotion: () => reduced });
    adapter.animatePanelEnter({});
    expect(fake.animations).toHaveLength(0);
    reduced = false;
    adapter.animatePanelEnter({});
    adapter.animateMetricChange({});
    adapter.animateReviewOpen({});
    expect(fake.stopped).toBe(1);
    adapter.stopAllMotion();
    expect(fake.stopped).toBe(3);
  });

  it("deduplicates authoritative events and never represents QUEUED as RUNNING or hides BLOCKED", () => {
    const fake = fakeDriver();
    const adapter = createMotionUiAdapter({ driver: fake.driver });
    expect(adapter.animateWorkflowProgress({}, { eventId: "event-1", eventType: "JOB_QUEUED", sequence: 1, status: "QUEUED" })).toBe(true);
    expect(adapter.animateWorkflowProgress({}, { eventId: "event-1", eventType: "JOB_QUEUED", sequence: 1, status: "QUEUED" })).toBe(false);
    expect(adapter.animateWorkflowProgress({}, { eventId: "event-2", eventType: "JOB_BLOCKED", sequence: 2, status: "BLOCKED" })).toBe(true);
    expect(JSON.stringify(fake.keyframes[0])).toContain("opacity");
    expect(JSON.stringify(fake.keyframes[0])).not.toContain("scale");
    expect(JSON.stringify(fake.keyframes[1])).toContain("translateX");
  });

  it("stops on kill switch and does not call the disabled video provider", async () => {
    const fake = fakeDriver();
    const windowPort = fakeWindow();
    const documentPort = fakeDocument(true);
    const installed = installCommandCenterMotion(windowPort.port, documentPort.port);
    windowPort.emit("onlyway:motion:operational", { eventId: "event-3", eventType: "JOB_LEASE_ACQUIRED", sequence: 3, status: "RUNNING" });
    expect(fake.animations).toHaveLength(0);
    installed.dispose();
    const video = new DisabledVideoGenerationProvider();
    expect(video.capability()).toMatchObject({ reasonCode: "VIDEO_PROVIDER_NOT_CONFIGURED", status: "DISABLED" });
    await expect(video.submit({} as never)).rejects.toMatchObject({ code: "video_provider_disabled" });
  });

  it("keeps TikTok transitions a browser-only preview contract with publication locked", () => {
    const preview = createTikTokMotionPreview(["Hook", "Prova", "CTA"]);
    expect(preview).toMatchObject({ marker: TIKTOK_MOTION_PREVIEW_MARKER, providerCalls: 0, publication: "LOCKED", renderedVideo: false });
    expect(preview.beats.map(({ effect }) => effect)).toEqual(["PAN", "ZOOM", "TEXT_STAGGER"]);
    expect(JSON.stringify(preview)).not.toContain("mp4");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("PREVIEW_ONLY_NOT_RENDERED_VIDEO");
  });

  it("preserves CSP-safe external scripts and the 390px overflow/reduced-motion protections", () => {
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("cdn.");
    expect(COMMAND_CENTER_CSS).toContain("@media (prefers-reduced-motion:reduce)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("overflow-x:hidden");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("@media (max-width:430px)");
  });
});

function fakeDriver(): { readonly animations: MotionControl[]; readonly driver: MotionDriver; readonly keyframes: unknown[]; readonly stopped: number } {
  const state: { animations: MotionControl[]; keyframes: unknown[]; stopped: number } = { animations: [], keyframes: [], stopped: 0 };
  const driver: MotionDriver = {
    animate: (_target, keyframes) => {
      state.keyframes.push(keyframes);
      const control = { stop: () => { state.stopped += 1; } };
      state.animations.push(control);
      return control;
    },
    inView: (_target, callback) => { callback({}); return () => undefined; },
    stagger: () => 0,
  };
  return {
    get animations() { return state.animations; },
    driver,
    get keyframes() { return state.keyframes; },
    get stopped() { return state.stopped; },
  };
}

type Listener = (event: { readonly detail?: unknown }) => void;

function fakeWindow(): { readonly port: Parameters<typeof installCommandCenterMotion>[0]; emit(name: string, detail: unknown): void } {
  const listeners = new Map<string, Set<Listener>>();
  const port = {
    addEventListener: (name: string, listener: Listener) => { const current = listeners.get(name) ?? new Set<Listener>(); current.add(listener); listeners.set(name, current); },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
  };
  return { port, emit: (name, detail) => { for (const listener of listeners.get(name) ?? []) listener({ detail }); } };
}

function fakeDocument(killSwitch: boolean): { readonly port: Parameters<typeof installCommandCenterMotion>[1] } {
  const listeners = new Map<string, Set<Listener>>();
  return { port: {
    addEventListener: (name: string, listener: Listener) => { const current = listeners.get(name) ?? new Set<Listener>(); current.add(listener); listeners.set(name, current); },
    hidden: false,
    querySelector: (selector: string) => selector.includes("data-motion-kill-switch") && killSwitch ? {} : null,
    querySelectorAll: () => [],
    removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
  } };
}
