import { DeterministicQualityGuardian } from "../guardians/quality-guardian-service.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import {
  METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION,
  type ContentEvidence,
  type MetodoVeloceContentProductionBrief,
  type MetodoVeloceContentProductionPackage,
} from "./metodo-veloce-content-production.js";
import { contentClaimRisk, MetodoVeloceContentProductionBriefValidator, MetodoVeloceContentProductionPackageValidator } from "./metodo-veloce-content-production-validator.js";

export class DeterministicMetodoVeloceContentProductionLine {
  readonly #brief = new MetodoVeloceContentProductionBriefValidator();
  readonly #package = new MetodoVeloceContentProductionPackageValidator();
  readonly #quality = new DeterministicQualityGuardian();

  public constructor(private readonly clock: Clock) {}

  public produce(candidate: MetodoVeloceContentProductionBrief): MetodoVeloceContentProductionPackage {
    const brief = validate(candidate, this.#brief, "Content production brief");
    const findings = claimFindings(brief);
    const blocked = findings.length > 0;
    const generatedAt = this.clock.now().toISOString();
    const report = this.#quality.evaluate({ contractVersion: "1", generatedAt, state: { evidenceReferencesPresent: true, evidenceRequired: true, finalResponsePresent: !blocked, humanReviewCompleted: false, humanReviewRequired: true, minimumReadinessScore: 82, modelOutputRejected: false, outputClaimsEvidence: false, readinessScore: blocked ? 0 : 88, rejectedOutputCount: 0, rejectedOutputThreshold: 3, resultWellFormed: true, sourceReferencesPresent: true, taskResultComplete: !blocked, unsafeContentPipelineDetected: blocked, validationFailureCount: 0, validationFailureThreshold: 3 } });
    const result: MetodoVeloceContentProductionPackage = {
      approval: { required: true, status: blocked ? "NOT_ELIGIBLE" : "PENDING_FABIO" },
      contractVersion: METODO_VELOCE_CONTENT_PRODUCTION_CONTRACT_VERSION,
      editorialPlan: { angle: `Un punto pratico su ${brief.topic} senza promesse non verificabili.`, audience: brief.audience, objective: brief.objective, selectedIdea: `Trasforma ${brief.topic} in una decisione concreta prima di parlare di ${brief.offer}.` },
      evidence: { items: brief.evidence, limitations: ["Le evidenze sono dichiarate nel brief e non sono state cercate sul web.", "Qualunque risultato o beneficio ulteriore richiede verifica prima dell'uso esterno."] },
      externalActionsAllowed: false,
      generatedAt,
      metrics: { measures: ["contenuti prodotti", "percentuale approvata", "tempo di produzione", "costo per contenuto", "salvataggi", "visualizzazioni", "lead", "conversioni"], reviewCadence: "weekly" },
      missionReference: brief.missionReference,
      productionId: brief.productionId,
      quality: { readinessScore: blocked ? 0 : 88, report },
      risk: { findings, status: blocked ? "BLOCKED" : "CLEAR" },
      status: blocked ? "BLOCKED" : "READY_FOR_FABIO_APPROVAL",
      version: 1,
      ...(blocked ? {} : { assets: assets(brief) }),
    };
    return validate(result, this.#package, "Content production package");
  }
}

function assets(brief: MetodoVeloceContentProductionBrief) {
  const proof = evidenceLine(brief.evidence[0]);
  const hook = `Prima di ${brief.topic}, controlla questo.`;
  return {
    carousel: [
      slide(1, `Prima di ${brief.topic}`, "Non partire dall'entusiasmo: parti da una decisione che puoi verificare."),
      slide(2, "Il problema", `Molte persone parlano di ${brief.offer} prima di aver chiarito cosa serve davvero al pubblico.`),
      slide(3, "La domanda utile", `Per ${brief.audience}: quale azione concreta deve diventare più semplice?`),
      slide(4, "L'evidenza", proof),
      slide(5, "Il test", `Usa ${brief.topic} per una sola ipotesi, un segnale osservabile e una revisione onesta.`),
      slide(6, "La scelta", "Tieni ciò che è supportato, dichiara ciò che è ancora un'ipotesi."),
      slide(7, "Prossimo passo", brief.callToAction),
    ],
    instagram: { caption: [hook, "", `Se vuoi parlare di ${brief.offer}, prima rendi chiara la scelta da fare.`, proof, "", "Non servono promesse: servono un test piccolo, un dato dichiarato e una prossima azione.", "", brief.callToAction].join("\n"), firstLine: hook, hashtags: ["#metodoveloce", "#contenuti", "#marketing", "#business", "#strategia", "#creator"] },
    tiktok: { beats: [beat(1, "Fermati un attimo", hook), beat(2, "Il problema", `Parlare di ${brief.offer} senza una decisione chiara crea solo rumore.`), beat(3, "Il dato", proof), beat(4, "Il test", `Scegli un'ipotesi su ${brief.topic}, osserva un segnale e correggi.`), beat(5, "Azione", brief.callToAction)], caption: `${hook} ${brief.callToAction}`, durationSeconds: 35 as const, hook },
    variants: { instagramOpeners: [`Il problema con ${brief.topic} non è la mancanza di idee.`, `Prima di promuovere ${brief.offer}, chiarisci questa scelta.`, `Un contenuto utile non ha bisogno di promesse enormi.`], tiktokHooks: [hook, `Se ${brief.topic} non porta a una scelta, stai solo creando rumore.`, `La parte più importante di ${brief.offer} arriva prima della caption.`] },
  };
}

function claimFindings(brief: MetodoVeloceContentProductionBrief): readonly string[] { const findings = [brief.topic, brief.offer, brief.callToAction, ...brief.evidence.map(({ statement }) => statement)].filter(contentClaimRisk).map((value) => `Claim bloccante rilevato: ${value.slice(0, 180)}`); return Object.freeze(findings); }
function evidenceLine(evidence: ContentEvidence | undefined): string { return evidence === undefined ? "Nessuna evidenza disponibile." : `Evidenza dichiarata (${evidence.sourceRef}): ${evidence.statement}`; }
function slide(slide: number, title: string, body: string) { return { body, slide, title }; }
function beat(beat: number, onScreenText: string, spokenText: string) { return { beat, onScreenText, spokenText }; }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new Error(`${label} failed validation`); return result.value; }
