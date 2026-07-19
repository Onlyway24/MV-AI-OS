import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import {
  PrivateCommandCenterServer,
  type StartedCommandCenter,
} from "../../src/command-center/command-center-server.js";
import { OperationsControlService } from "../../src/operations-control/operations-control-service.js";
import type {
  ControlActionReceipt,
  OperationsIncidentRecord,
  ProposedControlAction,
} from "../../src/operations-control/operations-control.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";

const ACTOR_ID = "fabio";
const ACCESS_TOKEN = "a".repeat(64);
const START = "2026-07-19T10:00:00.000Z";
const WORKSPACE_ID = "onlyway";

describe("Command Center operations control HTTP boundary", () => {
  it("fails closed on session, Origin, CSRF, caller identity, and oversized bodies", async () => {
    await withHarness(true, async (harness) => {
      const body = proposalBody(harness.incident);
      expect((await fetch(`${harness.origin}/api/control-actions/propose`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", Origin: harness.origin, "X-Onlyway-Csrf": harness.csrfToken },
        method: "POST",
      })).status).toBe(401);
      expect((await harness.post("/api/control-actions/propose", body, { Origin: "https://example.invalid" })).status).toBe(403);
      expect((await harness.post("/api/control-actions/propose", body, { "X-Onlyway-Csrf": "0".repeat(64) })).status).toBe(403);
      expect((await harness.post("/api/control-actions/propose", { ...body, actorId: "mallory" })).status).toBe(409);
      expect((await harness.post("/api/control-actions/propose", { ...body, workspaceId: "other" })).status).toBe(409);
      expect((await harness.post("/api/control-actions/propose", { ...body, padding: "x".repeat(17_000) })).status).toBe(400);

      const persisted = await harness.repositories.transaction(({ operationsControls }) =>
        operationsControls.getProposalByIdempotencyKey(WORKSPACE_ID, body.idempotencyKey));
      expect(persisted).toBeUndefined();
    });
  });

  it("injects trusted identity and applies one confirmed durable action", async () => {
    await withHarness(true, async (harness) => {
      const proposedResponse = await harness.post("/api/control-actions/propose", proposalBody(harness.incident));
      expect(proposedResponse.status).toBe(200);
      expect(proposedResponse.headers.get("cache-control")).toContain("no-store");
      const proposed = await proposedResponse.json() as ProposedControlAction;
      expect(proposed).toMatchObject({
        proposal: { actorId: ACTOR_ID, state: "PENDING", workspaceId: WORKSPACE_ID },
        replayed: false,
      });
      if (proposed.confirmationToken === undefined) throw new Error("Expected a fresh confirmation token");
      const confirmation = {
        confirmationToken: proposed.confirmationToken,
        contractVersion: "1",
        entityFingerprint: harness.incident.fingerprint,
        proposalId: proposed.proposal.proposalId,
      };

      expect((await harness.post("/api/control-actions/confirm", {
        ...confirmation,
        confirmationToken: "0".repeat(64),
      })).status).toBe(409);
      const open = await harness.repositories.transaction(({ operationsControls }) =>
        operationsControls.getIncident(harness.incident.incidentId));
      expect(open?.status).toBe("OPEN");

      const confirmedResponse = await harness.post("/api/control-actions/confirm", confirmation);
      expect(confirmedResponse.status).toBe(200);
      const receipt = await confirmedResponse.json() as ControlActionReceipt;
      expect(receipt).toMatchObject({
        action: "ACKNOWLEDGE_INCIDENT",
        actorId: ACTOR_ID,
        resultEntityId: harness.incident.incidentId,
        resultEntityVersion: 1,
        workspaceId: WORKSPACE_ID,
      });
      const acknowledged = await harness.repositories.transaction(({ operationsControls }) =>
        operationsControls.getIncident(harness.incident.incidentId));
      expect(acknowledged).toMatchObject({ acknowledgedBy: ACTOR_ID, status: "ACKNOWLEDGED", version: 1 });

      const replay = await harness.post("/api/control-actions/confirm", confirmation);
      expect(replay.status).toBe(200);
      await expect(replay.json()).resolves.toEqual(receipt);
    });
  });

  it("returns service unavailable when the operations boundary was not installed", async () => {
    await withHarness(false, async (harness) => {
      const response = await harness.post("/api/control-actions/propose", proposalBody(harness.incident));
      expect(response.status).toBe(503);
      await expect(response.text()).resolves.toBe("Control action boundary non disponibile");
    });
  });
});

interface Harness {
  readonly cookie: string;
  readonly csrfToken: string;
  readonly incident: OperationsIncidentRecord;
  readonly origin: string;
  readonly repositories: SqliteRepositoryTransactionRunner;
  post(path: string, body: unknown, overrides?: Readonly<Record<string, string>>): Promise<Response>;
}

async function withHarness(
  installBoundary: boolean,
  test: (harness: Harness) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-operations-control-http-"));
  const repositories = new SqliteRepositoryTransactionRunner({ path: join(directory, "runtime.sqlite"), timeoutMs: 1_000 });
  const clock = Object.freeze({ now: () => new Date(START) });
  let idSequence = 0;
  let tokenSequence = 0;
  const operationsControlService = new OperationsControlService({
    actorId: ACTOR_ID,
    clock,
    randomId: () => `http-${String(++idSequence)}`,
    randomToken: () => (++tokenSequence).toString(16).padStart(64, "0"),
    repositories,
    workspaceId: WORKSPACE_ID,
  });
  let started: StartedCommandCenter | undefined;
  try {
    const incident = await operationsControlService.openIncident({
      incidentId: "incident-http-boundary",
      severity: "HIGH",
      summaryCode: "OPERATOR_REVIEW_REQUIRED",
    });
    const queryService = new CommandCenterQueryService({ clock, repositories, workspaceId: WORKSPACE_ID });
    const server = new PrivateCommandCenterServer({
      accessToken: ACCESS_TOKEN,
      ...(installBoundary ? { operationsControlService } : {}),
      port: 0,
      queryService,
    });
    started = await server.start();
    const origin = new URL(started.accessUrl).origin;
    const entry = await fetch(started.accessUrl, { redirect: "manual" });
    const setCookie = entry.headers.get("set-cookie");
    const cookie = setCookie?.split(";", 1)[0];
    if (cookie === undefined) throw new Error("Expected a local session cookie");
    const session = await fetch(`${origin}/api/session`, { headers: { Cookie: cookie } });
    const { csrfToken } = await session.json() as { readonly csrfToken: string };
    const baseHeaders = Object.freeze({
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
      "X-Onlyway-Csrf": csrfToken,
    });
    await test({
      cookie,
      csrfToken,
      incident,
      origin,
      post: (path, body, overrides = {}) => fetch(`${origin}${path}`, {
        body: JSON.stringify(body),
        headers: { ...baseHeaders, ...overrides },
        method: "POST",
      }),
      repositories,
    });
  } finally {
    await started?.close();
    await repositories.close();
    await rm(directory, { force: true, recursive: true });
  }
}

function proposalBody(incident: OperationsIncidentRecord) {
  return Object.freeze({
    action: "ACKNOWLEDGE_INCIDENT",
    contractVersion: "1",
    entityId: incident.incidentId,
    entityVersion: incident.version,
    fingerprint: incident.fingerprint,
    idempotencyKey: "ack-incident-http-v0",
    reason: Object.freeze({
      code: "INCIDENT_REVIEWED",
      detail: "Fabio ha verificato l'incidente nel Centro di Comando.",
    }),
  });
}
