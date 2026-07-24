import { animate, inView, stagger } from "motion";

export const COMMAND_CENTER_MOTION_CONTRACT_VERSION = "1" as const;
export const TIKTOK_MOTION_PREVIEW_MARKER = "PREVIEW_ONLY_NOT_RENDERED_VIDEO" as const;

export type GovernedMotionStatus = "AWAITING_FABIO" | "BLOCKED" | "COMPLETED" | "FAILED" | "IDLE" | "PAUSED" | "QUEUED" | "RUNNING";

export interface MotionControl {
  cancel?(): void;
  readonly finished?: Promise<unknown>;
  stop?(): void;
}

export interface MotionDriver {
  animate(target: unknown, keyframes: unknown, options?: unknown): MotionControl;
  inView(target: unknown, callback: (target: unknown) => void, options?: unknown): () => void;
  stagger(interval: number, options?: unknown): unknown;
}

export interface MotionUiAdapterOptions {
  readonly driver?: MotionDriver;
  readonly enabled?: () => boolean;
  readonly maxConcurrentAnimations?: number;
  readonly reducedMotion?: () => boolean;
}

export interface GovernedOperationalMotionEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly sequence: number;
  readonly status: GovernedMotionStatus;
}

export interface MotionUiAdapter {
  animateMetricChange(target: unknown): void;
  animatePanelEnter(target: unknown): void;
  animatePanelExit(target: unknown): void;
  animateReviewOpen(target: unknown): void;
  animateStatusTransition(target: unknown, status: GovernedMotionStatus): void;
  animateSuccessReceipt(target: unknown): void;
  animateTikTokPreview(target: unknown, beats: readonly unknown[]): void;
  animateValidationFailure(target: unknown): void;
  animateWorkflowProgress(target: unknown, event: GovernedOperationalMotionEvent): boolean;
  observePanels(target: unknown): () => void;
  stopActiveAnimations(): void;
  stopAllMotion(): void;
}

const ALLOWED_STATUSES = new Set<GovernedMotionStatus>(["AWAITING_FABIO", "BLOCKED", "COMPLETED", "FAILED", "IDLE", "PAUSED", "QUEUED", "RUNNING"]);
const DEFAULT_MAX_CONCURRENT_ANIMATIONS = 8;
const MAX_SEEN_EVENTS = 256;

const defaultDriver: MotionDriver = {
  animate,
  inView,
  stagger,
};

/**
 * Browser-only animation boundary. It receives already-authoritative state and
 * never mutates, advances, or persists business/domain state.
 */
