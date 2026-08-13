import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import { COMMAND_CENTER_CLIENT_JS, COMMAND_CENTER_HTML, COMMAND_CENTER_RESPONSIVE_CSS } from "../../src/command-center/command-center-assets.js";

describe("Command Center Venture Studio", () => {
  it("keeps the four-area shell and exposes eight progressively disclosed venture tools", () => {
    const primary = [...COMMAND_CENTER_HTML.matchAll(/data-view-target="([^"]+)"/gu)].map((match) => match[1]);
    const venture = [...COMMAND_CENTER_HTML.matchAll(/data-venture-target="([^"]+)"/gu)].map((match) => match[1]);
    expect(primary).toEqual(["today", "studio", "team", "system"]);
    expect(venture).toEqual(["radar", "pipeline", "portfolio", "capital", "experiments", "dossier", "assets", "decisions"]);
    expect(COMMAND_CENTER_HTML.match(/data-venture-panel=/gu)).toHaveLength(8);
    expect(COMMAND_CENTER_HTML).toContain("Dal segnale alla decisione Founder");
    expect(COMMAND_CENTER_HTML).toContain("azioni esterne LOCKED");
    expect(COMMAND_CENTER_HTML).not.toContain("Approva Venture");
  });

  it("renders durable empty states and explicit lock/NOT_AVAILABLE semantics without HTML injection", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderVentureStudio(snapshot.venture");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("unavailableVentureView");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Nessun record durevole disponibile");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("non crea attività, domanda o risultati dimostrativi");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("PUBLICATION_LOCKED");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("EXTERNAL_ACTION_LOCKED");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("innerHTML");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("supports keyboard navigation, reduced motion, touch targets and narrow viewports", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("showVentureTool");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-venture-tool-tabs button");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("min-height:44px");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("@media (max-width:430px)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("max-width:calc(100vw - 32px)");
  });
});
