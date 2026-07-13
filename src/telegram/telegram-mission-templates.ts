import { createHash } from "node:crypto";

import type { FounderMissionType } from "../missions/founder-mission-brief.js";
import type { TelegramMissionProfileSelection } from "./telegram-mission-draft.js";

/**
 * Explicit, immutable accelerators for the Mission console.  A template only
 * supplies structural values that are already part of the public Mission
 * contract; material business facts always remain operator input.
 */
export interface TelegramMissionTemplate {
  readonly contractVersion: "1";
  readonly description: string;
  readonly fingerprint: string;
  readonly founderProfile: TelegramMissionProfileSelection;
  readonly id: string;
  readonly label: string;
  readonly missionType: FounderMissionType;
  readonly requiredOperatorFields: readonly string[];
  readonly suppliedFields: readonly string[];
  readonly version: "1.0.0";
}

const definitions: readonly Omit<TelegramMissionTemplate, "fingerprint">[] = [
  {
    contractVersion: "1",
    description: "Struttura una Missione commerciale Metodo Veloce senza introdurre dati di mercato o obiettivi impliciti.",
    founderProfile: profile("metodo-veloce@1.0.0"),
    id: "metodo-veloce-content-plan",
    label: "Piano contenuti Metodo Veloce",
    missionType: "content_strategy",
    requiredOperatorFields: required(),
    suppliedFields: ["tipo Missione", "profili versionati"],
    version: "1.0.0",
  },
  {
    contractVersion: "1",
    description: "Prepara un'analisi di opportunità con profilo Metodo Veloce, senza assumere mercato, budget o soglie.",
    founderProfile: profile("metodo-veloce@1.0.0"),
    id: "metodo-veloce-opportunity-analysis",
    label: "Analisi opportunità Metodo Veloce",
    missionType: "business_opportunity",
    requiredOperatorFields: required(),
    suppliedFields: ["tipo Missione", "profili versionati"],
    version: "1.0.0",
  },
  {
    contractVersion: "1",
    description: "Imposta una Missione di sviluppo interno usando esclusivamente il profilo MV-AI-OS già registrato.",
    founderProfile: profile("mv-ai-os@1.0.0"),
    id: "mv-ai-os-development",
    label: "Sviluppo MV-AI-OS",
    missionType: "software_development",
    requiredOperatorFields: required(),
    suppliedFields: ["tipo Missione", "profili versionati"],
    version: "1.0.0",
  },
  {
    contractVersion: "1",
    description: "Imposta una revisione di rischio non esecutiva con profilo MV-AI-OS.",
    founderProfile: profile("mv-ai-os@1.0.0"),
    id: "mv-ai-os-risk-review",
    label: "Revisione rischio o qualità",
    missionType: "risk_review",
    requiredOperatorFields: required(),
    suppliedFields: ["tipo Missione", "profili versionati"],
    version: "1.0.0",
  },
];

export const TELEGRAM_MISSION_TEMPLATE_REGISTRY: readonly TelegramMissionTemplate[] = Object.freeze(
  definitions.map((definition) => Object.freeze({ ...definition, fingerprint: fingerprint(definition) })),
);

export function telegramMissionTemplate(id: string): TelegramMissionTemplate | undefined {
  return TELEGRAM_MISSION_TEMPLATE_REGISTRY.find((entry) => entry.id === id);
}

/** Fails closed if an entry is altered without a new immutable identity/version. */
export function isTelegramMissionTemplateIntact(template: TelegramMissionTemplate): boolean {
  const { fingerprint: saved, ...definition } = template;
  return saved === fingerprint(definition);
}

function profile(brandProfileId: string): TelegramMissionProfileSelection {
  return Object.freeze({
    brandProfileId,
    brandProfileVersion: "1.0.0",
    founderProfileId: "only-way-founder-preferences@1.0.0",
    founderProfileVersion: "1.0.0",
  });
}
function required(): readonly string[] {
  return Object.freeze(["obiettivo", "pubblico", "output attesi", "scadenza", "budget", "metriche", "fatti noti"]);
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
