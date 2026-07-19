import { describe, expect, it } from "vitest";
import { Script } from "node:vm";

import { OPERATIONAL_AGENT_IDS } from "../../src/agent-company/operational-agent-company.js";
import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
  COMMAND_CENTER_RESPONSIVE_CSS,
} from "../../src/command-center/command-center-assets.js";

describe("Command Center Squad Apex roster", () => {
  it("maps every operational agent exactly once to an original visual identity", () => {
    const mappedIds = [...COMMAND_CENTER_CLIENT_JS.matchAll(/^\s{4}"([^"]+)": \{ callSign:/gmu)]
      .map((match) => match[1]);
    const callSigns = [...COMMAND_CENTER_CLIENT_JS.matchAll(/callSign: "([^"]+)"/gu)]
      .map((match) => match[1]);

    expect(mappedIds).toEqual([...OPERATIONAL_AGENT_IDS]);
    expect(new Set(mappedIds).size).toBe(OPERATIONAL_AGENT_IDS.length);
    expect(callSigns).toHaveLength(OPERATIONAL_AGENT_IDS.length);
    expect(new Set(callSigns).size).toBe(OPERATIONAL_AGENT_IDS.length);
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("Marvel");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("Avengers");
  });

  it("provides a keyboard-operable roster, filters, real telemetry slots, and a dossier", () => {
    const filters = [...COMMAND_CENTER_HTML.matchAll(/data-agent-filter="([^"]+)"/gu)]
      .map((match) => match[1]);

    expect(filters).toEqual([
      "ALL",
      "COMMAND",
      "INTELLIGENCE",
      "STUDIO",
      "GROWTH",
      "BUILD",
      "GUARDIANS",
    ]);
    expect(COMMAND_CENTER_HTML).toContain("id=\"agent-dossier\"");
    expect(COMMAND_CENTER_HTML).toContain("id=\"team-total\"");
    expect(COMMAND_CENTER_HTML).toContain("id=\"apex-squads\">—");
    expect(COMMAND_CENTER_HTML).toContain("id=\"apex-guardians\"");
    expect(COMMAND_CENTER_HTML).toContain("Non diciassette chatbot.");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderTeamPulse(snapshot.agents)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('text("apex-squads", number(squads))');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderAgentDossier(selected)");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('button.setAttribute("aria-pressed"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('link.setAttribute("aria-current", "page")');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('main.toggleAttribute("inert", drawerOpen)');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('main.setAttribute("aria-hidden", "true")');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('sidebar.toggleAttribute("inert"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('sidebar.setAttribute("aria-hidden", "true")');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('mobileSidebar.addEventListener("change"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("focusedAgentId");
    expect(COMMAND_CENTER_HTML).toContain("TASK COMPLETATI");
  });

  it("ships responsive cinematic styles and syntactically valid client JavaScript", () => {
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-tower-intro");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-agent-dossier");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain('.cc-agent[data-squad="GUARDIANS"]');
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("@media (max-width:820px)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-skip-link:focus");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });
});
