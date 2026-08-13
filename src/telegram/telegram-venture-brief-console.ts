import type { FounderPortfolioBrief } from "../venture-holding/venture-domain.js";
import type { VentureBriefService } from "../venture-holding/venture-brief-service.js";
import type { TelegramOutboundMessageIntent } from "./telegram-contracts.js";

const COMMAND = "/venture_brief";
const MAX_MESSAGE_LENGTH = 3_800;
const BRIEF_ID = /^[a-z0-9][a-z0-9@._:-]{0,127}$/u;

export interface TelegramVentureBriefReader {
  inspect(briefId: string): Promise<FounderPortfolioBrief>;
  readLatest(kind: FounderPortfolioBrief["kind"]): Promise<FounderPortfolioBrief>;
}

/** Read-only progressive disclosure of canonical, durable portfolio briefs. */
export class TelegramVentureBriefConsole {
  public constructor(private readonly dependencies: {
    readonly chatId: string;
    readonly service: Pick<VentureBriefService, "inspect" | "readLatest"> | TelegramVentureBriefReader;
  }) {}

  public async handle(command: string): Promise<TelegramOutboundMessageIntent> {
    const parsed = parseCommand(command);
    if (parsed === undefined) return this.#intent(`Uso: ${COMMAND}, ${COMMAND} weekly oppure ${COMMAND} <id>.`);
    try {
      const record = parsed.briefId === undefined ? await this.dependencies.service.readLatest(parsed.kind) : await this.dependencies.service.inspect(parsed.briefId);
      return this.#intent(parsed.briefId === undefined ? formatVentureBriefSummary(record) : formatVentureBriefDetail(record));
    } catch {
      return this.#intent("Venture Brief non disponibile. Verifica l'ID o attendi il prossimo brief H24 locale.");
    }
  }

  #intent(text: string): TelegramOutboundMessageIntent { return Object.freeze({ chatId: this.dependencies.chatId, contractVersion: "1", text }); }
}

export function formatVentureBriefSummary(brief: FounderPortfolioBrief): string {
  return fit([
    `Onlyway Venture Brief — ${brief.kind}`,
    `Aggiornato: ${brief.updatedAt} · v${String(brief.version)}`,
    `Venture report [MEASURED]: ${String(brief.ventureReportIds.length)}`,
    `Opportunità [MEASURED]: ${String(brief.opportunityIds.length)}`,
    `Esperimenti [MEASURED]: ${String(brief.experimentIds.length)}`,
    `Decisioni Fabio [MEASURED]: ${String(brief.founderDecisionIds.length)}`,
    `Blocker [MEASURED]: ${String(brief.blockerCodes.length)}`,
    `Rischi [MEASURED]: ${String(brief.riskCount)}`,
    `Costi: ${brief.costStatus}`,
    "Capitale [NOT_AVAILABLE]: il brief canonico non contiene un totale approvato.",
    `ID: ${brief.briefId}`,
    `Dettaglio: ${COMMAND} ${brief.briefId}`,
    externalEffectsLine(),
    "PROPOSAL_ONLY · PUBLICATION_LOCKED",
  ].join("\n"));
}

export function formatVentureBriefDetail(brief: FounderPortfolioBrief): string {
  return fit([
    `Onlyway Venture Brief — dettaglio ${brief.kind}`,
    `ID: ${brief.briefId} · fingerprint ${brief.fingerprint.slice(0, 16)}…`,
    `Portfolio: ${safeId(brief.portfolioId)} · aggiornato ${brief.updatedAt}`,
    `Venture report: ${ids(brief.ventureReportIds)}`,
    `Opportunità: ${ids(brief.opportunityIds)}`,
    `Esperimenti: ${ids(brief.experimentIds)}`,
    `Blocker: ${ids(brief.blockerCodes)}`,
    `Decisioni Fabio: ${ids(brief.founderDecisionIds)}`,
    `Rischi aggregati [MEASURED]: ${String(brief.riskCount)}`,
    `Costi: ${brief.costStatus}`,
    `Prossime azioni: ${brief.nextActions.length === 0 ? "NOT_AVAILABLE" : String(brief.nextActions.length) + " registrate"}`,
    externalEffectsLine(),
    "INTERNAL_ONLY · EXTERNAL_ACTION_LOCKED · questo comando non avvia job, spese o pubblicazioni.",
  ].join("\n"));
}

function parseCommand(value: string): Readonly<{ readonly briefId?: string; readonly kind: "DAILY" | "WEEKLY" }> | undefined {
  const parts = value.trim().split(/\s+/u);
  if (parts[0]?.toLowerCase() !== COMMAND || parts.length > 2) return undefined;
  const argument = parts[1];
  if (argument === undefined) return Object.freeze({ kind: "DAILY" as const });
  if (argument.toLowerCase() === "weekly") return Object.freeze({ kind: "WEEKLY" as const });
  return BRIEF_ID.test(argument) ? Object.freeze({ briefId: argument, kind: "DAILY" as const }) : undefined;
}

function ids(values: readonly string[]): string { return values.length === 0 ? "NOT_AVAILABLE" : values.slice(0, 8).map(safeId).join(" · ") + (values.length > 8 ? ` · +${String(values.length - 8)}` : ""); }
function externalEffectsLine(): string { return "Effetti esterni [MEASURED]: zero."; }
function safeId(value: string): string { return value.replace(/[^A-Za-z0-9@._:-]/gu, "?").slice(0, 100); }
function fit(value: string): string { return value.length <= MAX_MESSAGE_LENGTH ? value : `${value.slice(0, MAX_MESSAGE_LENGTH - 24).trimEnd()}\n… dettaglio abbreviato.`; }
