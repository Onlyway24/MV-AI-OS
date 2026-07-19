import type {
  OperationalEvent,
  OperationalEventCursorWindow,
} from "../operations-runtime/operational-event.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";

const WORKSPACE_ID = /^[a-zA-Z0-9][a-zA-Z0-9@._:-]{0,127}$/u;

/** Workspace-scoped read boundary consumed by the local SSE plane. */
export interface CommandCenterEventSource {
  cursorWindow(): Promise<OperationalEventCursorWindow>;
  listAfter(afterSequence: number, limit: number): Promise<readonly OperationalEvent[]>;
}

export interface CommandCenterEventPlaneOptions {
  readonly connectionLimit?: number;
  readonly heartbeatMs?: number;
  readonly maxReplayEvents?: number;
  readonly pollIntervalMs?: number;
  readonly source: CommandCenterEventSource;
}

/** Read-only adapter that keeps the web server outside the persistence boundary. */
export class RepositoryBackedCommandCenterEventSource implements CommandCenterEventSource {
  public constructor(
    private readonly repositories: RepositoryTransactionRunner,
    private readonly workspaceId: string,
  ) {
    if (!WORKSPACE_ID.test(workspaceId)) throw new Error("Command Center event workspace is invalid");
  }

  public cursorWindow(): Promise<OperationalEventCursorWindow> {
    return this.repositories.transaction(({ operationalEvents }) =>
      operationalEvents.cursorWindow(this.workspaceId));
  }

  public listAfter(afterSequence: number, limit: number): Promise<readonly OperationalEvent[]> {
    return this.repositories.transaction(({ operationalEvents }) =>
      operationalEvents.listAfter(this.workspaceId, afterSequence, limit));
  }
}
