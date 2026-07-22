import { describe, expect, it } from "vitest";

import { PrivateCommandCenterServer, type StartedCommandCenter } from "../../src/command-center/command-center-server.js";

const ACCESS_TOKEN = "b".repeat(64);

describe("Command Center ORACLE prompt HTTP boundary", () => {
  it("requires the loopback session, trusted Origin and CSRF before propose or confirm", async () => withHarness(true, async (harness) => {
    const body = promptBody();
    expect((await fetch(`${harness.origin}/api/prompt-missions/propose`, { body: JSON.stringify(body), headers: { "Content-Type": "application/json", Origin: harness.origin, "X-Onlyway-Csrf": harness.csrfToken }, method: "POST" })).status).toBe(401);
    expect((await harness.post("/api/prompt-missions/propose", body, { Origin: "https://example.invalid" })).status).toBe(403);
    expect((await harness.post("/api/prompt-missions/propose", body, { "X-Onlyway-Csrf": "0".repeat(64) })).status).toBe(403);
    expect((await harness.post("/api/prompt-missions/propose", { ...body, padding: "x".repeat(17_000) })).status).toBe(400);
    expect(harness.calls.propose).toBe(0);

    const confirmation = { confirmationToken: "c".repeat(64), contractVersion: "1", prompt: body.prompt, promptFingerprint: "d".repeat(64), proposalFingerprint: "e".repeat(64), proposalId: "oracle-proposal-http-001" };
    expect((await fetch(`${harness.origin}/api/prompt-missions/confirm`, { body: JSON.stringify(confirmation), headers: { "Content-Type": "application/json", Origin: harness.origin, "X-Onlyway-Csrf": harness.csrfToken }, method: "POST" })).status).toBe(401);
    expect((await harness.post("/api/prompt-missions/confirm", confirmation, { Origin: "https://example.invalid" })).status).toBe(403);
    expect((await harness.post("/api/prompt-missions/confirm", confirmation, { "X-Onlyway-Csrf": "0".repeat(64) })).status).toBe(403);
    expect(harness.calls.confirm).toBe(0);

    const proposedResponse = await harness.post("/api/prompt-missions/propose", body);
    expect(proposedResponse.status).toBe(200);
    expect(proposedResponse.headers.get("cache-control")).toContain("no-store");
    const proposed = await proposedResponse.json() as Record<string, unknown>;
    expect(proposed).toMatchObject({ canConfirm: true, providerCalls: 0, publication: "LOCKED", status: "READY_TO_CREATE_DRAFT" });
    expect(JSON.stringify(proposed)).not.toContain(body.prompt);
    expect(harness.calls.propose).toBe(1);

    const confirmed = await harness.post("/api/prompt-missions/confirm", confirmation);
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toMatchObject({ externalActionsAllowed: false, providerCalls: 0, publication: "LOCKED", status: "READY_FOR_FABIO_REVIEW" });
    expect(harness.calls.confirm).toBe(1);
  }));

  it("returns service unavailable when the ORACLE prompt boundary is not installed", async () => withHarness(false, async (harness) => {
    const response = await harness.post("/api/prompt-missions/propose", promptBody());
    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toBe("Prompt mission boundary non disponibile");
  }));
});

interface Harness {
  readonly calls: { confirm: number; propose: number };
  readonly csrfToken: string;
  readonly origin: string;
  post(path: string, body: unknown, overrides?: Readonly<Record<string, string>>): Promise<Response>;
}

async function withHarness(installBoundary: boolean, test: (harness: Harness) => Promise<void>): Promise<void> {
  const calls = { confirm: 0, propose: 0 };
  const oracleCreativePromptService = {
    confirmForOperator: () => { calls.confirm += 1; return Promise.resolve({ contractVersion: "1", estimatedCostUsd: 0, externalActionsAllowed: false, productionId: "oracle-http-001", providerCalls: 0, publication: "LOCKED", status: "READY_FOR_FABIO_REVIEW", unauthorizedExternalEffectOccurred: false } as never); },
    proposeForOperator: () => { calls.propose += 1; return Promise.resolve({ canConfirm: true, confirmationToken: "c".repeat(64), contractVersion: "1", estimatedCostUsd: 0, expiresAt: "2026-07-22T12:05:00.000Z", externalActionsAllowed: false, promptFingerprint: "d".repeat(64), proposalFingerprint: "e".repeat(64), proposalId: "oracle-proposal-http-001", providerCalls: 0, publication: "LOCKED", status: "READY_TO_CREATE_DRAFT" } as never); },
  };
  let started: StartedCommandCenter | undefined;
  try {
    const server = new PrivateCommandCenterServer({ accessToken: ACCESS_TOKEN, ...(installBoundary ? { oracleCreativePromptService } : {}), port: 0, queryService: { snapshot: () => Promise.resolve({}) as never } });
    started = await server.start();
    const origin = new URL(started.accessUrl).origin;
    const entry = await fetch(started.accessUrl, { redirect: "manual" });
    const cookie = entry.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) throw new Error("Expected a local session cookie");
    const session = await fetch(`${origin}/api/session`, { headers: { Cookie: cookie } });
    const { csrfToken } = await session.json() as { readonly csrfToken: string };
    const baseHeaders = Object.freeze({ "Content-Type": "application/json", Cookie: cookie, Origin: origin, "X-Onlyway-Csrf": csrfToken });
    await test({ calls, csrfToken, origin, post: (path, body, overrides = {}) => fetch(`${origin}${path}`, { body: JSON.stringify(body), headers: { ...baseHeaders, ...overrides }, method: "POST" }) });
  } finally {
    await started?.close();
  }
}

function promptBody() {
  return Object.freeze({ businessMissionId: "business-mission-001", contractVersion: "1", deliverables: ["CAROUSEL", "INSTAGRAM_COPY", "TIKTOK_VIDEO_BLUEPRINT", "IMAGE_MASTER", "VIDEO_RENDER"], objective: "lead_generation", platforms: ["instagram", "tiktok"], prompt: "Crea una guida evidence-led per validare una nuova offerta.", promptId: "oracle-http-001" });
}
