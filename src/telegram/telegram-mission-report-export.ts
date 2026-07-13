import type { LocalWorkflowCommandResponse } from "../runtime/local-workflow-command.js";
import type { TelegramMissionDraft } from "./telegram-mission-draft.js";

export const TELEGRAM_MISSION_REPORT_EXPORT_CONTRACT_VERSION = "1" as const;
export type TelegramMissionReportFormat = "json" | "markdown";

export interface TelegramMissionReport {
  readonly contractVersion: "1";
  readonly effortClass: string;
  readonly expectedOutputs: readonly string[];
  readonly firstAction: string;
  readonly mission: { readonly objective: string; readonly type: string };
  readonly noExternalActions: true;
  readonly noWorkflow: true;
  readonly profileReferences: readonly string[];
  readonly quality: { readonly score: string; readonly status: string };
  readonly remediation: readonly string[];
  readonly selectedRoles: readonly string[];
  readonly technical: { readonly exportContractVersion: "1"; readonly missionDraftContractVersion: "1" };
}

/** Maps only intentional Mission information out of a validated durable result. */
export function createTelegramMissionReport(draft: TelegramMissionDraft, response: LocalWorkflowCommandResponse): TelegramMissionReport {
  const result = object(response.result);
  const planning = object(result?.planning);
  const plan = object(planning?.plan);
  const quality = object(result?.quality);
  const control = object(plan?.control);
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const roles = [...new Set(steps.map((step) => string(object(step)?.primaryAgent && object(object(step)?.primaryAgent)?.agentId)).filter(known))].sort();
  const expectedOutputs = steps.map((step) => string(object(object(step)?.expectedOutput)?.description)).filter(known);
  const remediation = array(quality?.remediationRecommendations).map(string).filter(known);
  const profiles = [
    `${draft.profileSelection?.founderProfileId ?? "—"}@${draft.profileSelection?.founderProfileVersion ?? "—"}`,
    `${draft.profileSelection?.brandProfileId ?? "—"}@${draft.profileSelection?.brandProfileVersion ?? "—"}`,
    ...(draft.profileSelection?.missionTypeProfileId === undefined ? [] : [`${draft.profileSelection.missionTypeProfileId}@${draft.profileSelection.missionTypeProfileVersion ?? "—"}`]),
  ];
  return deepFreeze({
    contractVersion: "1",
    effortClass: string(control?.totalEffortClass),
    expectedOutputs,
    firstAction: string(control?.firstConcreteAction),
    mission: { objective: safe(draft.objective), type: safe(draft.missionType) },
    noExternalActions: true,
    noWorkflow: true,
    profileReferences: profiles,
    quality: { score: string(quality?.totalScore), status: string(quality?.status) },
    remediation,
    selectedRoles: roles,
    technical: { exportContractVersion: "1", missionDraftContractVersion: "1" },
  });
}

export function serializeTelegramMissionReport(report: TelegramMissionReport, format: TelegramMissionReportFormat): string {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  return [
    "# Report Missione", "", `- Stato qualità: ${report.quality.status} (${report.quality.score})`, `- Tipo: ${report.mission.type}`,
    `- Obiettivo: ${report.mission.objective}`, `- Ruoli: ${report.selectedRoles.join(", ") || "—"}`,
    `- Impegno: ${report.effortClass}`, `- Prima azione: ${report.firstAction}`, "", "## Output previsti", ...list(report.expectedOutputs), "", "## Rimedi o chiarimenti", ...list(report.remediation), "", "## Profili versionati", ...list(report.profileReferences), "", "Nessun valore predefinito nascosto è stato applicato.", "La pianificazione non creerà Workflow e non eseguirà azioni esterne.",
  ].join("\n").concat("\n");
}

function array(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function known(value: string): boolean { return value !== "—"; }
function list(values: readonly string[]): readonly string[] { return values.length === 0 ? ["- —"] : values.map((value) => `- ${value}`); }
function object(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function safe(value: unknown): string { return typeof value === "string" && value.length > 0 ? value : "—"; }
function string(value: unknown): string { return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? String(value) : "—"; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
