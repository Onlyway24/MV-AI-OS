import { asRecord, isSemanticVersion } from "../validation/primitives.js";
import { type ValidationIssue, type ValidationResult, type Validator, validationFailure, validationSuccess } from "../validation/validation.js";
import { DEFAULT_AGENT_COMPANY_READINESS_INPUT, type AgentCompanyReadinessReviewInput } from "../assistants/agent-company-readiness-review.js";
import { DeterministicAgentCompanyReadinessEvaluator } from "../assistants/agent-company-readiness-review-service.js";
import type { AgentCompanyCapability } from "../assistants/agent-capability-registry.js";
import type { AgentCompanyPermissionRule } from "../assistants/agent-permission-matrix.js";
import type { AgentHandoffRequest } from "../assistants/agent-handoff-contracts.js";
import { MISSION_PLAN_CONTRACT_VERSION, type MissionCostClass, type MissionEffortClass, type MissionPlan, type MissionPlanAgentReference, type MissionPlanStep } from "./mission-plan.js";

const TOP_KEYS = new Set(["briefId", "companyReadinessReportId", "contractVersion", "control", "nonExecuting", "planId", "steps", "strategyOptions", "summary"]);
const SUMMARY_KEYS = new Set(["assumptions", "businessOrOperatorValue", "confidence", "expectedFinalResult", "normalizedObjective", "recommendedDirection", "unresolvedQuestions"]);
const STRATEGY_KEYS = new Set(["compromises", "description", "optionId", "strategyKind", "valueRationale"]);
const STEP_KEYS = new Set(["approvalRequirements", "capabilityIds", "costClass", "dependencies", "effortClass", "expectedOutput", "failureConditions", "guardianRequirements", "handoffIds", "nonExecuting", "order", "permissionRuleIds", "primaryAgent", "purpose", "requiredInputs", "responsibilityAreaId", "riskLevel", "stepId", "stopConditions", "successCriteria", "supportingAgents", "title"]);
const AGENT_KEYS = new Set(["agentId", "specificationId", "version"]);
const OUTPUT_KEYS = new Set(["artifactType", "description", "requiredSections"]);
const CONTROL_KEYS = new Set(["approvalQueue", "criticalRisks", "evidenceRequirements", "externalActionBoundary", "firstConcreteAction", "guardianReviewQueue", "minimumAcceptableQuality", "rejectionReasons", "successMetrics", "totalCostClass", "totalEffortClass"]);
const APPROVAL_QUEUE_KEYS = new Set(["approvalId", "requiredFor", "stepIds"]);
const GUARDIAN_QUEUE_KEYS = new Set(["domains", "reviewId", "stepIds"]);
const EXTERNAL_KEYS = new Set(["externalExecutionAllowed", "nonExecuting", "requestedActionTypes"]);
const STRATEGY_KINDS = new Set(["BOLD", "RAPID", "RECOMMENDED"]);
const RISK_LEVELS = new Set(["high", "low", "medium"]);
const EFFORT_CLASSES = new Set<MissionEffortClass>(["high", "low", "medium"]);
const COST_CLASSES = new Set<MissionCostClass>(["high", "low", "medium", "minimal", "unknown"]);
const CONFIDENCE = new Set(["high", "low", "medium"]);
const GUARDIANS = new Set(["backup", "cost", "incident", "operator_safety", "quality", "security"]);
const APPROVALS = new Set(["cloud_or_vps_readiness", "external_side_effect", "increase_autonomy", "memory_write", "model_expansion", "publish_or_send", "tool_execution", "workflow_execution"]);
const ID = /^[a-z0-9][a-z0-9@._-]*$/u;
const SENSITIVE = [/\bsk-[A-Za-z0-9_-]{8,}/u, /\b(?:api|access)[_-]?key\b/iu, /\b(?:raw\s+)?(?:completion|prompt|provider payload|transcript)\b/iu, /\bsecret\s*(?:ref(?:erence)?|value)?\b/iu, /(?:\/Users\/|\/home\/)[^\s]+/u];

export class MissionPlanValidator implements Validator<MissionPlan> {
  readonly #company: AgentCompanyReadinessReviewInput;

