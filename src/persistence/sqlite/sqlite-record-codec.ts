import type { AuditEvent } from "../../contracts/audit-event.js";
import type { TaskResponse } from "../../contracts/task-response.js";
import type { TaskRecord } from "../../core/models/task.js";
import { RepositoryValidationError } from "../../errors/core-error.js";
import type { StoredRequest } from "../request-repository.js";
import { AuditEventValidator } from "../../validation/audit-event-validator.js";
import { StoredRequestValidator } from "../../validation/stored-request-validator.js";
import { TaskRecordValidator } from "../../validation/task-record-validator.js";
import { TaskResponseValidator } from "../../validation/task-response-validator.js";
import type {
  ValidationIssue,
  Validator,
} from "../../validation/validation.js";

export class SqliteRecordCodec {
  readonly #auditValidator = new AuditEventValidator();
  readonly #requestValidator = new StoredRequestValidator();
  readonly #responseValidator = new TaskResponseValidator();
  readonly #taskValidator = new TaskRecordValidator();

  public encodeTask(value: unknown): {
    readonly json: string;
    readonly value: TaskRecord;
  } {
    return encodeValidated(value, this.#taskValidator, "Task record");
  }

  public decodeTask(json: string): TaskRecord {
    return freezeValidated(
      parseJson(json, "Task record"),
      this.#taskValidator,
      "Task record",
    );
  }

  public encodeRequest(value: unknown): {
    readonly json: string;
    readonly value: StoredRequest;
  } {
    return encodeValidated(
      value,
      this.#requestValidator,
      "Stored request",
    );
  }

  public decodeRequest(json: string): StoredRequest {
    return freezeValidated(
      parseJson(json, "Stored request"),
      this.#requestValidator,
      "Stored request",
    );
  }

  public validateResponse(value: unknown): TaskResponse {
    return validated(value, this.#responseValidator, "Task response");
  }

  public encodeAudit(value: unknown): {
    readonly json: string;
    readonly value: AuditEvent;
  } {
    return encodeValidated(
      value,
      this.#auditValidator,
      "Audit event",
    );
  }

  public decodeAudit(json: string): AuditEvent {
    return freezeValidated(
      parseJson(json, "Audit event"),
      this.#auditValidator,
      "Audit event",
    );
  }
}

function encodeValidated<T>(
  value: unknown,
  validator: Validator<T>,
  label: string,
): { readonly json: string; readonly value: T } {
  const valid = validated(value, validator, label);
  let json: string;
  try {
    json = JSON.stringify(valid);
  } catch {
    throw new RepositoryValidationError(`${label} is not serializable`);
  }
  return { json, value: valid };
}

function parseJson(json: string, label: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new RepositoryValidationError(
      `${label} contains invalid JSON`,
    );
  }
}

function validated<T>(
  value: unknown,
  validator: Validator<T>,
  label: string,
): T {
  const validation = validator.validate(value);
  if (!validation.ok) {
    throw validationError(label, validation.issues);
  }
  return validation.value;
}

function freezeValidated<T>(
  value: unknown,
  validator: Validator<T>,
  label: string,
): T {
  return deepFreeze(structuredClone(validated(value, validator, label)));
}

function validationError(
  label: string,
  issues: readonly ValidationIssue[],
): RepositoryValidationError {
  return new RepositoryValidationError(`${label} failed validation`, {
    issues: issues.map(({ code, message, path }) => ({
      code,
      message,
      path,
    })),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}

export function readTextColumn(
  row: Readonly<Record<string, unknown>>,
  column: string,
): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new RepositoryValidationError(
      `SQLite row column ${column} must be text`,
    );
  }
  return value;
}
