export const COMMAND_CENTER_VENTURE_VIEW_CONTRACT_VERSION = "1" as const;

export type CommandCenterVentureCoverage = "COMPLETE" | "LIMIT_REACHED" | "NOT_AVAILABLE";
export type CommandCenterVentureHealth = "ATTENTION_REQUIRED" | "FOUNDER_INPUT_REQUIRED" | "NOT_AVAILABLE" | "READY";

export interface CommandCenterVentureEntitySummary {
  readonly entityId: string;
  readonly fingerprint: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CommandCenterVentureOpportunitySummary extends CommandCenterVentureEntitySummary {
  readonly demand: "DEMAND_NOT_VERIFIED" | "VERIFIED";
  readonly evidenceRefs: readonly string[];
  readonly expiry: string;
  readonly outcome: "FOUNDER_REVIEW_REQUIRED" | "REJECT" | "RESEARCH_MORE" | "THESIS_CANDIDATE";
}

export interface CommandCenterVentureSummary extends CommandCenterVentureEntitySummary {
  readonly blockerCodes: readonly string[];
  readonly stage: string;
}

export interface CommandCenterVentureExperimentSummary extends CommandCenterVentureEntitySummary {
  readonly observation: "AWAITING_REAL_OBSERVATION" | "AVAILABLE";
  readonly status: "AWAITING_FABIO" | "BLOCKED" | "COMPLETED" | "DRAFT" | "READY";
  readonly ventureId: string;
}

export interface CommandCenterCapitalProposalSummary extends CommandCenterVentureEntitySummary {
  readonly amountCents: number | "NOT_AVAILABLE";
  readonly currency: string;
  readonly proposalOnly: true;
  readonly status: "AWAITING_FABIO" | "DRAFT" | "REJECTED" | "REVIEWED";
  readonly ventureId: string;
}

export interface CommandCenterFounderVentureDecision {
  readonly decisionId: string;
  readonly entityFingerprint: string;
  readonly entityId: string;
  readonly entityType: "VENTURE" | "VENTURE_EXPERIMENT" | "VENTURE_THESIS";
  readonly entityVersion: number;
  readonly priority: "HIGH" | "MEDIUM";
  readonly question: string;
  readonly reasonCode: string;
  readonly updatedAt: string;
}

export interface CommandCenterFounderPortfolioBriefSummary extends CommandCenterVentureEntitySummary {
  readonly briefKind: "DAILY" | "MONTHLY_CAPITAL_PLACEHOLDER" | "WEEKLY";
  readonly founderDecisions: number;
  readonly riskCount: number;
}

export interface CommandCenterVentureArtifactSummary extends CommandCenterVentureEntitySummary {
  readonly allowedUse: "INTERNAL_PACKAGE_ONLY" | "PROPOSAL_ONLY";
  readonly artifactKind: string;
  readonly reviewState: "AWAITING_FABIO" | "BLOCKED" | "DRAFT" | "REVIEWED";
  readonly ventureId: string;
}

export interface CommandCenterVentureView {
  readonly artifacts: readonly CommandCenterVentureArtifactSummary[];
  readonly briefs: readonly CommandCenterFounderPortfolioBriefSummary[];
  readonly capital: Readonly<{
    readonly approvedCents: number | "NOT_AVAILABLE";
    readonly proposedCents: number | "NOT_AVAILABLE";
  }>;
  readonly capitalProposals: readonly CommandCenterCapitalProposalSummary[];
  readonly contractVersion: typeof COMMAND_CENTER_VENTURE_VIEW_CONTRACT_VERSION;
  readonly coverage: CommandCenterVentureCoverage;
  readonly decisions: readonly CommandCenterFounderVentureDecision[];
  readonly experiments: readonly CommandCenterVentureExperimentSummary[];
  readonly externalActions: "LOCKED";
  readonly health: Readonly<{
    readonly nextAction: string;
    readonly reasonCode: string;
    readonly status: CommandCenterVentureHealth;
  }>;
  readonly opportunities: readonly CommandCenterVentureOpportunitySummary[];
  readonly portfolio: CommandCenterVentureEntitySummary | null;
  readonly publication: "LOCKED";
  readonly summaries: Readonly<{
    readonly blockedVentures: number;
    readonly capacity: number | "FOUNDER_INPUT_REQUIRED" | "NOT_AVAILABLE";
    readonly founderDecisions: number;
    readonly portfolioRiskCount: number;
    readonly readyExperiments: number;
    readonly venturesInProgress: number;
  }>;
  readonly ventures: readonly CommandCenterVentureSummary[];
}

export interface CommandCenterVentureQuery {
  snapshot(): Promise<CommandCenterVentureView>;
}

/**
 * Fail-closed projection used until the durable Venture repository is wired.
 * Missing values remain explicit and no zero is presented as an economic fact.
 */
export const EMPTY_COMMAND_CENTER_VENTURE_VIEW: CommandCenterVentureView = deepFreeze({
  artifacts: [],
  briefs: [],
  capital: { approvedCents: "NOT_AVAILABLE", proposedCents: "NOT_AVAILABLE" },
  capitalProposals: [],
  contractVersion: COMMAND_CENTER_VENTURE_VIEW_CONTRACT_VERSION,
  coverage: "NOT_AVAILABLE",
  decisions: [],
  experiments: [],
  externalActions: "LOCKED",
  health: {
    nextAction: "Registra la Founder Venture Policy e le evidenze ammesse prima di valutare una Venture.",
    reasonCode: "VENTURE_PORTFOLIO_NOT_AVAILABLE",
    status: "NOT_AVAILABLE",
  },
  opportunities: [],
  portfolio: null,
  publication: "LOCKED",
  summaries: {
    blockedVentures: 0,
    capacity: "NOT_AVAILABLE",
    founderDecisions: 0,
    portfolioRiskCount: 0,
    readyExperiments: 0,
    venturesInProgress: 0,
  },
  ventures: [],
});

/** Creates an immutable view and checks the cross-record invariants consumed by the UI. */
export function buildCommandCenterVentureView(
  input: Omit<CommandCenterVentureView, "contractVersion" | "externalActions" | "publication">,
): CommandCenterVentureView {
  if (input.portfolio !== null) assertEntity(input.portfolio);
  for (const entity of [...input.opportunities, ...input.ventures, ...input.experiments, ...input.capitalProposals, ...input.briefs, ...input.artifacts]) assertEntity(entity);
  for (const decision of input.decisions) {
    if (!identifier(decision.decisionId) || !identifier(decision.entityId) || !fingerprint(decision.entityFingerprint) || !version(decision.entityVersion) || !timestamp(decision.updatedAt) || decision.question.trim().length === 0 || decision.question.length > 300 || !reasonCode(decision.reasonCode)) throw new Error("Command Center Venture decision is invalid");
  }
  if (!nonNegativeCount(input.summaries.blockedVentures) || !nonNegativeCount(input.summaries.founderDecisions) || !nonNegativeCount(input.summaries.portfolioRiskCount) || !nonNegativeCount(input.summaries.readyExperiments) || !nonNegativeCount(input.summaries.venturesInProgress) || (typeof input.summaries.capacity === "number" && !nonNegativeCount(input.summaries.capacity))) throw new Error("Command Center Venture summary is invalid");
  if (input.summaries.founderDecisions !== input.decisions.length) throw new Error("Command Center Venture decision count is inconsistent");
  if (input.coverage === "COMPLETE" && input.portfolio === null && input.health.status === "READY") throw new Error("Command Center Venture cannot be READY without a portfolio");
  return deepFreeze({ ...input, contractVersion: COMMAND_CENTER_VENTURE_VIEW_CONTRACT_VERSION, externalActions: "LOCKED", publication: "LOCKED" });
}

function assertEntity(value: CommandCenterVentureEntitySummary): void {
  if (!identifier(value.entityId) || !fingerprint(value.fingerprint) || value.title.trim().length === 0 || value.title.length > 240 || !timestamp(value.updatedAt) || !version(value.version)) throw new Error("Command Center Venture entity is invalid");
}
function identifier(value: string): boolean { return /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function fingerprint(value: string): boolean { return /^[a-f0-9]{64}$/u.test(value); }
function reasonCode(value: string): boolean { return /^[A-Z][A-Z0-9_]{1,63}$/u.test(value); }
function timestamp(value: string): boolean { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && Number.isFinite(Date.parse(value)); }
function version(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function nonNegativeCount(value: number): boolean { return Number.isSafeInteger(value) && value >= 0; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
