import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
} from "../../src/command-center/command-center-assets.js";
import { COMMAND_CENTER_PREMIUM_CSS } from "../../src/command-center/command-center-premium-experience.js";

describe("Onlyway Premium Command Center Experience", () => {
  it("defines one canonical visual system for hierarchy, spacing, type, motion and focus", () => {
    for (const token of [
      "--ow-surface-primary",
      "--ow-surface-decision",
      "--ow-surface-operational",
      "--ow-surface-evidence",
      "--ow-surface-warning",
      "--ow-space-1",
      "--ow-space-16",
      "--ow-type-display",
      "--ow-type-section",
      "--ow-type-numeric",
      "--ow-z-dialog",
      "--ow-motion-standard",
      "--ow-focus",
    ]) expect(COMMAND_CENTER_PREMIUM_CSS).toContain(token);

    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(":focus-visible");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("box-shadow:var(--ow-focus)!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("--ow-bronze-dark:var(--ow-text-tertiary)");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("min-height:44px");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("min-height:48px");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-tiktok-motion-preview-head button,");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-visual-review-nav button{");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-vault-sequence summary");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("display:list-item!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("min-height:44px!important");
  });

  it("keeps four destinations in a vertical desktop shell and a real mobile drawer", () => {
    const destinations = [...COMMAND_CENTER_HTML.matchAll(/data-view-target="([^"]+)"/gu)].map((match) => match[1]);
    expect(destinations).toEqual(["today", "studio", "team", "system"]);
    expect(COMMAND_CENTER_HTML).toContain('data-navigation="sidebar"');
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("grid-template-columns:var(--ow-sidebar-expanded) minmax(0,1fr)");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain('.cc-app[data-sidebar-state="compact"]');
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("width:min(86vw,340px)!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("transform:translateX(-104%)!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-oracle-composer .cc-oracle-mark{display:grid!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-oracle-composer textarea{grid-column:2;grid-row:1;min-width:0}");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("syncSidebarMode");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('sidebar.toggleAttribute("inert", mobileSidebar.matches && !drawerOpen)');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("visibleFocusControls(sidebar)");
  });

  it("makes Oggi founder-first and keeps ORACLE controls progressively disclosed", () => {
    expect(COMMAND_CENTER_HTML).toContain("FOUNDER COMMAND SURFACE");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-overview{order:4}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-revenue-hero{order:5}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-decision-inbox{order:1}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-hero-grid{order:2}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-metrics{order:3}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-oracle-composer:focus-within .cc-oracle-controls");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("pointer-events:none");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("max-height:0");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('route[0] === "studio" ? "Studio / "');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("establishFounderFirstOrder()");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("main.insertBefore(overview, revenue)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('section === "approvals" || section === "overview"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('"Oggi / Approvazioni"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("previousSection !== section");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("window.requestAnimationFrame(resetRouteScroll)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("window.setTimeout(resetRouteScroll, 0)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('emitMotion("route", { selector: "#" + section })');
  });

  it("uses only the official local brand asset and preserves the strict local CSP", async () => {
    const serverSource = await readFile(new URL("../../src/command-center/command-center-server.ts", import.meta.url), "utf8");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain('url("/assets/brand/onlyway-obsidian-chrome-original.png")');
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toMatch(/https?:\/\//u);
    expect(serverSource).toContain("default-src 'self'");
    expect(serverSource).toContain("connect-src 'self'");
    expect(serverSource).toContain("img-src 'self' data:");
    expect(serverSource).toContain("frame-ancestors 'none'");
    expect(serverSource).toContain("COMMAND_CENTER_PREMIUM_CSS");
  });

  it("keeps confirmation cancellation truthful while a governed POST is in flight", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("confirmationInFlight: false");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("if (!pending || state.confirmationInFlight) return");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("setConfirmationInFlight(true)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("if (state.confirmationInFlight && force !== true) return false");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('event.key === "Escape" && !actionConfirmation.hidden && !state.confirmationInFlight');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('control.toggleAttribute("inert", active)');
    expect(COMMAND_CENTER_HTML).toContain('id="action-confirmation-dialog"');
    expect(COMMAND_CENTER_HTML).toContain('tabindex="-1"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('actionConfirmationDialog.setAttribute("aria-busy", String(active))');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("actionConfirmationDialog.focus({ preventScroll: true })");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("const returnFocus = document.activeElement");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("if (replacement) replacement.focus()");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("keeps motion bounded, dynamic and semantically truthful", () => {
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("@media (prefers-reduced-motion:reduce)");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("animation:none!important");
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toContain("infinite");
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toContain("cursor:none");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("transform:none!important");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('JOB_FAILED: "FAILED"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('JOB_PAUSED: "PAUSED"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('JOB_QUEUED: "QUEUED"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("window.requestAnimationFrame(apply)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("state.ambientCleanup = prepareAmbientMotion()");
  });

  it("bounds live refresh work and releases background activity", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("lastAuxiliaryRefreshAt: 0");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Date.now() - state.lastAuxiliaryRefreshAt >= 15000");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("document.addEventListener(\"visibilitychange\", syncLiveVisibility)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("state.eventSource = null");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('image.decoding = "async"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('image.loading = "lazy"');
  });

  it("does not weaken governance, invent state or unlock publication", () => {
    expect(COMMAND_CENTER_HTML).toContain("Azioni esterne");
    expect(COMMAND_CENTER_HTML).toContain("BLOCCATE");
    expect(COMMAND_CENTER_HTML).toContain("Publication locked");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("pubblicazione LOCKED");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("effetti esterni ZERO");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("window.confirm");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("innerHTML");
  });
});
