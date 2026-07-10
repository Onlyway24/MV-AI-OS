import { asRecord } from "../validation/primitives.js";
import { type ValidationIssue, type ValidationResult, type Validator, validationFailure, validationSuccess } from "../validation/validation.js";
import { AgentCompanyReadinessReportValidator } from "../assistants/agent-company-readiness-review-validator.js";
import { MissionPlanningResultValidator } from "./mission-planner-validator.js";
import { MissionQualityGateReportValidator } from "./mission-quality-gate-validator.js";
import { LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION, type LocalMissionPlanningDryRunInput, type LocalMissionPlanningDryRunResult } from "./local-mission-planning-dry-run.js";

const INPUT_KEYS = new Set(["brief", "contractVersion"]);
const RESULT_KEYS = new Set(["contractVersion", "nonExecuting", "planning", "quality", "readiness", "status"]);
const STATUSES = new Set(["AGENT_COMPANY_NOT_READY", "APPROVAL_READY", "BLOCKED", "CLARIFICATION_REQUIRED", "REJECTED", "REMEDIATION_REQUIRED"]);

export class LocalMissionPlanningDryRunInputValidator implements Validator<LocalMissionPlanningDryRunInput> {
  public validate(value: unknown): ValidationResult<LocalMissionPlanningDryRunInput> {
    const record = asRecord(value);
    if (record === undefined) return validationFailure([issue("invalid_type", "local mission dry-run input must be an object", "$")]);
    const issues: ValidationIssue[] = [];
    rejectUnknown(record, INPUT_KEYS, issues, "");
    if (record.contractVersion !== LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION) issues.push(issue("unsupported_version", "contractVersion must be 1", "contractVersion"));
    if (asRecord(record.brief) === undefined) issues.push(issue("invalid_type", "brief must be an object", "brief"));
    return issues.length === 0
      ? validationSuccess({ brief: record.brief as LocalMissionPlanningDryRunInput["brief"], contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION })
      : validationFailure(issues);
  }
}

export class LocalMissionPlanningDryRunResultValidator implements Validator<LocalMissionPlanningDryRunResult> {
  readonly #readiness = new AgentCompanyReadinessReportValidator();
  readonly #planning = new MissionPlanningResultValidator();
  readonly #quality = new MissionQualityGateReportValidator();

  public validate(value: unknown): ValidationResult<LocalMissionPlanningDryRunResult> {
    const record = asRecord(value);
    if (record === undefined) return validationFailure([issue("invalid_type", "local mission dry-run result must be an object", "$")]);
    const issues: ValidationIssue[] = [];
    rejectUnknown(record, RESULT_KEYS, issues, "");
    if (record.contractVersion !== LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION) issues.push(issue("unsupported_version", "contractVersion must be 1", "contractVersion"));
    if (record.nonExecuting !== true) issues.push(issue("unsafe_execution", "dry-run results must be non-executing", "nonExecuting"));
    const readiness = this.#readiness.validate(record.readiness);
    if (!readiness.ok) issues.push(issue("invalid_readiness", "readiness report is invalid", "readiness"));
    const status = typeof record.status === "string" && STATUSES.has(record.status) ? record.status : undefined;
    if (status === undefined) issues.push(issue("invalid_value", "status is unsupported", "status"));
    const planning = record.planning === undefined ? undefined : this.#planning.validate(record.planning);
    const quality = record.quality === undefined ? undefined : this.#quality.validate(record.quality);
    if (planning !== undefined && !planning.ok) issues.push(issue("invalid_planning", "planning result is invalid", "planning"));
    if (quality !== undefined && !quality.ok) issues.push(issue("invalid_quality", "quality report is invalid", "quality"));
    validateState(status, readiness.ok ? readiness.value.summary.status : undefined, planning, quality, issues);
    return issues.length === 0 && readiness.ok && (planning === undefined || planning.ok) && (quality === undefined || quality.ok)
      ? validationSuccess({
          contractVersion: LOCAL_MISSION_PLANNING_DRY_RUN_CONTRACT_VERSION,
          nonExecuting: true,
          ...(planning === undefined ? {} : { planning: planning.value }),
          ...(quality === undefined ? {} : { quality: quality.value }),
          readiness: readiness.value,
          status: status as LocalMissionPlanningDryRunResult["status"],
        })
      : validationFailure(issues);
  }
}

function validateState(status: string | undefined, readiness: string | undefined, planning: ValidationResult<LocalMissionPlanningDryRunResult["planning"]> | undefined, quality: ValidationResult<NonNullable<LocalMissionPlanningDryRunResult["quality"]>> | undefined, issues: ValidationIssue[]): void {
  if (readiness !== "READY" && status !== "AGENT_COMPANY_NOT_READY") issues.push(issue("inconsistent_result", "non-ready Agent Company must block planning", "status"));
  if (status === "AGENT_COMPANY_NOT_READY" && planning !== undefined) issues.push(issue("inconsistent_result", "non-ready Agent Company cannot include planning", "planning"));
  if (status === "CLARIFICATION_REQUIRED" && (planning?.ok !== true || planning.value?.status !== "CLARIFICATION_REQUIRED" || quality !== undefined)) issues.push(issue("inconsistent_result", "clarification requires a planning result without quality", "status"));
  if (status === "REJECTED" && (planning?.ok !== true || planning.value?.status !== "REJECTED" || quality !== undefined)) issues.push(issue("inconsistent_result", "rejection requires a rejected planning result without quality", "status"));
  if (["APPROVAL_READY", "BLOCKED", "REMEDIATION_REQUIRED"].includes(status ?? "") && (planning?.ok !== true || planning.value?.status !== "PLAN_READY" || quality?.ok !== true)) issues.push(issue("inconsistent_result", "quality status requires a plan-ready planning result and quality report", "status"));
  if (quality?.ok && status !== quality.value.status) issues.push(issue("inconsistent_result", "dry-run status must match quality status", "status"));
}

function rejectUnknown(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void { for (const key of Object.keys(record)) if (!allowed.has(key)) issues.push(issue("unknown_field", "unknown fields are not allowed", prefix.length === 0 ? key : `${prefix}.${key}`)); }
function issue(code: string, message: string, path: string): ValidationIssue { return { code, message, path }; }
