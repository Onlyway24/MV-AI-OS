import type {
  AgentResult,
  AgentResultStatus,
  EvidenceReference,
  EvidenceSource,
} from "../contracts/agent-execution.js";
import type { JsonObject } from "../contracts/json.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import { readAgentReference } from "./agent-contract-readers.js";
import { readErrorRecord } from "./error-record-reader.js";
import {
  readOptionalJsonObject,
  readRequiredString,
} from "./field-readers.js";
import {
  asRecord,
  isJsonObject,
  isRfc3339Timestamp,
} from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const RESULT_STATUSES = new Set<AgentResultStatus>([
  "failed",
  "needs_approval",
  "needs_input",
  "succeeded",
]);
const EVIDENCE_SOURCES = new Set<EvidenceSource>([
  "conversation",
  "knowledge",
  "memory",
]);
export class AgentResultValidator implements Validator<AgentResult> {
  public validate(value: unknown): ValidationResult<AgentResult> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent result must be an object",
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
    const invocationId = readRequiredString(record, "invocationId", issues);
    const taskId = readRequiredString(record, "taskId", issues);
    const agent = readAgentReference(record.agent, "agent", issues);
    const status = readRequiredString(record, "status", issues);
    const output = readOptionalJsonObject(record, "output", issues);
    const evidence = readEvidence(record.evidence, "evidence", issues);
    const memoryProposals = readJsonObjectArray(
      record.memoryProposals,
      "memoryProposals",
      issues,
    );
    const workflowProposal = readOptionalJsonObject(
      record,
      "workflowProposal",
      issues,
    );
    const usage = readOptionalJsonObject(record, "usage", issues);
    const error = readErrorRecord(record.error, "error", issues);
    const completedAt = readRequiredString(record, "completedAt", issues);

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
      status !== undefined &&
      !RESULT_STATUSES.has(status as AgentResultStatus)
    ) {
      issues.push({
        code: "invalid_value",
        message: "status is not supported",
        path: "status",
      });
    }

    if (completedAt !== undefined && !isRfc3339Timestamp(completedAt)) {
      issues.push({
        code: "invalid_timestamp",
        message: "completedAt must be a UTC RFC 3339 timestamp",
        path: "completedAt",
      });
    }

    if (status === "succeeded" && output === undefined) {
      issues.push({
        code: "required",
        message: "output is required when status is succeeded",
        path: "output",
      });
    }

    if (status !== undefined && status !== "succeeded" && output !== undefined) {
      issues.push({
        code: "forbidden",
        message: "output is only allowed when status is succeeded",
        path: "output",
      });
    }

    if (status === "failed" && error === undefined) {
      issues.push({
        code: "required",
        message: "error is required when status is failed",
        path: "error",
      });
    }

    if (status !== undefined && status !== "failed" && error !== undefined) {
      issues.push({
        code: "forbidden",
        message: "error is only allowed when status is failed",
        path: "error",
      });
    }

    if (
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      invocationId === undefined ||
      taskId === undefined ||
      agent === undefined ||
      status === undefined ||
      evidence === undefined ||
      memoryProposals === undefined ||
      completedAt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agent,
      completedAt,
      contractVersion,
      ...(error === undefined ? {} : { error }),
      evidence,
      invocationId,
      memoryProposals,
      ...(output === undefined ? {} : { output }),
      status: status as AgentResultStatus,
      taskId,
      ...(usage === undefined ? {} : { usage }),
      ...(workflowProposal === undefined ? {} : { workflowProposal }),
    });
  }
}

function readEvidence(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly EvidenceReference[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array`,
      path,
    });
    return undefined;
  }

  const evidence: EvidenceReference[] = [];
  for (const [index, candidate] of (value as readonly unknown[]).entries()) {
    const itemPath = `${path}[${String(index)}]`;
    const record = asRecord(candidate);
    if (record === undefined) {
      issues.push({
        code: "invalid_type",
        message: `${itemPath} must be an object`,
        path: itemPath,
      });
      continue;
    }

    const referenceId = readRequiredString(
      record,
      "referenceId",
      issues,
      itemPath,
    );
    const source = readRequiredString(record, "source", issues, itemPath);
    if (
      source !== undefined &&
      !EVIDENCE_SOURCES.has(source as EvidenceSource)
    ) {
      issues.push({
        code: "invalid_value",
        message: `${itemPath}.source is not supported`,
        path: `${itemPath}.source`,
      });
    }

    if (
      referenceId !== undefined &&
      source !== undefined &&
      EVIDENCE_SOURCES.has(source as EvidenceSource)
    ) {
      evidence.push({
        referenceId,
        source: source as EvidenceSource,
      });
    }
  }

  return evidence;
}

function readJsonObjectArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): readonly JsonObject[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an array of JSON objects`,
      path,
    });
    return undefined;
  }

  const objects: JsonObject[] = [];
  for (const [index, candidate] of (value as readonly unknown[]).entries()) {
    if (!isJsonObject(candidate)) {
      issues.push({
        code: "invalid_json_object",
        message: `${path}[${String(index)}] must be a JSON object`,
        path: `${path}[${String(index)}]`,
      });
      continue;
    }
    objects.push(candidate);
  }

  return objects;
}
