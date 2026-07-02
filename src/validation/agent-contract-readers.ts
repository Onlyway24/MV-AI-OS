import type {
  AgentReference,
  ContractReference,
} from "../agents/agent-manifest.js";
import { readRequiredString } from "./field-readers.js";
import { asRecord, isSemanticVersion } from "./primitives.js";
import type { ValidationIssue } from "./validation.js";

export function readAgentReference(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentReference | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    issues.push({
      code: value === undefined ? "required" : "invalid_type",
      message: `${path} must be an object`,
      path,
    });
    return undefined;
  }

  const agentId = readRequiredString(record, "agentId", issues, path);
  const version = readRequiredString(record, "version", issues, path);

  if (version !== undefined && !isSemanticVersion(version)) {
    issues.push({
      code: "invalid_format",
      message: `${path}.version must use semantic versioning`,
      path: `${path}.version`,
    });
  }

  if (agentId === undefined || version === undefined) {
    return undefined;
  }

  return { agentId, version };
}

export function readContractReference(
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
