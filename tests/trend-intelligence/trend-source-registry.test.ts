import { describe, expect, it } from "vitest";

import { OperationalPlaneService } from "../../src/operational-planes/operational-plane-service.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";
import { ensureInitialSocialSources } from "../../src/social-intelligence-live/social-official-sources.js";
import {
  PUBLIC_TREND_SOURCE_BLUEPRINTS,
  ensurePublicTrendSources,
} from "../../src/trend-intelligence/trend-source-registry.js";
import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import { FixedClock } from "../support/fixtures.js";

describe("Public Trend source registry", () => {
  it("exposes one replay-safe local prompt command without acquiring data", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const boundary = createLocalWorkflowCommandBoundary({
      actorId: "fabio",
      clock: new FixedClock("2026-07-25T08:00:00.000Z"),
      repositories,
      workspaceId: "onlyway",
    });
    const command = {
      actorId: "fabio",
      commandId: "register-public-trend-sources-v1",
      contractVersion: "1" as const,
      input: {},
      operation: "REGISTER_PUBLIC_TREND_SOURCES" as const,
      workspaceId: "onlyway",
    };

    const first = await boundary.execute(command);
    const replay = await boundary.execute(command);
    const catalog = await boundary.execute({
      actorId: "fabio",
      commandId: "get-trend-source-catalog-v1",
      contractVersion: "1",
      input: {},
      operation: "GET_TREND_SOURCE_CATALOG",
      workspaceId: "onlyway",
    });

    expect(first).toMatchObject({
      operation: "REGISTER_PUBLIC_TREND_SOURCES",
      replayed: false,
      unauthorizedExternalEffectOccurred: false,
    });
    expect(first.nextAction).toMatch(/registration records policy only/iu);
    expect(first.result).toHaveLength(5);
    expect(replay).toMatchObject({ replayed: true });
    expect(catalog).toMatchObject({
      operation: "GET_TREND_SOURCE_CATALOG",
      unauthorizedExternalEffectOccurred: false,
    });
    expect(catalog.result).toHaveLength(20);
    expect(
      (catalog.result as readonly { readonly providerRuntime: string }[]).filter(
        ({ providerRuntime }) => providerRuntime === "DISABLED",
      ).length,
    ).toBeGreaterThanOrEqual(4);
    const records = await repositories.transaction(({ operationalPlanes }) =>
      operationalPlanes.listSocialLiveRecordsByWorkspaceId("onlyway", 10)
    );
    expect(records).toEqual([]);
  });

  it("registers the bounded no-credential wave idempotently without claiming data", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const operationalPlanes = new OperationalPlaneService({
      actorId: "fabio",
      clock: new FixedClock("2026-07-25T08:00:00.000Z"),
      repositories,
      workspaceId: "onlyway",
    });

    await ensureInitialSocialSources({
      operationalPlanes,
      repositories,
      workspaceId: "onlyway",
    });
    const first = await ensurePublicTrendSources({
      operationalPlanes,
      repositories,
      workspaceId: "onlyway",
    });
    const replay = await ensurePublicTrendSources({
      operationalPlanes,
      repositories,
      workspaceId: "onlyway",
    });

    expect(first).toHaveLength(5);
    expect(first.map(({ sourceId }) => sourceId)).toEqual(
      PUBLIC_TREND_SOURCE_BLUEPRINTS.map(({ sourceId }) => sourceId),
    );
    expect(first.every(({ status }) => status === "AUTHORIZED")).toBe(true);
    expect(replay).toEqual(first);
    expect(first[0]).not.toHaveProperty("connectorStatus");
    expect(first[0]).not.toHaveProperty("dataStatus");
  });

  it("fails closed when an existing source policy conflicts", async () => {
    const repositories = new InMemoryRepositoryTransactionRunner();
    const operationalPlanes = new OperationalPlaneService({
      actorId: "fabio",
      clock: new FixedClock("2026-07-25T08:00:00.000Z"),
      repositories,
      workspaceId: "onlyway",
    });
    await operationalPlanes.registerSource({
      canonicalReference: "https://example.test/not-gdelt",
      category: "AUTHORIZED_DATASET",
      maxFreshnessDays: 1,
      name: "Conflicting source",
      permittedRiskDomains: ["GENERAL"],
      publicCitationAllowed: false,
      reliability: "LOW",
      requiresSecondSource: true,
      sourceId: "trend-gdelt",
      status: "AUTHORIZED",
    });

    await expect(
      ensurePublicTrendSources({
        operationalPlanes,
        repositories,
        workspaceId: "onlyway",
      }),
    ).rejects.toThrow(/conflicts/iu);
  });
});
