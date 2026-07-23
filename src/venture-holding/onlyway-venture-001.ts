import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { JsonObject } from "../contracts/json.js";
import type { EvidencePack } from "../operational-planes/operational-plane.js";
import type {
  CapitalAllocationProposal,
  FounderPortfolioBrief,
  FounderVenturePolicy,
  Venture,
  VentureArtifact,
  VentureEconomics,
  VentureExperiment,
  VentureOperatingReport,
  VentureOpportunity,
  VenturePortfolio,
  VentureScorecard,
} from "./venture-domain.js";
import type { VentureCommandRecord } from "./venture-command-boundary.js";
import { DeterministicVentureEconomicsEngine, type VentureEconomicBps, type VentureEconomicValue } from "./venture-economics.js";
import { DeterministicVentureLaunchPackFactory, type VentureLaunchDatum } from "./venture-launch-pack.js";
import { DeterministicVentureScorecardService } from "./venture-scorecard.js";

export const ONLYWAY_VENTURE_001_ID = "onlyway-venture-001" as const;
export const ONLYWAY_VENTURE_001_OBJECTIVE = "Trasformare gli asset, le capacità e il pubblico di Metodo Veloce e Onlyway in una prima offerta validabile con rischio basso, capitale limitato e tempo al primo segnale il più breve possibile." as const;

const CANDIDATES = Object.freeze([
  Object.freeze({ category: "AI_SERVICES", customer: "FOUNDER_INPUT_REQUIRED", opportunityId: "venture-001-evidence-led-content-operations", problem: "Verificare se un servizio di content operations evidence-led risolve un problema acquistabile.", title: "Evidence-Led Content Operations Service" }),
  Object.freeze({ category: "RESELLING", customer: "FOUNDER_INPUT_REQUIRED", opportunityId: "venture-001-metodo-veloce-digital-reselling", problem: "Verificare se gli asset Metodo Veloce possono sostenere un prodotto digitale reselling acquistabile.", title: "Metodo Veloce Digital Reselling Product" }),
  Object.freeze({ category: "WORKFLOW_AUTOMATION", customer: "FOUNDER_INPUT_REQUIRED", opportunityId: "venture-001-ai-workflow-setup", problem: "Verificare se creator e small business acquistano un setup operativo di workflow AI Onlyway.", title: "Onlyway AI Workflow Setup for Creators and Small Businesses" }),
] as const);

export interface OnlywayVenture001Package {
  readonly policy: FounderVenturePolicy;
  readonly portfolio: VenturePortfolio;
  readonly opportunities: readonly VentureOpportunity[];
  readonly scorecards: readonly VentureScorecard[];
  readonly economics: readonly VentureEconomics[];
  readonly venture: Venture;
  readonly experiments: readonly VentureExperiment[];
  readonly capitalProposal: CapitalAllocationProposal;
  readonly artifacts: readonly VentureArtifact[];
  readonly operatingReport: VentureOperatingReport;
  readonly briefs: readonly FounderPortfolioBrief[];
  readonly decisionRequests: readonly string[];
  readonly blockerCodes: readonly string[];
  readonly records: readonly VentureCommandRecord[];
  readonly state: "AWAITING_FABIO";
  readonly externalEffects: "ZERO";
}

export class OnlywayVenture001Factory {
  readonly #economics = new DeterministicVentureEconomicsEngine();
  readonly #launchPack = new DeterministicVentureLaunchPackFactory();
  readonly #scorecards = new DeterministicVentureScorecardService();

