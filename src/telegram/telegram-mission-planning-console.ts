import { DEFAULT_AGENT_COMPANY_MAP } from "../assistants/agent-company-specification.js";
import { DeterministicFounderMissionConverter } from "../missions/mission-conversion-context.js";
import type { LocalRuntime } from "../runtime/local-runtime.js";
import type { Clock } from "../ports/clock.js";
import type { TelegramOutboundMessageIntent } from "./telegram-contracts.js";
import type { TelegramMissionDraftSessionCommand, TelegramMissionDraftSessionSnapshot } from "./telegram-mission-draft-session-coordinator.js";
import { TelegramMissionDraftSessionCoordinator } from "./telegram-mission-draft-session-coordinator.js";
import type { TelegramMissionDraft, TelegramMissionDraftField } from "./telegram-mission-draft.js";
import type { TelegramMissionDraftOperation, TelegramMissionDraftOperationKind } from "./telegram-mission-draft-state-engine.js";
import type { TelegramSqliteStateStore } from "./telegram-sqlite-state-store.js";
import { isTelegramMissionTemplateIntact, TELEGRAM_MISSION_TEMPLATE_REGISTRY, type TelegramMissionTemplate } from "./telegram-mission-templates.js";

const REQUIRED_FIELDS: readonly TelegramMissionDraftField[] = ["OBJECTIVE", "MISSION_TYPE", "AUDIENCE", "DELIVERABLES", "DEADLINE", "BUDGET", "SUCCESS_METRICS", "KNOWN_FACTS", "PROFILE_SELECTION"];
const FIELD_NAMES: Readonly<Record<TelegramMissionDraftField, string>> = {
  APPROVAL_POLICY: "politica di approvazione", ASSUMPTIONS: "assunzioni", AUDIENCE: "pubblico", BUDGET: "budget", CONSTRAINTS: "vincoli", DEADLINE: "scadenza", DELIVERABLES: "output attesi", EXTERNAL_ACTIONS: "azioni esterne proposte", KNOWN_FACTS: "fatti noti", MISSION_TYPE: "tipo Missione", OBJECTIVE: "obiettivo", OBJECTIVE_DETAILS: "dettagli dell'obiettivo", PROFILE_SELECTION: "profili", SUCCESS_METRICS: "metriche di successo", UNKNOWNS: "incognite",
};

export class TelegramMissionPlanningConsole {
  readonly #converter = new DeterministicFounderMissionConverter();
  public constructor(private readonly input: { readonly actorId: string; readonly chatId: string; readonly clock: Clock; readonly coordinator: TelegramMissionDraftSessionCoordinator; readonly runtime: LocalRuntime; readonly state: TelegramSqliteStateStore; readonly templates?: readonly TelegramMissionTemplate[]; readonly workspaceId: string }) {}

