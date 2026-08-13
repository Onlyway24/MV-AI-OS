import { createHash } from "node:crypto";

import { BusinessMissionExecutionInputValidator } from "../business/business-mission-validator.js";
import { MetodoVeloceContentProductionBriefValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import { validationFailure, validationSuccess, type ValidationResult, type Validator } from "../validation/validation.js";
import {
  OPERATIONAL_AGENT_COMPANY_CATALOG,
  OPERATIONAL_AGENT_IDS,
  type AgentCompanyWorkday,
  type AgentCompanyWorkdayInput,
} from "./operational-agent-company.js";

const ID = /^[a-zA-Z0-9@._:-]{1,128}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const MAX_WORKDAY_BYTES = 1_048_576;
const MAX_WORK_ITEM_OUTPUT_BYTES = 65_536;

export class AgentCompanyWorkdayInputValidator implements Validator<AgentCompanyWorkdayInput> {
  readonly #business = new BusinessMissionExecutionInputValidator();
  readonly #content = new MetodoVeloceContentProductionBriefValidator();
  public validate(value: unknown): ValidationResult<AgentCompanyWorkdayInput> {
    if (!record(value) || !id(value.workdayId) || !id(value.missionId) || (value.researchMissionId !== undefined && !id(value.researchMissionId)) || !text(value.objective, 1, 4_000) || !integer(value.maxBudgetCents, 0, 1_000_000_000) || !Array.isArray(value.researchPacks) || value.researchPacks.length !== 3 || !value.researchPacks.every(pack) || new Set(value.researchPacks.map((item) => record(item) ? item.packId : undefined)).size !== 3 || !this.#business.validate(value.businessMission).ok || !content(value.content, this.#content) || !developer(value.developer) || !publisher(value.publisher)) return invalid("Agent Company workday input is invalid");
    const business = value.businessMission as Record<string, unknown>;
    const candidates = Array.isArray(business.candidates) ? business.candidates : [];
    const packIds = new Set(value.researchPacks.map((item) => (item as { readonly packId: string }).packId));
    if (!candidates.every((candidate) => record(candidate) && typeof candidate.evidencePackId === "string" && packIds.has(candidate.evidencePackId))) return invalid("Business candidates must use the workday Evidence Packs");
    const contentInput = value.content as Record<string, unknown>;
    if (typeof contentInput.evidencePackId !== "string" || !packIds.has(contentInput.evidencePackId)) return invalid("Content must use a workday Evidence Pack");
    return valid(value as unknown as AgentCompanyWorkdayInput);
  }
}

export class AgentCompanyWorkdayValidator implements Validator<AgentCompanyWorkday> {
  readonly #input = new AgentCompanyWorkdayInputValidator();
  public validate(value: unknown): ValidationResult<AgentCompanyWorkday> {
    if (!record(value) || !jsonBytesAtMost(value, MAX_WORKDAY_BYTES) || value.contractVersion !== "1" || !id(value.workdayId) || !id(value.actorId) || !id(value.workspaceId) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || !integer(value.version, 0, Number.MAX_SAFE_INTEGER) || !["AWAITING_FABIO", "BLOCKED", "RUNNING"].includes(String(value.status)) || value.externalActionsExecuted !== false || !HASH.test(String(value.inputFingerprint)) || !this.#input.validate(value.input).ok || createAgentCompanyInputFingerprint(value.input as AgentCompanyWorkdayInput) !== value.inputFingerprint || !Array.isArray(value.tasks) || value.tasks.length !== OPERATIONAL_AGENT_IDS.length) return invalid("Agent Company workday is invalid");
    const catalog = new Map(OPERATIONAL_AGENT_COMPANY_CATALOG.map((entry) => [entry.agentId, entry]));
    const seen = new Set<string>();
    for (const task of value.tasks) {
      if (!record(task) || !OPERATIONAL_AGENT_IDS.includes(task.agentId as never) || seen.has(String(task.agentId)) || !id(task.workItemId) || !id(task.executorId) || !["BLOCKED", "COMPLETED", "QUEUED", "RUNNING"].includes(String(task.status)) || !integer(task.attempts, 0, 100) || !integer(task.costCents, 0, 1_000_000_000) || !integer(task.durationMs, 0, 86_400_000) || !Array.isArray(task.dependencies) || !task.dependencies.every((dependency) => OPERATIONAL_AGENT_IDS.includes(dependency as never)) || !Array.isArray(task.gates) || (!["QUEUED", "RUNNING"].includes(String(task.status)) && !gates(task.gates)) || (["QUEUED", "RUNNING"].includes(String(task.status)) && task.gates.length !== 0)) return invalid("Agent Company work item is invalid");
      const entry = catalog.get(task.agentId as never);
      if (task.executorId !== entry?.executorId || task.taskType !== entry.supportedTasks[0]) return invalid("Agent Company executor binding is invalid");
      if (task.status === "COMPLETED" && (!record(task.output) || !jsonBytesAtMost(task.output, MAX_WORK_ITEM_OUTPUT_BYTES) || !HASH.test(String(task.outputFingerprint)) || createAgentCompanyOutputFingerprint(task.output) !== task.outputFingerprint || !timestamp(task.startedAt) || !timestamp(task.completedAt) || task.blocker !== undefined)) return invalid("Completed Agent Company work item is invalid");
      if (task.status === "BLOCKED" && (!workItemBlocker(task.blocker) || !timestamp(task.startedAt) || !timestamp(task.completedAt))) return invalid("Blocked Agent Company work item is invalid");
      if ((task.status === "QUEUED" || task.status === "RUNNING") && (task.output !== undefined || task.outputFingerprint !== undefined || task.completedAt !== undefined || task.blocker !== undefined)) return invalid("Pending Agent Company work item is invalid");
      seen.add(String(task.agentId));
    }
    if (value.status === "AWAITING_FABIO" && !value.tasks.every((task) => record(task) && task.status === "COMPLETED")) return invalid("Agent Company workday cannot await Fabio before all tasks complete");
    if (value.status === "BLOCKED" && !value.tasks.some((task) => record(task) && task.status === "BLOCKED")) return invalid("Blocked Agent Company workday has no blocker");
    return valid(value as unknown as AgentCompanyWorkday);
  }
}

export function createAgentCompanyInputFingerprint(input: AgentCompanyWorkdayInput): string { return hash(input); }
export function createAgentCompanyOutputFingerprint(output: object): string { return hash(output); }

function content(value: unknown, validator: MetodoVeloceContentProductionBriefValidator): boolean { return record(value) && exactKeys(value, ["brief", "evidencePackId"]) && id(value.evidencePackId) && validator.validate(value.brief).ok; }
function pack(value: unknown): boolean { return record(value) && exactKeys(value, ["evidenceIds", "packId"]) && id(value.packId) && Array.isArray(value.evidenceIds) && value.evidenceIds.length >= 1 && value.evidenceIds.length <= 8 && value.evidenceIds.every(id) && new Set(value.evidenceIds).size === value.evidenceIds.length; }
function developer(value: unknown): boolean { return record(value) && exactKeys(value, ["acceptanceChecks", "filesInScope", "isolatedBranch", "objective"]) && strings(value.acceptanceChecks, 1, 20) && strings(value.filesInScope, 1, 100) && text(value.isolatedBranch, 1, 200) && text(value.objective, 1, 2_000) && !/^(main|master)$/u.test(value.isolatedBranch); }
function publisher(value: unknown): boolean { return record(value) && exactKeys(value, ["platforms", "scheduledFor"]) && Array.isArray(value.platforms) && value.platforms.length >= 1 && value.platforms.length <= 2 && value.platforms.every((platform) => platform === "instagram" || platform === "tiktok") && new Set(value.platforms).size === value.platforms.length && timestamp(value.scheduledFor); }
function gates(value: readonly unknown[]): boolean { const names = new Set<string>(); return value.length === 3 && value.every((gate) => { if (!record(gate) || !["COST", "QUALITY", "RISK"].includes(String(gate.gate)) || names.has(String(gate.gate)) || !["BLOCKED", "PASSED"].includes(String(gate.status)) || !integer(gate.score, 0, 100) || !strings(gate.findings, 0, 30)) return false; names.add(String(gate.gate)); return true; }); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function valid<T>(value: T): ValidationResult<T> { return validationSuccess(deepFreeze(structuredClone(value))); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function text(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.trim().length >= min && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => text(entry, 1, 4_000)); }
function integer(value: unknown, min: number, max: number): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max; }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function workItemBlocker(value: unknown): boolean { return record(value) && exactKeys(value, ["evidence", "missingInput", "nextAction", "owner", "reasonCode", "remediation"]) && strings(value.evidence, 1, 20) && text(value.missingInput, 4, 1_000) && text(value.nextAction, 4, 1_000) && (OPERATIONAL_AGENT_IDS.includes(value.owner as never) || value.owner === "FABIO" || value.owner === "OPERATIONS_RUNTIME") && typeof value.reasonCode === "string" && /^[A-Z][A-Z0-9_]{2,63}$/u.test(value.reasonCode) && text(value.remediation, 4, 1_000); }
function jsonBytesAtMost(value: unknown, maximum: number): boolean { try { return Buffer.byteLength(JSON.stringify(value), "utf8") <= maximum; } catch { return false; } }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
