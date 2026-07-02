import type {
  AgentInvocation,
  AgentInvocationLimits,
} from "../contracts/agent-execution.js";
import { REQUEST_CONTRACT_VERSION } from "../contracts/request-envelope.js";
import {
  readAgentReference,
  readContractReference,
} from "./agent-contract-readers.js";
import {
  readOptionalNumber,
  readRequiredInteger,
  readRequiredJsonObject,
  readRequiredString,
  readRequiredStringArray,
} from "./field-readers.js";
import { asRecord } from "./primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "./validation.js";

export class AgentInvocationValidator implements Validator<AgentInvocation> {
  public validate(value: unknown): ValidationResult<AgentInvocation> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent invocation must be an object",
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
    const correlationId = readRequiredString(
      record,
      "correlationId",
      issues,
    );
    const agent = readAgentReference(record.agent, "agent", issues);
    const objective = readRequiredString(record, "objective", issues);
    const input = readRequiredJsonObject(record, "input", issues);
    const context = readRequiredJsonObject(record, "context", issues);
    const permissions = readRequiredStringArray(
      record,
      "permissions",
      issues,
    );
    const outputContract = readContractReference(
      record.outputContract,
      "outputContract",
      issues,
    );
    const limits = readInvocationLimits(record.limits, "limits", issues);
    const attempt = readRequiredInteger(record, "attempt", issues, "", 1);

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
      issues.length > 0 ||
      contractVersion !== REQUEST_CONTRACT_VERSION ||
      invocationId === undefined ||
      taskId === undefined ||
      correlationId === undefined ||
      agent === undefined ||
      objective === undefined ||
      input === undefined ||
      context === undefined ||
      permissions === undefined ||
      outputContract === undefined ||
      limits === undefined ||
      attempt === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agent,
      attempt,
      context,
      contractVersion,
      correlationId,
      input,
      invocationId,
      limits,
      objective,
      outputContract,
      permissions,
      taskId,
    });
  }
}

function readInvocationLimits(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): AgentInvocationLimits | undefined {
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
  const modelProfile = readRequiredString(
    record,
    "modelProfile",
    issues,
    path,
  );
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
    modelProfile === undefined ||
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
    modelProfile,
    timeoutMs,
  };
}
