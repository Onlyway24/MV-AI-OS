import { businessDateAt } from "../contracts/business-calendar.js";
import type { DailyOperatingBriefRecord, OperatingDataKind } from "../daily-brief/daily-operating-brief.js";
import type { DailyOperatingBriefService } from "../daily-brief/daily-operating-brief-service.js";
import type { Clock } from "../ports/clock.js";
import type { TelegramOutboundMessageIntent } from "./telegram-contracts.js";

const COMMAND = "/daily_brief";
const MAX_MESSAGE_LENGTH = 3_800;
const BRIEF_ID = /^[a-z0-9][a-z0-9@._-]{0,127}$/u;

export interface TelegramDailyBriefReader {
  generate(businessDate: string): Promise<DailyOperatingBriefRecord>;
  inspect(briefId: string): Promise<DailyOperatingBriefRecord>;
}

export class TelegramDailyBriefConsole {
  public constructor(private readonly dependencies: {
    readonly chatId: string;
    readonly clock: Clock;
    readonly service: DailyOperatingBriefService | TelegramDailyBriefReader;
  }) {}

  public async handle(command: string): Promise<TelegramOutboundMessageIntent> {
    const parsed = parseCommand(command);
    if (parsed === undefined) return this.#intent(`Uso: ${COMMAND} oppure ${COMMAND} <id>.`);
    try {
      const brief = parsed.briefId === undefined
        ? await this.dependencies.service.generate(businessDateAt(this.dependencies.clock.now()))
        : await this.dependencies.service.inspect(parsed.briefId);
      return this.#intent(parsed.briefId === undefined ? formatDailyBriefSummary(brief) : formatDailyBriefDetail(brief));
    } catch {
      return this.#intent("Daily Operating Brief non disponibile. Verifica l'ID o riprova più tardi.");
    }
  }

  #intent(text: string): TelegramOutboundMessageIntent {
    return Object.freeze({ chatId: this.dependencies.chatId, contractVersion: "1", text });
  }
}

export function formatDailyBriefSummary(brief: DailyOperatingBriefRecord): string {
  const { sections } = brief;
  const unavailable = Object.values(sections).filter(({ kind }) => kind === "UNAVAILABLE").length;
  return fit([
    `Daily Operating Brief — ${brief.businessDate}`,
    `Sistema: ${sections.systemHealth.value.status} [${sections.systemHealth.kind}]`,
    `Decisioni Fabio: ${String(sections.recommendedFounderDecisions.value.length)} [${sections.recommendedFounderDecisions.kind}]`,
    `${unavailableOr("Approvazioni", sections.approvalsRequired.kind, String(sections.approvalsRequired.value.length))} · ${unavailableOr("Bloccati", sections.blockedTasks.kind, String(sections.blockedTasks.value.length))}`,
    unavailableOr("Produzione", sections.productionQueue.kind, `${String(sections.productionQueue.value.pendingFabio)} review Fabio · ${String(sections.productionQueue.value.active)} attivi · ${String(sections.productionQueue.value.deadLetter)} dead-letter`),
    unavailableOr("Social", sections.socialIntelligence.kind, `${sections.socialIntelligence.value.status} · ${String(sections.socialIntelligence.value.records)} record · analytics ${String(sections.socialIntelligence.value.analyticsRecords)}`),
    `Sezioni non disponibili: ${String(unavailable)}`,
    `ID: ${brief.briefId}`,
    `Dettaglio: ${COMMAND} ${brief.briefId}`,
    externalEffectStatement(sections.externalActionsPerformed),
  ].join("\n"));
}

