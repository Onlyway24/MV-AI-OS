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
      "animateCinematicSceneEnter", "animateMetricChange", "animatePanelEnter", "animatePanelExit", "animateReviewOpen", "animateStatusTransition", "animateSuccessReceipt", "animateTikTokPreview", "animateValidationFailure", "animateWorkflowProgress", "observeCinematicScenes", "observePanels", "stopActiveAnimations", "stopAllMotion",
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

  it("caps all cinematic and operational motion at eight concurrent controls", () => {
    const fake = fakeDriver();
    const adapter = createMotionUiAdapter({ driver: fake.driver, maxConcurrentAnimations: 64 });
    for (let index = 0; index < 9; index += 1) adapter.animateCinematicSceneEnter({});
    expect(fake.animations).toHaveLength(9);
    expect(fake.stopped).toBe(1);
    adapter.stopAllMotion();
    expect(fake.stopped).toBe(9);
  });

  it("observes cinematic scenes through the same Motion boundary and disposes idempotently", () => {
    const fake = fakeDriver();
    const adapter = createMotionUiAdapter({ driver: fake.driver });
    const dispose = adapter.observeCinematicScenes([{}]);
    expect(fake.observations).toBe(1);
    expect(fake.activeObservers).toBe(1);
    expect(JSON.stringify(fake.keyframes[0])).toContain("opacity");
    expect(JSON.stringify(fake.keyframes[0])).not.toContain("transform");
    dispose();
    dispose();
    expect(fake.observerDisposals).toBe(1);
    expect(fake.activeObservers).toBe(0);
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

  it("keeps panel observers alive when route or visibility only stops active animation", () => {
    let disposed = 0;
    const fake = fakeDriver();
    const driver: MotionDriver = { ...fake.driver, inView: () => () => { disposed += 1; } };
    const adapter = createMotionUiAdapter({ driver });
    adapter.observePanels({});
    adapter.animatePanelEnter({});
    adapter.stopActiveAnimations();
    expect(disposed).toBe(0);
    adapter.stopAllMotion();
    expect(disposed).toBe(1);
  });

  it("rebinds panel and cinematic observers without duplicates after render and route lifecycle events", () => {
    const fake = fakeDriver();
    const windowPort = fakeWindow();
    const documentPort = lifecycleDocument();
    const installed = installCommandCenterMotion(windowPort.port, documentPort.port, { driver: fake.driver });
    expect(fake.observations).toBe(2);
    expect(fake.activeObservers).toBe(2);

    windowPort.emit("onlyway:motion:render", { selector: "#today-view" });
    expect(fake.observations).toBe(4);
    expect(fake.observerDisposals).toBe(2);
    expect(fake.activeObservers).toBe(2);

    windowPort.emit("onlyway:motion:route", { selector: "#studio-view" });
    expect(fake.observations).toBe(6);
    expect(fake.observerDisposals).toBe(4);
    expect(fake.activeObservers).toBe(2);

    installed.dispose();
    expect(fake.observerDisposals).toBe(6);
    expect(fake.activeObservers).toBe(0);
  });

  it("fails closed while hidden, reduced, or kill-switched and resumes only after an authoritative rebind", () => {
    const fake = fakeDriver();
    const windowPort = fakeWindow();
    const documentPort = lifecycleDocument();
    const installed = installCommandCenterMotion(windowPort.port, documentPort.port, { driver: fake.driver });
    expect(fake.activeObservers).toBe(2);

    documentPort.setHidden(true);
    documentPort.emit("visibilitychange");
    expect(fake.activeObservers).toBe(0);
    const observationsWhileHidden = fake.observations;
    windowPort.emit("onlyway:motion:render", { selector: "#today-view" });
    expect(fake.observations).toBe(observationsWhileHidden);

    documentPort.setHidden(false);
    documentPort.emit("visibilitychange");
    expect(fake.activeObservers).toBe(2);

    windowPort.setReduced(true);
    expect(fake.activeObservers).toBe(0);
    const observationsWhileReduced = fake.observations;
    windowPort.emit("onlyway:motion:render", {});
    expect(fake.observations).toBe(observationsWhileReduced);

    windowPort.setReduced(false);
    expect(fake.activeObservers).toBe(2);
    documentPort.setKillSwitch(true);
    windowPort.emit("onlyway:motion:operational", { eventId: "kill-1", eventType: "KILL_SWITCH_CHANGED", sequence: 10, status: "PAUSED" });
    expect(fake.activeObservers).toBe(0);

    documentPort.setKillSwitch(false);
    windowPort.emit("onlyway:motion:render", {});
    expect(fake.activeObservers).toBe(2);
    installed.dispose();
  });

  it("represents FAILED and PAUSED as bounded terminal states without fake progress", () => {
    const fake = fakeDriver();
    const adapter = createMotionUiAdapter({ driver: fake.driver });
    expect(adapter.animateWorkflowProgress({}, { eventId: "event-failed", eventType: "JOB_FAILED", sequence: 8, status: "FAILED" })).toBe(true);
    expect(adapter.animateWorkflowProgress({}, { eventId: "event-paused", eventType: "JOB_PAUSED", sequence: 9, status: "PAUSED" })).toBe(true);
    expect(JSON.stringify(fake.keyframes[0])).toContain("translateX");
    expect(JSON.stringify(fake.keyframes[1])).toContain("opacity");
    expect(JSON.stringify(fake.keyframes[1])).not.toContain("translate");
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

function fakeDriver(): {
  readonly activeObservers: number;
  readonly animations: MotionControl[];
  readonly driver: MotionDriver;
  readonly keyframes: unknown[];
  readonly observations: number;
  readonly observerDisposals: number;
  readonly stopped: number;
} {
  const state = { activeObservers: 0, animations: [] as MotionControl[], keyframes: [] as unknown[], observations: 0, observerDisposals: 0, stopped: 0 };
  const driver: MotionDriver = {
    animate: (_target, keyframes) => {
      state.keyframes.push(keyframes);
      const control = { stop: () => { state.stopped += 1; } };
      state.animations.push(control);
      return control;
    },
    inView: (_target, callback) => {
      state.observations += 1;
      state.activeObservers += 1;
      callback({});
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        state.observerDisposals += 1;
        state.activeObservers -= 1;
      };
    },
    stagger: () => 0,
  };
  return {
    get activeObservers() { return state.activeObservers; },
    get animations() { return state.animations; },
    driver,
    get keyframes() { return state.keyframes; },
    get observations() { return state.observations; },
    get observerDisposals() { return state.observerDisposals; },
    get stopped() { return state.stopped; },
  };
}

type Listener = (event: { readonly detail?: unknown }) => void;

function fakeWindow(): {
  readonly port: Parameters<typeof installCommandCenterMotion>[0];
  emit(name: string, detail: unknown): void;
  setReduced(value: boolean): void;
} {
  const listeners = new Map<string, Set<Listener>>();
  const reducedListeners = new Set<() => void>();
  let reduced = false;
  const port = {
    addEventListener: (name: string, listener: Listener) => { const current = listeners.get(name) ?? new Set<Listener>(); current.add(listener); listeners.set(name, current); },
    matchMedia: () => ({
      addEventListener: (_name: "change", listener: () => void) => { reducedListeners.add(listener); },
      get matches() { return reduced; },
      removeEventListener: (_name: "change", listener: () => void) => { reducedListeners.delete(listener); },
    }),
    removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
  };
  return {
    port,
    emit: (name, detail) => { for (const listener of listeners.get(name) ?? []) listener({ detail }); },
    setReduced: (value) => {
      reduced = value;
      for (const listener of reducedListeners) listener();
    },
  };
}

function fakeDocument(killSwitch: boolean): { readonly port: Parameters<typeof installCommandCenterMotion>[1] } {
  const listeners = new Map<string, Set<Listener>>();
  return { port: {
    addEventListener: (name: string, listener: Listener) => { const current = listeners.get(name) ?? new Set<Listener>(); current.add(listener); listeners.set(name, current); },
    hidden: false,
    querySelector: (selector: string) => selector.includes('data-motion-kill-switch="inactive"') && !killSwitch ? {} : null,
    querySelectorAll: () => [],
    removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
  } };
}

function lifecycleDocument(): {
  readonly port: Parameters<typeof installCommandCenterMotion>[1];
  emit(name: string): void;
  setHidden(value: boolean): void;
  setKillSwitch(value: boolean): void;
} {
  const listeners = new Map<string, Set<Listener>>();
  let hidden = false;
  let killSwitch = false;
  const root = { setAttribute: () => undefined };
  const port = {
    addEventListener: (name: string, listener: Listener) => { const current = listeners.get(name) ?? new Set<Listener>(); current.add(listener); listeners.set(name, current); },
    get hidden() { return hidden; },
    querySelector: (selector: string) => {
      if (selector === "#command-center") return root;
      if (selector.includes('data-motion-kill-switch="inactive"')) return killSwitch ? null : {};
      return {};
    },
    querySelectorAll: () => [{}],
    removeEventListener: (name: string, listener: Listener) => { listeners.get(name)?.delete(listener); },
  };
  return {
    port,
    emit: (name) => { for (const listener of listeners.get(name) ?? []) listener({}); },
    setHidden: (value) => { hidden = value; },
    setKillSwitch: (value) => { killSwitch = value; },
  };
}
