import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalRuntime, TelegramMissionDraftSessionCoordinator, TelegramMissionPlanningConsole, TelegramSqliteStateStore, TelegramWorkflowOperatorConsole, type CommandCenterContentApprovalGate, type LocalRuntimeConfig, type VisualApprovalBindingReceipt } from "../../src/index.js";
import { canonicalSha256 } from "../../src/contracts/canonical-fingerprint.js";
import { FixedClock } from "../support/fixtures.js";

const clock = new FixedClock("2026-07-14T10:05:00.000Z");
const identity = createHash("sha256").update("100:200", "utf8").digest("hex");

describe("Telegram Workflow Operator Console", () => {
  it("promotes an approval-ready Mission through a separate confirmation and reports the durable checkpoints", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const mission = new TelegramMissionPlanningConsole({ actorId: "actor-local", chatId: "200", clock, coordinator: new TelegramMissionDraftSessionCoordinator(state), runtime, state, workspaceId: "workspace-local" });
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, runtime, state, workspaceId: "workspace-local" });

    await approvalReadyMission(mission);
    const preview = await workflow.handle(identity, "/workflow mission-draft-1");
    expect(preview.text).toContain("ha superato il Quality Gate");
    expect(preview.buttons?.[0]?.text).toBe("Crea Workflow");

    const created = await workflow.handleCallback(identity, preview.buttons?.[0]?.callbackData ?? "");
    expect(created?.text).toContain("Workflow creato");
    expect(created?.text).toContain("Nessuna azione esterna");

    const report = await workflow.handle(identity, "/report mission-draft-1");
    expect(report.text).toContain("Stato: ACTIVE");
    expect(report.text).toContain("Record Fabio approval");
    expect(report.text).toContain("nessuna azione esterna non autorizzata");

    const replayPreview = await workflow.handle(identity, "/workflow mission-draft-1");
    const replay = await workflow.handleCallback(identity, replayPreview.buttons?.[0]?.callbackData ?? "");
    expect(replay?.text).toContain("già presente");

    await runtime.close();
    await state.close();
  }));

  it("refuses missing, unplanned, or non-approved Mission references without creating a Workflow", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, runtime, state, workspaceId: "workspace-local" });

    const missingReference = await workflow.handle(identity, "/workflow");
    const unplanned = await workflow.handle(identity, "/workflow unknown-mission");
    const missingReport = await workflow.handle(identity, "/report unknown-mission");
    expect(missingReference.text).toContain("Indica una Missione");
    expect(unplanned.text).toContain("Nessun Workflow è stato creato");
    expect(missingReport.text).toContain("Workflow non è disponibile");
    expect((await workflow.handle(identity, "/workflows")).text).toContain("preparation-only");

    await runtime.close();
    await state.close();
  }));

  it("never lets an adapter-local Visual Gate substitute bypass the central file-backed gate", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const stages: string[] = [];
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, contentApprovalGate: testVisualGate(stages), runtime, state, workspaceId: "workspace-local" });
    if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
    await createEvidenceBoundTelegramContent(runtime, "mv-content-telegram-001");

    expect((await workflow.handle(identity, "/productions")).text).toContain("mv-content-telegram-001");
    const preview = await workflow.handle(identity, "/production mv-content-telegram-001");
    expect(preview.text).toContain("PENDING_FABIO_APPROVAL");
    expect(preview.text).toContain("Evidence Pack: telegram-pack-001");
    expect(preview.buttons?.[0]?.text).toBe("Approva per calendario");
    expect((await workflow.handle(identity, "/evidencepack telegram-pack-001")).text).toContain("Fonte Telegram");
    const blocked = await workflow.handleCallback(identity, preview.buttons?.[0]?.callbackData ?? "");
    expect(blocked?.text).toContain("bloccata dal Visual Gate");
    expect(blocked?.text).toContain("Nessuna approvazione è stata applicata");
    expect(stages).toEqual(["PROPOSE", "CONFIRM"]);
    const inspected = await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "inspect-central-visual-gate-block", contractVersion: "1", input: { productionId: "mv-content-telegram-001" }, operation: "INSPECT_METODO_VELOCE_CONTENT", workspaceId: "workspace-local" });
    expect(inspected.result).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });

    await runtime.close();
    await state.close();
  }));

  it("fails closed without an exact Visual Gate and never offers the Telegram approval callback", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, runtime, state, workspaceId: "workspace-local" });
    if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
    await createEvidenceBoundTelegramContent(runtime, "mv-content-telegram-visual-blocked");

    const preview = await workflow.handle(identity, "/production mv-content-telegram-visual-blocked");
    expect(preview.text).toContain("Visual Gate: BLOCCATO");
    expect(preview.buttons).toBeUndefined();
    const inspected = await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "inspect-visual-blocked", contractVersion: "1", input: { productionId: "mv-content-telegram-visual-blocked" }, operation: "INSPECT_METODO_VELOCE_CONTENT", workspaceId: "workspace-local" });
    expect(inspected.result).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });

    await runtime.close();
    await state.close();
  }));

  it("consumes but does not apply approval when the Visual Gate binding changes before callback", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, contentApprovalGate: testVisualGate([], "e".repeat(64)), runtime, state, workspaceId: "workspace-local" });
    if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
    await createEvidenceBoundTelegramContent(runtime, "mv-content-telegram-stale-visual");

    const preview = await workflow.handle(identity, "/production mv-content-telegram-stale-visual");
    expect(preview.buttons?.[0]?.text).toBe("Approva per calendario");
    const blocked = await workflow.handleCallback(identity, preview.buttons?.[0]?.callbackData ?? "");
    expect(blocked?.text).toContain("binding del Visual Gate è cambiato");
    const replay = await workflow.handleCallback(identity, preview.buttons?.[0]?.callbackData ?? "");
    expect(replay).toBeUndefined();
    const inspected = await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "inspect-stale-visual", contractVersion: "1", input: { productionId: "mv-content-telegram-stale-visual" }, operation: "INSPECT_METODO_VELOCE_CONTENT", workspaceId: "workspace-local" });
    expect(inspected.result).toMatchObject({ status: "PENDING_FABIO_APPROVAL", version: 0 });

    await runtime.close();
    await state.close();
  }));

  it("shows legacy content but never offers Fabio approval without an Evidence Pack", async () => withDatabase(async (path) => {
    const runtime = await createLocalRuntime(config(path), { clock });
    const state = new TelegramSqliteStateStore({ path, timeoutMs: 1_000 }, clock, () => "fixed-token");
    const workflow = new TelegramWorkflowOperatorConsole({ actorId: "actor-local", chatId: "200", clock, confirmationRetentionSeconds: 600, runtime, state, workspaceId: "workspace-local" });
    if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
    await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "telegram-content-legacy-001", contractVersion: "1", input: { brief: contentBrief("mv-content-legacy-001") }, operation: "PRODUCE_METODO_VELOCE_CONTENT", workspaceId: "workspace-local" });

    const preview = await workflow.handle(identity, "/production mv-content-legacy-001");
    expect(preview.text).toContain("senza Evidence Pack");
    expect(preview.buttons).toBeUndefined();

    await runtime.close();
    await state.close();
  }));
});

