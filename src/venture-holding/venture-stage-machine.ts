import { RepositoryConflictError } from "../errors/core-error.js";
import type { VentureDecision, VentureStage } from "./venture-domain.js";

const TRANSITIONS = Object.freeze({
  DISCOVERED: Object.freeze(["RESEARCHING", "EVIDENCE_INSUFFICIENT", "ARCHIVED"]),
  RESEARCHING: Object.freeze(["EVIDENCE_INSUFFICIENT", "THESIS_READY", "ARCHIVED"]),
  EVIDENCE_INSUFFICIENT: Object.freeze(["RESEARCHING", "AWAITING_FABIO", "ARCHIVED"]),
  THESIS_READY: Object.freeze(["AWAITING_FABIO"]),
  AWAITING_FABIO: Object.freeze(["VALIDATION_READY", "EVIDENCE_INSUFFICIENT", "ARCHIVED"]),
  VALIDATION_READY: Object.freeze(["VALIDATING", "PAUSED"]),
  VALIDATING: Object.freeze(["SIGNAL_POSITIVE", "SIGNAL_NEGATIVE", "PAUSED"]),
  SIGNAL_POSITIVE: Object.freeze(["LAUNCH_READY", "SCALE_REVIEW", "PAUSED"]),
  SIGNAL_NEGATIVE: Object.freeze(["KILL_REVIEW", "PAUSED"]),
  LAUNCH_READY: Object.freeze(["ACTIVE", "PAUSED"]),
  ACTIVE: Object.freeze(["PAUSED", "SCALE_REVIEW", "KILL_REVIEW"]),
  PAUSED: Object.freeze(["VALIDATION_READY", "VALIDATING", "ACTIVE", "KILL_REVIEW", "ARCHIVED"]),
  SCALE_REVIEW: Object.freeze(["ACTIVE", "PAUSED", "KILL_REVIEW"]),
  KILL_REVIEW: Object.freeze(["KILLED", "PAUSED"]),
  KILLED: Object.freeze(["ARCHIVED"]),
  ARCHIVED: Object.freeze([]),
} as const satisfies Readonly<Record<VentureStage, readonly VentureStage[]>>);

export function assertVentureStageTransition(input: { readonly from: VentureStage; readonly to: VentureStage; readonly decision?: VentureDecision }): void {
  if (!(TRANSITIONS[input.from] as readonly VentureStage[]).includes(input.to)) throw new RepositoryConflictError("Venture stage transition is not allowed");
  if (input.to === "ACTIVE" && input.decision?.decision !== "RESUME_VENTURE") throw new RepositoryConflictError("Venture activation requires an exact Fabio resume decision");
  if (input.to === "VALIDATION_READY" && input.decision?.decision !== "APPROVE_EXPERIMENT") throw new RepositoryConflictError("Venture validation requires an exact Fabio experiment decision");
  if (input.to === "KILLED" && input.decision?.decision !== "REQUEST_KILL_REVIEW") throw new RepositoryConflictError("Venture kill transition requires an exact Fabio kill-review decision");
}
