import type { AuditEvent } from "../../contracts/audit-event.js";
import type { TaskResponse } from "../../contracts/task-response.js";
import type { TaskRecord } from "../../core/models/task.js";
import { RepositoryValidationError } from "../../errors/core-error.js";
import type { KnowledgeRecord } from "../../knowledge/knowledge-record.js";
import { KnowledgeRecordValidator } from "../../knowledge/knowledge-record-validator.js";
import type { MemoryRecord } from "../../memory/memory-record.js";
import { MemoryRecordValidator } from "../../memory/memory-record-validator.js";
import type { StoredRequest } from "../request-repository.js";
import { AuditEventValidator } from "../../validation/audit-event-validator.js";
import { StoredRequestValidator } from "../../validation/stored-request-validator.js";
import { TaskRecordValidator } from "../../validation/task-record-validator.js";
import { TaskResponseValidator } from "../../validation/task-response-validator.js";
import type {
  WorkflowCommandReceipt,
  WorkflowDefinition,
  WorkflowInstance,
} from "../../workflows/runtime/workflow-runtime.js";
import {
  WorkflowCommandReceiptValidator,
  WorkflowDefinitionValidator,
  WorkflowInstanceValidator,
} from "../../workflows/runtime/workflow-runtime-validator.js";
import type {
  WorkflowEvent,
  WorkflowEventDraft,
} from "../../workflows/runtime/workflow-persistence.js";
import type {
  WorkflowApprovalCheckpoint,
  WorkflowControlCheckpointEvent,
  WorkflowControlCheckpointEventDraft,
  WorkflowGuardianCheckpoint,
} from "../../workflows/runtime/workflow-control-checkpoint.js";
import {
  WorkflowApprovalCheckpointValidator,
  WorkflowControlCheckpointEventDraftValidator,
  WorkflowControlCheckpointEventValidator,
  WorkflowGuardianCheckpointValidator,
} from "../../workflows/runtime/workflow-control-checkpoint-validator.js";
import {
  WorkflowEventDraftValidator,
  WorkflowEventValidator,
} from "../../workflows/runtime/workflow-persistence-validator.js";
import type {
  ValidationIssue,
  Validator,
} from "../../validation/validation.js";

export class SqliteRecordCodec {
  readonly #auditValidator = new AuditEventValidator();
  readonly #knowledgeValidator = new KnowledgeRecordValidator();
  readonly #memoryValidator = new MemoryRecordValidator();
  readonly #requestValidator = new StoredRequestValidator();
  readonly #responseValidator = new TaskResponseValidator();
  readonly #taskValidator = new TaskRecordValidator();
  readonly #workflowCommandReceiptValidator =
    new WorkflowCommandReceiptValidator();
  readonly #workflowApprovalCheckpointValidator =
    new WorkflowApprovalCheckpointValidator();
  readonly #workflowControlCheckpointEventDraftValidator =
    new WorkflowControlCheckpointEventDraftValidator();
  readonly #workflowControlCheckpointEventValidator =
    new WorkflowControlCheckpointEventValidator();
  readonly #workflowDefinitionValidator = new WorkflowDefinitionValidator();
  readonly #workflowEventDraftValidator = new WorkflowEventDraftValidator();
  readonly #workflowEventValidator = new WorkflowEventValidator();
  readonly #workflowInstanceValidator = new WorkflowInstanceValidator();
  readonly #workflowGuardianCheckpointValidator =
    new WorkflowGuardianCheckpointValidator();

