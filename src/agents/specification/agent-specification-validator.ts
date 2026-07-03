import {
  type AgentRiskLevel,
  type AgentStatus,
} from "../agent-manifest.js";
import type { AgentCapability } from "./agent-capability.js";
import { AgentCapabilityValidator } from "./agent-capability-validator.js";
import { AgentInputSchemaValidator } from "./agent-input-schema-validator.js";
import type { AgentLimit } from "./agent-limit.js";
import { AgentLimitValidator } from "./agent-limit-validator.js";
import { AgentOutputSchemaValidator } from "./agent-output-schema-validator.js";
import type { AgentPolicyRequirement } from "./agent-policy-requirement.js";
import { AgentPolicyRequirementValidator } from "./agent-policy-requirement-validator.js";
import {
  AGENT_SPECIFICATION_SCHEMA_VERSION,
  type AgentSpecification,
} from "./agent-specification.js";
import {
  isAgentSpecificationIdentifier,
  prefixAgentSpecificationIssues,
} from "./agent-specification-validation.js";
import {
  readRequiredString,
  readRequiredStringArray,
} from "../../validation/field-readers.js";
import {
  asRecord,
  isSemanticVersion,
} from "../../validation/primitives.js";
import {
  type ValidationIssue,
  type ValidationResult,
  type Validator,
  validationFailure,
  validationSuccess,
} from "../../validation/validation.js";

const AGENT_STATUSES = new Set<AgentStatus>([
  "active",
  "disabled",
  "experimental",
]);
const RISK_LEVELS = new Set<AgentRiskLevel>(["high", "low", "medium"]);

