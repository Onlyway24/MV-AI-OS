#!/usr/bin/env node
import { createTelegramOperatorConsole, preflightTelegramOperator, readTelegramApplicationConfig } from "./telegram-runtime.js";

async function main(): Promise<void> {
  const [action, path] = process.argv.slice(2);
  if (action === "preflight" && path !== undefined && process.argv.length === 4) { const report = await preflightTelegramOperator(await readTelegramApplicationConfig(path)); process.stdout.write(`Telegram preflight: ${report.status}; secret reference: ${report.secretReferenceId}; composition: ready\n`); return; }
  if (action === undefined || path !== undefined || process.argv.length !== 3) throw new Error("Usage: mv-ai-os-telegram [preflight] <local-config.json>");
  const console_ = await createTelegramOperatorConsole(await readTelegramApplicationConfig(action));
  let stopping = false;
  const stop = (): void => { stopping = true; void console_.close().finally(() => process.exit(0)); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  await console_.bootstrap();
  await pollUntilStopped(console_, () => stopping);
}
void main().catch(() => { process.stderr.write("Telegram operator could not start. Run the documented preflight and verify the local secret reference and private database directory.\n"); process.exitCode = 1; });

async function pollUntilStopped(
  console_: { readonly pollOnce: () => Promise<void> },
  stopping: () => boolean,
): Promise<void> {
  while (!stopping()) await console_.pollOnce();
}
