import type { JsonObject } from "./json.js";
import type { RequestContractVersion } from "./request-envelope.js";

export const AUDIT_SCHEMA_VERSION = "1" as const;

export type AuditOutcome = "failure" | "success";

export interface AuditEvent {
  readonly contractVersion: RequestContractVersion;
  readonly schemaVersion: typeof AUDIT_SCHEMA_VERSION;
  readonly eventId: string;
  readonly eventType: string;
  readonly correlationId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly taskId?: string;
  readonly subject?: JsonObject;
  readonly action: string;
  readonly outcome: AuditOutcome;
  readonly metadata: JsonObject;
  readonly occurredAt: string;
}