export class AgentSpecificationValidator
  implements Validator<AgentSpecification>
{
  readonly #capabilityValidator = new AgentCapabilityValidator();
  readonly #inputSchemaValidator = new AgentInputSchemaValidator();
  readonly #limitValidator = new AgentLimitValidator();
  readonly #outputSchemaValidator = new AgentOutputSchemaValidator();
  readonly #policyRequirementValidator =
    new AgentPolicyRequirementValidator();

  public validate(value: unknown): ValidationResult<AgentSpecification> {
    const record = asRecord(value);
    if (record === undefined) {
      return validationFailure([
        {
          code: "invalid_type",
          message: "agent specification must be an object",
          path: "$",
        },
      ]);
    }

    const issues: ValidationIssue[] = [];
    const schemaVersion = readRequiredString(
      record,
      "schemaVersion",
      issues,
    );
    const agentId = readRequiredString(record, "agentId", issues);
    const version = readRequiredString(record, "version", issues);
    const implementationRef = readRequiredString(
      record,
      "implementationRef",
      issues,
    );
    const name = readRequiredString(record, "name", issues);
    const mission = readRequiredString(record, "mission", issues);
    const status = readRequiredString(record, "status", issues);
    const riskLevel = readRequiredString(record, "riskLevel", issues);
    const taskTypes = readRequiredStringArray(
      record,
      "taskTypes",
      issues,
      "",
      false,
    );
    const instructionsRef = readRequiredString(
      record,
      "instructionsRef",
      issues,
    );
    const inputSchemaValidation = this.#inputSchemaValidator.validate(
      record.inputSchema,
    );
    if (!inputSchemaValidation.ok) {
      issues.push(
        ...prefixAgentSpecificationIssues(
          inputSchemaValidation.issues,
          "inputSchema",
        ),
      );
    }
    const outputSchemaValidation = this.#outputSchemaValidator.validate(
      record.outputSchema,
    );
    if (!outputSchemaValidation.ok) {
      issues.push(
        ...prefixAgentSpecificationIssues(
          outputSchemaValidation.issues,
          "outputSchema",
        ),
      );
    }
    const capabilities = this.#readCapabilities(
      record.capabilities,
      issues,
    );
    const limitValidation = this.#limitValidator.validate(record.limits);
    if (!limitValidation.ok) {
      issues.push(
        ...prefixAgentSpecificationIssues(
          limitValidation.issues,
          "limits",
        ),
      );
    }
    const policyRequirements = this.#readPolicyRequirements(
      record.policyRequirements,
      issues,
    );
    const handoffTargets = readRequiredStringArray(
      record,
      "handoffTargets",
      issues,
    );

    validateIdentityAndVersions(
      schemaVersion,
      agentId,
      version,
      taskTypes,
      handoffTargets,
      issues,
    );
    validateEnum(status, AGENT_STATUSES, "status", issues);
    validateEnum(riskLevel, RISK_LEVELS, "riskLevel", issues);
    if (
      capabilities !== undefined &&
      policyRequirements !== undefined &&
      limitValidation.ok
    ) {
      validateCapabilityPolicy(
        capabilities,
        policyRequirements,
        limitValidation.value,
        issues,
      );
    }

    if (
      issues.length > 0 ||
      schemaVersion !== AGENT_SPECIFICATION_SCHEMA_VERSION ||
      agentId === undefined ||
      version === undefined ||
      implementationRef === undefined ||
      name === undefined ||
      mission === undefined ||
      status === undefined ||
      !AGENT_STATUSES.has(status as AgentStatus) ||
      riskLevel === undefined ||
      !RISK_LEVELS.has(riskLevel as AgentRiskLevel) ||
      taskTypes === undefined ||
      instructionsRef === undefined ||
      !inputSchemaValidation.ok ||
      !outputSchemaValidation.ok ||
      capabilities === undefined ||
      !limitValidation.ok ||
      policyRequirements === undefined ||
      handoffTargets === undefined
    ) {
      return validationFailure(issues);
    }

    return validationSuccess({
      agentId,
      capabilities,
      handoffTargets,
      implementationRef,
      inputSchema: inputSchemaValidation.value,
      instructionsRef,
      limits: limitValidation.value,
      mission,
      name,
      outputSchema: outputSchemaValidation.value,
      policyRequirements,
      riskLevel: riskLevel as AgentRiskLevel,
      schemaVersion,
      status: status as AgentStatus,
      taskTypes,
      version,
    });
  }

  #readCapabilities(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly AgentCapability[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "capabilities must be an array",
        path: "capabilities",
      });
      return undefined;
    }

    const capabilities: AgentCapability[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation = this.#capabilityValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixAgentSpecificationIssues(
            validation.issues,
            `capabilities[${String(index)}]`,
          ),
        );
        continue;
      }
      capabilities.push(validation.value);
    }
    validateUnique(
      capabilities.map(({ capabilityId }) => capabilityId),
      "capabilityId",
      "capabilities",
      issues,
    );
    validateUnique(
      capabilities.map(({ permission }) => permission),
      "permission",
      "capabilities",
      issues,
    );
    return capabilities;
  }

  #readPolicyRequirements(
    value: unknown,
    issues: ValidationIssue[],
  ): readonly AgentPolicyRequirement[] | undefined {
    if (!Array.isArray(value)) {
      issues.push({
        code: value === undefined ? "required" : "invalid_type",
        message: "policyRequirements must be an array",
        path: "policyRequirements",
      });
      return undefined;
    }

    const requirements: AgentPolicyRequirement[] = [];
    for (const [index, candidate] of value.entries()) {
      const validation =
        this.#policyRequirementValidator.validate(candidate);
      if (!validation.ok) {
        issues.push(
          ...prefixAgentSpecificationIssues(
            validation.issues,
            `policyRequirements[${String(index)}]`,
          ),
        );
        continue;
      }
      requirements.push(validation.value);
    }
    validateUnique(
      requirements.map(({ requirementId }) => requirementId),
      "requirementId",
      "policyRequirements",
      issues,
    );
    const coverage = requirements.flatMap((requirement) =>
      requirement.permissions.map(
        (permission) =>
          `${requirement.requirementType}:${permission}`,
      ),
    );
    validateUnique(
      coverage,
      "requirement type and permission",
      "policyRequirements",
      issues,
    );
    return requirements;
  }
}