export function createMotionUiAdapter(options: MotionUiAdapterOptions = {}): MotionUiAdapter {
  const driver = options.driver ?? defaultDriver;
  const enabled = options.enabled ?? (() => true);
  const reducedMotion = options.reducedMotion ?? (() => false);
  const maximum = boundedMaximum(options.maxConcurrentAnimations);
  const controls: MotionControl[] = [];
  const observers = new Set<() => void>();
  const seenEvents = new Set<string>();
  const seenOrder: string[] = [];

  const mayAnimate = (): boolean => enabled() && !reducedMotion();
  const track = (control: MotionControl): void => {
    controls.push(control);
    if (control.finished !== undefined) {
      void control.finished.then(
        () => { forgetControl(controls, control); },
        () => { forgetControl(controls, control); },
      );
    }
    while (controls.length > maximum) stopControl(controls.shift());
  };
  const run = (target: unknown, keyframes: unknown, transition: unknown): void => {
    if (!mayAnimate() || target === undefined || target === null) return;
    track(driver.animate(target, keyframes, transition));
  };

  const animatePanelEnter = (target: unknown): void => {
    run(target, { opacity: [0, 1], transform: ["translateY(10px)", "translateY(0px)"] }, { duration: 0.32, easing: [0.2, 0.75, 0.25, 1] });
  };
  const animatePanelExit = (target: unknown): void => {
    run(target, { opacity: [1, 0], transform: ["translateY(0px)", "translateY(-6px)"] }, { duration: 0.16, easing: "ease-in" });
  };
  const animateReviewOpen = (target: unknown): void => {
    run(target, { opacity: [0, 1], transform: ["translateY(8px) scale(0.985)", "translateY(0px) scale(1)"] }, { duration: 0.28, easing: [0.2, 0.75, 0.25, 1] });
  };
  const animateMetricChange = (target: unknown): void => {
    run(target, { opacity: [0.68, 1], transform: ["translateY(3px)", "translateY(0px)"] }, { duration: 0.22, easing: "ease-out" });
  };
  const animateValidationFailure = (target: unknown): void => {
    run(target, { transform: ["translateX(0px)", "translateX(-4px)", "translateX(4px)", "translateX(0px)"] }, { duration: 0.24, easing: "ease-out" });
  };
  const animateSuccessReceipt = (target: unknown): void => {
    run(target, { opacity: [0.62, 1], transform: ["scale(0.985)", "scale(1)"] }, { duration: 0.26, easing: "ease-out" });
  };
  const animateStatusTransition = (target: unknown, status: GovernedMotionStatus): void => {
    if (!ALLOWED_STATUSES.has(status)) return;
    if (status === "BLOCKED" || status === "FAILED") animateValidationFailure(target);
    else if (status === "COMPLETED") animateSuccessReceipt(target);
    else if (status === "AWAITING_FABIO") animateReviewOpen(target);
    else if (status === "RUNNING") run(target, { opacity: [0.72, 1], transform: ["scale(0.99)", "scale(1)"] }, { duration: 0.3, easing: "ease-out" });
    else if (status === "PAUSED") run(target, { opacity: [1, 0.68] }, { duration: 0.18, easing: "ease-out" });
    else if (status === "QUEUED") run(target, { opacity: [0.72, 1] }, { duration: 0.2, easing: "linear" });
  };
  const animateWorkflowProgress = (target: unknown, event: GovernedOperationalMotionEvent): boolean => {
    if (!validEvent(event) || seenEvents.has(event.eventId)) return false;
    seenEvents.add(event.eventId);
    seenOrder.push(event.eventId);
    while (seenOrder.length > MAX_SEEN_EVENTS) {
      const oldest = seenOrder.shift();
      if (oldest !== undefined) seenEvents.delete(oldest);
    }
    animateStatusTransition(target, event.status);
    return true;
  };
  const animateTikTokPreview = (target: unknown, beats: readonly unknown[]): void => {
    run(target, { opacity: [0.72, 1], transform: ["scale(1.018) translateY(3px)", "scale(1) translateY(0px)"] }, { duration: 0.44, easing: [0.2, 0.75, 0.25, 1] });
    if (beats.length > 0 && mayAnimate()) track(driver.animate(beats, { opacity: [0, 1], transform: ["translateY(9px)", "translateY(0px)"] }, { delay: driver.stagger(0.07), duration: 0.28, easing: "ease-out" }));
  };
  const observePanels = (target: unknown): (() => void) => {
    if (!enabled()) return () => undefined;
    const dispose = driver.inView(target, (visibleTarget) => { animatePanelEnter(visibleTarget); }, { amount: 0.12 });
    observers.add(dispose);
    return () => { dispose(); observers.delete(dispose); };
  };
  const stopActiveAnimations = (): void => {
    while (controls.length > 0) stopControl(controls.pop());
  };
  const stopAllMotion = (): void => {
    stopActiveAnimations();
    for (const dispose of observers) dispose();
    observers.clear();
  };

  return Object.freeze({ animateMetricChange, animatePanelEnter, animatePanelExit, animateReviewOpen, animateStatusTransition, animateSuccessReceipt, animateTikTokPreview, animateValidationFailure, animateWorkflowProgress, observePanels, stopActiveAnimations, stopAllMotion });
}

function validEvent(event: GovernedOperationalMotionEvent): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(event.eventId) && Number.isSafeInteger(event.sequence) && event.sequence >= 0 && ALLOWED_STATUSES.has(event.status) && /^[A-Z][A-Z0-9_]{1,63}$/u.test(event.eventType);
}

function boundedMaximum(candidate: number | undefined): number {
  const value = candidate ?? DEFAULT_MAX_CONCURRENT_ANIMATIONS;
  return Number.isSafeInteger(value) && value >= 1 && value <= 16 ? value : DEFAULT_MAX_CONCURRENT_ANIMATIONS;
}

function forgetControl(controls: MotionControl[], control: MotionControl): void {
  const index = controls.indexOf(control);
  if (index >= 0) controls.splice(index, 1);
}

function stopControl(control: MotionControl | undefined): void {
  if (control === undefined) return;
  if (typeof control.stop === "function") control.stop();
  else if (typeof control.cancel === "function") control.cancel();
}

interface BrowserEventLike { readonly detail?: unknown }
interface BrowserElementLike { setAttribute?(name: string, value: string): void }
interface BrowserMediaQuery { readonly matches: boolean; addEventListener?(name: "change", listener: () => void): void; removeEventListener?(name: "change", listener: () => void): void }
interface BrowserDocumentLike {
  readonly hidden?: boolean;
  addEventListener(name: string, listener: (event: BrowserEventLike) => void): void;
  querySelector(selector: string): unknown;
  querySelectorAll(selector: string): readonly unknown[];
  removeEventListener(name: string, listener: (event: BrowserEventLike) => void): void;
}
interface BrowserWindowLike {
  addEventListener(name: string, listener: (event: BrowserEventLike) => void): void;
  matchMedia?(query: string): BrowserMediaQuery;
  removeEventListener(name: string, listener: (event: BrowserEventLike) => void): void;
}

