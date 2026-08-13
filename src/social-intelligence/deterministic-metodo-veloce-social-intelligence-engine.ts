import type { ContentCarouselSlide } from "../content-production/metodo-veloce-content-production.js";
import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import {
  METODO_VELOCE_SOCIAL_INTELLIGENCE_CONTRACT_VERSION,
  SOCIAL_OPPORTUNITY_CRITERIA,
  type MetodoVeloceSocialIntelligenceRequest,
  type SocialDataKind,
  type SocialHashtagCandidate,
  type SocialOpportunityCriterion,
  type SocialOpportunityCriterionResult,
  type SocialOpportunityDecision,
  type SocialPublishingPack,
  type SocialPublishingPackStatus,
} from "./metodo-veloce-social-intelligence.js";
import {
  MetodoVeloceSocialIntelligenceRequestValidator,
  SocialPublishingPackValidator,
  socialPublishingPackFingerprint,
} from "./metodo-veloce-social-intelligence-validator.js";

export const SOCIAL_OPPORTUNITY_WEIGHTS: Readonly<Record<SocialOpportunityCriterion, number>> = Object.freeze({
  AUDIENCE_DEMAND: 15,
  BRAND_FIT: 10,
  CLAIM_SAFETY: 5,
  COMPETITOR_GAP: 8,
  CONVERSION_POTENTIAL: 10,
  DISTINCTIVENESS: 7,
  EVIDENCE_STRENGTH: 10,
  FATIGUE_RESILIENCE: 5,
  FRESHNESS: 5,
  PRACTICAL_VALUE: 10,
  PRODUCTION_FEASIBILITY: 5,
  TREND_VELOCITY: 10,
});

const CONFIDENCE: Readonly<Record<SocialDataKind, number>> = Object.freeze({ ASSUMPTION: 0.5, EVIDENCE: 0.9, MEASURED: 1, MISSING: 0 });
const METRICS = Object.freeze(["visualizzazioni", "watch time", "completamento", "salvataggi", "condivisioni", "commenti", "visite profilo", "click", "lead", "conversioni attribuibili"] as const);

export class DeterministicMetodoVeloceSocialIntelligenceEngine {
  readonly #request = new MetodoVeloceSocialIntelligenceRequestValidator();
  readonly #pack = new SocialPublishingPackValidator();

  public constructor(private readonly clock: Clock) {}