function validateIdentityAndVersions(
  schemaVersion: string | undefined,
  agentId: string | undefined,
  version: string | undefined,
  taskTypes: readonly string[] | undefined,
  handoffTargets: readonly string[] | undefined,
  issues: ValidationIssue[],
): void {
  if (
    schemaVersion !== undefined &&
    schemaVersion !== AGENT_SPECIFICATION_SCHEMA_VERSION
  ) {
    issues.push({
      code: "unsupported_version",
      message: `schemaVersion must be ${AGENT_SPECIFICATION_SCHEMA_VERSION}`,
      path: "schemaVersion",
    });
  }
  if (
    agentId !== undefined &&
    !isAgentSpecificationIdentifier(agentId)
  ) {
    issues.push({
      code: "invalid_format",
      message: "agentId must be a lowercase identifier",
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
  for (const [index, taskType] of taskTypes?.entries() ?? []) {
    if (!isAgentSpecificationIdentifier(taskType)) {
      issues.push({
        code: "invalid_format",
        message: "taskTypes must contain normalized identifiers",
        path: `taskTypes[${String(index)}]`,
      });
    }
  }
  for (const [index, target] of handoffTargets?.entries() ?? []) {
    if (!isAgentSpecificationIdentifier(target)) {
      issues.push({
        code: "invalid_format",
        message: "handoffTargets must contain normalized agent IDs",
        path: `handoffTargets[${String(index)}]`,
      });
    }
    if (agentId !== undefined && target === agentId) {
      issues.push({
        code: "invalid_value",
        message: "an agent cannot hand off to itself",
        path: `handoffTargets[${String(index)}]`,
      });
    }
  }
}

function validateCapabilityPolicy(
  capabilities: readonly AgentCapability[],
  requirements: readonly AgentPolicyRequirement[],
  limits: AgentLimit,
  issues: ValidationIssue[],
): void {
  const declaredPermissions = new Set(
    capabilities.map(({ permission }) => permission),
  );
  for (const [requirementIndex, requirement] of requirements.entries()) {
    for (const [permissionIndex, permission] of
      requirement.permissions.entries()) {
      if (!declaredPermissions.has(permission)) {
        issues.push({
          code: "permission_not_declared",
          message:
            "policy requirement references an undeclared capability permission",
          path: `policyRequirements[${String(requirementIndex)}].permissions[${String(permissionIndex)}]`,
        });
      }
    }
  }

  const requirementCoverage = new Set(
    requirements.flatMap((requirement) =>
      requirement.permissions.map(
        (permission) =>
          `${requirement.requirementType}:${permission}`,
      ),
    ),
  );
  for (const [index, capability] of capabilities.entries()) {
    if (
      (capability.capabilityType === "tool.execute" ||
        capability.capabilityType === "tool.read") &&
      !requirementCoverage.has(`audit:${capability.permission}`)
    ) {
      issues.push({
        code: "policy_requirement_missing",
        message: "tool capabilities require an audit policy requirement",
        path: `capabilities[${String(index)}].permission`,
      });
    }
    if (
      capability.capabilityType === "tool.execute" &&
      !requirementCoverage.has(`approval:${capability.permission}`)
    ) {
      issues.push({
        code: "policy_requirement_missing",
        message:
          "tool.execute capabilities require an approval policy requirement",
        path: `capabilities[${String(index)}].permission`,
      });
    }
  }

  const hasModelCapability = capabilities.some(
    ({ capabilityType }) => capabilityType === "model.invoke",
  );
  const hasToolCapability = capabilities.some(
    ({ capabilityType }) =>
      capabilityType === "tool.execute" || capabilityType === "tool.read",
  );
  if (hasModelCapability !== (limits.maxModelCalls > 0)) {
    issues.push({
      code: "limit_mismatch",
      message:
        "maxModelCalls must be positive exactly when model.invoke is declared",
      path: "limits.maxModelCalls",
    });
  }
  if (hasToolCapability !== (limits.maxToolCalls > 0)) {
    issues.push({
      code: "limit_mismatch",
      message:
        "maxToolCalls must be positive exactly when a tool capability is declared",
      path: "limits.maxToolCalls",
    });
  }
  if (
    !hasModelCapability &&
    (limits.maxTokens !== undefined || limits.maxCostUsd !== undefined)
  ) {
    issues.push({
      code: "limit_mismatch",
      message:
        "model token and cost limits require a model.invoke capability",
      path: "limits",
    });
  }
}

function validateUnique(
  values: readonly string[],
  label: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (new Set(values).size !== values.length) {
    issues.push({
      code: "duplicate",
      message: `${path} must not contain duplicate ${label} values`,
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
