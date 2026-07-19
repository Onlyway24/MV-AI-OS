import type {
  OperationalEvent,
  OperationalEventCursorWindow,
  OperationalEventDraft,
  OperationalEventType,
} from "./operational-event.js";

export interface OperationalEventRepository {
  append(event: OperationalEventDraft): Promise<OperationalEvent>;
  cursorWindow(workspaceId: string): Promise<OperationalEventCursorWindow>;
  getLatestByType(
    workspaceId: string,
    eventType: OperationalEventType,
  ): Promise<OperationalEvent | undefined>;
  listAfter(
    workspaceId: string,
    afterSequence: number,
    limit: number,
  ): Promise<readonly OperationalEvent[]>;
  pruneBefore(
    workspaceId: string,
    beforeSequence: number,
    limit: number,
  ): Promise<number>;
}