async function createEvidenceBoundTelegramContent(runtime: Awaited<ReturnType<typeof createLocalRuntime>>, productionId: string): Promise<void> {
  if (runtime.executeWorkflowCommand === undefined) throw new Error("Workflow command boundary unavailable");
  await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "telegram-source-001", contractVersion: "1", input: { canonicalReference: "https://example.org/official/", category: "OFFICIAL_SITE", maxFreshnessDays: 30, name: "Fonte Telegram", permittedRiskDomains: ["GENERAL"], publicCitationAllowed: true, reliability: "HIGH", requiresSecondSource: false, sourceId: "telegram-source", status: "AUTHORIZED" }, operation: "REGISTER_EVIDENCE_SOURCE", workspaceId: "workspace-local" });
  await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "telegram-evidence-001", contractVersion: "1", input: { claimMappings: [{ claimId: "telegram-claim", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }], contentPublishedAt: "2026-07-10T00:00:00.000Z", corroboratingEvidenceIds: [], evidenceId: "telegram-evidence", excerpt: "Estratto strutturato della fonte autorizzata per il contenuto Telegram.", fingerprint: "a".repeat(64), freshnessExpiresAt: "2026-07-20T10:05:00.000Z", limitations: ["Non generalizzare oltre il campione osservato."], riskDomain: "GENERAL", sourceId: "telegram-source", sourceReference: "https://example.org/official/telegram", status: "VERIFIED" }, operation: "RECORD_EVIDENCE", workspaceId: "workspace-local" });
  await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "telegram-pack-001", contractVersion: "1", input: { evidenceIds: ["telegram-evidence"], packId: "telegram-pack-001" }, operation: "CREATE_EVIDENCE_PACK", workspaceId: "workspace-local" });
  await runtime.executeWorkflowCommand({ actorId: "actor-local", commandId: "telegram-content-produce-001", contractVersion: "1", input: { brief: contentBrief(productionId), evidencePackId: "telegram-pack-001" }, operation: "PRODUCE_METODO_VELOCE_CONTENT_FROM_EVIDENCE_PACK", workspaceId: "workspace-local" });
}

