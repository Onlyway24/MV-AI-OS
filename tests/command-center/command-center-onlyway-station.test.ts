import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  COMMAND_CENTER_CLIENT_JS,
  COMMAND_CENTER_HTML,
} from "../../src/command-center/command-center-assets.js";
import { COMMAND_CENTER_PREMIUM_CSS } from "../../src/command-center/command-center-premium-experience.js";

const STATION_DESTINATIONS = [
  "agents",
  "approvals",
  "business",
  "evidence",
  "production",
  "social",
  "system",
  "vault",
  "venture",
] as const;

const STATION_ROOM_IDS = [
  "archives",
  "command",
  "communications",
  "factory",
  "publishing",
  "research",
  "treasury",
  "venture",
  "war_room",
] as const;

describe("Onlyway Station frontend contract", () => {
  it("exposes a semantic shell for nine unique server-projected rooms and existing destinations", () => {
    const station = elementById(COMMAND_CENTER_HTML, "section", "station");
    const roomIds = [
      ...COMMAND_CENTER_PREMIUM_CSS.matchAll(
        /\.cc-station-room\[data-station-room="([^"]+)"\]/gu,
      ),
    ].map((match) => match[1] ?? "");
    const renderStation = functionBlock(COMMAND_CENTER_CLIENT_JS, "renderStation");

    expect(station).toContain('data-primary-view="today"');
    expect(station).toContain('data-cinematic-scene="station"');
    expect(station).toContain('id="station-room-grid"');
    expect(station).toMatch(/snapshot locale/iu);
    expect(new Set(roomIds).size).toBe(9);
    expect([...new Set(roomIds)].sort()).toEqual([...STATION_ROOM_IDS].sort());
    expect(renderStation).toContain("for (const room of station.rooms)");
    expect(renderStation).toContain("link.href = room.href");
    expect(renderStation).toContain("link.dataset.stationRoom = room.roomId");
    expect(renderStation).toContain("roomTarget.append(link)");

    for (const destination of STATION_DESTINATIONS) {
      expect(COMMAND_CENTER_CLIENT_JS).toMatch(
        new RegExp(`(?:^|\\s)${destination}: \\["(?:today|studio|system|team)", "[-a-z]+"\\]`, "u"),
      );
    }
  });

  it("renders the Station exactly once per authoritative snapshot and keeps its route truth-bound", () => {
    const renderStation = functionBlock(COMMAND_CENTER_CLIENT_JS, "renderStation");
    const calls = COMMAND_CENTER_CLIENT_JS.match(
      /^\s*renderStation\(snapshot\.station \|\| null\);\s*$/gmu,
    ) ?? [];

    expect(calls).toHaveLength(1);
    expect(COMMAND_CENTER_CLIENT_JS).toContain('station: ["today", "production"]');
    for (const source of [
      "station.coverage",
      "station.opportunityLanes",
      "station.rooms",
      "room.callSign",
      "room.coverage",
      "room.detail",
      "room.href",
      "room.metric",
      "room.owners",
      "room.status",
    ]) {
      expect(renderStation).toContain(source);
    }
    expect(renderStation).toContain(
      "!station || !Array.isArray(station.rooms) || !Array.isArray(station.opportunityLanes)",
    );
    expect(renderStation).toContain("Nessuno stato operativo viene dedotto.");
    expect(renderStation).not.toContain("snapshot.");
    expect(renderStation).not.toContain("fetch(");
    expect(renderStation).not.toContain("EventSource");
    expect(renderStation).not.toContain("Math.random");
    expect(renderStation).not.toContain("setInterval");
    expect(renderStation).not.toContain("requestAnimationFrame");
    expect(() => new Script(COMMAND_CENTER_CLIENT_JS)).not.toThrow();
  });

  it("keeps publication and external actions visibly locked without fake revenue or progress", () => {
    const station = elementById(COMMAND_CENTER_HTML, "section", "station");

    expect(station).toMatch(/AZIONI ESTERNE<\/small><strong>LOCKED<\/strong>/u);
    expect(station).toMatch(/PUBBLICAZIONE<\/small><strong>LOCKED<\/strong>/u);
    expect(station).toContain("EXTERNAL EFFECTS LOCKED");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain("innerHTML");
    expect(station).not.toMatch(/(?:[$€£]\s*\d|\b\d+(?:[.,]\d+)?\s*(?:EUR|USD)\b)/iu);
    expect(station).not.toMatch(/\b(?:trillion|billion|million)\b/iu);
    expect(station).not.toMatch(/\b\d{1,3}\s*%\b|\bprogress(?:o|ion)?\b/iu);
    expect(station).not.toMatch(/\b(?:GENERATING NOW|ACTIVE NOW|REVENUE VERIFIED|PUBLISHED|UNLOCKED)\b/iu);
  });

  it("rejects borrowed identities, coercive language and copy-first positioning", () => {
    const station = elementById(COMMAND_CENTER_HTML, "section", "station");
    const forbiddenLanguage =
      /\b(?:ultron|hermes|nova|minions?|slaves?|dungeon|eternity|whips?|quarters)\b|schiav|frust|costrett/iu;

    expect(station).not.toMatch(forbiddenLanguage);
    expect(station).not.toMatch(/\bcopy other(?:'s)?\b|\bcopia(?:re|ndo)?\s+(?:gli altri|prodotti|design)\b/iu);
    expect(functionBlock(COMMAND_CENTER_CLIENT_JS, "renderStation")).toContain("room.callSign");
  });

  it("uses a one-column mobile composition with overflow and reduced-motion protection", () => {
    const mobile = between(
      COMMAND_CENTER_PREMIUM_CSS,
      "@media (max-width:820px){",
      "@media (max-width:430px){",
    );
    const reduced = fromMarker(COMMAND_CENTER_PREMIUM_CSS, "@media (prefers-reduced-motion:reduce){");
    const stationRules = cssRules(COMMAND_CENTER_PREMIUM_CSS, ".cc-station");

    expect(mobile).toContain("overflow-x:hidden");
    expect(mobile).toMatch(/\.cc-station-map[^{]*\{[^}]*flex-direction\s*:\s*column/su);
    expect(stationRules).toMatch(/(?:min-width\s*:\s*0|overflow-wrap\s*:\s*anywhere)/u);
    expect(reduced).toContain("animation:none!important");
    expect(reduced).toMatch(/\.cc-station(?:-map|-room)?[^{]*\{[^}]*transform\s*:\s*none!important/su);
    expect(stationRules).not.toContain("infinite");
  });

  it("keeps all three critical Station states visible on compact mobile", () => {
    const compact = between(
      COMMAND_CENTER_PREMIUM_CSS,
      "@media (max-width:430px){",
      "@media (prefers-reduced-motion:reduce){",
    );

    expect(compact).toMatch(/\.cc-station-status[^{]*\{[^}]*display\s*:\s*grid/su);
    expect(compact).toMatch(/\.cc-station-status[^{]*\{[^}]*grid-template-columns\s*:\s*repeat\(2,minmax\(0,1fr\)\)/su);
    expect(compact).toMatch(/\.cc-station-status span:last-child[^{]*\{[^}]*grid-column\s*:\s*1\/-1/su);
  });

  it("introduces no external visual or package dependency", async () => {
    const station = elementById(COMMAND_CENTER_HTML, "section", "station");
    const stationRules = cssRules(COMMAND_CENTER_PREMIUM_CSS, ".cc-station");
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { readonly dependencies?: Readonly<Record<string, string>> };

    expect(station).not.toMatch(/https?:\/\//u);
    expect(station).not.toMatch(/<script\b/iu);
    expect(stationRules).not.toMatch(/https?:\/\/|@import/u);
    expect(Object.keys(packageJson.dependencies ?? {}).sort()).toEqual([
      "@simplewebauthn/server",
      "motion",
    ]);
  });
});

function elementById(source: string, tagName: string, id: string): string {
  const opening = new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`, "gu");
  const match = opening.exec(source);
  if (match === null) throw new Error(`${tagName}#${id} not found`);

  const tags = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gu");
  tags.lastIndex = match.index;
  let depth = 0;
  for (let current = tags.exec(source); current !== null; current = tags.exec(source)) {
    depth += current[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return source.slice(match.index, tags.lastIndex);
  }
  throw new Error(`${tagName}#${id} is not closed`);
}

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

function cssRules(source: string, prefix: string): string {
  return [...source.matchAll(new RegExp(`\\${prefix}[^{}]*\\{[^}]*\\}`, "gu"))]
    .map((match) => match[0])
    .join("\n");
}
