import type {
  AgentLimits,
  AgentManifest,
  AgentMemoryAccess,
  AgentRiskLevel,
  AgentStatus,
  ContractReference,
  MemoryCategory,
} from "../agents/agent-manifest.js";
import {
  readOptionalNumber,
  readRequiredBoolean,
  readRequiredInteger,
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord, isSemanticVersion } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

const AGENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const AGENT_STATUSES = new Set<AgentStatus>([
  "active",
  "disabled",
  "experimental",
]);
const RISK_LEVELS = new Set<AgentRiskLevel>(["high", "low", "medium"]);
const MEMORY_CATEGORIES = new Set<MemoryCategory>([
  "conversation",
  "operational",
  "semantic",
  "user",
  "working",
]);

export class AgentManifestValidator implements Validator<AgentManifest> {
  public validate(value: unknown): ValidationResult<AgentManifest> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent manifest must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const agentId = readRequiredString(record, "agentId", issues);
    const name = readRequiredString(record, "name", issues);
    const version = readRequiredString(record, "version", issues);
    const description = readRequiredString(record, "description", issues);
    const status = readRequiredString(record, "status", issues);
    const taskTypes = readRequiredStringArray(
      record,
      "taskTypes",
      issues,
      "",
      false,
    );
    const inputContract = readContractReference(
      record.inputContract,
      "inputContract",
      issues,
    );
    const outputContract = readContractReference(
      record.outputContract,
      "outputContract",
      issues,
    );
    const modelProfile = readRequiredString(record, "modelProfile", issues);
    const memoryAccess = readMemoryAccess(
      record.memoryAccess,
      "memoryAccess",
      issues,
    );
    const knowledgeAccess = readRequiredStringArray(
      record,
      "knowledgeAccess",
      issues,
    );
    const tools = readRequiredStringArray(record, "tools", issues);
    const workflowProposals = readRequiredStringArray(
      record,
      "workflowProposals",
      issues,
    );
    const limits = readLimits(record.limits, "limits", issues);
    const instructionsRef = readRequiredString(
      record,
      "instructionsRef",
      issues,
    );
    const handoffTargets = readRequiredStringArray(
      record,
      "handoffTargets",
      issues,
    );
    const riskLevel = readRequiredString(record, "riskLevel", issues);

    if (agentId !== undefined && !AGENT_ID_PATTERN.test(agentId)) {
      issues.push({
        code: "invalid_format",
        message: "agentId must be a lowercase dot, dash, or underscore identifier",
        path: "agentId",
      });
    }

    if (version !== undefined && !isSemanticVersion(version)) {
      issues.push({
        code: "invalid_format",
        message: "version must use semantic versioning",
        path: "version",
      });
    }

    if (
      status !== undefined &&
      !AGENT_STATUSES.has(status as AgentStatus)
    ) {
      issues.push({
        code: "invalid_value",
        message: "status is not supported",
        path: "status",
      });
    }

    if (
      riskLevel !== undefined &&
      !RISK_LEVELS.has(riskLevel as AgentRiskLevel)
    ) {
      issues.push({
        code: "invalid_value",
        message: "riskLevel is not supported",
        path: "riskLevel",
      });
    }

    if (
      issues.length > 0 ||
      agentId === undefined ||
      name === undefined ||
      version === undefined ||
      description === undefined ||
      status === undefined ||
      taskTypes === undefined ||
      inputContract === undefined ||
      outputContract === undefined ||
      modelProfile === undefined ||
      memoryAccess === undefined ||
      knowledgeAccess === undefined ||
      tools === undefined ||
      workflowProposals === undefined ||
      limits === undefined ||
      instructionsRef === undefined ||
      handoffTargets === undefined ||
      riskLevel === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agentId,
      description,
      handoffTargets,
      inputContract,
      instructionsRef,
      knowledgeAccess,
      limits,
      memoryAccess,
      modelProfile,
      name,
      outputContract,
      riskLevel: riskLevel as AgentRiskLevel,
      status: status as AgentStatus,
      taskTypes,
      tools,
      version,
      workflowProposals,
    });
  }
}

function readContractReference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): ContractReference | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const contractId = readRequiredString(record, "contractId", issues, path);
  const contractVersion = readRequiredString(
    record,
    "contractVersion",
    issues,
    path,
  );

  if (contractId === undefined || contractVersion === undefined) {
    return undefined;
  }

  return { contractId, contractVersion };
}

function readMemoryAccess(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentMemoryAccess | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const read = readRequiredStringArray(record, "read", issues, path);
  const proposeWrites = readRequiredBoolean(
    record,
    "proposeWrites",
    issues,
    path,
  );

  if (read !== undefined) {
    for (const [index, category] of read.entries()) {
      if (!MEMORY_CATEGORIES.has(category as MemoryCategory)) {
        issues.push({
          code: "invalid_value",
          message: `${path}.read contains an unsupported memory category`,
          path: `${path}.read[${String(index)}]`,
        });
      }
    }
  }

  if (read === undefined || proposeWrites === undefined) {
    return undefined;
  }

  return {
    proposeWrites,
    read: read as readonly MemoryCategory[],
  };
}

function readLimits(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentLimits | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const timeoutMs = readRequiredInteger(record, "timeoutMs", issues, path, 1);
  const maxToolCalls = readRequiredInteger(
    record,
    "maxToolCalls",
    issues,
    path,
  );
  const maxResultBytes = readRequiredInteger(
    record,
    "maxResultBytes",
    issues,
    path,
    1,
  );
  const maxTokens = readOptionalNumber(
    record,
    "maxTokens",
    issues,
    path,
    1,
  );
  const maxCostUsd = readOptionalNumber(
    record,
    "maxCostUsd",
    issues,
    path,
  );

  if (
    timeoutMs === undefined ||
    maxToolCalls === undefined ||
    maxResultBytes === undefined
  ) {
    return undefined;
  }

  return {
    ...(maxCostUsd === undefined ? {} : { maxCostUsd }),
    maxResultBytes,
    ...(maxTokens === undefined ? {} : { maxTokens }),
    maxToolCalls,
    timeoutMs,
  };
}
