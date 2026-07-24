import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
} from "../../src/command-center/command-center-assets.js";
import { COMMAND_CENTER_PREMIUM_CSS } from "../../src/command-center/command-center-premium-experience.js";

describe("Onlyway Cinematic Operating Experience", () => {
  it("maps every major operating surface to a semantic, truth-bound scene", () => {
    const scenes = [...COMMAND_CENTER_HTML.matchAll(/data-cinematic-scene="([^"]+)"/gu)]
      .map((match) => match[1]);

    expect(scenes).toEqual(expect.arrayContaining([
      "oracle",
      "command",
      "revenue",
      "revenue-journey",
      "venture-pulse",
      "control-plane",
      "studio-index",
      "venture",
      "business",
      "social",
      "production",
      "evidence",
      "creative-intelligence",
      "runtime",
      "tower",
      "approvals",
      "governance",
    ]));
    expect(new Set(scenes).size).toBe(scenes.length);
    expect(COMMAND_CENTER_HTML).toContain('data-cinematic-layer="identity"');
    expect(COMMAND_CENTER_HTML).toContain('data-cinematic-layer="light"');
    expect(COMMAND_CENTER_HTML).toContain('class="cc-cinematic-hud" aria-hidden="true"');
  });

  it("renders the real ORACLE responsibility chain without declaring fake activity", () => {
    expect(COMMAND_CENTER_HTML).toContain("Da intenzione a pacchetto verificabile.");
    for (const callSign of ["NEXUS", "ORACLE", "VECTOR", "PRISM", "FORGE"]) {
      expect(COMMAND_CENTER_HTML).toContain(`<span>${callSign}</span>`);
    }
    expect(COMMAND_CENTER_HTML).toContain("PROPOSAL-BOUND");
    expect(COMMAND_CENTER_HTML).toContain("MEDIA GATED");
    expect(COMMAND_CENTER_HTML).toContain("PUBLICATION LOCKED");
    expect(COMMAND_CENTER_HTML).not.toContain("75% COMPLETE");
    expect(COMMAND_CENTER_HTML).not.toContain("GENERATING NOW");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('proposal.canConfirm ? "PREFLIGHT READY" : "BLOCKED · " + proposal.reasonCode');
  });

  it("uses scroll only for decorative direction and selects the correct desktop or mobile scroll root", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("if (mobileSidebar.matches)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("documentNode.scrollHeight - window.innerHeight");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("scrollTarget.scrollHeight - scrollTarget.clientHeight");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('window.addEventListener("scroll", scroll');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('scrollTarget?.addEventListener("scroll", scroll');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('"--ow-cinema-progress-percent"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('"--ow-cinema-light-x"');
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("snapshot.overview.progress");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("fails closed for reduced motion, visibility and the authoritative runtime kill switch", () => {
    expect(COMMAND_CENTER_HTML).toContain('data-motion-kill-switch="active"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('root.dataset.motionKillSwitch = snapshot.runtime.killSwitch === "TRIGGERED" ? "active" : "inactive"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('root.dataset.motionKillSwitch === "active"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("prefersReducedMotion() || document.hidden");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("@media (prefers-reduced-motion:reduce)");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-main>[data-cinematic-scene]{opacity:1!important}");
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toContain("infinite");
  });

  it("keeps mobile in natural flow and exposes Revenue and Venture instead of deleting them", () => {
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("@media (max-width:820px)");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-revenue-journey,.cc-venture-today{display:block!important}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-overview-heading{backdrop-filter:none;background:transparent;position:static}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-cinematic-hud{display:none}");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-main{");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain("overflow-x:hidden");
  });

  it("rebinds cinematic observers after redacted render events without emitting snapshots", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain('emitMotion("render", { section: root.dataset.section || "today" })');
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain('emitMotion("render", snapshot)');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('window.addEventListener("onlyway:motion:render", routeOrRender)');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('window.removeEventListener("onlyway:motion:render", routeOrRender)');
  });

  it("keeps the approval asset visible before progressive audit detail", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain('card.classList.contains("cc-approval-review") ? 2 : 1');
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(".cc-visual-review{");
    expect(COMMAND_CENTER_HTML).toContain("CONTROLLO FABIO");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Programmazione e pubblicazione restano separate e bloccate.");
  });

  it("returns the ORACLE chamber to proposal-bound whenever its one-time confirmation closes", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("const wasOracleConfirmation = state.pendingConfirmation?.oracle === true");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('if (wasOracleConfirmation) text("oracle-cinematic-state", "PROPOSAL-BOUND")');
  });

  it("uses no external visual dependency and documents the maintenance contract", async () => {
    const guide = await readFile(new URL("../../docs/design/ONLYWAY_CINEMATIC_REFERENCE_ANALYSIS.md", import.meta.url), "utf8");
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toMatch(/https?:\/\//u);
    expect(COMMAND_CENTER_HTML).not.toMatch(/<img[^>]+src="https?:/u);
    expect(guide).toContain("## Cortometraggio 1");
    expect(guide).toContain("## Cortometraggio 2");
    expect(guide).toContain("## Principi comparati applicati");
    expect(guide).toContain("## Regole di manutenzione");
  });
});
