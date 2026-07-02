import {
  AUDIT_SCHEMA_VERSION,
  type AuditEvent,
  type AuditOutcome,
} from "../contracts/audit-event.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readOptionalJsonObject,
  readOptionalString,
  readRequiredJsonObject,
  readRequiredString,
} from "./field-readers.js";
import { asRecord, isRfc3339Timestamp } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const AUDIT_OUTCOMES = new Set<AuditOutcome>(["failure", "success"]);

export class AuditEventValidator implements Validator<AuditEvent> {
  public validate(value: unknown): ValidationResult<AuditEvent> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "audit event must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const contractVersion = readRequiredString(
      record,
      "contractVersion",
      issues,
    );
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const eventId = readRequiredString(record, "eventId", issues);
    const eventType = readRequiredString(record, "eventType", issues);
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const actorId = readRequiredString(record, "actorId", issues);
    const taskId = readOptionalString(record, "taskId", issues);
    const subject = readOptionalJsonObject(record, "subject", issues);
    const action = readRequiredString(record, "action", issues);
    const outcome = readRequiredString(record, "outcome", issues);
    const metadata = readRequiredJsonObject(record, "metadata", issues);
    const occurredAt = readRequiredString(record, "occurredAt", issues);

    if (
      contractVersion !== undefined &&
      contractVersion !== REQUEST_CONTRACT_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `contractVersion must be ${REQUEST_CONTRACT_VERSION}`,
        path: "contractVersion",
      });
    }
    if (
      schemaVersion !== undefined &&
      schemaVersion !== AUDIT_SCHEMA_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `schemaVersion must be ${AUDIT_SCHEMA_VERSION}`,
        path: "schemaVersion",
      });
    }
    if (
      outcome !== undefined &&
      !AUDIT_OUTCOMES.has(outcome as AuditOutcome)
    ) {
      issues.push({
        code: "invalid_value",
        message: "outcome is not supported",
        path: "outcome",
      });
    }
    if (occurredAt !== undefined && !isRfc3339Timestamp(occurredAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "occurredAt must be a UTC RFC 3339 timestamp",
        path: "occurredAt",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      schemaVersion !== AUDIT_SCHEMA_VERSION ||
      eventId === undefined ||
      eventType === undefined ||
      correlationId === undefined ||
      workspaceId === undefined ||
      actorId === undefined ||
      action === undefined ||
      outcome === undefined ||
      !AUDIT_OUTCOMES.has(outcome as AuditOutcome) ||
      metadata === undefined ||
      occurredAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      action,
      actorId,
      contractVersion,
      correlationId,
      eventId,
      eventType,
      metadata,
      occurredAt,
      outcome: outcome as AuditOutcome,
      schemaVersion,
      ...(subject === undefined ? {} : { subject }),
      ...(taskId === undefined ? {} : { taskId }),
      workspaceId,
    });
  }
}
