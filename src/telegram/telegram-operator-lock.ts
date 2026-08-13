import { randomUUID } from "node:crypto";

import { RepositoryConflictError } from "../errors/core-error.js";
import { SupervisedProcessLock } from "../operations-runtime/supervised-process-lock.js";
import { TelegramOperatorError } from "./telegram-operator-errors.js";

export class TelegramOperatorProcessLock {
  private constructor(private readonly lock: SupervisedProcessLock) {}

  public static async acquire(sqlitePath: string): Promise<TelegramOperatorProcessLock> {
    try {
      const lock = await SupervisedProcessLock.acquire({
        instanceId: `telegram-${randomUUID()}`,
        path: `${sqlitePath}.telegram-operator.lock`,
        role: "telegram",
      });
      return new TelegramOperatorProcessLock(lock);
    } catch (error) {
      if (error instanceof RepositoryConflictError) throw new TelegramOperatorError("OPERATOR_LOCK_HELD", "CONFIGURATION", false);
      throw new TelegramOperatorError("DATABASE_UNAVAILABLE", "CONFIGURATION", false);
    }
  }

  public async close(): Promise<void> {
    try { await this.lock.close(); }
    catch { throw new TelegramOperatorError("OPERATOR_SHUTDOWN_FAILED", "SHUTDOWN", false); }
  }
}