  public async handle(identity: string, updateId: string, text: string): Promise<TelegramOutboundMessageIntent> {
    const command = text.trim();
    if (command === "/mission quick" || command === "/mission templates") return this.#templates();
    const session = this.input.state.startSession(identity, this.input.actorId, this.input.workspaceId, 3_600);
    if (command === "/mission" || command === "/mission home") return this.#home(identity);
    if (command === "/mission start") return this.#open(identity, session, false);
    if (command === "/mission restart") return this.#open(identity, session, true);
    if (command.startsWith("/mission template ")) return this.#template(identity, updateId, command.slice("/mission template ".length).trim(), session);
    if (command === "aiuto" || command === "/mission help") { const snapshot = this.#read(identity); return this.#message(helpFor(snapshot?.draft.currentField ?? "OBJECTIVE")); }
    if (command === "indietro" || command === "/mission back") return this.#back(identity, updateId);
    if (command.startsWith("/mission edit ")) return this.#edit(identity, command.slice("/mission edit ".length).trim(), updateId);
    const snapshot = this.#read(identity);
    if (snapshot === undefined && (/^[{[]/u.test(command))) {
      await this.#open(identity, session, false);
      const started = this.#read(identity);
      return started === undefined ? this.#message("Non è stato possibile avviare la Missione.") : this.#applyField(started, updateId, command);
    }
    if (snapshot === undefined) return this.#message("Non c'è una Missione attiva. Apri /mission e scegli Nuova missione.");
    if (snapshot.draft.status === "CONFIRMED") return this.#planningPrompt(snapshot);
    if (snapshot.draft.status === "PLANNING_AUTHORIZED") return this.#plan(snapshot);
    if (snapshot.draft.status !== "COLLECTING") return this.#message("La Missione è in revisione. Usa /mission per proseguire o /mission edit <campo> per modificare.");
    return this.#applyField(snapshot, updateId, command);
  }

  #home(identity: string): TelegramOutboundMessageIntent {
    const snapshot = this.#read(identity);
    if (snapshot?.draft.status === "PLANNING_AUTHORIZED") {
      const result = this.input.state.readMissionResult(snapshot.draft.draftId);
      if (result !== undefined) return this.#message(formatPlan(snapshot.draft.objective ?? "—", snapshot.draft.missionType ?? "—", result.response.result));
    }
    const diagnostics = this.input.state.diagnostics();
    const actions = ["Nuova missione: /mission start", "Avvio rapido: /mission quick", "Guida: /mission help", "Stato: /status"];
    if (snapshot !== undefined && ["COLLECTING", "REVIEW_READY", "CONFIRMED"].includes(snapshot.draft.status)) actions.splice(2, 0, "Riprendi missione: /mission start");
    if (diagnostics.completedResults > 0) actions.splice(actions.length - 1, 0, "Ultimo risultato: /mission start");
    return this.#message(["Mission Console", "Pianificazione locale, non esecutiva.", "Per iniziare una Missione — obiettivo: scegli Nuova missione.", "", ...actions.map((action) => `• ${action}`), "", "Nessun valore predefinito nascosto è stato applicato.", "La pianificazione non creerà Workflow e non eseguirà azioni esterne."].join("\n"));
  }

  #templates(): TelegramOutboundMessageIntent {
    const templates = this.#templatesRegistry();
    if (!templates.every(isTelegramMissionTemplateIntact)) return this.#message("Template non disponibile o non integro. Torna a /mission.");
    return this.#message(["Avvio rapido — template espliciti", ...templates.map((template) => `• ${template.label} (${template.id}@${template.version})`), "", "Usa /mission template <id> per applicare oppure /mission template <id> details per leggere i dettagli.", "Ogni template è un acceleratore versionato, non un valore predefinito nascosto."].join("\n"));
  }

  async #template(identity: string, updateId: string, requested: string, session: { readonly sessionId: string; readonly version: number; readonly expiresAt: string; readonly state: string }): Promise<TelegramOutboundMessageIntent> {
    const details = requested.endsWith(" details"); const id = details ? requested.slice(0, -8).trim() : requested;
    const template = this.#templatesRegistry().find((entry) => entry.id === id);
    if (template === undefined || !isTelegramMissionTemplateIntact(template)) return this.#message("Template non disponibile o non integro. Torna a /mission quick.");
    if (details) return this.#message([`${template.label} — ${template.id}@${template.version}`, template.description, `Profili: ${template.founderProfile.founderProfileId}; ${template.founderProfile.brandProfileId}`, `Fornisce: ${template.suppliedFields.join(", ")}`, `Fabio deve ancora fornire: ${template.requiredOperatorFields.join(", ")}`, "Non è un valore predefinito nascosto."].join("\n"));
    if (this.#read(identity) !== undefined) return this.#message("C'è già una Missione attiva. Usa /mission restart prima di cambiare template.");
    await this.#open(identity, session, false);
    let snapshot = this.#read(identity);
    if (snapshot === undefined) return this.#message("Impossibile avviare la Missione dal template.");
    const type = this.input.coordinator.apply(this.#command(snapshot, this.#operation(snapshot, `tg-template-type-${updateId}`, "UPDATE_MISSION_TYPE", { missionType: template.missionType })));
    if (!type.ok) return this.#message("Il template non può essere applicato in questo stato.");
    snapshot = this.#read(identity);
    if (snapshot === undefined) return this.#message("Il template non può essere applicato in questo stato.");
    const profile = this.input.coordinator.apply(this.#command(snapshot, this.#operation(snapshot, `tg-template-profile-${updateId}`, "UPDATE_PROFILE_SELECTION", { profileSelection: template.founderProfile })));
    if (!profile.ok) return this.#message("Il template non può essere applicato in questo stato.");
    snapshot = this.#read(identity);
    return snapshot === undefined ? this.#message("Il template non può essere applicato in questo stato.") : this.#prompt(snapshot, `${template.label} applicato (${template.id}@${template.version}). Nessun valore materiale è stato inserito.`);
  }

  public async handleCallback(identity: string, token: string): Promise<TelegramOutboundMessageIntent> {
    const applied = this.input.coordinator.applyCallback(token, identity);
    if (!applied.ok) return this.#message("Conferma non valida o non più attuale. Riapri /mission.");
    const snapshot = this.#read(identity);
    if (snapshot === undefined) return this.#message("La sessione Missione non è più disponibile.");
    if (snapshot.draft.status === "CONFIRMED") return this.#planningPrompt(snapshot, "Dati Missione confermati. Nessuna pianificazione è stata ancora eseguita.");
    if (snapshot.draft.status === "PLANNING_AUTHORIZED") return this.#plan(snapshot);
    return this.#message("Azione Missione registrata.");
  }

  public cancel(identity: string, updateId: string): TelegramOutboundMessageIntent {
    const snapshot = this.#read(identity);
    if (snapshot === undefined || ["CANCELLED", "CONFIRMED", "EXPIRED", "PLANNING_AUTHORIZED"].includes(snapshot.draft.status)) return this.#message("Non c'è una Missione modificabile da annullare.");
    this.input.coordinator.cancel(snapshot, `tg-cancel-${updateId}`);
    return this.#message("Missione annullata. I dati raccolti sono stati minimizzati.");
  }

  async #open(identity: string, session: { readonly sessionId: string; readonly version: number; readonly expiresAt: string; readonly state: string }, restart: boolean): Promise<TelegramOutboundMessageIntent> {
    const active = this.#read(identity);
    if (active !== undefined && !restart) {
      if (active.draft.status === "CONFIRMED") return this.#planningPrompt(active);
      if (active.draft.status === "PLANNING_AUTHORIZED") return this.#plan(active);
      if (active.draft.status === "REVIEW_READY" && active.draft.reviewContextFingerprint !== undefined) return this.#draftConfirmationPrompt(active, active.draft.reviewContextFingerprint);
      return this.#prompt(active);
    }
    if (restart && !["CANCELLED", "COMPLETED", "EXPIRED", "RESULT_REVIEW"].includes(session.state)) return this.#message("Il riavvio richiede una Missione terminata. Usa /cancel_action per annullare quella corrente.");
    const now = this.input.clock.now().toISOString();
    const version = session.version + 1;
    const draft: TelegramMissionDraft = { actorId: this.input.actorId, assumptions: [], authorizedIdentityHash: identity, constraints: [], contractVersion: "1", createdAt: now, currentField: "OBJECTIVE", draftId: `mission-draft-${String(version)}`, expiresAt: session.expiresAt, proposedExternalActions: [], sessionId: session.sessionId, status: "COLLECTING", unknowns: [], updatedAt: now, version, workspaceId: this.input.workspaceId };
    const snapshot = restart ? this.input.coordinator.restart(identity, draft, true) : this.input.coordinator.start(identity, draft);
    return this.#prompt(snapshot, restart ? "Nuova Missione avviata dopo il riavvio esplicito." : "Creiamo una Missione strutturata.");
  }

  #edit(identity: string, requested: string, updateId: string): TelegramOutboundMessageIntent {
    const snapshot = this.#read(identity);
    const field = requested.toUpperCase().replace(/-/gu, "_") as TelegramMissionDraftField;
    if (snapshot === undefined || !["COLLECTING", "REVIEW_READY"].includes(snapshot.draft.status) || !REQUIRED_FIELDS.includes(field)) return this.#message("Campo non modificabile. Usa: objective, mission_type, audience, deliverables, deadline, budget, success_metrics, known_facts, profile_selection.");
    const operation = this.#operation(snapshot, `tg-edit-${updateId}`, "RETURN_TO_COLLECTING", { currentField: field });
    this.input.coordinator.apply({ ...this.#command(snapshot, operation), coordinationKind: "MOVE_BACK" });
    const current = this.#read(identity);
    return current === undefined ? this.#message("Impossibile riaprire la Missione.") : this.#prompt(current, `Modifica: ${FIELD_NAMES[field]}.`);
  }

  #back(identity: string, updateId: string): TelegramOutboundMessageIntent {
    const snapshot = this.#read(identity);
    if (snapshot === undefined || !["COLLECTING", "REVIEW_READY"].includes(snapshot.draft.status)) return this.#message("Non è possibile tornare indietro in questo stato Missione.");
    this.input.coordinator.moveBackward(snapshot, `tg-back-${updateId}`);
    const current = this.#read(identity);
    return current === undefined ? this.#message("Impossibile aggiornare la navigazione Missione.") : this.#prompt(current, "Tornato al campo precedente.");
  }

  #applyField(snapshot: TelegramMissionDraftSessionSnapshot, updateId: string, text: string): TelegramOutboundMessageIntent {
    const field = snapshot.draft.currentField;
    const parsed = parseField(field, text);
    if (parsed === undefined) return this.#message(`Formato non valido per ${FIELD_NAMES[field]}. ${fieldHelp(field)}`);
    let current = snapshot;
    for (const [index, entry] of parsed.entries()) {
      const operation = this.#operation(current, `tg-field-${updateId}-${String(index + 1)}`, entry.kind, entry.payload);
      const result = this.input.coordinator.apply(this.#command(current, operation));
      if (!result.ok) return this.#message("Aggiornamento rifiutato: la Missione è cambiata o il valore non è valido.");
      current = this.#read(current.session.identityBinding) ?? current;
    }
    const next = nextField(current.draft);
    if (next !== undefined) {
      const operation = this.#operation(current, `tg-next-${updateId}`, "SET_CURRENT_FIELD", { currentField: next });
      this.input.coordinator.apply(this.#command(current, operation));
      const updated = this.#read(current.session.identityBinding);
      return updated === undefined ? this.#message("Aggiornamento registrato.") : this.#prompt(updated, "Valore registrato.");
    }
    const readiness = this.#converter.evaluateReadiness(current.draft, current.draft.updatedAt);
    if (readiness.status !== "READY" || readiness.context === undefined) return this.#message(`Missione incompleta: ${readiness.findings.map((finding) => finding.telegramField).join(", ")}. Usa /mission edit <campo>.`);
    this.input.coordinator.openReview(current, `tg-review-${updateId}`);
    const reviewing = this.#read(current.session.identityBinding);
    if (reviewing === undefined) return this.#message("Revisione non disponibile.");
    this.input.coordinator.markReviewReady(reviewing, `tg-review-ready-${updateId}`, readiness.context.profileFingerprint);
    const ready = this.#read(current.session.identityBinding);
    return ready === undefined ? this.#message("Revisione non disponibile.") : this.#draftConfirmationPrompt(ready, readiness.context.profileFingerprint);
  }

  #draftConfirmationPrompt(snapshot: TelegramMissionDraftSessionSnapshot, contextFingerprint: string): TelegramOutboundMessageIntent {
    const callback = this.input.coordinator.issueCallback(this.#command(snapshot, this.#operation(snapshot, `tg-confirm-${snapshot.draft.draftId}-${String(snapshot.draft.version)}`, "CONFIRM_DRAFT", { contextFingerprint }), "CONFIRM"), snapshot.session.expiresAt);
    return this.#message(`${review(snapshot.draft)}\n\nConferma i dati raccolti. Questa azione non genera alcun piano.`, [{ callbackData: callback.token, text: "Conferma dati Missione" }]);
  }

  #planningPrompt(snapshot: TelegramMissionDraftSessionSnapshot, prefix = "Dati Missione confermati."): TelegramOutboundMessageIntent {
    const readiness = this.#converter.evaluateReadiness(snapshot.draft, snapshot.draft.updatedAt);
    if (readiness.status !== "READY" || readiness.context === undefined) return this.#message("Il contesto Missione non è più valido. Usa /mission edit <campo>.");
    const callback = this.input.coordinator.issueCallback(this.#command(snapshot, this.#operation(snapshot, `tg-plan-${snapshot.draft.draftId}-${String(snapshot.draft.version)}`, "AUTHORIZE_PLANNING", { contextFingerprint: readiness.context.profileFingerprint }), "AUTHORIZE_PLANNING"), snapshot.session.expiresAt);
    return this.#message(`${prefix}\n\nGenera il piano deterministico e il Quality Gate? Nessun Workflow verrà creato.`, [{ callbackData: callback.token, text: "Genera piano Missione" }]);
  }

  async #plan(snapshot: TelegramMissionDraftSessionSnapshot): Promise<TelegramOutboundMessageIntent> {
    const draft = planningSourceDraft(snapshot.draft);
    const readiness = this.#converter.evaluateReadiness(draft, draft.updatedAt);
    if (readiness.status !== "READY" || readiness.context === undefined || readiness.context.profileFingerprint !== snapshot.draft.planningContextFingerprint) return this.#message("La Missione autorizzata non supera più la validazione. Nessun piano è stato generato.");
    const conversion = this.#converter.convert(draft, readiness.context);
    if (!conversion.ok || this.input.runtime.executeWorkflowCommand === undefined) return this.#message("La Missione non supera la validazione locale. Nessun piano è stato generato.");
    const commandId = `telegram-plan-${snapshot.draft.draftId}`;
    await this.input.runtime.executeWorkflowCommand({ actorId: this.input.actorId, commandId: `telegram-create-${snapshot.draft.draftId}`, contractVersion: "1", input: { brief: conversion.value.brief }, operation: "CREATE_MISSION", workspaceId: this.input.workspaceId });
    const planned = await this.input.runtime.executeWorkflowCommand({ actorId: this.input.actorId, commandId, contractVersion: "1", input: { brief: conversion.value.brief }, operation: "PLAN_MISSION", workspaceId: this.input.workspaceId });
    return this.#message(formatPlan(conversion.value.brief.objective.statement, conversion.value.brief.missionType, planned.result));
  }

  #read(identity: string): TelegramMissionDraftSessionSnapshot | undefined { try { return this.input.coordinator.read(identity); } catch { return undefined; } }
  #templatesRegistry(): readonly TelegramMissionTemplate[] { return this.input.templates ?? TELEGRAM_MISSION_TEMPLATE_REGISTRY; }
  #operation(snapshot: TelegramMissionDraftSessionSnapshot, operationId: string, kind: TelegramMissionDraftOperationKind, payload?: Readonly<Record<string, unknown>>): TelegramMissionDraftOperation { return { actorId: snapshot.session.actorId, authorizedIdentityHash: snapshot.session.identityBinding, contractVersion: "1", draftId: snapshot.draft.draftId, expectedVersion: snapshot.draft.version, kind, operationId, sessionId: snapshot.session.sessionId, workspaceId: snapshot.session.workspaceId, ...(payload === undefined ? {} : { payload }) } as TelegramMissionDraftOperation; }
  #command(snapshot: TelegramMissionDraftSessionSnapshot, operation: TelegramMissionDraftOperation, coordinationKind: TelegramMissionDraftSessionCommand["coordinationKind"] = "APPLY_FIELD"): TelegramMissionDraftSessionCommand { return { actorId: snapshot.session.actorId, authorizedIdentityHash: snapshot.session.identityBinding, contractVersion: "1", coordinationKind, expectedDraftVersion: snapshot.draft.version, expectedSessionVersion: snapshot.session.version, operation, sessionId: snapshot.session.sessionId, workspaceId: snapshot.session.workspaceId }; }
  #prompt(snapshot: TelegramMissionDraftSessionSnapshot, prefix?: string): TelegramOutboundMessageIntent { const step = REQUIRED_FIELDS.indexOf(snapshot.draft.currentField) + 1; return this.#message(`${prefix === undefined ? "" : `${prefix}\n\n`}Sezione ${section(snapshot.draft.currentField)} · Passo ${String(Math.max(1, step))}/${String(REQUIRED_FIELDS.length)}\n${fieldHelp(snapshot.draft.currentField)}\n\nScrivi “aiuto” per una spiegazione contestuale. Usa /cancel_action per annullare.`); }
  #message(text: string, buttons?: TelegramOutboundMessageIntent["buttons"]): TelegramOutboundMessageIntent { return { chatId: this.input.chatId, contractVersion: "1", text: text.slice(0, 3_900), ...(buttons === undefined ? {} : { buttons }) }; }
}

function nextField(draft: TelegramMissionDraft): TelegramMissionDraftField | undefined {
  if (draft.objective === undefined || draft.objectiveDetails === undefined) return "OBJECTIVE";
  if (draft.missionType === undefined) return "MISSION_TYPE";
  if (draft.audience === undefined) return "AUDIENCE";
  if (draft.deliverables === undefined) return "DELIVERABLES";
  if (draft.deadline === undefined) return "DEADLINE";
  if (draft.budget === undefined) return "BUDGET";
  if (draft.successMetrics === undefined) return "SUCCESS_METRICS";
  if (draft.knownFacts === undefined) return "KNOWN_FACTS";
  if (draft.profileSelection === undefined) return "PROFILE_SELECTION";
  return undefined;
}

function parseField(field: TelegramMissionDraftField, input: string): readonly { readonly kind: TelegramMissionDraftOperationKind; readonly payload: Readonly<Record<string, unknown>> }[] | undefined {
  if (field === "MISSION_TYPE") return /^[a-z_]{3,64}$/u.test(input) ? [{ kind: "UPDATE_MISSION_TYPE", payload: { missionType: input } }] : undefined;
  const value = parseJson(input); if (value === undefined) return undefined;
  switch (field) {
    case "OBJECTIVE": return record(value) && typeof value.statement === "string" ? [{ kind: "UPDATE_OBJECTIVE", payload: { objective: value.statement } }, { kind: "UPDATE_OBJECTIVE_DETAILS", payload: { objectiveDetails: value } }] : undefined;
    case "AUDIENCE": return [{ kind: "UPDATE_AUDIENCE", payload: { audience: value } }];
    case "DELIVERABLES": return [{ kind: "UPDATE_DELIVERABLES", payload: { deliverables: value } }];
    case "DEADLINE": return [{ kind: "UPDATE_DEADLINE", payload: { deadline: value } }];
    case "BUDGET": return [{ kind: "UPDATE_BUDGET", payload: { budget: value } }];
    case "SUCCESS_METRICS": return [{ kind: "REPLACE_SUCCESS_METRICS", payload: { successMetrics: value } }];
    case "KNOWN_FACTS": return [{ kind: "REPLACE_KNOWN_FACTS", payload: { knownFacts: value } }];
    case "PROFILE_SELECTION": return [{ kind: "UPDATE_PROFILE_SELECTION", payload: { profileSelection: value } }];
    default: return undefined;
  }
}

function fieldHelp(field: TelegramMissionDraftField): string {
  const examples: Partial<Record<TelegramMissionDraftField, string>> = {
    OBJECTIVE: 'Invia JSON: {"statement":"...","purpose":"...","desiredOutcome":"...","businessValues":["help_fabio_make_money"]}',
    MISSION_TYPE: "Invia uno tra: business_opportunity, market_research, content_strategy, product_or_offer_design, software_development, internal_operations, quality_improvement, risk_review, monetization_experiment, customer_delivery_preparation.",
    AUDIENCE: 'Invia JSON: {"description":"...","market":"...","segments":["..."]}',
    DELIVERABLES: 'Invia JSON: [{"deliverableId":"output-1","title":"...","description":"...","format":"...","acceptanceCriteria":["..."]}]',
    DEADLINE: 'Invia JSON: {"status":"unknown","timezone":"Europe/Rome"} oppure {"status":"known","dueAt":"2026-08-01T12:00:00.000Z","timezone":"Europe/Rome"}',
    BUDGET: 'Invia JSON: {"status":"unknown"} oppure {"status":"known","currency":"EUR","maximumAmount":1000}',
    SUCCESS_METRICS: 'Invia JSON: [{"metricId":"metric-1","measurement":"...","target":"...","evidenceRequired":"..."}]',
    KNOWN_FACTS: 'Invia JSON: [{"factId":"fact-1","statement":"..."}]',
    PROFILE_SELECTION: 'Invia JSON: {"founderProfileId":"only-way-founder-preferences@1.0.0","founderProfileVersion":"1.0.0","brandProfileId":"metodo-veloce@1.0.0","brandProfileVersion":"1.0.0"}',
  };
  return `Missione — ${FIELD_NAMES[field]}.\n${examples[field] ?? "Invia un valore strutturato valido."}`;
}

function helpFor(field: TelegramMissionDraftField): string { return [`Aiuto — ${FIELD_NAMES[field]}`, "Perché serve: rende il piano verificabile e non introduce supposizioni nascoste.", fieldHelp(field), "Valori vuoti, duplicati, testo di comando e dati personali non sono accettati.", field === "PROFILE_SELECTION" ? "I profili sono versionati e dichiarati: non sono identità Telegram." : "Questo valore è fornito da Fabio; non viene ottenuto dalla cronologia Telegram."].join("\n"); }
function section(field: TelegramMissionDraftField): string { if (["OBJECTIVE", "MISSION_TYPE"].includes(field)) return "Obiettivo e tipo"; if (["AUDIENCE", "DELIVERABLES"].includes(field)) return "Pubblico e deliverable"; if (["DEADLINE", "BUDGET"].includes(field)) return "Scadenza e budget"; if (["SUCCESS_METRICS", "KNOWN_FACTS"].includes(field)) return "Metriche ed evidenze"; return "Profili e regole"; }

function review(draft: TelegramMissionDraft): string { return `Riepilogo Missione\nObiettivo: ${draft.objective ?? "—"}\nTipo: ${draft.missionType ?? "—"}\nPubblico: ${draft.audience?.description ?? "—"}\nOutput: ${draft.deliverables?.map((entry) => entry.title).join(", ") ?? "—"}\nScadenza: ${draft.deadline?.status ?? "—"}\nBudget: ${draft.budget?.status ?? "—"}\nProfili: ${draft.profileSelection?.founderProfileId ?? "—"} / ${draft.profileSelection?.brandProfileId ?? "—"}`; }

function formatPlan(objective: string, missionType: string, raw: unknown): string {
  if (!record(raw)) return "Il piano non è disponibile. Nessun Workflow è stato creato e nessuna azione esterna è stata eseguita.";
  const planning = record(raw.planning) ? raw.planning : undefined; const plan = planning !== undefined && record(planning.plan) ? planning.plan : undefined; const quality = record(raw.quality) ? raw.quality : undefined;
  if (plan === undefined) return `Mission status: ${string(raw.status)}\nObiettivo: ${objective}\nChiarimenti o remediation: ${planning === undefined ? "necessari" : string(planning.status)}\n\nNessun Workflow è stato creato e nessuna azione esterna è stata eseguita.`;
  const steps = Array.isArray(plan.steps) ? plan.steps.map((step) => record(step) ? `${string(step.order)}. ${string(step.title)} — ${string(step.primaryAgent && record(step.primaryAgent) ? step.primaryAgent.agentId : "")}` : "").filter(Boolean).join("\n") : "—";
  const control = record(plan.control) ? plan.control : {};
  const roles = [...new Set(Array.isArray(plan.steps) ? plan.steps.flatMap((step) => record(step) && record(step.primaryAgent) ? [string(step.primaryAgent.agentId)] : []) : [])].join(", ") || DEFAULT_AGENT_COMPANY_MAP.roles.slice(0, 0).map((role) => role.displayName).join(", ");
  return `Mission status: ${string(raw.status)}\nObiettivo: ${objective}\nTipo Missione: ${missionType}\nRuoli Agent Company: ${roles}\n\nPassi del piano:\n${steps}\n\nOutput attesi: ${Array.isArray(plan.steps) ? plan.steps.map((step) => record(step) && record(step.expectedOutput) ? string(step.expectedOutput.description) : "").filter(Boolean).join("; ") : "—"}\nApprovazioni: ${Array.isArray(control.approvalQueue) && control.approvalQueue.length > 0 ? "richieste" : "nessuna nel piano"}\nGuardian: ${Array.isArray(control.guardianReviewQueue) ? control.guardianReviewQueue.map((entry) => record(entry) && Array.isArray(entry.domains) ? entry.domains.map(string).join(", ") : "").filter(Boolean).join("; ") : "—"}\nImpegno e costo: ${string(control.totalEffortClass)} / ${string(control.totalCostClass)}\nQuality Gate: ${quality === undefined ? "—" : `${string(quality.totalScore)} — ${string(quality.status)}`}\nRemediation o chiarimenti: ${quality !== undefined && Array.isArray(quality.remediationRecommendations) ? quality.remediationRecommendations.map(string).join("; ") || "nessuno" : "nessuno"}\nPrima azione concreta: ${string(control.firstConcreteAction)}\n\nNessun Workflow è stato creato e nessuna azione esterna è stata eseguita.`;
}

function parseJson(value: string): unknown { if (value.length > 1_800) return undefined; try { return JSON.parse(value) as unknown; } catch { return undefined; } }
function planningSourceDraft(draft: TelegramMissionDraft): TelegramMissionDraft { const confirmed = structuredClone(draft) as TelegramMissionDraft & { planningContextFingerprint?: string }; delete confirmed.planningContextFingerprint; return { ...confirmed, status: "CONFIRMED", updatedAt: draft.confirmedAt ?? draft.updatedAt, version: draft.version - 1 }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function string(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value) : "—"; }
