#!/usr/bin/env node
import { createTelegramOperatorConsole, readTelegramApplicationConfig } from "./telegram-runtime.js";

async function main(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined || process.argv.length !== 3) throw new Error("Usage: mv-ai-os-telegram <local-config.json>");
  const console_ = await createTelegramOperatorConsole(await readTelegramApplicationConfig(path));
  let stopping = false;
  const stop = (): void => { stopping = true; void console_.close().finally(() => process.exit(0)); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  await console_.bootstrap();
  await pollUntilStopped(console_, () => stopping);
}
void main().catch(() => { process.exitCode = 1; });

async function pollUntilStopped(
  console_: { readonly pollOnce: () => Promise<void> },
  stopping: () => boolean,
): Promise<void> {
  while (!stopping()) await console_.pollOnce();
}
