import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { LocalRuntimeConfig } from "../../src/runtime/local-runtime-config.js";
import { createLocalRuntime } from "../../src/runtime/create-local-runtime.js";
import { SqliteRepositoryTransactionRunner } from "../../src/persistence/sqlite/sqlite-repository-transaction-runner.js";
import { CommandCenterQueryService } from "../../src/command-center/command-center-query-service.js";
import { CommandCenterActionService } from "../../src/command-center/command-center-action-service.js";
import { COMMAND_CENTER_CLIENT_JS } from "../../src/command-center/command-center-assets.js";
import { PrivateCommandCenterServer } from "../../src/command-center/command-center-server.js";
import { OperationsControlService } from "../../src/operations-control/operations-control-service.js";
import { createLocalWorkflowCommandBoundary } from "../../src/runtime/create-local-workflow-command-boundary.js";
import { FixedClock } from "../support/fixtures.js";

describe("Private Command Center", () => {
  it("marks the Decision Inbox as a lower bound when any canonical query reaches its cap", async () => {
    await withDatabase(async (path) => {
      const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const clock = new FixedClock("2026-07-14T12:00:00.000Z");
      await seedReadyRuntimeLeases(repositories);
      const boundary = createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
      for (let index = 1; index <= 26; index += 1) {
        const productionId = `mv-content-coverage-${String(index).padStart(3, "0")}`;
        await boundary.execute({ actorId: "actor-local", commandId: `coverage-${String(index).padStart(3, "0")}`, contractVersion: "1", input: { brief: brief(productionId) }, operation: "PRODUCE_METODO_VELOCE_CONTENT", workspaceId: "workspace-local" });
      }
      const snapshot = await new CommandCenterQueryService({ clock, repositories, workspaceId: "workspace-local" }).snapshot();
      expect(snapshot.productions).toHaveLength(25);
      expect(snapshot.overview).toMatchObject({
        decisionInboxCoverage: "LIMIT_REACHED",
        decisionsRequired: 25,
        operationalWindow: {
          agentCompanyWorkdays: { limit: 25, observed: 0, status: "COMPLETE" },
          businessMissions: { limit: 25, observed: 0, status: "COMPLETE" },
          productions: { limit: 25, observed: 25, status: "LIMIT_REACHED" },
        },
      });
      expect(snapshot.overview.decisionInbox).toHaveLength(25);
      expect(snapshot.overview.metrics).toContainEqual(expect.objectContaining({ id: "approval", value: "≥ 25" }));
      expect(snapshot.overview.metrics.find(({ id }) => id === "quality")?.context).toContain("copertura parziale");
      expect(snapshot.socialIntelligence.coverage).toBe("LIMIT_REACHED");
      expect(snapshot.overview.system).toBe("ATTENTION_REQUIRED");
      expect(snapshot.runtime.status).toBe("ATTENTION_REQUIRED");
      await repositories.close();
    });
  });

  it("fails readiness closed for a blocked production", async () => {
    await withDatabase(async (path) => {
      const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const clock = new FixedClock("2026-07-14T12:00:00.000Z");
      await seedReadyRuntimeLeases(repositories);
      const queryService = new CommandCenterQueryService({ clock, repositories, workspaceId: "workspace-local" });
      await expect(queryService.snapshot()).resolves.toMatchObject({ overview: { system: "READY" }, runtime: { status: "READY" } });

      const boundary = createLocalWorkflowCommandBoundary({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" });
      await boundary.execute({
        actorId: "actor-local",
        commandId: "blocked-production-readiness",
        contractVersion: "1",
        input: { brief: { ...brief("mv-content-blocked-readiness"), offer: "guadagno garantito" } },
        operation: "PRODUCE_METODO_VELOCE_CONTENT",
        workspaceId: "workspace-local",
      });

      await expect(queryService.snapshot()).resolves.toMatchObject({
        overview: { dailyBrief: { decision: "È richiesta la correzione del contenuto" }, system: "ATTENTION_REQUIRED" },
        productions: [expect.objectContaining({ status: "BLOCKED" })],
        runtime: { status: "ATTENTION_REQUIRED" },
      });
      await repositories.close();
    });
  });

  it("fails readiness closed for an open operations incident", async () => {
    await withDatabase(async (path) => {
      const repositories = new SqliteRepositoryTransactionRunner({ path, timeoutMs: 1_000 });
      const clock = new FixedClock("2026-07-14T12:00:00.000Z");
      await seedReadyRuntimeLeases(repositories);
      const queryService = new CommandCenterQueryService({ clock, repositories, workspaceId: "workspace-local" });
      await expect(queryService.snapshot()).resolves.toMatchObject({ overview: { system: "READY" }, runtime: { status: "READY" } });

      await new OperationsControlService({ actorId: "actor-local", clock, repositories, workspaceId: "workspace-local" }).openIncident({
        incidentId: "incident-readiness-open",
        severity: "HIGH",
        summaryCode: "OPERATOR_REVIEW_REQUIRED",
      });

      await expect(queryService.snapshot()).resolves.toMatchObject({
        controls: { incidents: [expect.objectContaining({ status: "OPEN" })] },
        overview: { system: "ATTENTION_REQUIRED" },
        runtime: { status: "ATTENTION_REQUIRED" },
      });
      await repositories.close();
    });
  });

  it("uses the non-mutating local social checkpoint and coverage-aware empty states", () => {
    expect(COMMAND_CENTER_CLIENT_JS).toContain('const connectorCheckpoint = "http://127.0.0.1:43123/"');
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain('"http://127.0.0.1:43123/oauth/" + platform + "/start"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Apri checkpoint locale");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("questo link non ne esegue alcuna");
    expect(COMMAND_CENTER_CLIENT_JS).not.toContain('"Disconnetti"');
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Nessuna decisione nella finestra osservata; la copertura è parziale");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Nessun Social Publishing Pack nella finestra osservata; la copertura è parziale");
    expect(COMMAND_CENTER_CLIENT_JS).toContain("Readiness bloccata: verificare blocker, incidenti, copertura e runtime");
  });

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
      expect(snapshot.overview).toMatchObject({
        decisionInboxCoverage: "COMPLETE",
        decisionInbox: [expect.objectContaining({
          decisionKey: "CONTENT_PRODUCTION:mv-content-command-center-001",
          entityId: "mv-content-command-center-001",
          entityType: "CONTENT_PRODUCTION",
        })],
        decisionsRequired: 1,
      });
      expect(snapshot.productions).toHaveLength(1);
      expect(snapshot.business).toEqual([]);
      expect(snapshot.agentCompany).toEqual([]);
      expect(snapshot.socialIntelligence).toMatchObject({ blocked: 0, packs: [], readyForFabio: 0, requiresResearch: 0 });
      expect(snapshot.agents).toHaveLength(17);
      expect(snapshot.agents).toEqual(expect.arrayContaining([
        expect.objectContaining({ agentId: "onlyway-assistant", completedTasks: 0, state: "READY" }),
        expect.objectContaining({ agentId: "developer-agent", completedTasks: 0, state: "READY" }),
        expect.objectContaining({ agentId: "publisher-agent", completedTasks: 0, state: "READY" }),
      ]));
      expect(snapshot.runtime).toMatchObject({
        continuousWorker: "NOT_REGISTERED",
        jobs: [],
        killSwitch: "LOCKED",
        usage: { attempts: 0, costCents: 0, externalEffectsExecuted: false, providerCalls: 0, toolCalls: 0 },
      });
      expect(snapshot.dailyOperatingBriefs).toEqual([]);
      expect(snapshot.founderWorkdays).toEqual([]);
      expect(snapshot.controls).toMatchObject({ incidents: [], productionControls: [], receipts: [] });
      expect(snapshot.controls.targets).toHaveLength(1);
      expect(snapshot.controls.targets[0]).toMatchObject({
        actions: ["REQUEST_PRODUCTION_REVISION", "PAUSE_PRODUCTION", "CANCEL_PRODUCTION"],
        entityId: "mv-content-command-center-001",
        kind: "PRODUCTION",
        state: "ACTIVE",
        version: 0,
      });
      expect(snapshot.controls.targets[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
      const productionEvents = await repositories.transaction(({ operationalEvents }) => operationalEvents.listAfter("workspace-local", 0, 10));
      expect(productionEvents.map(({ eventType }) => eventType)).toEqual([
        "PRODUCTION_STATUS_CHANGED",
        "GATE_DECIDED",
        "APPROVAL_REQUESTED",
      ]);

      const server = new PrivateCommandCenterServer({
        accessToken: "1".repeat(64),
        actionService: new CommandCenterActionService({
          actorId: "actor-local",
          clock: new FixedClock("2026-07-14T12:05:00.000Z"),
          commands: createLocalWorkflowCommandBoundary({
            actorId: "actor-local",
            clock: new FixedClock("2026-07-14T12:05:00.000Z"),
            repositories,
            workspaceId: "workspace-local",
          }),
          repositories,
          workspaceId: "workspace-local",
        }),
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
      expect(pageHtml).toContain("A3 — Controllata");
      expect(pageHtml).toContain("CAMERA DI AUTORIZZAZIONE");
      expect(pageHtml).toContain("Missioni Business");
      expect(pageHtml).toContain("id=\"business\"");
      expect(pageHtml).toContain("Intelligence Social");
      expect(pageHtml).toContain("id=\"social\"");
      expect(pageHtml).toContain("id=\"social-pack-list\"");
      expect(pageHtml).toContain("id=\"business-mission-list\"");
      expect(pageHtml).toContain("id=\"agent-grid\"");
      expect(pageHtml).toContain("id=\"agent-workday-list\"");
      expect(pageHtml).toContain("id=\"agent-workday-detail\"");
      expect(pageHtml).toContain("id=\"sidebar-toggle\"");
      expect(pageHtml).toContain("id=\"mobile-menu-toggle\"");
      expect(pageHtml).toContain("id=\"package-inspector\"");
      expect(pageHtml).toContain("id=\"decision-inbox-list\"");
      expect(pageHtml).toContain("id=\"action-confirmation-timer\"");
      expect(pageHtml).not.toContain(["Only", "Way"].join(" "));
      expect(pageHtml).not.toContain("1111111111111111111111111111111111111111111111111111111111111111");

      const theme = await fetch(`${origin}/responsive.css`, { headers: { Cookie: cookie ?? "" } });
      expect(theme.status).toBe(200);
      const themeText = await theme.text();
      expect(themeText).toContain("--ow-obsidian");
      expect(themeText).toContain("onlyway-obsidian-chrome-original.png");
      expect(themeText).toContain("cursor:auto");
      expect(themeText).toContain("height:100dvh");
      expect(themeText).toContain("transform:none!important");
      expect(themeText).toContain("scroll-behavior:auto!important");
      expect(themeText).toContain("@media (max-width:820px)");
      expect(themeText).toContain(".cc-approval-review-grid,.cc-visual-review-canvases{grid-template-columns:1fr}");

      const app = await fetch(`${origin}/app.js`, { headers: { Cookie: cookie ?? "" } });
      expect(app.status).toBe(200);
      const appText = await app.text();
      expect(appText).not.toContain("window.confirm");
      expect(appText).not.toContain("custom-cursor");
      expect(appText).toContain("onlyway.command-center.sidebar");
      expect(appText).toContain("renderAgentWorkdays(snapshot.agentCompany || [])");
      expect(appText).toContain("renderSocialIntelligence(snapshot.socialIntelligence");
      expect(appText).toContain("Nessun orario inventato");
      expect(appText).toContain("agent.displayName");
      expect(appText).not.toContain("agent.telemetry");
      expect(appText).toContain("Conferma scaduta: nessuna modifica eseguita.");
      expect(appText).toContain("REQUEST_BUSINESS_REVISION");
      expect(appText).toContain("/api/control-actions/propose");
      expect(appText).toContain("/api/control-actions/confirm");
      expect(appText).toContain("FABIO_REVISION_REQUEST");
      expect(appText).toContain("Riprova con job successore");
      expect(appText).toContain("Riconosci incidente");
      expect(appText).toContain("boundedAgentValue");
      expect(appText).toContain("mobileReturnFocus");
      expect(appText).toContain("returnFocus.focus()");
      expect(appText).toContain('event.key === "Tab"');
      expect(appText).toContain("confirmationInertedNodes");
      expect(appText).toContain('if (!actionConfirmation.hidden) return;');
      expect(appText).toContain('event.key !== "Enter" && event.key !== " "');
      expect(appText).toContain("for (const button of [sidebarToggle, mobileMenuToggle])");
      expect(appText).toContain('behavior: prefersReducedMotion() ? "auto" : "smooth"');
      expect(appText).toContain('reducedMotionQuery.addEventListener("change", reset)');
      expect(appText).toContain('snapshot.runtime.counts.running > 0 ? "active" : "idle"');
      expect(appText).not.toContain("snapshot.runtime.counts.queued > 0 ? \"active\"");
      expect(appText).toContain("VISUAL GATE BLOCCATO");
      expect(appText).toContain("Approvazione bloccata: logo originale mancante");
      expect(appText).toContain("/api/brand-media-factory");
      expect(appText).toContain("Brand-Locked Media Factory");
      expect(appText).toContain("Conformità Responses");
      expect(appText).toContain("nessun body o segreto esposto");
      expect(appText).toContain("Apri checkpoint locale");
      expect(appText).toContain("questo link non ne esegue alcuna");
      expect(appText).not.toContain('"Disconnetti"');
      expect(appText).not.toContain(">Pubblica<");

      const insightsTemplate = await fetch(`${origin}/downloads/metodo-veloce-insights-template.csv`, { headers: { Cookie: cookie ?? "" } });
      expect(insightsTemplate.status).toBe(200);
      expect(insightsTemplate.headers.get("content-type")).toContain("text/csv");
      expect(insightsTemplate.headers.get("content-disposition")).toContain("metodo-veloce-insights-template.csv");
      expect(await insightsTemplate.text()).toContain("snapshot_id,content_id,published_at");
      const competitorTemplate = await fetch(`${origin}/downloads/metodo-veloce-competitor-observations-template.csv`, { headers: { Cookie: cookie ?? "" } });
      expect(competitorTemplate.status).toBe(200);
      expect(await competitorTemplate.text()).toContain("observation_id,competitor_record_id,observed_at,source_url");
      const audioTemplate = await fetch(`${origin}/downloads/metodo-veloce-audio-rights-template.csv`, { headers: { Cookie: cookie ?? "" } });
      expect(audioTemplate.status).toBe(200);
      expect(await audioTemplate.text()).toContain("observation_id,audio_id,title,platform,account_ref");

      const protectedBrandAsset = await fetch(`${origin}/assets/brand/onlyway-obsidian-chrome-original.png`);
      expect(protectedBrandAsset.status).toBe(401);
      const protectedSocialAsset = await fetch(`${origin}/assets/metodo-veloce/social-pack-five-items-v3/instagram/slide-01.png`);
      expect(protectedSocialAsset.status).toBe(401);

      const brandAsset = await fetch(`${origin}/assets/brand/onlyway-obsidian-chrome-original.png`, {
        headers: { Cookie: cookie ?? "" },
      });
      expect(brandAsset.status).toBe(200);
      expect(brandAsset.headers.get("content-type")).toBe("image/png");
      const assetBytes = Buffer.from(await brandAsset.arrayBuffer());
      expect(createHash("sha256").update(assetBytes).digest("hex")).toBe("f965c40a871a9dd4ce249708fac20da64a0a09a4fe74c8d1993b037caea15fe3");

      const visualReview = await fetch(`${origin}/api/social-visual-review`, { headers: { Cookie: cookie ?? "" } });
      expect(visualReview.status).toBe(200);
      const visualPayload = await visualReview.json() as {
        readonly approvalScope: string;
        readonly assets: { readonly instagram: readonly Record<string, unknown>[]; readonly tiktok: readonly Record<string, unknown>[] };
        readonly externalActionsAllowed: boolean;
        readonly publicationAuthorized: boolean;
        readonly visualReview: { readonly status: string };
      };
      expect(visualPayload).toMatchObject({
        approvalScope: "INTERNAL_PACKAGE_ONLY",
        externalActionsAllowed: false,
        publicationAuthorized: false,
        visualReview: { status: "BLOCKED_ORIGINAL_LOGO_MISSING" },
      });
      expect(visualPayload.assets.instagram).toHaveLength(6);
      expect(visualPayload.assets.instagram.at(0)).toMatchObject({ height: 1350, slide: 1, width: 1080 });
      expect(visualPayload.assets.tiktok).toHaveLength(6);
      expect(visualPayload.assets.tiktok.at(0)).toMatchObject({ height: 1920, slide: 1, width: 1080 });
      const socialAsset = await fetch(`${origin}/assets/metodo-veloce/social-pack-five-items-v3/instagram/slide-01.png`, { headers: { Cookie: cookie ?? "" } });
      expect(socialAsset.status).toBe(200);
      expect(socialAsset.headers.get("content-type")).toBe("image/png");
      expect(createHash("sha256").update(Buffer.from(await socialAsset.arrayBuffer())).digest("hex")).toBe("b6599a3fee2746c1a30bf8ceb45ff246426ef344c2cfd867c6d1d820f64015f8");
      const rejectedVisualPath = await fetch(`${origin}/assets/metodo-veloce/social-pack-five-items-v3/instagram/slide-07.png`, { headers: { Cookie: cookie ?? "" } });
      expect(rejectedVisualPath.status).toBe(404);

      const mediaFactory = await fetch(`${origin}/api/brand-media-factory`, { headers: { Cookie: cookie ?? "" } });
      expect(mediaFactory.status).toBe(200);
      const mediaFactoryPayload = await mediaFactory.json() as {
        readonly responsesConformance: { readonly fingerprint: string };
      };
      expect(mediaFactoryPayload).toMatchObject({
        externalActionsAllowed: false,
        externalEffects: { completedImageGenerations: 1, openAiProviderCalls: 6, serverSpendUsd: 0 },
        liveCalls: 6,
        publicationAuthorized: false,
        responsesConformance: {
          canonicalRequestShape: { endpoint: "/v1/responses", fieldNames: ["model", "input"] },
          conformanceGate: { status: "PASS" },
          result: { status: "PROVIDER_PLAIN_READY" },
          session: { liveCalls: 1, status: "CLOSED" },
          visualGate: { status: "BLOCKED_NO_IMAGE_AUTHORIZATION" },
        },
        socialConnections: {
          instagram: { expectedAccount: "@mr.metodo.veloce_official", state: "APP_CONFIGURATION_REQUIRED" },
          publication: "LOCKED",
          tiktok: { expectedAccount: "@metodo_veloce.official", state: "APP_CONFIGURATION_REQUIRED" },
        },
        status: "READY_FOR_FABIO_REVIEW",
        visualGate: { status: "PASS" },
      });
      const instagramVariant = await fetch(`${origin}/assets/metodo-veloce/media-factory-quality-closure-v1/rendered/instagram-1080x1350.png`, { headers: { Cookie: cookie ?? "" } });
      expect(instagramVariant.status).toBe(200);
      expect(instagramVariant.headers.get("content-type")).toBe("image/png");
      expect(createHash("sha256").update(Buffer.from(await instagramVariant.arrayBuffer())).digest("hex")).toBe("e033c359ae1f3b76fc86ec5af2db6a543e01c9d8cab86f778c579c7183284822");
      const rejectedQualityAsset = await fetch(`${origin}/assets/metodo-veloce/media-factory-quality-closure-v1/rendered/not-allowed.png`, { headers: { Cookie: cookie ?? "" } });
      expect(rejectedQualityAsset.status).toBe(404);
      const refreshedMediaFactory = await fetch(`${origin}/api/brand-media-factory`, { headers: { Cookie: cookie ?? "" } });
      const refreshedPayload = await refreshedMediaFactory.json() as {
        readonly responsesConformance: { readonly fingerprint: string };
      };
      expect(refreshedPayload.responsesConformance.fingerprint).toBe(mediaFactoryPayload.responsesConformance.fingerprint);

      const session = await fetch(`${origin}/api/session`, { headers: { Cookie: cookie ?? "" } });
      const { csrfToken } = await session.json() as { readonly csrfToken: string };
      const actionHeaders = {
        "Content-Type": "application/json",
        Cookie: cookie ?? "",
        Origin: origin,
        "X-Onlyway-Csrf": csrfToken,
      };
      const proposalResponse = await fetch(`${origin}/api/actions/propose`, {
        body: JSON.stringify({ action: "REJECT_CONTENT", productionId: "mv-content-command-center-001" }),
        headers: actionHeaders,
        method: "POST",
      });
      expect(proposalResponse.status).toBe(200);
      const proposal = await proposalResponse.json() as {
        readonly actionId: string;
        readonly confirmationToken: string;
        readonly summary: { readonly packageFingerprint: string; readonly version: number };
      };
      expect(proposal.summary).toMatchObject({ version: 0 });
      expect(proposal.summary.packageFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      const confirmation = await fetch(`${origin}/api/actions/confirm`, {
        body: JSON.stringify({ actionId: proposal.actionId, confirmationToken: proposal.confirmationToken, packageFingerprint: proposal.summary.packageFingerprint }),
        headers: actionHeaders,
        method: "POST",
      });
      expect(confirmation.status).toBe(200);
      await expect(confirmation.json()).resolves.toMatchObject({
        action: "REJECT_CONTENT",
        command: { operation: "REVIEW_METODO_VELOCE_CONTENT", replayed: false },
      });
      await expect(queryService.snapshot()).resolves.toMatchObject({
        productions: [expect.objectContaining({ status: "ARCHIVED", version: 1 })],
      });

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

function brief(productionId = "mv-content-command-center-001") {
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
    productionId,
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

async function seedReadyRuntimeLeases(repositories: SqliteRepositoryTransactionRunner): Promise<void> {
  await repositories.transaction(async ({ operationsRuntime }) => {
    await operationsRuntime.insertProcessLease({
      contractVersion: "1",
      expiresAt: "2026-07-14T12:05:00.000Z",
      fencingToken: 1,
      heartbeatAt: "2026-07-14T11:59:00.000Z",
      instanceId: "scheduler-instance",
      leaseKey: "scheduler",
      role: "SCHEDULER",
      version: 0,
      workspaceId: "workspace-local",
    });
    await operationsRuntime.insertProcessLease({
      contractVersion: "1",
      expiresAt: "2026-07-14T12:05:00.000Z",
      fencingToken: 1,
      heartbeatAt: "2026-07-14T11:59:00.000Z",
      instanceId: "worker-instance",
      leaseKey: "worker-1",
      role: "WORKER",
      version: 0,
      workspaceId: "workspace-local",
    });
  });
}

async function withDatabase(test: (path: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-command-center-"));
  try {
    await test(join(directory, "runtime.sqlite"));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
