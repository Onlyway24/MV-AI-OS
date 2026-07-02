import type { AuditEvent } from "../contracts/audit-event.js";

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
  listByCorrelationId(
    correlationId: string,
  ): Promise<readonly AuditEvent[]>;
}
