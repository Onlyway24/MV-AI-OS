import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
  COMMAND_CENTER_RESPONSIVE_CSS,
} from "../../src/command-center/command-center-assets.js";

describe("Command Center focused information architecture", () => {
  it("exposes four primary destinations and keeps specialist tools inside Studio", () => {
    const primaryViews = [...COMMAND_CENTER_HTML.matchAll(/data-view-target="([^"]+)"/gu)]
      .map((match) => match[1]);
    const studioTools = [...COMMAND_CENTER_HTML.matchAll(/data-studio-target="([^"]+)"/gu)]
      .map((match) => match[1]);

    expect(primaryViews).toEqual(["today", "studio", "team", "system"]);
    expect(studioTools).toEqual(["production", "social", "business", "evidence", "vault", "venture"]);
    expect(COMMAND_CENTER_HTML.match(/data-studio-panel=/gu)).toHaveLength(6);
    expect(COMMAND_CENTER_HTML).toContain('aria-controls="vault"');
    expect(COMMAND_CENTER_HTML).toContain('aria-labelledby="studio-tab-vault"');
    expect(COMMAND_CENTER_HTML).toContain("Buongiorno, Fabio.");
    expect(COMMAND_CENTER_HTML).toContain("Qui trovi il prossimo collo di bottiglia tra lavoro e ricavo.");
    expect(COMMAND_CENTER_HTML).toContain("Intelligence Creativa");
    expect(COMMAND_CENTER_HTML).toContain("ONLYWAY REVENUE OPERATING SYSTEM");
    expect(COMMAND_CENTER_HTML).toContain('id="revenue-stage-list"');
    expect(COMMAND_CENTER_HTML).toContain('id="revenue-readiness-grid"');
    expect(COMMAND_CENTER_HTML).toContain('id="venture"');
    expect(COMMAND_CENTER_HTML.match(/data-venture-target=/gu)).toHaveLength(8);
  });

  it("renders only durable Vault state and keeps navigation non-mutating", () => {
    expect(COMMAND_CENTER_HTML).toContain('id="reference-vault-gallery"');
    expect(COMMAND_CENTER_HTML).toContain('id="reference-vault-detail"');
    expect(COMMAND_CENTER_HTML).toContain('aria-live="polite"');
    expect(COMMAND_CENTER_HTML).toContain('id="visual-fingerprint-panel"');
    expect(COMMAND_CENTER_HTML).toContain('id="writing-fingerprint-panel"');
    expect(COMMAND_CENTER_HTML).toContain('id="business-context-panel"');
    expect(COMMAND_CENTER_HTML).toContain('id="decision-memory-panel"');
    expect(COMMAND_CENTER_HTML).toContain('id="approved-rejected-comparison"');
    expect(COMMAND_CENTER_HTML).toContain('id="carousel-sequence-panel"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderReferenceVault(snapshot.referenceVault");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderRevenue(snapshot.revenue");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("PIPELINE_AGGREGATE_NOT_AVAILABLE");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("DRAFT INTERNO · INVIO BLOCCATO");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("innerHTML");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Nessuna azione è stata eseguita.");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('vault: ["studio", "vault"]');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("isVaultRightsBlocked");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('typeof asset.eligible === "boolean"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Idoneità creative direction");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Privacy / retention");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderVaultComparison");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("renderVaultSequences");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('card.setAttribute("aria-controls", "reference-vault-detail")');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("finestra parziale");
    expect(COMMAND_CENTER_CLIENT_JS).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('window.scrollTo({ behavior: prefersReducedMotion() ? "auto" : "smooth"');
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("IMPORT_REFERENCE_ASSET");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("APPROVE_REFERENCE_ASSET");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("turns the top command into a governed ORACLE composer without hiding media blockers", () => {
    expect(COMMAND_CENTER_HTML).toContain('id="command-input"');
    expect(COMMAND_CENTER_HTML).toContain('aria-describedby="command-help command-result"');
    expect(COMMAND_CENTER_HTML).toContain('maxlength="240"');
    expect(COMMAND_CENTER_HTML).toContain('id="command-business-mission"');
    expect(COMMAND_CENTER_HTML).toContain('value="IMAGE_MASTER"');
    expect(COMMAND_CENTER_HTML).toContain('value="VIDEO_RENDER"');
    expect(COMMAND_CENTER_HTML).toContain('value="CAROUSEL" checked disabled');
    expect(COMMAND_CENTER_HTML).toContain('value="TIKTOK_VIDEO_BLUEPRINT" checked disabled');
    expect(COMMAND_CENTER_HTML).toContain('value="IMAGE_MASTER" />');
    expect(COMMAND_CENTER_HTML).toContain('id="command-navigate"');
    expect(COMMAND_CENTER_HTML).toContain('id="command-submit"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('/api/prompt-missions/propose');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('/api/prompt-missions/confirm');
    expect(COMMAND_CENTER_HTML).toContain('NEXUS coordina ORACLE, VECTOR, PRISM e FORGE');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('proposal.providerCalls');
    expect(COMMAND_CENTER_CLIENT_JS).toContain('proposal.publication + " · effetti esterni ZERO"');
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("window.confirm");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-oracle-composer");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-oracle-deliverables label{font-size:10px;min-height:44px");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-oracle-actions button{width:100%}");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("uses progressive disclosure and a 390 px bottom dock without horizontal overflow", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain("collapseCardDetails");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("@media (max-width:430px)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("grid-template-columns:repeat(4,1fr)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("height:56px!important");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("backdrop-filter:none!important;overflow:visible!important");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("justify-self:stretch;width:calc(100vw - 20px)");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-agent-company-layout--apex{grid-template-columns:minmax(0,1fr)}");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-agent-roster,.cc-agent-company-layout--apex .cc-agent-grid");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("max-width:100%;overflow:hidden");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-vault-filters button{min-height:44px}");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("min-height:44px");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("overflow-x:hidden");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain(".cc-mobile-menu");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("display:none!important");
    expect(COMMAND_CENTER_RESPONSIVE_CSS).toContain("[hidden]{display:none!important}");
  });
});
