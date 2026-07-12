import { open, unlink } from "node:fs/promises";

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
      if (isAlreadyExists(error)) throw new Error("Telegram operator is already running for this local database");
      throw new Error("Telegram operator lock cannot be created");
    }
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    try { await unlink(this.path); }
    catch (error) { if (!isMissing(error)) throw new Error("Telegram operator lock cannot be released"); }
  }
}

function isAlreadyExists(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"; }
function isMissing(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"; }