export function formatDailyBriefDetail(brief: DailyOperatingBriefRecord): string {
  const { sections } = brief;
  const costs = sections.costsAndBudgets;
  const effects = sections.externalActionsPerformed;
  const decisions = sections.recommendedFounderDecisions.value.slice(0, 5).map((decision) => `  - ${decision.priority} ${safeIdentity(decision.decisionId)}`);
  return fit([
    "Daily Operating Brief — dettaglio",
    `Data: ${brief.businessDate} · ID: ${brief.briefId}`,
    line("Sistema", sections.systemHealth.kind, `${sections.systemHealth.value.status}; scheduler ${sections.systemHealth.value.scheduler}; worker ${sections.systemHealth.value.worker}; kill switch ${sections.systemHealth.value.killSwitch}`),
    line("Completato", sections.workCompleted.kind, `${String(sections.workCompleted.value.length)} elementi`),
    line("In corso", sections.workInProgress.kind, `${String(sections.workInProgress.value.length)} elementi`),
    line("Bloccati", sections.blockedTasks.kind, `${String(sections.blockedTasks.value.length)} elementi`),
    line("Approvazioni", sections.approvalsRequired.kind, `${String(sections.approvalsRequired.value.length)} elementi`),
    line("Produzione", sections.productionQueue.kind, `${String(sections.productionQueue.value.active)} attivi; ${String(sections.productionQueue.value.pendingFabio)} review Fabio; ${String(sections.productionQueue.value.deadLetter)} dead-letter`),
    line("Social", sections.socialIntelligence.kind, `${sections.socialIntelligence.value.status}; ${String(sections.socialIntelligence.value.records)} record; ${String(sections.socialIntelligence.value.analyticsRecords)} analytics`),
    line("Missioni business", sections.businessMissions.kind, `${String(sections.businessMissions.value.length)} elementi`),
    unavailableOr("Costi", costs.kind, `${String(costs.value.measuredCostCents)} cent misurati; ${String(costs.value.estimatedCostCents)} cent stimati; riconciliazione ${costs.value.reconciliation}`),
    line("Evidence", sections.evidenceFreshness.kind, `${String(sections.evidenceFreshness.value.fresh)} fresche; ${String(sections.evidenceFreshness.value.stale)} scadute; ${String(sections.evidenceFreshness.value.total)} totali`),
    unavailableOr("Incidenti", sections.incidents.kind, `${String(sections.incidents.value.length)} elementi`),
    unavailableOr("Backup", sections.backupState.kind, sections.backupState.value.status),
    unavailableOr("Azioni esterne", effects.kind, `${String(effects.value.deployments)} deploy; ${String(effects.value.messages)} messaggi; ${String(effects.value.paidCalls)} chiamate a pagamento; ${String(effects.value.publications)} pubblicazioni; ${String(effects.value.purchases)} acquisti`),
    line("Decisioni Fabio", sections.recommendedFounderDecisions.kind, `${String(sections.recommendedFounderDecisions.value.length)} aperte`),
    ...decisions,
    ...(sections.recommendedFounderDecisions.value.length > decisions.length ? [`  - altre ${String(sections.recommendedFounderDecisions.value.length - decisions.length)}`] : []),
    externalEffectStatement(effects),
  ].join("\n"));
}

function parseCommand(value: string): { readonly briefId?: string } | undefined {
  const parts = value.trim().split(/\s+/u);
  if (parts[0]?.toLowerCase() !== COMMAND || parts.length > 2) return undefined;
  const briefId = parts[1];
  return briefId === undefined ? Object.freeze({}) : BRIEF_ID.test(briefId) ? Object.freeze({ briefId }) : undefined;
}

function line(label: string, kind: OperatingDataKind, value: string): string { return `${label} [${kind}]: ${value}`; }
function unavailableOr(label: string, kind: OperatingDataKind, measuredValue: string): string { return kind === "UNAVAILABLE" ? line(label, kind, "dato non disponibile; gli zeri mostrati non sono misurati") : line(label, kind, measuredValue); }
function externalEffectStatement(effects: DailyOperatingBriefRecord["sections"]["externalActionsPerformed"]): string {
  if (effects.kind === "UNAVAILABLE") return "INTERNAL_ONLY · sola lettura · copertura azioni esterne non disponibile; questo comando non avvia azioni.";
  const total = effects.value.deployments + effects.value.messages + effects.value.paidCalls + effects.value.publications + effects.value.purchases;
  return total === 0
    ? "INTERNAL_ONLY · sola lettura · zero azioni esterne misurate; questo comando non avvia azioni."
    : `INTERNAL_ONLY · sola lettura · ${String(total)} azione/i esterna/e registrata/e; questo comando non ne avvia.`;
}
function safeIdentity(value: string): string { return value.replace(/[^A-Za-z0-9@._:-]/gu, "?").slice(0, 100); }
function fit(value: string): string { return value.length <= MAX_MESSAGE_LENGTH ? value : `${value.slice(0, MAX_MESSAGE_LENGTH - 24).trimEnd()}\n… dettaglio abbreviato.`; }