  public create(input: { readonly actorId: string; readonly evidencePacks: readonly EvidencePack[]; readonly now: string; readonly workspaceId: string }): OnlywayVenture001Package {
    assertTimestamp(input.now);
    assertIdentity(input.actorId, input.workspaceId);
    for (const pack of input.evidencePacks) if (pack.actorId !== input.actorId || pack.workspaceId !== input.workspaceId) throw new Error("Venture #001 Evidence Pack identity is invalid");
    const policy = this.#policy(input);
    const opportunities = Object.freeze(CANDIDATES.map((candidate) => this.#opportunity(input, candidate)));
    const scorecards = Object.freeze(opportunities.map((opportunity) => this.#scorecard(input, opportunity)));
    const economics = Object.freeze(opportunities.map((opportunity) => this.#economicsRecord(input, opportunity)));
    const experiments = Object.freeze(this.#experiments(input));
    const decisionRequests = Object.freeze([
      "Definire cliente prioritario e problema acquistabile per ciascun candidato.",
      "Definire pesi scorecard, soglia Thesis, capitale massimo, ore Fabio, margine minimo e delivery load.",
      "Autorizzare nuova ricerca o rifiutare i candidati; nessun esperimento esterno è autorizzato.",
    ]);
    const launchPack = this.#launchPack.produce({
      acquisitionStrategy: missing(), contentAcquisitionPlan: missing(), crmSchema: missing(), customerOnboarding: missing(), deliverySystem: missing(), economics: missing(),
      evidenceMap: available("Le Evidence Pack registrate sono collegate come contesto; nessuna prova di domanda o willingness to pay è stata rilevata.", evidenceRefs(input.evidencePacks)),
      emailDrafts: missing(), executiveDecision: available("Nessun vincitore forzato. Tutti e tre i candidati richiedono ricerca e Founder input.", scorecards.map(({ scorecardId }) => scorecardId)),
      experimentPlan: available("Tre esperimenti interni sono preparati; restano bloccati e AWAITING_REAL_OBSERVATION.", experiments.map(({ experimentId }) => experimentId)),
      founderDecisionsRequired: decisionRequests,
      idealCustomerProfile: missing(), killCriteria: missing(), offerArchitecture: missing(), outreachDrafts: missing(),
      opportunityReport: available("Tre candidati Founder-supplied confrontati. Domanda: DEMAND_NOT_VERIFIED per tutti.", opportunities.map(({ opportunityId }) => opportunityId)),
      positioning: missing(), pricing: missing(), riskRegister: available("Rischio principale: domanda, pricing, capacità e delivery non verificati.", opportunities.flatMap(({ evidenceMap }) => evidenceMap.sourceRefs)), scaleCriteria: missing(), socialContentSeries: missing(), thesisId: "NOT_AVAILABLE", validationPlan: missing(), valueProposition: missing(), ventureId: ONLYWAY_VENTURE_001_ID,
    });
    const artifacts = Object.freeze(launchPack.artifacts.map((artifact): VentureArtifact => record({
      actorId: input.actorId, allowedUse: artifact.allowedUse, artifactId: artifact.artifactId, authoringAgent: artifact.authoringAgent, content: artifact.content, contractVersion: "1" as const, createdAt: input.now, evidenceRefs: artifact.evidenceRefs, externalActionsExecuted: false as const, kind: artifact.kind, mediaType: artifact.mediaType, reviewState: artifact.reviewState, tombstoned: false, updatedAt: input.now, ventureId: artifact.ventureId, version: 0, workspaceId: input.workspaceId,
    })));
    const venture = record<Venture>({
      actorId: input.actorId, approvalState: "AWAITING_FABIO", artifactIds: artifacts.map(({ artifactId }) => artifactId), assetIds: [], budget: { actualMinorUnits: "0", budgetId: "venture-001-budget", currency: unavailable(), maximumMinorUnits: unavailable(), reservedMinorUnits: "0", spendAuthorized: false, status: "FOUNDER_INPUT_REQUIRED" }, contractVersion: "1", createdAt: input.now, dependencies: [{ dependencyId: "venture-001-demand", description: "Real commercial demand evidence", owner: "research-agent", status: "BLOCKED" }, { dependencyId: "venture-001-policy", description: "Founder Venture Policy material values", owner: "FABIO", status: "FOUNDER_INPUT_REQUIRED" }], experimentIds: experiments.map(({ experimentId }) => experimentId), externalActions: "LOCKED", portfolioId: "onlyway-portfolio", publication: "LOCKED", risks: [{ description: "Demand and willingness to pay are not verified.", domain: "ECONOMIC", evidenceRefs: evidenceRefs(input.evidencePacks), level: "HIGH", mitigation: "Run authorized research and a separately approved real observation.", riskId: "venture-001-demand-risk" }], stage: "EVIDENCE_INSUFFICIENT", synergies: [{ assetRef: "metodo-veloce", description: "Founder-supplied brand and internal operating assets are available for analysis only.", evidenceRefs: evidenceRefs(input.evidencePacks), synergyId: "venture-001-metodo-veloce-synergy" }], title: "ONLYWAY VENTURE #001 — METODO VELOCE COMMERCIALIZATION", tombstoned: false, updatedAt: input.now, ventureId: ONLYWAY_VENTURE_001_ID, version: 0, workspaceId: input.workspaceId,
    });
    const capitalProposal = record<CapitalAllocationProposal>({
      actorId: input.actorId, amountMinorUnits: unavailable(), contractVersion: "1", createdAt: input.now, currency: unavailable(), evidenceConfidenceBps: unavailable(), expectedImpact: unavailable(), externalActionsExecuted: false, opportunityCost: unavailable(), proposalId: "venture-001-capital-proposal", reversibility: unavailable(), risk: "NOT_AVAILABLE", speed: unavailable(), spendAuthorized: false, status: "CAPITAL_ALLOCATION_PROPOSAL", strategicFit: unavailable(), updatedAt: input.now, ventureId: ONLYWAY_VENTURE_001_ID, version: 0, workspaceId: input.workspaceId,
    });
    const blockerCodes = Object.freeze(["DEMAND_NOT_VERIFIED", "FOUNDER_INPUT_REQUIRED", "THESIS_NOT_READY", "AWAITING_REAL_OBSERVATION"]);
    const operatingReport = record<VentureOperatingReport>({ actorId: input.actorId, blockerCodes, contractVersion: "1", costStatus: "NOT_AVAILABLE", createdAt: input.now, evidenceFreshness: freshness(input.evidencePacks, input.now), experimentStatus: "AWAITING_REAL_OBSERVATION", externalEffects: "ZERO", founderDecisionIds: [], nextActions: decisionRequests, reportId: "venture-001-operating-report", riskCount: venture.risks.length, stage: venture.stage, updatedAt: input.now, ventureId: venture.ventureId, version: 0, workspaceId: input.workspaceId });
    const briefs = Object.freeze(["DAILY", "WEEKLY", "MONTHLY_CAPITAL_PLACEHOLDER"].map((kind, index): FounderPortfolioBrief => record({ actorId: input.actorId, blockerCodes, briefId: `venture-001-${kind.toLowerCase().replaceAll("_", "-")}`, contractVersion: "1", costStatus: "NOT_AVAILABLE", createdAt: input.now, experimentIds: experiments.map(({ experimentId }) => experimentId), externalEffects: "ZERO", founderDecisionIds: [], kind: kind as FounderPortfolioBrief["kind"], nextActions: decisionRequests, opportunityIds: opportunities.map(({ opportunityId }) => opportunityId), portfolioId: "onlyway-portfolio", riskCount: venture.risks.length, updatedAt: input.now, ventureReportIds: index === 0 ? [operatingReport.reportId] : [operatingReport.reportId], version: 0, workspaceId: input.workspaceId })));
    const portfolio = record<VenturePortfolio>({ actorId: input.actorId, capitalProposalIds: [capitalProposal.proposalId], contractVersion: "1", createdAt: input.now, externalActions: "LOCKED", founderDecisionIds: [], opportunityIds: opportunities.map(({ opportunityId }) => opportunityId), policyRef: { fingerprint: policy.fingerprint, policyId: policy.policyId, version: policy.version }, portfolioId: "onlyway-portfolio", publication: "LOCKED", thesisIds: [], tombstoned: false, updatedAt: input.now, ventureIds: [venture.ventureId], version: 0, workspaceId: input.workspaceId });
    const records: readonly VentureCommandRecord[] = Object.freeze([
      { record: policy, type: "FOUNDER_VENTURE_POLICY" },
      { record: portfolio, type: "VENTURE_PORTFOLIO" },
      ...opportunities.map((entry) => ({ record: entry, type: "VENTURE_OPPORTUNITY" as const })),
      ...scorecards.map((entry) => ({ record: entry, type: "VENTURE_SCORECARD" as const })),
      ...economics.map((entry) => ({ record: entry, type: "VENTURE_ECONOMICS" as const })),
      { record: venture, type: "VENTURE" }, ...experiments.map((entry) => ({ record: entry, type: "VENTURE_EXPERIMENT" as const })),
      { record: capitalProposal, type: "CAPITAL_ALLOCATION_PROPOSAL" }, ...artifacts.map((entry) => ({ record: entry, type: "VENTURE_ARTIFACT" as const })),
      { record: operatingReport, type: "VENTURE_OPERATING_REPORT" }, ...briefs.map((entry) => ({ record: entry, type: "FOUNDER_PORTFOLIO_BRIEF" as const })),
    ]);
    return deepFreeze({ artifacts, blockerCodes, briefs, capitalProposal, decisionRequests, economics, experiments, externalEffects: "ZERO" as const, operatingReport, opportunities, policy, portfolio, records, scorecards, state: "AWAITING_FABIO" as const, venture });
  }

  #policy(input: { readonly actorId: string; readonly now: string; readonly workspaceId: string }): FounderVenturePolicy { return record({ acceptableAutomation: founderInput(), actorId: input.actorId, allowedMarkets: founderInput(), allowedRevenueModels: founderInput(), approvalRequirements: ["FABIO_EXPLICIT", "FABIO_VERSION_BOUND"], contractVersion: "1", createdAt: input.now, customerModel: founderInput(), economicObjective: founderInput(), economicRisk: founderInput(), evidenceRequirements: founderInput(), forbiddenMarkets: founderInput(), killConditions: founderInput(), maximumCapitalMinorUnits: founderInput(), maximumDaysToFirstSignal: founderInput(), maximumDeliveryLoad: founderInput(), maximumFabioDependency: founderInput(), maximumFabioHoursPerWeek: founderInput(), minimumMarginBps: founderInput(), policyId: "onlyway-founder-venture-policy", reputationalRisk: founderInput(), scaleConditions: founderInput(), updatedAt: input.now, version: 0, workspaceId: input.workspaceId }); }

  #opportunity(input: { readonly actorId: string; readonly evidencePacks: readonly EvidencePack[]; readonly now: string; readonly workspaceId: string }, candidate: typeof CANDIDATES[number]): VentureOpportunity {
    const founderSourceBase = { demandEvidence: false, expiresAt: "9999-12-31T23:59:59.999Z", kind: "FOUNDER_INPUT" as const, observedAt: input.now, reference: "founder-input:venture-001", sourceId: `${candidate.opportunityId}-founder`, willingnessToPayEvidence: false };
    const founderSource = { ...founderSourceBase, fingerprint: canonicalSha256(founderSourceBase) };
    const packSources = input.evidencePacks.map((pack) => { const base = { demandEvidence: false, expiresAt: pack.minFreshnessExpiresAt, kind: "EVIDENCE_PACK" as const, observedAt: pack.createdAt, reference: pack.packId, sourceId: `${candidate.opportunityId}:${pack.packId}`, willingnessToPayEvidence: false }; return { ...base, fingerprint: canonicalSha256(base) }; });
    const sources = Object.freeze([founderSource, ...packSources]);
    const mapBase = { claimRefs: Object.freeze([]), contradictions: Object.freeze([]), evidenceMapId: `${candidate.opportunityId}-evidence-map`, freshness: freshness(input.evidencePacks, input.now), missingInputs: Object.freeze(["COMMERCIAL_DEMAND_EVIDENCE", "WILLINGNESS_TO_PAY_EVIDENCE", "FOUNDER_POLICY"]), opportunityId: candidate.opportunityId, sourceRefs: Object.freeze(sources.map(({ sourceId }) => sourceId)) };
    const evidenceMap = Object.freeze({ ...mapBase, fingerprint: canonicalSha256(mapBase) });
    return record({ actorId: input.actorId, capitalRequiredMinorUnits: founderInput(), category: candidate.category, competition: unavailable(), contractVersion: "1", createdAt: input.now, customer: candidate.customer, customerAccess: unavailable(), deliveryComplexity: founderInput(), demand: "DEMAND_NOT_VERIFIED", evidenceMap, expiresAt: minimumExpiry(sources), founderFit: founderInput(), frequency: unavailable(), marginPotentialBps: founderInput(), onlywaySynergy: founderInput(), opportunityId: candidate.opportunityId, origin: "FOUNDER_SUPPLIED_CANDIDATE", problem: candidate.problem, risk: unavailable(), sources, stage: "EVIDENCE_INSUFFICIENT", timeToFirstSignalDays: founderInput(), title: candidate.title, tombstoned: false, unknowns: ["CUSTOMER", "DEMAND", "PRICE", "DELIVERY_CAPACITY", "CAC", "MARGIN"], updatedAt: input.now, urgency: unavailable(), version: 0, willingnessToPay: "DEMAND_NOT_VERIFIED", workspaceId: input.workspaceId });
  }

  #scorecard(input: { readonly actorId: string; readonly now: string; readonly workspaceId: string }, opportunity: VentureOpportunity): VentureScorecard {
    const calculated = this.#scorecards.evaluate({ criteria: [], opportunityId: opportunity.opportunityId, policy: { hardRejectReasonCodes: [], weightsBps: {} } });
    return record({ actorId: input.actorId, blockingReasonCodes: calculated.blockingReasonCodes, ...(calculated.confidenceAdjustedScoreBps === undefined ? {} : { confidenceAdjustedScoreBps: calculated.confidenceAdjustedScoreBps }), contractVersion: "1", createdAt: input.now, criteria: calculated.criteria, opportunityId: opportunity.opportunityId, outcome: calculated.outcome, scorecardId: `${opportunity.opportunityId}-scorecard`, sensitiveToSingleAssumption: calculated.sensitiveToSingleAssumption, ...(calculated.totalScoreBps === undefined ? {} : { totalScoreBps: calculated.totalScoreBps }), updatedAt: input.now, version: 0, workspaceId: input.workspaceId });
  }

  #economicsRecord(input: { readonly actorId: string; readonly now: string; readonly workspaceId: string }, opportunity: VentureOpportunity): VentureEconomics {
    const scenarios = (["PRUDENT", "BASE", "AMBITIOUS"] as const).map((name) => {
      const missingValue = economicMissing(["FOUNDER_INPUT_REQUIRED"]);
      const missingBps = economicBpsMissing(["FOUNDER_INPUT_REQUIRED"]);
      const scenarioInput = { acquisitionCostMinorUnits: missingValue, availableCapitalMinorUnits: missingValue, availableFounderTimeMilliHours: missingValue, currency: "XXX", deliveryCostMinorUnits: missingValue, fixedCostsMinorUnits: missingValue, founderHourlyCostMinorUnits: missingValue, founderTimePerClientMilliHours: missingValue, minimumContributionMarginBps: missingBps, monthlyClients: missingValue, name, priceMinorUnits: missingValue, refundRateBps: missingBps, targetMonthlyContributionMinorUnits: missingValue, toolCostsMinorUnits: missingValue };
      return { inputsFingerprint: canonicalSha256(scenarioInput), name, results: json(this.#economics.calculate(scenarioInput)) };
    });
    return record({ actorId: input.actorId, contractVersion: "1", createdAt: input.now, currency: unavailable(), economicsId: `${opportunity.opportunityId}-economics`, formulasVersion: "1", scenarios, sensitivityMatrix: [{ base: unavailable(), field: "priceMinorUnits", high: unavailable(), low: unavailable() }, { base: unavailable(), field: "founderTimePerClientMilliHours", high: unavailable(), low: unavailable() }], status: "NOT_AVAILABLE", updatedAt: input.now, ventureId: ONLYWAY_VENTURE_001_ID, version: 0, workspaceId: input.workspaceId });
  }

  #experiments(input: { readonly actorId: string; readonly now: string; readonly workspaceId: string }): readonly VentureExperiment[] {
    const definitions = [
      { id: "venture-001-customer-interviews", owner: "research-agent", type: "CUSTOMER_INTERVIEW" as const },
      { id: "venture-001-price-test", owner: "sales-agent", type: "PRICE_TEST" as const },
      { id: "venture-001-delivery-prototype", owner: "customer-delivery-agent", type: "DELIVERY_PROTOTYPE" as const },
    ];
    return definitions.map((definition) => record({ actorId: input.actorId, assetRefs: [], budgetMaximumMinorUnits: founderInput(), contractVersion: "1", createdAt: input.now, decision: { decisionId: `${definition.id}-decision`, observationRefs: [], outcome: "AWAITING_REAL_OBSERVATION", reasonCodes: ["NO_VERIFIED_REAL_OBSERVATION"] }, durationDays: founderInput(), evidenceRequired: ["REAL_OBSERVATION", "AUTHORIZED_EVIDENCE_REF"], experimentId: definition.id, experimentType: definition.type, externalActionsExecuted: false, externalActionsProposed: definition.type === "DELIVERY_PROTOTYPE" ? [] : ["SEPARATE_FABIO_AUTHORIZATION_REQUIRED"], hypothesis: { evidenceRefs: [], falsifiable: true, hypothesisId: `${definition.id}-hypothesis`, statement: "FOUNDER_INPUT_REQUIRED" }, method: "Internal design only; no market execution in this sprint.", metrics: [{ failureThreshold: founderInput(), kind: "PRIMARY", metricId: `${definition.id}-primary`, name: "FOUNDER_INPUT_REQUIRED", successThreshold: founderInput(), unit: "FOUNDER_INPUT_REQUIRED" }], observations: [], owner: definition.owner, sample: founderInput(), status: "BLOCKED", stopCondition: founderInput(), target: "FOUNDER_INPUT_REQUIRED", updatedAt: input.now, ventureId: ONLYWAY_VENTURE_001_ID, version: 0, workspaceId: input.workspaceId }));
  }
}

function record<T extends object>(base: Omit<T, "fingerprint"> & { readonly fingerprint?: never }): T { return deepFreeze({ ...base, fingerprint: canonicalSha256(base) }) as T; }
function founderInput(): { readonly status: "FOUNDER_INPUT_REQUIRED"; readonly reasonCode: "FOUNDER_INPUT_REQUIRED" } { return Object.freeze({ reasonCode: "FOUNDER_INPUT_REQUIRED", status: "FOUNDER_INPUT_REQUIRED" }); }
function unavailable(): { readonly status: "NOT_AVAILABLE"; readonly reasonCode: "NOT_AVAILABLE" } { return Object.freeze({ reasonCode: "NOT_AVAILABLE", status: "NOT_AVAILABLE" }); }
function missing(): VentureLaunchDatum { return Object.freeze({ reasonCode: "FOUNDER_INPUT_REQUIRED", status: "NOT_AVAILABLE" }); }
function available(value: string, refs: readonly string[]): VentureLaunchDatum { return refs.length === 0 ? missing() : Object.freeze({ evidenceRefs: Object.freeze([...refs]), status: "AVAILABLE", value }); }
function evidenceRefs(packs: readonly EvidencePack[]): readonly string[] { return Object.freeze(packs.map(({ packId }) => packId)); }
function freshness(packs: readonly EvidencePack[], now: string): "CURRENT" | "NOT_AVAILABLE" | "STALE" { if (packs.length === 0) return "NOT_AVAILABLE"; return packs.every(({ minFreshnessExpiresAt }) => Date.parse(minFreshnessExpiresAt) > Date.parse(now)) ? "CURRENT" : "STALE"; }
function minimumExpiry(values: readonly { readonly expiresAt: string }[]): string { return values.map(({ expiresAt }) => expiresAt).sort()[0] ?? "1970-01-01T00:00:00.000Z"; }
function economicMissing(missingInputs: readonly string[]): VentureEconomicValue { return Object.freeze({ missingInputs, reasonCode: "FOUNDER_INPUT_REQUIRED", status: "NOT_AVAILABLE" }); }
function economicBpsMissing(missingInputs: readonly string[]): VentureEconomicBps { return Object.freeze({ missingInputs, reasonCode: "FOUNDER_INPUT_REQUIRED", status: "NOT_AVAILABLE" }); }
function json(value: unknown): JsonObject { return JSON.parse(JSON.stringify(value)) as JsonObject; }
function assertIdentity(actorId: string, workspaceId: string): void { if (!/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(actorId) || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(workspaceId)) throw new Error("Venture #001 identity is invalid"); }
function assertTimestamp(value: string): void { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Venture #001 timestamp is invalid"); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
