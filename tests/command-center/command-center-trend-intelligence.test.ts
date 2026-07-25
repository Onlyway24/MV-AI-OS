import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
} from "../../src/command-center/command-center-assets.js";
import { COMMAND_CENTER_PREMIUM_CSS } from "../../src/command-center/command-center-premium-experience.js";

describe("Command Center Trend Intelligence Network", () => {
  it("exposes one compact Station flight deck and one detailed Social source network", () => {
    expect(COMMAND_CENTER_HTML).toContain('id="trend-operations-deck"');
    expect(COMMAND_CENTER_HTML).toContain('id="trend-operations-pipeline"');
    expect(COMMAND_CENTER_HTML).toContain('id="trend-operations-pipeline" aria-label="Pipeline Trend Intelligence · scorri orizzontalmente sui display compatti" tabindex="0"');
    expect(COMMAND_CENTER_HTML).toContain('id="trend-operations-cells"');
    expect(COMMAND_CENTER_HTML).toContain('id="trend-operations-candidates"');
    expect(COMMAND_CENTER_HTML).toContain('id="trend-source-network"');
    expect(COMMAND_CENTER_HTML).toContain("ATTENTION SIGNAL ≠ VERIFIED DEMAND");
    expect(COMMAND_CENTER_HTML).toContain("PAID PROVIDERS LOCKED");
    expect(COMMAND_CENTER_HTML).toContain(
      "FABIO DECIDES · EXTERNAL WRITES LOCKED",
    );
    expect(COMMAND_CENTER_HTML).not.toMatch(
      /\b(?:revenue verified|guaranteed demand|autonomous publishing)\b/iu,
    );
  });

  it("renders only the bounded server projection and fails closed without it", () => {
    const renderTrend = functionBlock(
      COMMAND_CENTER_CLIENT_JS,
      "renderTrendOperations",
    );
    const calls = COMMAND_CENTER_CLIENT_JS.match(
      /^\s*renderTrendOperations\(snapshot\.trendOperations \|\| null\);\s*$/gmu,
    ) ?? [];

    expect(calls).toHaveLength(1);
    expect(renderTrend).toContain("Array.isArray(view.pipeline)");
    expect(renderTrend).toContain("Array.isArray(view.cells)");
    expect(renderTrend).toContain("Array.isArray(view.candidates)");
    expect(renderTrend).toContain("Array.isArray(view.sources)");
    expect(renderTrend).toContain("view.candidates.slice(0, 3)");
    expect(renderTrend).toContain("Nessun segnale viene simulato.");
    expect(renderTrend).toContain("Nessuna receipt osservata");
    expect(renderTrend).not.toContain("fetch(");
    expect(renderTrend).not.toContain("EventSource");
    expect(renderTrend).not.toContain("Math.random");
    expect(renderTrend).not.toContain("setInterval");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("innerHTML");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("keeps policy, capability, connector and data independent in the DOM contract", () => {
    const renderTrend = functionBlock(
      COMMAND_CENTER_CLIENT_JS,
      "renderTrendOperations",
    );
    for (const field of [
      "source.policyStatus",
      "source.capabilityStatus",
      "source.connectorStatus",
      "source.dataStatus",
      "source.latestReceipt",
      "view.summary.authorizedPolicies",
      "view.summary.cataloguedCapabilities",
      "view.summary.receiptBackedConnectors",
      "view.summary.dataStatus",
      "view.publication",
    ]) {
      expect(renderTrend).toContain(field);
    }
    expect(renderTrend).toContain("ATTENTION SIGNAL — NOT VERIFIED DEMAND");
    expect(COMMAND_CENTER_PREMIUM_CSS).toContain(
      "grid-template-columns:repeat(6,minmax(0,1fr))",
    );
  });

  it("uses a deliberate mobile composition without external assets or endless motion", () => {
    const mobile = between(
      COMMAND_CENTER_PREMIUM_CSS,
      "@media (max-width:820px){",
      "@media (max-width:430px){",
    );
    const reduced = fromMarker(
      COMMAND_CENTER_PREMIUM_CSS,
      "@media (prefers-reduced-motion:reduce){",
    );

    expect(mobile).toContain(".cc-trend-deck-grid{grid-template-columns:1fr}");
    expect(mobile).toContain(".cc-trend-cells{grid-template-columns:1fr}");
    expect(mobile).toContain(".cc-trend-sources{grid-template-columns:1fr}");
    expect(mobile).toContain("overflow-x:auto");
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toMatch(/https?:\/\//u);
    expect(COMMAND_CENTER_PREMIUM_CSS).not.toContain("infinite");
    expect(reduced).toContain("animation:none!important");
  });
});

function functionBlock(source: string, name: string): string {
  const marker = `  function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${name} function not found`);
  const end = source.indexOf("\n  function ", start + marker.length);
  return source.slice(start, end < 0 ? source.length : end);
}

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${startMarker} not found`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`${endMarker} not found after ${startMarker}`);
  return source.slice(start, end);
}

function fromMarker(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${marker} not found`);
  return source.slice(start);
}