  public encodeTask(value: unknown): {
    readonly json: string;
    readonly value: TaskRecord;
  } {
    return encodeValidated(value, this.#taskValidator, "Task record");
  }

  public encodeMemory(value: unknown): {
    readonly json: string;
    readonly value: MemoryRecord;
  } {
    return encodeValidated(value, this.#memoryValidator, "Memory record");
  }

  public encodeKnowledge(value: unknown): {
    readonly json: string;
    readonly value: KnowledgeRecord;
  } {
    return encodeValidated(
      value,
      this.#knowledgeValidator,
      "Knowledge record",
    );
  }

  public decodeKnowledge(json: string): KnowledgeRecord {
    return freezeValidated(
      parseJson(json, "Knowledge record"),
      this.#knowledgeValidator,
      "Knowledge record",
    );
  }

  public decodeMemory(json: string): MemoryRecord {
    return freezeValidated(
      parseJson(json, "Memory record"),
      this.#memoryValidator,
      "Memory record",
    );
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

  public encodeWorkflowDefinition(value: unknown): {
    readonly json: string;
    readonly value: WorkflowDefinition;
  } {
    return encodeValidated(
      value,
      this.#workflowDefinitionValidator,
      "Workflow definition",
    );
  }

  public decodeWorkflowDefinition(json: string): WorkflowDefinition {
    return freezeValidated(
      parseJson(json, "Workflow definition"),
      this.#workflowDefinitionValidator,
      "Workflow definition",
    );
  }

  public encodeWorkflowInstance(value: unknown): {
    readonly json: string;
    readonly value: WorkflowInstance;
  } {
    return encodeValidated(
      value,
      this.#workflowInstanceValidator,
      "Workflow instance",
    );
  }

  public decodeWorkflowInstance(json: string): WorkflowInstance {
    return freezeValidated(
      parseJson(json, "Workflow instance"),
      this.#workflowInstanceValidator,
      "Workflow instance",
    );
  }

  public encodeWorkflowCommandReceipt(value: unknown): {
    readonly json: string;
    readonly value: WorkflowCommandReceipt;
  } {
    return encodeValidated(
      value,
      this.#workflowCommandReceiptValidator,
      "Workflow command receipt",
    );
  }

  public decodeWorkflowCommandReceipt(
    json: string,
  ): WorkflowCommandReceipt {
    return freezeValidated(
      parseJson(json, "Workflow command receipt"),
      this.#workflowCommandReceiptValidator,
      "Workflow command receipt",
    );
  }

  public encodeWorkflowEventDraft(value: unknown): {
    readonly json: string;
    readonly value: WorkflowEventDraft;
  } {
    return encodeValidated(
      value,
      this.#workflowEventDraftValidator,
      "Workflow event draft",
    );
  }

  public decodeWorkflowEventDraft(json: string): WorkflowEventDraft {
    return freezeValidated(
      parseJson(json, "Workflow event draft"),
      this.#workflowEventDraftValidator,
      "Workflow event draft",
    );
  }

  public validateWorkflowEvent(value: unknown): WorkflowEvent {
    return validated(
      value,
      this.#workflowEventValidator,
      "Workflow event",
    );
  }

  public encodeWorkflowApprovalCheckpoint(value: unknown): {
    readonly json: string;
    readonly value: WorkflowApprovalCheckpoint;
  } {
    return encodeValidated(
      value,
      this.#workflowApprovalCheckpointValidator,
      "Workflow approval checkpoint",
    );
  }

  public decodeWorkflowApprovalCheckpoint(
    json: string,
  ): WorkflowApprovalCheckpoint {
    return freezeValidated(
      parseJson(json, "Workflow approval checkpoint"),
      this.#workflowApprovalCheckpointValidator,
      "Workflow approval checkpoint",
    );
  }

  public encodeWorkflowGuardianCheckpoint(value: unknown): {
    readonly json: string;
    readonly value: WorkflowGuardianCheckpoint;
  } {
    return encodeValidated(
      value,
      this.#workflowGuardianCheckpointValidator,
      "Workflow Guardian checkpoint",
    );
  }

  public decodeWorkflowGuardianCheckpoint(
    json: string,
  ): WorkflowGuardianCheckpoint {
    return freezeValidated(
      parseJson(json, "Workflow Guardian checkpoint"),
      this.#workflowGuardianCheckpointValidator,
      "Workflow Guardian checkpoint",
    );
  }

  public encodeWorkflowControlCheckpointEventDraft(value: unknown): {
    readonly json: string;
    readonly value: WorkflowControlCheckpointEventDraft;
  } {
    return encodeValidated(
      value,
      this.#workflowControlCheckpointEventDraftValidator,
      "Workflow control checkpoint event",
    );
  }

  public decodeWorkflowControlCheckpointEventDraft(
    json: string,
  ): WorkflowControlCheckpointEventDraft {
    return freezeValidated(
      parseJson(json, "Workflow control checkpoint event"),
      this.#workflowControlCheckpointEventDraftValidator,
      "Workflow control checkpoint event",
    );
  }

  public validateWorkflowControlCheckpointEvent(
    value: unknown,
  ): WorkflowControlCheckpointEvent {
    return validated(
      value,
      this.#workflowControlCheckpointEventValidator,
      "Workflow control checkpoint event",
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

export function readNullableTextColumn(
  row: Readonly<Record<string, unknown>>,
  column: string,
): string | undefined {
  const value = row[column];
  if (value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new RepositoryValidationError(
      `SQLite row column ${column} must be text or null`,
    );
  }
  return value;
}

export function readIntegerColumn(
  row: Readonly<Record<string, unknown>>,
  column: string,
): number {
  const value = row[column];
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value)
  ) {
    throw new RepositoryValidationError(
      `SQLite row column ${column} must be an integer`,
    );
  }
  return value;
}
