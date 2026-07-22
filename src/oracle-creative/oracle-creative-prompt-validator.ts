import {
  ORACLE_CREATIVE_DELIVERABLES,
  ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION,
  ORACLE_LOCAL_CONTENT_BUNDLE,
  type OracleCreativePromptConfirmation,
  type OracleCreativePromptRequest,
} from "./oracle-creative-prompt.js";
import type { ValidationResult, Validator } from "../validation/validation.js";
import { validationFailure, validationSuccess } from "../validation/validation.js";

const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const FINGERPRINT = /^[a-f0-9]{64}$/u;
const SENSITIVE = /(?:\bsk-[a-z0-9][a-z0-9_-]{8,}|\bghp_[a-z0-9]{20,}|\bgithub_pat_[a-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b|\bAIza[a-z0-9_-]{30,}|\bBearer\s+[a-z0-9._~+/-]{12,}|\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}|api[ _-]?key|client[ _-]?secret|password|raw[ _-]?prompt|raw[ _-]?completion|provider[ _-]?payload|stack trace)/iu;
const POLICY_OVERRIDE = /(?:bypass|bypassa|ignora|override).{0,48}(?:guardrail|istruzion|policy|regol|sicurezza)/iu;

export class OracleCreativePromptRequestValidator implements Validator<OracleCreativePromptRequest> {
  public validate(value: unknown): ValidationResult<OracleCreativePromptRequest> {
    if (!record(value)) return invalid("Oracle creative prompt request is invalid");
    const expected = ["businessMissionId", "contractVersion", "deliverables", "objective", "platforms", "prompt", "promptId"];
    if (
      !keys(value, expected) ||
      value.contractVersion !== ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION ||
      !identifier(value.promptId) ||
      !identifier(value.businessMissionId) ||
      !prompt(value.prompt) ||
      !["educate", "engage", "lead_generation", "soft_sell"].includes(String(value.objective)) ||
      !uniqueValues(value.platforms, ["instagram", "tiktok"], 1, 2) ||
      !uniqueValues(value.deliverables, ORACLE_CREATIVE_DELIVERABLES, 1, ORACLE_CREATIVE_DELIVERABLES.length) ||
      !localBundleIncluded(value.deliverables) ||
      !platformsMatchDeliverables(value.platforms, value.deliverables)
    ) return invalid("Oracle creative prompt request is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as OracleCreativePromptRequest)));
  }
}

export class OracleCreativePromptConfirmationValidator implements Validator<OracleCreativePromptConfirmation> {
  public validate(value: unknown): ValidationResult<OracleCreativePromptConfirmation> {
    if (
      !record(value) ||
      !keys(value, ["confirmationToken", "contractVersion", "prompt", "promptFingerprint", "proposalFingerprint", "proposalId"]) ||
      value.contractVersion !== ORACLE_CREATIVE_PROMPT_CONTRACT_VERSION ||
      !identifier(value.proposalId) ||
      !fingerprint(value.confirmationToken) ||
      !fingerprint(value.promptFingerprint) ||
      !fingerprint(value.proposalFingerprint) ||
      !prompt(value.prompt)
    ) return invalid("Oracle creative prompt confirmation is invalid");
    return validationSuccess(freeze(structuredClone(value as unknown as OracleCreativePromptConfirmation)));
  }
}

export function oraclePromptIsSafe(value: unknown): value is string {
  return prompt(value);
}

function platformsMatchDeliverables(platforms: unknown, deliverables: unknown): boolean {
  if (!Array.isArray(platforms) || !Array.isArray(deliverables)) return false;
  if ((deliverables.includes("CAROUSEL") || deliverables.includes("INSTAGRAM_COPY")) && !platforms.includes("instagram")) return false;
  return (!deliverables.includes("TIKTOK_VIDEO_BLUEPRINT") && !deliverables.includes("VIDEO_RENDER")) || platforms.includes("tiktok");
}

function prompt(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 12 && value.trim().length <= 240 && !SENSITIVE.test(value) && !POLICY_OVERRIDE.test(value) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function uniqueValues(value: unknown, allowed: readonly string[], min: number, max: number): boolean {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every((entry) => typeof entry === "string" && allowed.includes(entry)) && new Set(value).size === value.length;
}

function localBundleIncluded(value: unknown): boolean { return Array.isArray(value) && ORACLE_LOCAL_CONTENT_BUNDLE.every((deliverable) => value.includes(deliverable)); }

function identifier(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && FINGERPRINT.test(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { const actual = Object.keys(value).sort(); const sorted = [...expected].sort(); return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]); }
function invalid<T>(message: string): ValidationResult<T> { return validationFailure([{ code: "invalid_value", message, path: "$" }]); }
function freeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) freeze(child); return value; }
