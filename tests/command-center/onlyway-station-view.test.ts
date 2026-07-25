import { describe, expect, it } from "vitest";

import {
  buildOnlywayStationView,
  ONLYWAY_STATION_OPPORTUNITY_LANE_IDS,
  ONLYWAY_STATION_ROOM_IDS,
  type OnlywayStationBuildInput,
} from "../../src/command-center/onlyway-station-view.js";

describe("Onlyway Station view", () => {
  it("projects exactly nine truth-bound rooms and six validation-only lanes", () => {
    const view = buildOnlywayStationView(input());

    expect(view.rooms.map(({ roomId }) => roomId)).toEqual(ONLYWAY_STATION_ROOM_IDS);
    expect(view.opportunityLanes.map(({ laneId }) => laneId)).toEqual(ONLYWAY_STATION_OPPORTUNITY_LANE_IDS);
    expect(new Set(view.rooms.map(({ href }) => href)).size).toBe(9);
    expect(view.rooms).toHaveLength(9);
    expect(view.opportunityLanes).toHaveLength(6);
    expect(view.opportunityLanes.map(({ status }) => status)).toEqual(Array.from({ length: 6 }, () => "VALIDATION_REQUIRED"));
  });

  it("keeps every room, lane and the aggregate fail-closed", () => {
    const view = buildOnlywayStationView(input());

    expect(view).toMatchObject({ externalActions: "LOCKED", publication: "LOCKED" });
    expect(view.rooms.map(({ externalActions, publication }) => [externalActions, publication])).toEqual(Array.from({ length: 9 }, () => ["LOCKED", "LOCKED"]));
    expect(view.opportunityLanes.map(({ externalActions, publication }) => [externalActions, publication])).toEqual(Array.from({ length: 6 }, () => ["LOCKED", "LOCKED"]));
    expect(view.rooms.find(({ roomId }) => roomId === "publishing")).toMatchObject({
      metric: "Publication locked",
      status: "LOCKED",
    });
  });

  it("does not turn missing observations into activity or revenue", () => {
    const view = buildOnlywayStationView(input());

    expect(view.rooms.find(({ roomId }) => roomId === "communications")).toMatchObject({
      metric: "Social Pack assenti",
      status: "NOT_AVAILABLE",
    });
    expect(view.rooms.find(({ roomId }) => roomId === "treasury")).toMatchObject({
      metric: "Costo non osservato",
      status: "NOT_AVAILABLE",
    });
    expect(view.rooms.find(({ roomId }) => roomId === "war_room")).toMatchObject({
      metric: "Record di crisi non osservati",
      status: "NOT_AVAILABLE",
    });
    expect(JSON.stringify(view)).not.toMatch(/revenue verified|active now|published/iu);
  });

  it("preserves partial coverage as lower-bound language", () => {
    const value = input();
    const view = buildOnlywayStationView({
      ...value,
      research: { ...value.research, coverage: "LIMIT_REACHED", evidencePacks: 25, sources: 100 },
    });
    const research = view.rooms.find(({ roomId }) => roomId === "research");

    expect(view.coverage).toBe("LIMIT_REACHED");
    expect(research?.metric).toBe("≥ 25 Evidence Pack");
    expect(research?.detail).toContain("≥ 100 fonti");
  });

  it("validates counters, enums and timestamps before rendering", () => {
    const value = input();

    expect(() => buildOnlywayStationView({ ...value, generatedAt: "not-a-date" })).toThrow(/generatedAt/u);
    expect(() => buildOnlywayStationView({
      ...value,
      factory: { ...value.factory, productions: -1 },
    })).toThrow(/factory\.productions/u);
    expect(() => buildOnlywayStationView({
      ...value,
      command: { ...value.command, system: "INVALID" as "READY" },
    })).toThrow(/command\.system/u);
  });

  it("deep-freezes the complete projection", () => {
    const view = buildOnlywayStationView(input());

    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.rooms)).toBe(true);
    expect(Object.isFrozen(view.rooms[0])).toBe(true);
    expect(Object.isFrozen(view.rooms[0]?.owners)).toBe(true);
    expect(Object.isFrozen(view.opportunityLanes)).toBe(true);
  });
});

function input(): OnlywayStationBuildInput {
  return {
    archives: { assets: 0, coverage: "NOT_AVAILABLE", decisions: 0, outcomeLinks: 0, rightsBlockers: 0 },
    command: { agentsReady: 17, agentsTotal: 17, coverage: "COMPLETE", decisionsRequired: 0, system: "READY" },
    communications: { coverage: "COMPLETE", readyForFabio: 0, requiresResearch: 0, socialPacks: 0, trendObservations: 0 },
    factory: { blocked: 0, coverage: "COMPLETE", pendingFabio: 0, productions: 0, workdays: 0 },
    generatedAt: "2026-07-24T12:00:00.000Z",
    publishing: { approvedForScheduling: 0, coverage: "COMPLETE", readyForFabio: 0, scheduled: 0 },
    research: { coverage: "COMPLETE", evidence: 0, evidencePacks: 0, missions: 0, sources: 0 },
    treasury: { attempts: 0, coverage: "COMPLETE", measuredCostCents: 0, providerCalls: 0 },
    venture: { coverage: "COMPLETE", decisions: 0, experiments: 0, health: "NOT_AVAILABLE", opportunities: 0, ventures: 0 },
    warRoom: { coverage: "COMPLETE", deadLetterJobs: 0, decisions: 0, failedJobs: 0, openIncidents: 0 },
  };
}
