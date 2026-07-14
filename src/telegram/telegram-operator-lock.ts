import { open, unlink } from "node:fs/promises";

import { TelegramOperatorError } from "./telegram-operator-errors.js";

export class TelegramOperatorProcessLock {
  #closed = false;
  private constructor(private readonly path: string) {}

  public static async acquire(sqlitePath: string): Promise<TelegramOperatorProcessLock> {
    const path = `${sqlitePath}.telegram-operator.lock`;
    try {
      const handle = await open(path, "wx", 0o600);
      await handle.close();
      return new TelegramOperatorProcessLock(path);
    } catch (error) {
      if (isAlreadyExists(error)) throw new TelegramOperatorError("OPERATOR_LOCK_HELD", "CONFIGURATION", false);
      throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false);
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try { await unlink(this.path); }
    catch (error) { if (!isMissing(error)) throw new TelegramOperatorError("OPERATOR_SHUTDOWN_FAILED", "SHUTDOWN", false); }
  }
}

function isAlreadyExists(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"; }
function isMissing(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
