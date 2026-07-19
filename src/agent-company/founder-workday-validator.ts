import { createHash } from "node:crypto";

import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";
import { OPERATIONAL_AGENT_COMPANY_CATALOG, OPERATIONAL_AGENT_IDS, type OperationalAgentId } from "./operational-agent-company.js";
import {
  FOUNDER_WORKDAY_OBJECTIVE,
  type FounderWorkdayBlocker,
  type FounderWorkdayRecord,
} from "./founder-workday.js";

const ID = /^[a-zA-Z0-9@._:-]{1,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const UNSAFE = /(?:\bsk-[A-Za-z0-9_-]{8,}|bearer\s+|password|secret|raw\s+(?:prompt|completion|payload)|stack\s+trace)/iu;

export class FounderWorkdayRecordValidator implements Validator<FounderWorkdayRecord> {
  public validate(value: unknown): ValidationResult<FounderWorkdayRecord> {
    if (!record(value) || !keys(value, ["actorId", "artifacts", "contractVersion", "createdAt", "fingerprint", "manifest", "objective", "status", "tasks", "updatedAt", "version", "workdayId", "workspaceId"]) || value.contractVersion !== "1" || value.objective !== FOUNDER_WORKDAY_OBJECTIVE || !id(value.actorId) || !id(value.workspaceId) || !id(value.workdayId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !integer(value.version, 0, 1_000_000) || !["AWAITING_FABIO", "BLOCKED", "RUNNING"].includes(String(value.status)) || !HASH.test(String(value.fingerprint)) || !manifest(value.manifest) || !tasks(value.tasks) || !artifacts(value.artifacts)) return invalid("Founder workday record is invalid");
    const withoutFingerprint = { ...value };
    delete withoutFingerprint.fingerprint;
    if (founderWorkdayFingerprint(withoutFingerprint) !== value.fingerprint) return invalid("Founder workday fingerprint is invalid");
    const graph = new Map((value.manifest as { readonly dependencyGraph: readonly { readonly agentId: string; readonly dependencies: readonly string[] }[] }).dependencyGraph.map((edge) => [edge.agentId, edge.dependencies]));
    if (!(value.tasks as readonly { readonly agentId: string; readonly dependencies: readonly string[]; readonly outputIdentity?: string; readonly receipt?: { readonly executorId: string; readonly outputFingerprint: string } }[]).every((task) => sameSet(task.dependencies, graph.get(task.agentId) ?? []) && (task.receipt === undefined || (task.receipt.outputFingerprint === task.outputIdentity && task.receipt.executorId === OPERATIONAL_AGENT_COMPANY_CATALOG.find(({ agentId }) => agentId === task.agentId)?.executorId)))) return invalid("Founder workday task graph or receipt binding is invalid");
    if (value.status === "BLOCKED" && !(value.tasks as readonly Record<string, unknown>[]).some((task) => task.status === "BLOCKED")) return invalid("Blocked Founder workday has no blocker");
    return success(value as unknown as FounderWorkdayRecord);
  }
}

export function founderWorkdayFingerprint(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function manifest(value: unknown): boolean {
  if (!record(value) || !keys(value, ["agentIds", "businessMissionIds", "dependencyGraph", "evidencePackIds", "productionIds", "socialRecordIds"]) || !uniqueIds(value.agentIds, 17, 17) || !sameSet(value.agentIds, OPERATIONAL_AGENT_IDS) || !uniqueIds(value.businessMissionIds, 0, 25) || !uniqueIds(value.evidencePackIds, 0, 100) || !uniqueIds(value.productionIds, 0, 25) || !uniqueIds(value.socialRecordIds, 0, 500) || !Array.isArray(value.dependencyGraph) || value.dependencyGraph.length !== 17) return false;
  const seen = new Set<string>();
  return value.dependencyGraph.every((edge) => { if (!record(edge) || !keys(edge, ["agentId", "dependencies"]) || !operationalAgentId(edge.agentId) || seen.has(edge.agentId) || !uniqueIds(edge.dependencies, 0, 17) || !edge.dependencies.every(operationalAgentId)) return false; seen.add(edge.agentId); return true; });
}

function tasks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 17) return false;
  const seen = new Set<string>();
  return value.every((task) => {
    if (!record(task)) return false;
    const expected = ["agentId", "assignment", "attempts", "costClass", "decisionRequired", "dependencies", "department", "gateStatus", "status", "taskId", ...(task.blocker === undefined ? [] : ["blocker"]), ...(task.outputIdentity === undefined ? [] : ["outputIdentity"]), ...(task.receipt === undefined ? [] : ["receipt"])];
    if (!keys(task, expected) || !operationalAgentId(task.agentId) || seen.has(task.agentId) || !id(task.taskId) || !text(task.assignment, 8, 800) || !text(task.department, 2, 120) || !integer(task.attempts, 0, 100) || task.costClass !== "LOCAL_ZERO_COST" || typeof task.decisionRequired !== "boolean" || !uniqueIds(task.dependencies, 0, 17) || !["AWAITING_DEPENDENCY", "AWAITING_FABIO", "BLOCKED", "COMPLETED", "RUNNING"].includes(String(task.status)) || !["AWAITING_INPUT", "BLOCKED", "PASSED"].includes(String(task.gateStatus)) || (task.outputIdentity !== undefined && (typeof task.outputIdentity !== "string" || !HASH.test(task.outputIdentity))) || (task.blocker !== undefined && !blocker(task.blocker)) || (task.receipt !== undefined && !receipt(task.receipt))) return false;
    if (task.status === "BLOCKED" && (task.blocker === undefined || task.gateStatus !== "BLOCKED")) return false;
    if (task.status === "COMPLETED" && (task.receipt === undefined || task.outputIdentity === undefined || task.gateStatus !== "PASSED")) return false;
    if (["AWAITING_DEPENDENCY", "AWAITING_FABIO"].includes(String(task.status)) && (task.receipt !== undefined || task.gateStatus !== "AWAITING_INPUT")) return false;
    seen.add(task.agentId);
    return true;
  });
}

function blocker(value: unknown): value is FounderWorkdayBlocker {
  return record(value) && keys(value, ["evidence", "missingInput", "nextAction", "owner", "remediation"]) && strings(value.evidence, 1, 20, 400) && text(value.missingInput, 4, 500) && text(value.nextAction, 4, 500) && text(value.remediation, 4, 500) && ["FABIO", "OPERATIONS_RUNTIME", "RESEARCH", "SYSTEM"].includes(String(value.owner));
}

function receipt(value: unknown): boolean {
  return record(value) && keys(value, ["completedAt", "costCents", "durationMs", "executorId", "externalEffects", "outputFingerprint", "receiptId", "startedAt"]) && timestamp(value.startedAt) && timestamp(value.completedAt) && integer(value.costCents, 0, 1_000_000_000) && integer(value.durationMs, 0, 86_400_000) && id(value.executorId) && value.externalEffects === 0 && HASH.test(String(value.outputFingerprint)) && id(value.receiptId);
}

function artifacts(value: unknown): boolean {
  if (!record(value) || !keys(value, ["blockedWorkReport", "costSummary", "decisionList", "externalEffectsSummary", "founderDailyDossier", "nextDayProductionPlan"])) return false;
  const blocked = value.blockedWorkReport;
  const cost = value.costSummary;
  const decisions = value.decisionList;
  const effects = value.externalEffectsSummary;
  const dossier = value.founderDailyDossier;
  const plan = value.nextDayProductionPlan;
  return record(blocked) && keys(blocked, ["blockedTaskIds", "blockers"]) && uniqueIds(blocked.blockedTaskIds, 0, 17) && Array.isArray(blocked.blockers) && blocked.blockers.every(blocker)
    && record(cost) && keys(cost, ["budgetCents", "coverage", "estimatedCostCents", "measuredCostCents", "providerCalls"]) && cost.coverage === "PREFLIGHT_ONLY" && integer(cost.budgetCents, 0, 1_000_000_000) && integer(cost.estimatedCostCents, 0, 1_000_000_000) && integer(cost.measuredCostCents, 0, 1_000_000_000) && cost.providerCalls === 0
    && Array.isArray(decisions) && decisions.length <= 50 && decisions.every(decision)
    && record(effects) && keys(effects, ["coverage", "deployments", "messages", "paidCalls", "publications", "purchases"]) && effects.coverage === "PREFLIGHT_ONLY" && Object.entries(effects).filter(([key]) => key !== "coverage").every(([, item]) => item === 0)
    && record(dossier) && keys(dossier, ["businessMissions", "evidencePacks", "freshEvidencePacks", "productionPackages", "socialAnalyticsRecords", "socialIntelligenceRecords", "summary"]) && [dossier.businessMissions, dossier.evidencePacks, dossier.freshEvidencePacks, dossier.productionPackages, dossier.socialAnalyticsRecords, dossier.socialIntelligenceRecords].every(datum) && text(dossier.summary, 8, 2_000)
    && record(plan) && keys(plan, ["blockedBy", "candidateProductionIds", "mode", "publication", "status"]) && strings(plan.blockedBy, 0, 20, 300) && uniqueIds(plan.candidateProductionIds, 0, 25) && plan.mode === "INTERNAL_PACKAGE_ONLY" && plan.publication === "LOCKED" && ["BLOCKED", "READY_FOR_FABIO"].includes(String(plan.status));
}

function decision(value: unknown): boolean { return record(value) && keys(value, ["decisionId", "evidence", "owner", "priority", "question", "status"]) && id(value.decisionId) && strings(value.evidence, 1, 20, 400) && ["FABIO", "SYSTEM"].includes(String(value.owner)) && ["HIGH", "LOW", "MEDIUM"].includes(String(value.priority)) && text(value.question, 4, 500) && value.status === "OPEN"; }
function datum(value: unknown): boolean { return record(value) && keys(value, ["kind", "provenance", "value"]) && ["ASSUMPTION", "ESTIMATE", "MEASURED", "UNAVAILABLE"].includes(String(value.kind)) && strings(value.provenance, 1, 30, 400) && integer(value.value, 0, 1_000_000_000); }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function sameSet(left: readonly string[], right: readonly string[]): boolean { return [...left].sort().join("\n") === [...right].sort().join("\n"); }
function uniqueIds(value: unknown, minimum: number, maximum: number): value is readonly string[] { return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every(id) && new Set(value).size === value.length; }
function strings(value: unknown, minimum: number, maximum: number, maximumLength: number): value is readonly string[] { return Array.isArray(value) && value.length >= minimum && value.length <= maximum && value.every((entry) => text(entry, 1, maximumLength)); }
function text(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum && !UNSAFE.test(value); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function operationalAgentId(value: unknown): value is OperationalAgentId { return typeof value === "string" && OPERATIONAL_AGENT_IDS.some((agentId) => agentId === value); }
function timestamp(value: unknown): value is string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value; }
function integer(value: unknown, minimum: number, maximum: number): boolean { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function success<T>(value: T): ValidationResult<T> { return validationSuccess(deepFreeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
