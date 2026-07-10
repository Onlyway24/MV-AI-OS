import { asRecord } from "../validation/primitives.js";
import { type ValidationIssue, type ValidationResult, type Validator, validationFailure, validationSuccess } from "../validation/validation.js";
import type { AgentCompanyReadinessReviewInput } from "../assistants/agent-company-readiness-review.js";
import { DEFAULT_AGENT_COMPANY_READINESS_INPUT } from "../assistants/agent-company-readiness-review.js";
import { MISSION_PLANNING_RESULT_CONTRACT_VERSION, type MissionPlanningResult } from "./mission-planner.js";
import { MissionPlanValidator } from "./mission-plan-validator.js";

const KEYS = new Set(["assumptions", "briefId", "clarificationQuestions", "contractVersion", "nonExecuting", "plan", "rejectionCodes", "status"]);
const STATUSES = new Set(["CLARIFICATION_REQUIRED", "PLAN_READY", "REJECTED"]);
const ID = /^[a-z0-9][a-z0-9@._-]*$/u;

export class MissionPlanningResultValidator implements Validator<MissionPlanningResult> {
  readonly #planValidator: MissionPlanValidator;

  public constructor(company: AgentCompanyReadinessReviewInput = DEFAULT_AGENT_COMPANY_READINESS_INPUT) {
    this.#planValidator = new MissionPlanValidator(company);
  }

  public validate(value: unknown): ValidationResult<MissionPlanningResult> {
    const record = asRecord(value);
    if (record === undefined) return validationFailure([{ code: "invalid_type", message: "mission planning result must be an object", path: "$" }]);
    const issues: ValidationIssue[] = [];
    for (const key of Object.keys(record)) if (!KEYS.has(key)) issues.push({ code: "unknown_field", message: "unknown fields are not allowed", path: key });
    if (record.contractVersion !== MISSION_PLANNING_RESULT_CONTRACT_VERSION) issues.push({ code: "unsupported_version", message: "contractVersion must be 1", path: "contractVersion" });
    if (typeof record.briefId !== "string" || !ID.test(record.briefId)) issues.push({ code: "invalid_format", message: "briefId must be normalized", path: "briefId" });
    if (record.nonExecuting !== true) issues.push({ code: "unsafe_execution", message: "planning result must be non-executing", path: "nonExecuting" });
    if (typeof record.status !== "string" || !STATUSES.has(record.status)) issues.push({ code: "invalid_value", message: "status is unsupported", path: "status" });
    if (!Array.isArray(record.assumptions)) issues.push({ code: "invalid_type", message: "assumptions must be an array", path: "assumptions" });
    if (!Array.isArray(record.clarificationQuestions)) issues.push({ code: "invalid_type", message: "clarificationQuestions must be an array", path: "clarificationQuestions" });
    if (!Array.isArray(record.rejectionCodes) || record.rejectionCodes.some((entry) => typeof entry !== "string" || !ID.test(entry))) issues.push({ code: "invalid_type", message: "rejectionCodes must contain normalized IDs", path: "rejectionCodes" });
    if (record.status === "PLAN_READY") {
      const validation = this.#planValidator.validate(record.plan);
      if (!validation.ok) issues.push({ code: "invalid_plan", message: "PLAN_READY result must contain a valid Mission Plan", path: "plan" });
      if (Array.isArray(record.clarificationQuestions) && record.clarificationQuestions.length > 0) issues.push({ code: "inconsistent_result", message: "PLAN_READY cannot contain clarification questions", path: "clarificationQuestions" });
      if (Array.isArray(record.rejectionCodes) && record.rejectionCodes.length > 0) issues.push({ code: "inconsistent_result", message: "PLAN_READY cannot contain rejection codes", path: "rejectionCodes" });
    } else if (record.plan !== undefined) issues.push({ code: "inconsistent_result", message: "non-ready result must not contain a Mission Plan", path: "plan" });
    if (record.status === "CLARIFICATION_REQUIRED" && Array.isArray(record.clarificationQuestions) && record.clarificationQuestions.length === 0) issues.push({ code: "inconsistent_result", message: "clarification result requires questions", path: "clarificationQuestions" });
    if (record.status === "REJECTED" && Array.isArray(record.rejectionCodes) && record.rejectionCodes.length === 0) issues.push({ code: "inconsistent_result", message: "rejected result requires rejection codes", path: "rejectionCodes" });
    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(value as MissionPlanningResult);
  }
}