  public constructor(company: AgentCompanyReadinessReviewInput = DEFAULT_AGENT_COMPANY_READINESS_INPUT) {
    this.#company = company;
  }

  public validate(value: unknown): ValidationResult<MissionPlan> {
    const record = asRecord(value);
    if (record === undefined) return validationFailure([{ code: "invalid_type", message: "mission plan must be an object", path: "$" }]);
    const issues: ValidationIssue[] = [];
    rejectUnknown(record, TOP_KEYS, issues, "");
    exact(record, "contractVersion", MISSION_PLAN_CONTRACT_VERSION, issues);
    identifier(record, "planId", issues);
    identifier(record, "briefId", issues);
    identifier(record, "companyReadinessReportId", issues);
    if (record.nonExecuting !== true) add(issues, "unsafe_execution", "mission plan must be non-executing", "nonExecuting");
    const readiness = new DeterministicAgentCompanyReadinessEvaluator().evaluate(this.#company);
    if (readiness.summary.status !== "READY") add(issues, "company_not_ready", "Agent Company must be READY before Mission Plan validation", "companyReadinessReportId");
    if (record.companyReadinessReportId !== readiness.reportId) add(issues, "ownership_mismatch", "company readiness report ID does not match supplied declarations", "companyReadinessReportId");
    validateSummary(record.summary, issues);
    validateStrategies(record.strategyOptions, issues);
    const steps = validateSteps(record.steps, issues, this.#company);
    validateDependencies(steps, issues);
    validateControl(record.control, steps, issues);
    rejectSensitive(record, issues);
    if (issues.length > 0) return validationFailure(issues);
    return validationSuccess(cloneAndFreeze(value) as MissionPlan);
  }
}

function validateSummary(value: unknown, issues: ValidationIssue[]): void {
  const record = object(value, "summary", SUMMARY_KEYS, issues);
  if (record === undefined) return;
  for (const key of ["businessOrOperatorValue", "expectedFinalResult", "normalizedObjective", "recommendedDirection"]) text(record, key, issues, "summary");
  enumValue(record, "confidence", CONFIDENCE, issues, "summary");
  strings(record, "assumptions", issues, "summary");
  strings(record, "unresolvedQuestions", issues, "summary");
}

function validateStrategies(value: unknown, issues: ValidationIssue[]): void {
  const items = records(value, "strategyOptions", STRATEGY_KEYS, issues, false);
  const ids: string[] = [];
  let recommended = 0;
  for (const [index, item] of items.entries()) {
    const path = `strategyOptions[${String(index)}]`;
    const idValue = identifier(item, "optionId", issues, path); if (idValue !== undefined) ids.push(idValue);
    const kind = enumValue(item, "strategyKind", STRATEGY_KINDS, issues, path); if (kind === "RECOMMENDED") recommended += 1;
    text(item, "description", issues, path); text(item, "valueRationale", issues, path); strings(item, "compromises", issues, path);
  }
  uniqueSorted(ids, "strategyOptions", issues);
  if (recommended !== 1) add(issues, "invalid_value", "exactly one RECOMMENDED strategy is required", "strategyOptions");
}

function validateSteps(value: unknown, issues: ValidationIssue[], company: AgentCompanyReadinessReviewInput): readonly MissionPlanStep[] {
  const items = records(value, "steps", STEP_KEYS, issues, false);
  const roles = new Map(company.agentCompanyMap.roles.map((role) => [role.roleId, role]));
  const specs = new Map(company.agentSpecifications.map((spec) => [spec.agentId, spec]));
  const areas = new Map(company.responsibilityMatrix.areas.map((area) => [area.areaId, area]));
  const capabilities = new Map(company.capabilityRegistry.capabilities.map((capability) => [capability.capabilityId, capability]));
  const permissions = new Map(company.permissionMatrix.permissionRules.map((rule) => [rule.permissionId, rule]));
  const handoffs = new Map(company.handoffContracts.handoffs.map((handoff) => [handoff.handoffId, handoff]));
  const valid: MissionPlanStep[] = [];
  const ids: string[] = [];
  for (const [index, item] of items.entries()) {
    const path = `steps[${String(index)}]`;
    const stepId = identifier(item, "stepId", issues, path); if (stepId !== undefined) ids.push(stepId);
    integer(item, "order", index + 1, issues, path);
    for (const key of ["title", "purpose"]) text(item, key, issues, path);
    enumValue(item, "riskLevel", RISK_LEVELS, issues, path); enumValue(item, "effortClass", EFFORT_CLASSES, issues, path); enumValue(item, "costClass", COST_CLASSES, issues, path);
    if (item.nonExecuting !== true) add(issues, "unsafe_execution", "mission step must be non-executing", `${path}.nonExecuting`);
    for (const key of ["requiredInputs", "successCriteria", "failureConditions", "stopConditions"]) strings(item, key, issues, path, false);
    const dependencies = strings(item, "dependencies", issues, path) ?? [];
    const capabilityIds = strings(item, "capabilityIds", issues, path, false) ?? [];
    const permissionIds = strings(item, "permissionRuleIds", issues, path, false) ?? [];
    const handoffIds = strings(item, "handoffIds", issues, path) ?? [];
    const guardians = strings(item, "guardianRequirements", issues, path) ?? [];
    const approvals = strings(item, "approvalRequirements", issues, path) ?? [];
    validateEnumEntries(guardians, GUARDIANS, issues, `${path}.guardianRequirements`); validateEnumEntries(approvals, APPROVALS, issues, `${path}.approvalRequirements`);
    const primary = agentReference(item.primaryAgent, `${path}.primaryAgent`, issues, roles, specs);
    const supporting = agentReferences(item.supportingAgents, `${path}.supportingAgents`, issues, roles, specs);
    const areaId = typeof item.responsibilityAreaId === "string" ? item.responsibilityAreaId : undefined;
    const area = areaId === undefined ? undefined : areas.get(areaId as never);
    if (area === undefined) add(issues, "not_found", "responsibility area is not declared", `${path}.responsibilityAreaId`);
    else if (primary !== undefined && !area.primaryOwners.some(({ agentId }) => agentId === primary.agentId)) add(issues, "ownership_mismatch", "primary agent does not own the responsibility area", `${path}.primaryAgent`);
    validateCapabilityPermissionStep(capabilityIds, permissionIds, guardians, approvals, primary, capabilities, permissions, path, issues);
    validateHandoffStep(handoffIds, primary, supporting, dependencies, handoffs, path, issues);
    const output = object(item.expectedOutput, `${path}.expectedOutput`, OUTPUT_KEYS, issues);
    if (output !== undefined) { text(output, "artifactType", issues, `${path}.expectedOutput`); text(output, "description", issues, `${path}.expectedOutput`); strings(output, "requiredSections", issues, `${path}.expectedOutput`, false); }
    if (stepId !== undefined && primary !== undefined && areaId !== undefined) valid.push(item as unknown as MissionPlanStep);
  }
  uniqueSorted(ids, "steps", issues);
  return valid;
}

function validateCapabilityPermissionStep(capabilityIds: readonly string[], permissionIds: readonly string[], guardians: readonly string[], approvals: readonly string[], primary: MissionPlanAgentReference | undefined, capabilities: ReadonlyMap<string, AgentCompanyCapability>, permissions: ReadonlyMap<string, AgentCompanyPermissionRule>, path: string, issues: ValidationIssue[]): void {
  const capabilitySet = new Set(capabilityIds);
  for (const capabilityId of capabilityIds) {
    const capability = capabilities.get(capabilityId); if (capability === undefined) { add(issues, "not_found", "capability is not declared", `${path}.capabilityIds`); continue; }
    if (primary !== undefined && !capability.primaryOwners.some(({ agentId }) => agentId === primary.agentId)) add(issues, "ownership_mismatch", "primary agent does not own the step capability", `${path}.capabilityIds`);
    const requiredGuardians = capability.guardianRequirements.flatMap(({ domains }) => domains);
    if (requiredGuardians.some((domain) => !guardians.includes(domain))) add(issues, "guardian_required", "step is missing a capability guardian requirement", `${path}.guardianRequirements`);
    if (capability.approvalRequired) for (const requirement of capability.approvalRequirements) if (requirement.requiredFor.some((approval) => !approvals.includes(approval))) add(issues, "approval_required", "step is missing a capability approval requirement", `${path}.approvalRequirements`);
  }
  for (const permissionId of permissionIds) {
    const permission = permissions.get(permissionId); if (permission === undefined || !capabilitySet.has(permission.capabilityId)) add(issues, "permission_mismatch", "permission must map to a declared step capability", `${path}.permissionRuleIds`);
  }
  for (const capabilityId of capabilityIds) if (![...permissions.values()].some((rule) => rule.capabilityId === capabilityId && permissionIds.includes(rule.permissionId))) add(issues, "permission_required", "each step capability requires its permission declaration", `${path}.permissionRuleIds`);
}

function validateHandoffStep(handoffIds: readonly string[], primary: MissionPlanAgentReference | undefined, supporting: readonly MissionPlanAgentReference[], dependencies: readonly string[], handoffs: ReadonlyMap<string, AgentHandoffRequest>, path: string, issues: ValidationIssue[]): void {
  for (const handoffId of handoffIds) {
    const handoff = handoffs.get(handoffId); if (handoff === undefined) { add(issues, "not_found", "handoff is not declared", `${path}.handoffIds`); continue; }
    if (primary !== undefined && handoff.target.agentId !== primary.agentId) add(issues, "ownership_mismatch", "handoff target must be the step primary agent", `${path}.handoffIds`);
    if (dependencies.length === 0 && !supporting.some(({ agentId }) => agentId === handoff.source.agentId)) add(issues, "invalid_handoff", "handoff source must be represented by a dependency or supporting agent", `${path}.handoffIds`);
  }
}

function validateDependencies(steps: readonly MissionPlanStep[], issues: ValidationIssue[]): void {
  const byId = new Map(steps.map((step) => [step.stepId, step]));
  for (const step of steps) for (const dependency of step.dependencies) {
    const target = byId.get(dependency);
    if (target === undefined) add(issues, "not_found", "step dependency does not exist", `steps.${step.stepId}.dependencies`);
    else if (target.order >= step.order) add(issues, "dependency_cycle", "dependencies must point to an earlier step", `steps.${step.stepId}.dependencies`);
  }
}

function validateControl(value: unknown, steps: readonly MissionPlanStep[], issues: ValidationIssue[]): void {
  const control = object(value, "control", CONTROL_KEYS, issues); if (control === undefined) return;
  enumValue(control, "totalEffortClass", EFFORT_CLASSES, issues, "control"); enumValue(control, "totalCostClass", COST_CLASSES, issues, "control");
  for (const key of ["criticalRisks", "evidenceRequirements", "rejectionReasons", "successMetrics"]) strings(control, key, issues, "control");
  text(control, "firstConcreteAction", issues, "control"); text(control, "minimumAcceptableQuality", issues, "control");
  const stepIds = new Set(steps.map(({ stepId }) => stepId));
  const approvals = records(control.approvalQueue, "control.approvalQueue", APPROVAL_QUEUE_KEYS, issues);
  const guardians = records(control.guardianReviewQueue, "control.guardianReviewQueue", GUARDIAN_QUEUE_KEYS, issues);
  for (const [index, item] of approvals.entries()) { const path = `control.approvalQueue[${String(index)}]`; identifier(item, "approvalId", issues, path); const ids = strings(item, "stepIds", issues, path, false) ?? []; validateRefs(ids, stepIds, issues, `${path}.stepIds`); const required = strings(item, "requiredFor", issues, path, false) ?? []; validateEnumEntries(required, APPROVALS, issues, `${path}.requiredFor`); }
  for (const [index, item] of guardians.entries()) { const path = `control.guardianReviewQueue[${String(index)}]`; identifier(item, "reviewId", issues, path); const ids = strings(item, "stepIds", issues, path, false) ?? []; validateRefs(ids, stepIds, issues, `${path}.stepIds`); const domains = strings(item, "domains", issues, path, false) ?? []; validateEnumEntries(domains, GUARDIANS, issues, `${path}.domains`); }
  for (const step of steps) {
    for (const approval of step.approvalRequirements) if (!approvals.some((item) => (item.stepIds as readonly unknown[]).includes(step.stepId) && (item.requiredFor as readonly unknown[]).includes(approval))) add(issues, "approval_required", "step approval is missing from the mission approval queue", "control.approvalQueue");
    for (const guardian of step.guardianRequirements) if (!guardians.some((item) => (item.stepIds as readonly unknown[]).includes(step.stepId) && (item.domains as readonly unknown[]).includes(guardian))) add(issues, "guardian_required", "step guardian is missing from the mission guardian queue", "control.guardianReviewQueue");
  }
  const external = object(control.externalActionBoundary, "control.externalActionBoundary", EXTERNAL_KEYS, issues);
  if (external !== undefined) {
    if (external.externalExecutionAllowed !== false || external.nonExecuting !== true) add(issues, "unsafe_execution", "external action boundary must deny execution", "control.externalActionBoundary");
    const requested = strings(external, "requestedActionTypes", issues, "control.externalActionBoundary") ?? [];
    if (requested.length > 0 && approvals.length === 0) add(issues, "approval_required", "requested external actions require an approval queue", "control.approvalQueue");
  }
  const effort = typeof control.totalEffortClass === "string" ? control.totalEffortClass : undefined; const cost = typeof control.totalCostClass === "string" ? control.totalCostClass : undefined;
  if (effort !== undefined && EFFORT_CLASSES.has(effort as MissionEffortClass) && classRank(effort) < Math.max(...steps.map(({ effortClass }) => classRank(effortClass)))) add(issues, "inconsistent_summary", "total effort understates a step", "control.totalEffortClass");
  if (cost !== undefined && COST_CLASSES.has(cost as MissionCostClass) && cost !== "unknown" && classRank(cost) < Math.max(...steps.map(({ costClass }) => classRank(costClass)))) add(issues, "inconsistent_summary", "total cost understates a step", "control.totalCostClass");
}

function agentReference(value: unknown, path: string, issues: ValidationIssue[], roles: ReadonlyMap<string, unknown>, specs: ReadonlyMap<string, { readonly agentId: string; readonly version: string }>): MissionPlanAgentReference | undefined {
  const record = object(value, path, AGENT_KEYS, issues); if (record === undefined) return undefined;
  const agentId = identifier(record, "agentId", issues, path); const specificationId = identifier(record, "specificationId", issues, path); const version = text(record, "version", issues, path);
  if (version !== undefined && !isSemanticVersion(version)) add(issues, "invalid_format", "agent version must use semantic versioning", `${path}.version`);
  const spec = agentId === undefined ? undefined : specs.get(agentId);
  if (agentId === undefined || !roles.has(agentId) || spec === undefined || version !== spec.version || specificationId !== `${agentId}@${version}`) { add(issues, "not_found", "agent reference must match an exact supplied role specification", path); return undefined; }
  return record as unknown as MissionPlanAgentReference;
}

function agentReferences(value: unknown, path: string, issues: ValidationIssue[], roles: ReadonlyMap<string, unknown>, specs: ReadonlyMap<string, { readonly agentId: string; readonly version: string }>): readonly MissionPlanAgentReference[] {
  if (!Array.isArray(value)) { add(issues, value === undefined ? "required" : "invalid_type", `${path} must be an array`, path); return []; }
  return value.map((entry, index) => agentReference(entry, `${path}[${String(index)}]`, issues, roles, specs)).filter((entry): entry is MissionPlanAgentReference => entry !== undefined);
}

function object(value: unknown, path: string, allowed: ReadonlySet<string>, issues: ValidationIssue[]): Readonly<Record<string, unknown>> | undefined { const record = asRecord(value); if (record === undefined) { add(issues, value === undefined ? "required" : "invalid_type", `${path} must be an object`, path); return undefined; } rejectUnknown(record, allowed, issues, path); return record; }
function records(value: unknown, path: string, allowed: ReadonlySet<string>, issues: ValidationIssue[], allowEmpty = true): readonly Readonly<Record<string, unknown>>[] { if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) { add(issues, value === undefined ? "required" : "invalid_type", `${path} must be an array`, path); return []; } return value.map((entry, index) => object(entry, `${path}[${String(index)}]`, allowed, issues)).filter((entry): entry is Readonly<Record<string, unknown>> => entry !== undefined); }
function text(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string): string | undefined { const value = record[key]; if (typeof value !== "string" || value.trim().length === 0 || value.length > 1_000) { add(issues, value === undefined ? "required" : "invalid_type", `${prefix}.${key} must be a non-empty bounded string`, `${prefix}.${key}`); return undefined; } return value; }
function identifier(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix = ""): string | undefined { const value = text(record, key, issues, prefix); if (value !== undefined && !ID.test(value)) add(issues, "invalid_format", `${prefix}.${key} must be normalized`, `${prefix}.${key}`); return value; }
function strings(record: Readonly<Record<string, unknown>>, key: string, issues: ValidationIssue[], prefix: string, allowEmpty = true): readonly string[] | undefined { const value = record[key]; if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0 || entry.length > 500) || (!allowEmpty && value.length === 0)) { add(issues, value === undefined ? "required" : "invalid_type", `${prefix}.${key} must be an array of strings`, `${prefix}.${key}`); return undefined; } return value as readonly string[]; }
function enumValue(record: Readonly<Record<string, unknown>>, key: string, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): string | undefined { const value = text(record, key, issues, prefix); if (value !== undefined && !allowed.has(value)) { add(issues, "invalid_value", `${prefix}.${key} is unsupported`, `${prefix}.${key}`); return undefined; } return value; }
function integer(record: Readonly<Record<string, unknown>>, key: string, expected: number, issues: ValidationIssue[], prefix: string): void { if (record[key] !== expected) add(issues, "not_deterministic", `${prefix}.${key} must match stable step order`, `${prefix}.${key}`); }
function exact(record: Readonly<Record<string, unknown>>, key: string, expected: string, issues: ValidationIssue[]): void { if (record[key] !== expected) add(issues, "unsupported_version", `${key} must be ${expected}`, key); }
function uniqueSorted(ids: readonly string[], path: string, issues: ValidationIssue[]): void { if (new Set(ids).size !== ids.length) add(issues, "duplicate", `${path} IDs must be unique`, path); const sorted = [...ids].sort(); if (ids.some((id, index) => id !== sorted[index])) add(issues, "not_deterministic", `${path} IDs must be sorted`, path); }
function validateEnumEntries(values: readonly string[], allowed: ReadonlySet<string>, issues: ValidationIssue[], path: string): void { values.forEach((value, index) => { if (!allowed.has(value)) add(issues, "invalid_value", `${path} contains an unsupported value`, `${path}[${String(index)}]`); }); }
function validateRefs(values: readonly string[], known: ReadonlySet<string>, issues: ValidationIssue[], path: string): void { if (values.some((value) => !known.has(value))) add(issues, "not_found", `${path} references an unknown step`, path); }
function rejectUnknown(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>, issues: ValidationIssue[], prefix: string): void { for (const key of Object.keys(record)) if (!allowed.has(key)) add(issues, "unknown_field", "unknown fields are not allowed", prefix.length === 0 ? key : `${prefix}.${key}`); }
function rejectSensitive(value: unknown, issues: ValidationIssue[], path = ""): void { if (typeof value === "string") { if (SENSITIVE.some((pattern) => pattern.test(value))) add(issues, "sensitive_content", "mission plan contains prohibited sensitive content", path.length === 0 ? "$" : path); return; } if (Array.isArray(value)) { value.forEach((entry, index) => { rejectSensitive(entry, issues, `${path}[${String(index)}]`); }); return; } const record = asRecord(value); if (record !== undefined) for (const [key, entry] of Object.entries(record)) rejectSensitive(entry, issues, path.length === 0 ? key : `${path}.${key}`); }
function classRank(value: string): number {
  switch (value) {
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    case "minimal": return 0;
    case "unknown": return 4;
    default: return 0;
  }
}
function add(issues: ValidationIssue[], code: string, message: string, path: string): void { issues.push({ code, message, path }); }
function cloneAndFreeze(value: unknown): unknown { if (Array.isArray(value)) return Object.freeze(value.map((entry) => cloneAndFreeze(entry))); const record = asRecord(value); if (record === undefined) return value; const clone: Record<string, unknown> = {}; for (const [key, entry] of Object.entries(record)) clone[key] = cloneAndFreeze(entry); return Object.freeze(clone); }
