import {
  MEMORY_SCHEMA_VERSION,
  type BaseMemoryRecord,
  type MemoryCategory,
  type MemoryProvenance,
  type MemoryRecord,
  type MemorySensitivity,
  type MemoryVisibility,
} from "./memory-record.js";
import {
  readOptionalNumber,
  readOptionalString,
  readRequiredJsonObject,
  readRequiredString,
  readRequiredStringArray,
} from "../validation/field-readers.js";
import {
  asRecord,
  isRfc3339Timestamp,
} from "../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../validation/validation.js";

const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "conversation",
  "operational",
  "semantic",
  "user",
  "working",
]);
const VISIBILITIES = new Set<MemoryVisibility>(["owner", "workspace"]);
const SENSITIVITIES = new Set<MemorySensitivity>([
  "internal",
  "public",
  "sensitive",
]);
const PROVENANCE_SOURCES = new Set<MemoryProvenance["source"]>([
  "agent_proposal",
  "import",
  "system",
  "user",
  "workflow_result",
]);
const VERIFICATION_STATES = new Set([
  "disputed",
  "unverified",
  "verified",
]);

export class MemoryRecordValidator implements Validator<MemoryRecord> {
  public validate(value: unknown): ValidationResult<MemoryRecord> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "memory record must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const memoryId = readRequiredString(record, "memoryId", issues);
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const category = readRequiredString(record, "category", issues);
    const content = readRequiredJsonObject(record, "content", issues);
    const workspaceId = readRequiredString(record, "workspaceId", issues);
    const ownerId = readRequiredString(record, "ownerId", issues);
    const visibility = readRequiredString(record, "visibility", issues);
    const provenance = readProvenance(
      record.provenance,
      "provenance",
      issues,
    );
    const createdAt = readRequiredString(record, "createdAt", issues);
    const updatedAt = readRequiredString(record, "updatedAt", issues);
    const expiresAt = readOptionalString(record, "expiresAt", issues);
    const deletedAt = readOptionalString(record, "deletedAt", issues);
    const sensitivity = readRequiredString(record, "sensitivity", issues);
    const permissionTags = readRequiredStringArray(
      record,
      "permissionTags",
      issues,
    );
    const searchableText = readOptionalString(
      record,
      "searchableText",
      issues,
    );

    validateEnum(category, MEMORY_CATEGORIES, "category", issues);
    validateEnum(visibility, VISIBILITIES, "visibility", issues);
    validateEnum(sensitivity, SENSITIVITIES, "sensitivity", issues);
    validateTimestamp(createdAt, "createdAt", issues);
    validateTimestamp(updatedAt, "updatedAt", issues);
    validateTimestamp(expiresAt, "expiresAt", issues);
    validateTimestamp(deletedAt, "deletedAt", issues);

    if (
      schemaVersion !== undefined &&
      schemaVersion !== MEMORY_SCHEMA_VERSION
    ) {
      issues.push({
        code: "unsupported_version",
        message: `schemaVersion must be ${MEMORY_SCHEMA_VERSION}`,
        path: "schemaVersion",
      });
    }

    if (
      issues.length > 0 ||
      memoryId === undefined ||
      schemaVersion !== MEMORY_SCHEMA_VERSION ||
      category === undefined ||
      !MEMORY_CATEGORIES.has(category as MemoryCategory) ||
      content === undefined ||
      workspaceId === undefined ||
      ownerId === undefined ||
      visibility === undefined ||
      !VISIBILITIES.has(visibility as MemoryVisibility) ||
      provenance === undefined ||
      createdAt === undefined ||
      updatedAt === undefined ||
      sensitivity === undefined ||
      !SENSITIVITIES.has(sensitivity as MemorySensitivity) ||
      permissionTags === undefined
    ) {
      return validationFailure(issues);
    }

    const base: BaseMemoryRecord = {
      category: category as MemoryCategory,
      content,
      createdAt,
      ...(deletedAt === undefined ? {} : { deletedAt }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      memoryId,
      ownerId,
      permissionTags,
      provenance,
      schemaVersion,
      ...(searchableText === undefined ? {} : { searchableText }),
      sensitivity: sensitivity as MemorySensitivity,
      updatedAt,
      visibility: visibility as MemoryVisibility,
      workspaceId,
    };

    return this.#specialize(base, record, issues);
  }

