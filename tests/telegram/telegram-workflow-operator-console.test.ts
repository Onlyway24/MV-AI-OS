import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createLocalRuntime, TelegramMissionDraftSessionCoordinator, TelegramMissionPlanningConsole, TelegramSqliteStateStore, TelegramWorkflowOperatorConsole, type LocalRuntimeConfig } from "../../src/index.js";
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
});

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
async function withDatabase(test: (path: string) => Promise<void>): Promise<void> { const directory = await mkdtemp(join(tmpdir(), "mv-ai-os-telegram-workflow-")); try { await test(join(directory, "runtime.sqlite")); } finally { await rm(directory, { force: true, recursive: true }); } }