  public analyze(candidate: MetodoVeloceSocialIntelligenceRequest, carousel: readonly ContentCarouselSlide[]): SocialPublishingPack {
    const request = validate(candidate, this.#request, "Social Intelligence request");
    const now = this.clock.now();
    const criteria = scoreCriteria(request);
    const completeCriteria = criteria.filter(({ weightedContribution }) => weightedContribution !== undefined);
    const completeness = round(completeCriteria.length * 100 / SOCIAL_OPPORTUNITY_CRITERIA.length);
    const critical = new Set<SocialOpportunityCriterion>(["AUDIENCE_DEMAND", "EVIDENCE_STRENGTH", "CLAIM_SAFETY"]);
    const criticalEvidenceComplete = criteria.filter(({ criterion }) => critical.has(criterion)).every(({ weightedContribution }) => weightedContribution !== undefined);
    const availableConfidenceWeight = completeCriteria.reduce((sum, criterion) => sum + criterion.weight * criterion.confidenceFactor, 0);
    const knownSignalScore = availableConfidenceWeight === 0 ? undefined : completeCriteria.reduce((sum, criterion) => sum + (criterion.weightedContribution ?? 0), 0) * 100 / availableConfidenceWeight;
    const score = completeness >= 66.67 && criticalEvidenceComplete && knownSignalScore !== undefined ? round(knownSignalScore * completeness / 100) : undefined;
    const fatigue = fatigueReport(request);
    const trendAnalysis = trendReport(request, now);
    const highRisk = request.culturalRisks.filter(({ severity }) => severity === "HIGH");
    const blockingReasons = Object.freeze([
      ...(trendAnalysis.status === "EXPIRED" ? ["Trend scaduto: la finestra operativa dichiarata non è più valida."] : []),
      ...highRisk.map(({ description }) => `Rischio culturale o reputazionale alto: ${description}`),
      ...(fatigue.status === "HIGH" ? ["Fatigue critica: il pattern è troppo simile ai contenuti recenti."] : []),
      ...(score !== undefined && score < 60 ? [`Opportunity Score insufficiente: ${String(score)}/100.`] : []),
    ]);
    const decision = decide(request, score, completeness, blockingReasons.length > 0);
    const status = statusFor(decision);
    const authorizedCompetitors = request.competitorSignals.filter(({ authorized }) => authorized);
    const eligibleHashtags = selectHashtags(request.hashtagCandidates, now);
    const hashtagStatus = eligibleHashtags.filter(({ dataKind }) => dataKind === "EVIDENCE" || dataKind === "MEASURED").length >= 2 && eligibleHashtags.length >= 6 ? "VERIFIED" as const : "INSUFFICIENT_DATA" as const;
    const resolvedHashtagSets = hashtagSets(eligibleHashtags, hashtagStatus);
    const authorizedAudio = request.audioCandidates.find((audio) => audio.accountAvailable && audio.rightsStatus === "COMMERCIAL_ALLOWED" && (audio.expiresAt === undefined || Date.parse(audio.expiresAt) > now.getTime()));
    const unauthorizedAudio = request.audioCandidates.filter((audio) => audio !== authorizedAudio).map(({ audioId, title }) => `${audioId}: ${title}`);
    const enoughScheduleData = request.scheduling.historicalPostCount >= 10 && request.scheduling.audienceSampleCount >= 3 && request.scheduling.candidateWindows.length > 0 && request.scheduling.candidateWindows.every(({ dataKind }) => dataKind === "MEASURED");
    const brandScore = round(request.brandChecks.reduce((sum, check) => sum + check.score, 0) / request.brandChecks.length);
    const keywordPhrases = keywords(request.topic);
    const generatedAt = now.toISOString();
    const instagramCaption = `${carousel[0]?.title ?? request.topic}\n\n${carousel.map(({ body, slide }) => `${String(slide)}. ${body}`).join("\n")}\n\n${request.conversionIntent.doNext}`;
    const tiktokCaption = `${carousel[0]?.title ?? request.topic}. ${request.conversionIntent.doNext}`;
    const masterBase = {
      brandInvariants: ["TOPIC", "IDENTITY", "LOGO", "MESSAGE", "TYPOGRAPHY", "PALETTE", "CTA"] as const,
      nativeVariants: {
        instagram: nativeVariant({ aspectRatio: "4:5", audioFallback: "NON_APPLICABILE", audioStatus: "NON_APPLICABILE", canvas: "1080x1350", caption: instagramCaption, carousel, cta: request.conversionIntent.doNext, format: "CAROUSEL", hashtagSets: resolvedHashtagSets, platform: "INSTAGRAM", scheduling: request.scheduling }),
        tiktok: nativeVariant({ aspectRatio: "9:16", audioFallback: authorizedAudio === undefined ? "AUDIO_ORIGINALE_METODO_VELOCE_O_NESSUN_AUDIO" : "NON_APPLICABILE", audioStatus: authorizedAudio === undefined ? (request.audioCandidates.length === 0 ? "NESSUN_AUDIO_SELEZIONATO" : "AUDIO_NON_AUTORIZZATO") : "AUDIO_AUTORIZZATO", canvas: "1080x1920", caption: tiktokCaption, carousel, cta: request.conversionIntent.doNext, format: "SLIDESHOW", hashtagSets: resolvedHashtagSets, platform: "TIKTOK", scheduling: request.scheduling }),
      },
      reelIncluded: false as const,
      reelOmissionReason: "Il contenuto è una checklist visuale a sei passaggi: il Reel non aggiunge valore sufficiente per giustificare una terza variante nel primo esperimento.",
      slideCount: 6 as const,
      topic: request.topic,
    };
    const base: Omit<SocialPublishingPack, "fingerprint"> = {
      abTest: {
        control: carousel[0]?.title ?? request.topic,
        hypothesis: "Modificare soltanto l'hook iniziale permette di attribuire l'eventuale differenza nel tasso di completamento alla variabile testata.",
        measurementWindow: "24H",
        primaryMetric: "tasso di completamento del carosello",
        variable: "HOOK",
        variant: `Il dettaglio su ${request.topic} che molti ignorano`,
      },
      audienceDemand: {
        intents: Object.freeze(request.audienceSignals.map(({ intent, query }) => `${intent}: ${query}`)),
        provenance: Object.freeze(request.audienceSignals.map(({ dataKind, evidenceId, note, observedAt, sourceId }) => ({ dataKind, note, observedAt, ...(evidenceId === undefined ? {} : { evidenceId }), ...(sourceId === undefined ? {} : { sourceId }) }))),
        status: request.audienceSignals.filter(({ dataKind }) => dataKind === "EVIDENCE" || dataKind === "MEASURED").length >= 2 ? "VERIFIED" : "INSUFFICIENT_DATA",
      },
      audioPlan: {
        ...(authorizedAudio === undefined ? {} : { selected: { audioId: authorizedAudio.audioId, title: authorizedAudio.title } }),
        status: authorizedAudio === undefined ? (request.audioCandidates.length === 0 ? "NESSUN_AUDIO_SELEZIONATO" : "AUDIO_NON_AUTORIZZATO") : "AUDIO_AUTORIZZATO",
        unauthorized: Object.freeze(unauthorizedAudio),
      },
      approvalScope: {
        consequences: Object.freeze(["Rende approvata soltanto questa versione interna e il suo fingerprint.", "Non autorizza programmazione, pubblicazione, spesa, contatti o altre azioni esterne.", "Qualsiasi modifica ad asset, caption, hashtag, audio o finestre richiede una nuova review."]),
        invalidatedByAnyChange: true,
        publicationAuthorized: false,
        schedulingAuthorized: false,
        scope: "INTERNAL_PACKAGE_ONLY",
      },
      blockingReasons,
      brandDistinctiveness: { score: brandScore, status: brandScore >= 80 ? "DISTINCTIVE" : "REMEDIATE" },
      carousel: Object.freeze(carousel.map((slide) => Object.freeze({ ...slide }))),
      competitorGap: {
        authorizedCompetitors: authorizedCompetitors.length,
        gaps: Object.freeze(authorizedCompetitors.map(({ competitorId, observedGap }) => `${competitorId}: ${observedGap}`)),
        status: authorizedCompetitors.filter(({ dataKind }) => dataKind === "EVIDENCE" || dataKind === "MEASURED").length >= 2 ? "VERIFIED" : "INSUFFICIENT_DATA",
      },
      contractVersion: METODO_VELOCE_SOCIAL_INTELLIGENCE_CONTRACT_VERSION,
      conversionIntent: request.conversionIntent,
      culturalRisk: { findings: request.culturalRisks, status: highRisk.length > 0 ? "BLOCKED" : "CLEAR" },
      decision,
      externalActionsAllowed: false,
      fatigue,
      generatedAt,
      hashtagSets: resolvedHashtagSets,
      masterContentPack: Object.freeze({ ...masterBase, fingerprint: hash(masterBase) }),
      measurement: {
        nextDecision: "Importare snapshot reali, confrontare la metrica primaria con il controllo e scegliere se iterare, fermare o passare al contenuto successivo.",
        snapshots: Object.freeze((["30M", "2H", "24H", "72H", "7D"] as const).map((window) => ({ metrics: METRICS, status: "AWAITING_REAL_IMPORT" as const, window }))),
      },
      opportunity: { completeness, criteria, ...(score === undefined ? {} : { score }) },
      portfolioRole: request.portfolioRole,
      productionId: request.productionId,
      publicationWindows: {
        mode: enoughScheduleData ? "DYNAMIC" : "EXPERIMENTAL",
        status: enoughScheduleData ? "DATA_SUFFICIENT" : "DATI_INSUFFICIENTI",
        ...(enoughScheduleData ? {} : { testPlan: "Finestra sperimentale: usare soltanto gli intervalli candidati dichiarati, cambiare una finestra per volta e importare analytics reali. Nessun orario è definito ottimale." }),
        windows: Object.freeze(request.scheduling.candidateWindows.map(({ endAt, label, startAt }) => ({ endAt, label, startAt }))),
      },
      sequence: Object.freeze([
        sequence(1, "PROBLEMA", "Fai riconoscere il problema e salva il post."),
        sequence(2, "ERRORI", "Commenta quale errore hai già incontrato."),
        sequence(3, "METODO", "Applica un passaggio del Metodo Veloce."),
        sequence(4, "CASO_PRATICO", "Confronta il caso con la tua situazione."),
        sequence(5, "CHECKLIST", "Salva la checklist prima di agire."),
        sequence(6, "CTA_OFFERTA", request.conversionIntent.doNext),
      ]),
      socialSeo: {
        captionKeywords: keywordPhrases,
        onScreenPhrases: Object.freeze([request.topic, `metodo pratico per ${request.topic}`, `errori da evitare: ${request.topic}`]),
        searchIntent: request.audienceSignals[0]?.query ?? `come fare ${request.topic}`,
      },
      status,
      trendAnalysis,
      visualDirection: {
        aspectRatio: "4:5",
        brandSignature: "Logo Metodo Veloce stabile, fulmine giallo, gerarchia tipografica condensata e continuità nera/gialla riconoscibile anche senza nome account.",
        canvas: "1080x1350",
        imageStyle: "ULTRAREALISTIC_CINEMATIC",
        palette: ["#050505", "#FFD400", "#F7F7F4"],
        slidePrompts: Object.freeze(carousel.map(({ slide, title }) => `Slide ${String(slide)} — fotografia ultrarealistica cinematografica per “${title}”, scena dark premium, luce calda controllata, nero dominante, accenti gialli, spazio negativo leggibile per headline bianca/gialla; nessun marchio di terzi inventato.`)),
      },
    };
    const result: SocialPublishingPack = Object.freeze({ ...base, fingerprint: socialPublishingPackFingerprint(base) });
    return validate(result, this.#pack, "Social Publishing Pack");
  }
}

function scoreCriteria(request: MetodoVeloceSocialIntelligenceRequest): readonly SocialOpportunityCriterionResult[] {
  const byCriterion = new Map(request.criterionInputs.map((input) => [input.criterion, input]));
  return Object.freeze(SOCIAL_OPPORTUNITY_CRITERIA.map((criterion): SocialOpportunityCriterionResult => {
    const input = byCriterion.get(criterion);
    if (input === undefined) throw new Error(`Missing criterion ${criterion}`);
    const confidenceFactor = CONFIDENCE[input.dataKind];
    const weight = SOCIAL_OPPORTUNITY_WEIGHTS[criterion];
    return Object.freeze({ ...input, confidenceFactor, weight, ...(input.value === undefined ? {} : { weightedContribution: round(input.value * confidenceFactor * weight / 100) }) });
  }));
}

function decide(request: MetodoVeloceSocialIntelligenceRequest, score: number | undefined, completeness: number, blocked: boolean): SocialOpportunityDecision {
  if (blocked) return "SCARTARE";
  const critical = new Set(["AUDIENCE_DEMAND", "EVIDENCE_STRENGTH", "CLAIM_SAFETY"] as const);
  if (completeness < 66.67 || request.criterionInputs.some(({ criterion, dataKind }) => critical.has(criterion as never) && dataKind === "MISSING")) return "RICHIEDE_RICERCA";
  if (score === undefined || score < 60) return "SCARTARE";
  const phase = request.trend?.phase;
  if (score >= 82 && (request.mode === "EVERGREEN" || phase === "EMERGENTE" || phase === "IN_CRESCITA" || phase === "PICCO")) return "PRODURRE_ORA";
  if (score >= 72) return "ENTRO_24_ORE";
  return "CALENDARIO";
}

function statusFor(decision: SocialOpportunityDecision): SocialPublishingPackStatus {
  if (decision === "RICHIEDE_RICERCA") return "REQUIRES_RESEARCH";
  if (decision === "SCARTARE") return "BLOCKED";
  return "READY_FOR_FABIO_APPROVAL";
}

function trendReport(request: MetodoVeloceSocialIntelligenceRequest, now: Date): SocialPublishingPack["trendAnalysis"] {
  if (request.trend === undefined) return Object.freeze({ phase: "NESSUN_TREND", status: "NOT_PROVIDED" });
  const expired = request.trend.phase === "SCADUTO" || Date.parse(request.trend.expiresAt) <= now.getTime() || Date.parse(request.trend.publishBy) <= now.getTime();
  return Object.freeze({ expiresAt: request.trend.expiresAt, phase: expired ? "SCADUTO" : request.trend.phase, publishBy: request.trend.publishBy, status: expired ? "EXPIRED" : "ACTIVE" });
}

function fatigueReport(request: MetodoVeloceSocialIntelligenceRequest): SocialPublishingPack["fatigue"] {
  const topic = normalize(request.topic);
  const signals = request.recentContents.flatMap((content) => {
    const matches = [];
    if (normalize(content.topic) === topic) matches.push(`topic:${content.topic}`);
    if (normalize(content.hookPattern).includes(topic) || topic.includes(normalize(content.hookPattern))) matches.push(`hook:${content.hookPattern}`);
    if (normalize(content.visualPattern).includes("dark premium")) matches.push(`visual:${content.visualPattern}`);
    return matches;
  });
  const score = Math.min(100, signals.length * 15);
  return Object.freeze({ repeatedSignals: Object.freeze([...new Set(signals)]), score, status: score >= 70 ? "HIGH" : score >= 40 ? "WATCH" : "FRESH" });
}

function selectHashtags(candidates: readonly SocialHashtagCandidate[], now: Date): readonly SocialHashtagCandidate[] {
  return Object.freeze([...candidates].filter(({ expiresAt, relevance, saturation }) => (expiresAt === undefined || Date.parse(expiresAt) > now.getTime()) && relevance >= 60 && (saturation === undefined || saturation <= 85)).sort((left, right) => right.relevance - left.relevance || left.tag.localeCompare(right.tag)));
}

function hashtagSets(candidates: readonly SocialHashtagCandidate[], status: "INSUFFICIENT_DATA" | "VERIFIED"): SocialPublishingPack["hashtagSets"] {
  const regular = candidates.filter(({ cluster }) => cluster !== "EXPERIMENTAL").map(({ tag }) => tag);
  const experimental = candidates.filter(({ cluster }) => cluster === "EXPERIMENTAL").map(({ tag }) => tag);
  const mainSize = regular.length <= 8 ? Math.max(1, Math.ceil(regular.length / 2)) : 8;
  return Object.freeze({ alternate: Object.freeze(regular.slice(mainSize, mainSize + 7)), experimental: Object.freeze(experimental.slice(0, 8)), main: Object.freeze(regular.slice(0, mainSize)), status });
}

function keywords(topic: string): readonly string[] {
  const tokens = topic.toLocaleLowerCase("it").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/u).filter((token) => token.length >= 4);
  return Object.freeze([...new Set([topic.toLocaleLowerCase("it"), ...tokens])].slice(0, 10));
}

function sequence(position: number, role: SocialPublishingPack["sequence"][number]["role"], callToAction: string) { return Object.freeze({ callToAction, position, role }); }
function nativeVariant(input: {
  readonly aspectRatio: "4:5" | "9:16";
  readonly audioFallback: "AUDIO_ORIGINALE_METODO_VELOCE_O_NESSUN_AUDIO" | "NON_APPLICABILE";
  readonly audioStatus: SocialPublishingPack["masterContentPack"]["nativeVariants"]["instagram"]["audio"]["status"];
  readonly canvas: "1080x1350" | "1080x1920";
  readonly caption: string;
  readonly carousel: readonly ContentCarouselSlide[];
  readonly cta: string;
  readonly format: "CAROUSEL" | "SLIDESHOW";
  readonly hashtagSets: SocialPublishingPack["hashtagSets"];
  readonly platform: "INSTAGRAM" | "TIKTOK";
  readonly scheduling: MetodoVeloceSocialIntelligenceRequest["scheduling"];
}): SocialPublishingPack["masterContentPack"]["nativeVariants"]["instagram"] {
  return Object.freeze({
    aspectRatio: input.aspectRatio,
    audio: { fallback: input.audioFallback, status: input.audioStatus },
    canvas: input.canvas,
    caption: input.caption,
    cta: input.cta,
    format: input.format,
    hashtagSets: input.hashtagSets,
    platform: input.platform,
    publicationWindowLabels: Object.freeze(input.scheduling.candidateWindows.filter(({ label }) => label.toLocaleUpperCase("it").startsWith(input.platform)).map(({ label }) => label)),
    slides: Object.freeze(input.carousel.map(({ body, slide, title }) => Object.freeze({ body, layoutInstruction: input.platform === "INSTAGRAM" ? "Composizione 4:5 con testo nella safe area, fotografia non tagliata e ritmo da carosello." : "Composizione 9:16 con testo nella safe area verticale, soggetto centrale e ritmo da slideshow.", slide, title }))),
  });
}
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }
function normalize(value: string): string { return value.toLocaleLowerCase("it").replace(/[^\p{L}\p{N}]/gu, " ").replace(/\s+/gu, " ").trim(); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new Error(`${label} failed validation`); return result.value; }
import { createHash } from "node:crypto";
