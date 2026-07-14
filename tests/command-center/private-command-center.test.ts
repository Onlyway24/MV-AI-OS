import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LocalRuntimeConfig } from "../../src/runtime/local-runtime-config.js";
import { createLocalRuntime } from "../../src/runtime/create-local-runtime.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { PrivateCommandCenterServer } from "../../src/command-center/command-center-server.js";
import { FixedClock } from "../support/fixtures.js";

describe("Private Command Center", () => {
  it("renders durable local state through a token-gated loopback API without exposing a mutation route", async () => {
    await withDatabase(async (path) => {
      const runtime = await createLocalRuntime(config(path), {
        clock: new FixedClock("2026-07-14T12:00:00.000Z"),
      });
      if (runtime.executeWorkflowCommand === undefined) {
        throw new Error("Workflow commands must be available");
      }
      await runtime.executeWorkflowCommand({
        actorId: "actor-local",
        commandId: "command-center-package-001",
        contractVersion: "1",
        input: { brief: brief() },
        operation: "PRODUCE_METODO_VELOCE_CONTENT",
        workspaceId: "workspace-local",
      });
      await runtime.close();

      const repositories = new SqliteRepositoryTransactionRunner({
        path,
        timeoutMs: 1_000,
      });
      const queryService = new CommandCenterQueryService({
        clock: new FixedClock("2026-07-14T12:05:00.000Z"),
        repositories,
        workspaceId: "workspace-local",
      });
      const snapshot = await queryService.snapshot();
      expect(snapshot.overview.metrics).toContainEqual(
        expect.objectContaining({ id: "approval", value: 1 }),
      );
      expect(snapshot.productions).toHaveLength(1);
      expect(snapshot.runtime).toMatchObject({
        continuousWorker: "NOT_REGISTERED",
        killSwitch: "LOCKED",
      });

      const server = new PrivateCommandCenterServer({
        accessToken: "1".repeat(64),
        port: 0,
        queryService,
      });
      const started = await server.start();
      expect(started.address.host).toBe("127.0.0.1");
      const entry = await fetch(started.accessUrl, { redirect: "manual" });
      expect(entry.status).toBe(303);
      const cookie = entry.headers.get("set-cookie");
      expect(cookie).toContain("HttpOnly");
      expect(entry.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");

      const origin = new URL(started.accessUrl).origin;
      const overview = await fetch(`${origin}/api/overview`, {
        headers: { Cookie: cookie ?? "" },
      });
      expect(overview.status).toBe(200);
      await expect(overview.json()).resolves.toMatchObject({
        productions: [expect.objectContaining({ productionId: "mv-content-command-center-001" })],
      });

      const page = await fetch(`${origin}/`, { headers: { Cookie: cookie ?? "" } });
      const pageHtml = await page.text();
      expect(page.status).toBe(200);
      expect(pageHtml).toContain("ONLYWAY");
      expect(pageHtml).toContain("Centro di Comando Onlyway");
      expect(pageHtml).toContain("A3 — Propositiva");
      expect(pageHtml).not.toContain(["Only", "Way"].join(" "));
      expect(pageHtml).not.toContain("1111111111111111111111111111111111111111111111111111111111111111");

      const forbiddenMutation = await fetch(`${origin}/api/overview`, {
        headers: { Cookie: cookie ?? "" },
        method: "POST",
      });
      expect(forbiddenMutation.status).toBe(405);

      await started.close();
      await repositories.close();
    });
  });
});

function brief() {
  return {
    audience: "Founder che vogliono validare un'offerta prima di investire budget.",
    callToAction: "Salva il post e scegli un test piccolo per questa settimana.",
    contractVersion: "1",
    evidence: [{
      evidenceId: "customer-note-1",
      sourceRef: "interview-2026-07",
      statement: "Le persone chiedono esempi concreti prima di valutare l'offerta.",
    }],
    language: "it",
    missionReference: "mission-command-center-1",
    objective: "educate",
    offer: "un percorso per validare offerte digitali",
    productionId: "mv-content-command-center-001",
    topic: "come validare un'offerta prima di promuoverla",
  } as const;
}

function config(path: string): LocalRuntimeConfig {
  return {
    actorId: "actor-local",
    contentAgentMode: "deterministic",
    contractVersion: "1",
    permissions: { actorGrants: [], policyGrants: [], taskGrants: [] },
    sqlite: { path, timeoutMs: 1_000 },
    workspaceId: "workspace-local",
  };
}

async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-command-center-"));
  try {
    await test(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