export interface InstalledCommandCenterMotion { readonly adapter: MotionUiAdapter; dispose(): void }

export function installCommandCenterMotion(browserWindow: BrowserWindowLike, browserDocument: BrowserDocumentLike): InstalledCommandCenterMotion {
  const reducedQuery = browserWindow.matchMedia?.("(prefers-reduced-motion: reduce)");
  const root = browserDocument.querySelector("#command-center") as BrowserElementLike | null;
  root?.setAttribute?.("data-motion-ui", "ready");
  root?.setAttribute?.("data-motion-reduced", String(reducedQuery?.matches === true));
  const killSwitch = (): boolean => Boolean(browserDocument.querySelector('[data-motion-kill-switch="active"]'));
  const adapter = createMotionUiAdapter({ enabled: () => !killSwitch(), reducedMotion: () => reducedQuery?.matches === true });
  adapter.observePanels(browserDocument.querySelectorAll(".cc-main > [data-primary-view], [data-studio-panel]"));

  const route = (event: BrowserEventLike): void => {
    const detail = record(event.detail);
    adapter.stopActiveAnimations();
    const selector = typeof detail?.selector === "string" && /^#[a-zA-Z0-9_-]{1,80}$/u.test(detail.selector) ? detail.selector : undefined;
    if (selector !== undefined) adapter.animatePanelEnter(browserDocument.querySelector(selector));
  };
  const operational = (event: BrowserEventLike): void => {
    const detail = governedEvent(event.detail);
    if (detail === undefined) return;
    if (detail.eventType === "KILL_SWITCH_CHANGED") { adapter.stopActiveAnimations(); return; }
    adapter.animateWorkflowProgress(browserDocument.querySelector("#command-form"), detail);
  };
  const review = (): void => { adapter.animateReviewOpen(browserDocument.querySelector("#action-confirmation .cc-authorization-dialog")); };
  const validation = (): void => { adapter.animateValidationFailure(browserDocument.querySelector("#command-form")); };
  const receipt = (): void => { adapter.animateSuccessReceipt(browserDocument.querySelector("#command-result")); };
  const preview = (event: BrowserEventLike): void => {
    const detail = record(event.detail);
    if (detail?.marker !== TIKTOK_MOTION_PREVIEW_MARKER) return;
    const target = browserDocument.querySelector('[data-motion-preview="tiktok"]');
    adapter.animateTikTokPreview(target, browserDocument.querySelectorAll('[data-motion-preview="tiktok"] [data-motion-preview-beat]'));
  };
  const stop = (): void => { adapter.stopActiveAnimations(); };
  const reducedChange = (): void => { root?.setAttribute?.("data-motion-reduced", String(reducedQuery?.matches === true)); stop(); };
  const visibility = (): void => { if (browserDocument.hidden === true) stop(); };

  const listeners = [["onlyway:motion:route", route], ["onlyway:motion:operational", operational], ["onlyway:motion:review", review], ["onlyway:motion:validation", validation], ["onlyway:motion:receipt", receipt], ["onlyway:motion:tiktok-preview", preview], ["onlyway:motion:stop", stop], ["beforeunload", stop]] as const;
  for (const [name, listener] of listeners) browserWindow.addEventListener(name, listener);
  browserDocument.addEventListener("visibilitychange", visibility);
  reducedQuery?.addEventListener?.("change", reducedChange);

  return Object.freeze({
    adapter,
    dispose: () => {
      adapter.stopAllMotion();
      for (const [name, listener] of listeners) browserWindow.removeEventListener(name, listener);
      browserDocument.removeEventListener("visibilitychange", visibility);
      reducedQuery?.removeEventListener?.("change", reducedChange);
    },
  });
}

function governedEvent(value: unknown): GovernedOperationalMotionEvent | undefined {
  const candidate = record(value);
  if (candidate === undefined || typeof candidate.eventId !== "string" || typeof candidate.eventType !== "string" || typeof candidate.sequence !== "number" || typeof candidate.status !== "string") return undefined;
  const event = { eventId: candidate.eventId, eventType: candidate.eventType, sequence: candidate.sequence, status: candidate.status as GovernedMotionStatus };
  return validEvent(event) ? event : undefined;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }

const runtime = globalThis as unknown as { readonly document?: BrowserDocumentLike; readonly window?: BrowserWindowLike; readonly __ONLYWAY_MOTION_INSTALLED__?: boolean };
if (runtime.window !== undefined && runtime.document !== undefined && runtime.__ONLYWAY_MOTION_INSTALLED__ !== true) {
  (runtime as { __ONLYWAY_MOTION_INSTALLED__?: boolean }).__ONLYWAY_MOTION_INSTALLED__ = true;
  installCommandCenterMotion(runtime.window, runtime.document);
}