async function approvalReadyMission(console: TelegramMissionPlanningConsole): Promise<void> {
  await console.handle(identity, "1", "/mission");
  await console.handle(identity, "2", '{"statement":"Evaluate a bounded business opportunity for Fabio.","purpose":"Identify a practical opportunity worth validating.","desiredOutcome":"A clear decision and one safe first action.","businessValues":["help_fabio_make_money","save_fabio_time"]}');
  await console.handle(identity, "3", "business_opportunity");
  await console.handle(identity, "4", '{"description":"Fabio as founder and operator","segments":["founder operator"]}');
  await console.handle(identity, "5", '[{"deliverableId":"validated-decision-brief","title":"Validated decision brief","description":"A structured decision brief with evidence needs and next action.","format":"structured_json","acceptanceCriteria":["The result is specific, measurable, safe, and ready for Fabio review."]}]');
  await console.handle(identity, "6", '{"status":"unknown","timezone":"Europe/Rome"}');
  await console.handle(identity, "7", '{"status":"unknown"}');
  await console.handle(identity, "8", '[{"metricId":"decision-readiness","measurement":"decision readiness","target":"one explicit go, revise, or stop recommendation","evidenceRequired":"The brief contains a decision, rationale, and validation need."}]');
  await console.handle(identity, "9", '[]');
  const review = await console.handle(identity, "10", '{"founderProfileId":"only-way-founder-preferences@1.0.0","founderProfileVersion":"1.0.0","brandProfileId":"mv-ai-os@1.0.0","brandProfileVersion":"1.0.0"}');
  const confirmed = await console.handleCallback(identity, review.buttons?.[0]?.callbackData ?? "");
  await console.handleCallback(identity, confirmed.buttons?.[0]?.callbackData ?? "");
}

function config(path: string): LocalRuntimeConfig { return { actorId: "actor-local", contentAgentMode: "deterministic", contractVersion: "1", permissions: { actorGrants: [], policyGrants: [], taskGrants: [] }, sqlite: { path, timeoutMs: 1_000 }, workspaceId: "workspace-local" }; }
function contentBrief(productionId: string) { return { audience: "Persone che vogliono testare un'offerta prima di investire budget.", callToAction: "Salva il post e scegli un test piccolo per questa settimana.", contractVersion: "1", evidence: [{ evidenceId: "telegram-evidence", sourceRef: "telegram-source", statement: "Le persone chiedono esempi concreti prima di valutare l'offerta." }], language: "it", missionReference: "mission-draft-1", objective: "educate", offer: "un percorso per validare offerte digitali", productionId, topic: "come validare un'offerta prima di promuoverla" } as const; }
function testVisualGate(stages: string[], confirmFingerprint = "c".repeat(64)): CommandCenterContentApprovalGate {
  return Object.freeze({
    verify: (input: Parameters<CommandCenterContentApprovalGate["verify"]>[0]) => {
      const { production, stage } = input;
      stages.push(stage);
      const bindingFingerprint = stage === "PROPOSE" ? "c".repeat(64) : confirmFingerprint;
      const receipt: VisualApprovalBindingReceipt = Object.freeze({
        assetSetFingerprint: "a".repeat(64),
        bindingFingerprint,
        contentPackageFingerprint: canonicalSha256(production.package),
        manifestFingerprint: "b".repeat(64),
        masterContentPackFingerprint: production.package.socialPublishingPack?.masterContentPack.fingerprint ?? "0".repeat(64),
        productionId: production.productionId,
        productionVersion: production.version,
        socialPublishingPackFingerprint: production.package.socialPublishingPack?.fingerprint ?? "0".repeat(64),
        workspaceId: production.workspaceId,
      });
      return Promise.resolve(receipt);
    },
  });
}
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-workflow-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