  #specialize(
    base: BaseMemoryRecord,
    record: Readonly<Record<string, unknown>>,
    issues: ValidationIssue[],
  ): ValidationResult<MemoryRecord> {
    switch (base.category) {
      case "working": {
        const taskId = readRequiredString(record, "taskId", issues);
        return taskId === undefined
          ? validationFailure(issues)
          : validationSuccess({ ...base, category: "working", taskId });
      }
      case "conversation": {
        const sessionId = readRequiredString(record, "sessionId", issues);
        return sessionId === undefined
          ? validationFailure(issues)
          : validationSuccess({
              ...base,
              category: "conversation",
              sessionId,
            });
      }
      case "user": {
        const approval = readApproval(record.approval, "approval", issues);
        if (base.visibility !== "owner") {
          issues.push({
            code: "invalid_value",
            message: "user memory visibility must be owner",
            path: "visibility",
          });
        }
        return approval === undefined || issues.length > 0
          ? validationFailure(issues)
          : validationSuccess({ ...base, approval, category: "user" });
      }
      case "semantic": {
        const confidence = readOptionalNumber(
          record,
          "confidence",
          issues,
        );
        const verification = readRequiredString(
          record,
          "verification",
          issues,
        );
        if (record.confidence === undefined) {
          issues.push({
            code: "required",
            message: "confidence is required",
            path: "confidence",
          });
        }
        if (confidence !== undefined && confidence > 1) {
          issues.push({
            code: "invalid_number",
            message: "confidence must not exceed 1",
            path: "confidence",
          });
        }
        validateEnum(
          verification,
          VERIFICATION_STATES,
          "verification",
          issues,
        );
        return confidence === undefined ||
          verification === undefined ||
          !VERIFICATION_STATES.has(verification) ||
          issues.length > 0
          ? validationFailure(issues)
          : validationSuccess({
              ...base,
              category: "semantic",
              confidence,
              verification: verification as
                | "disputed"
                | "unverified"
                | "verified",
            });
      }
      case "operational": {
        const taskId = readOptionalString(record, "taskId", issues);
        return issues.length > 0
          ? validationFailure(issues)
          : validationSuccess({
              ...base,
              category: "operational",
              ...(taskId === undefined ? {} : { taskId }),
            });
      }
    }
  }
}

function readProvenance(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): MemoryProvenance | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const source = readRequiredString(record, "source", issues, path);
  const referenceId = readOptionalString(
    record,
    "referenceId",
    issues,
    path,
  );
  validateEnum(source, PROVENANCE_SOURCES, `${path}.source`, issues);
  if (
    source === undefined ||
    !PROVENANCE_SOURCES.has(source as MemoryProvenance["source"])
  ) {
    return undefined;
  }
  return {
    ...(referenceId === undefined ? {} : { referenceId }),
    source: source as MemoryProvenance["source"],
  };
}

function readApproval(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): { readonly approvedBy: string; readonly approvedAt: string } | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }
  const approvedBy = readRequiredString(
    record,
    "approvedBy",
    issues,
    path,
  );
  const approvedAt = readRequiredString(
    record,
    "approvedAt",
    issues,
    path,
  );
  validateTimestamp(approvedAt, `${path}.approvedAt`, issues);
  return approvedBy === undefined || approvedAt === undefined
    ? undefined
    : { approvedAt, approvedBy };
}

function validateTimestamp(
  value: string | undefined,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !isRfc3339Timestamp(value)) {
    issues.push({
      code: "invalid_timestamp",
      message: `${path} must be a UTC RFC 3339 timestamp`,
      path,
    });
  }
}

function validateEnum<T extends string>(
  value: string | undefined,
  allowed: ReadonlySet<T>,
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined && !allowed.has(value as T)) {
    issues.push({
      code: "invalid_value",
      message: `${path} is not supported`,
      path,
    });
  }
}
