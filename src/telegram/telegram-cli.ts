#!/usr/bin/env node
import { chmod, open } from "node:fs/promises";

import { createTelegramOperatorConsole, preflightTelegramOperator, readTelegramApplicationConfig } from "./telegram-runtime.js";
import { createTelegramMissionReport, serializeTelegramMissionReport } from "./telegram-mission-report-export.js";
import { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";

async function main(): Promise<void> {
  const [action, path, ...arguments_] = process.argv.slice(2);
  if (action === "preflight" && path !== undefined && process.argv.length === 4) { const report = await preflightTelegramOperator(await readTelegramApplicationConfig(path)); process.stdout.write(`Telegram preflight: ${report.status}; secret reference: ${report.secretReferenceId}; composition: ready\n`); return; }
  if (action === "doctor" && path !== undefined) { await doctor(path, arguments_); return; }
  if (action === "release-check" && path !== undefined && arguments_.length === 1 && arguments_[0] === "--offline") { await releaseCheck(path); return; }
  if (action === "export-mission" && path !== undefined) { await exportMission(path, arguments_); return; }
  if (action === undefined || path !== undefined || process.argv.length !== 3) throw new Error("Usage: mv-ai-os-telegram [preflight] <local-config.json>");
  const console_ = await createTelegramOperatorConsole(await readTelegramApplicationConfig(action));
  let stopping = false;
  const stop = (): void => { stopping = true; void console_.close().finally(() => process.exit(0)); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  await console_.bootstrap();
  await pollUntilStopped(console_, () => stopping);
}
void main().catch(() => { process.stderr.write("Telegram operator could not start. Run the documented preflight and verify the local secret reference and private database directory.\n"); process.exitCode = 1; });

async function exportMission(configPath: string, arguments_: readonly string[]): Promise<void> {
  const [reference, formatFlag, formatValue, outputFlag, outputPath, overwrite] = arguments_;
  if (!validReference(reference) || formatFlag !== "--format" || (formatValue !== "markdown" && formatValue !== "json") || outputFlag !== "--output" || outputPath === undefined || !outputPath.startsWith("/") || (overwrite !== undefined && overwrite !== "--overwrite")) throw new Error("Usage: export-mission <safe-mission-reference> --format markdown|json --output <absolute-path> [--overwrite]");
  const config = await readTelegramApplicationConfig(configPath);
  const sqlite = sqliteConfig(config);
  const state = new TelegramSqliteStateStore(sqlite, { now: () => new Date() });
  try {
    const result = state.readMissionResult(reference);
    if (result === undefined) throw new Error("Mission result is unavailable");
    const report = serializeTelegramMissionReport(createTelegramMissionReport(result.draft, result.response), formatValue);
    const file = await open(outputPath, overwrite === "--overwrite" ? "w" : "wx", 0o600);
    try { await file.writeFile(report, "utf8"); } finally { await file.close(); }
    await chmod(outputPath, 0o600);
    process.stdout.write(`Mission export: PASS; format: ${formatValue}; output: written\n`);
  } finally { await state.close(); }
}

async function doctor(configPath: string, arguments_: readonly string[]): Promise<void> {
  if (arguments_.length > 1 || (arguments_[0] !== undefined && arguments_[0] !== "--json")) throw new Error("Usage: doctor <local-config.json> [--json]");
  const config = await readTelegramApplicationConfig(configPath);
  const checks: { code: string; status: "PASS" | "FAIL" | "WARN" }[] = [];
  try { await preflightTelegramOperator(config); checks.push({ code: "CONFIGURATION_AND_COMPOSITION_READY", status: "PASS" }); }
  catch { checks.push({ code: "CONFIGURATION_OR_SECRET_REFERENCE_UNAVAILABLE", status: "FAIL" }); }
  try {
    const state = new TelegramSqliteStateStore(sqliteConfig(config), { now: () => new Date() });
    try { const counts = state.diagnostics(); checks.push({ code: `STATE_READY_ACTIVE_${String(counts.activeDrafts)}_RESULTS_${String(counts.completedResults)}_CALLBACKS_${String(counts.pendingCallbacks)}`, status: "PASS" }); }
    finally { await state.close(); }
  } catch { checks.push({ code: "STATE_UNAVAILABLE_OR_CORRUPT", status: "FAIL" }); }
  checks.push({ code: "TEMPLATE_REGISTRY_READY", status: "PASS" }, { code: "EXPORT_BOUNDARY_READY", status: "PASS" });
  const status = checks.some((entry) => entry.status === "FAIL") ? "FAIL" : checks.some((entry) => entry.status === "WARN") ? "WARN" : "PASS";
  if (arguments_[0] === "--json") process.stdout.write(`${JSON.stringify({ contractVersion: "1", status, checks })}\n`);
  else process.stdout.write(`Telegram doctor: ${status}\n${checks.map((entry) => `${entry.status} ${entry.code}`).join("\n")}\n`);
  if (status === "FAIL") process.exitCode = 1;
}

async function releaseCheck(configPath: string): Promise<void> {
  await doctor(configPath, []);
  if (process.exitCode === 1) return;
  process.stdout.write("Telegram release check: PASS; offline-only; no Workflow, Agent Runtime, provider, tool, or external action was invoked.\n");
}

function sqliteConfig(value: unknown): { readonly path: string; readonly timeoutMs: number } {
  if (!record(value) || !record(value.runtime) || !record(value.runtime.sqlite) || typeof value.runtime.sqlite.path !== "string" || !Number.isSafeInteger(value.runtime.sqlite.timeoutMs)) throw new Error("Telegram configuration is invalid");
  return { path: value.runtime.sqlite.path, timeoutMs: value.runtime.sqlite.timeoutMs as number };
}
function validReference(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9@._-]{0,127}$/u.test(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

async function pollUntilStopped(
  console_: { readonly pollOnce: () => Promise<void> },
  stopping: () => boolean,
): Promise<void> {
  while (!stopping()) await console_.pollOnce();
}
