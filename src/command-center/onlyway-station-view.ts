export const ONLYWAY_STATION_CONTRACT_VERSION = "1" as const;

export const ONLYWAY_STATION_ROOM_IDS = Object.freeze([
  "command",
  "research",
  "venture",
  "factory",
  "communications",
  "treasury",
  "publishing",
  "war_room",
  "archives",
] as const);

export const ONLYWAY_STATION_OPPORTUNITY_LANE_IDS = Object.freeze([
  "original_commerce",
  "transparent_services",
  "licensed_assets",
  "evidence_editorial",
  "software_experiments",
  "rights_cleared_media",
] as const);

export type OnlywayStationCoverage = "COMPLETE" | "LIMIT_REACHED" | "NOT_AVAILABLE";
export type OnlywayStationRoomId = typeof ONLYWAY_STATION_ROOM_IDS[number];
export type OnlywayStationOpportunityLaneId = typeof ONLYWAY_STATION_OPPORTUNITY_LANE_IDS[number];
export type OnlywayStationRoomStatus =
  | "ATTENTION_REQUIRED"
  | "AVAILABLE"
  | "DRAFT_ONLY"
  | "LOCKED"
  | "MEASURED"
  | "NOT_AVAILABLE"
  | "READY"
  | "VALIDATION_REQUIRED";
export type OnlywayStationTone = "cool" | "gold" | "violet" | "warning";

interface StationSectorInput {
  readonly coverage: OnlywayStationCoverage;
}

export interface OnlywayStationBuildInput {
  readonly archives: StationSectorInput & {
    readonly assets: number;
    readonly decisions: number;
    readonly outcomeLinks: number;
    readonly rightsBlockers: number;
  };
  readonly command: StationSectorInput & {
    readonly agentsReady: number;
    readonly agentsTotal: number;
    readonly decisionsRequired: number;
    readonly system: "ATTENTION_REQUIRED" | "READY";
  };
  readonly communications: StationSectorInput & {
    readonly readyForFabio: number;
    readonly requiresResearch: number;
    readonly socialPacks: number;
    readonly trendObservations: number;
  };
  readonly factory: StationSectorInput & {
    readonly blocked: number;
    readonly pendingFabio: number;
    readonly productions: number;
    readonly workdays: number;
  };
  readonly generatedAt: string;
  readonly publishing: StationSectorInput & {
    readonly approvedForScheduling: number;
    readonly readyForFabio: number;
    readonly scheduled: number;
  };
  readonly research: StationSectorInput & {
    readonly evidence: number;
    readonly evidencePacks: number;
    readonly missions: number;
    readonly sources: number;
  };
  readonly treasury: StationSectorInput & {
    readonly attempts: number;
    readonly measuredCostCents: number;
    readonly providerCalls: number;
  };
  readonly venture: StationSectorInput & {
    readonly decisions: number;
    readonly experiments: number;
    readonly health: "ATTENTION_REQUIRED" | "FOUNDER_INPUT_REQUIRED" | "NOT_AVAILABLE" | "READY";
    readonly opportunities: number;
    readonly ventures: number;
  };
  readonly warRoom: StationSectorInput & {
    readonly deadLetterJobs: number;
    readonly decisions: number;
    readonly failedJobs: number;
    readonly openIncidents: number;
  };
}

export interface OnlywayStationRoom {
  readonly callSign: string;
  readonly coverage: OnlywayStationCoverage;
  readonly detail: string;
  readonly externalActions: "LOCKED";
  readonly href: `#${"agents" | "approvals" | "business" | "evidence" | "production" | "social" | "system" | "vault" | "venture"}`;
  readonly index: string;
  readonly metric: string;
  readonly owners: readonly string[];
  readonly publication: "LOCKED";
  readonly roomId: OnlywayStationRoomId;
  readonly status: OnlywayStationRoomStatus;
  readonly title: string;
  readonly tone: OnlywayStationTone;
}

export interface OnlywayStationOpportunityLane {
  readonly externalActions: "LOCKED";
  readonly guardrail: string;
  readonly href: `#${"business" | "evidence" | "production" | "vault" | "venture"}`;
  readonly index: string;
  readonly laneId: OnlywayStationOpportunityLaneId;
  readonly publication: "LOCKED";
  readonly status: "VALIDATION_REQUIRED";
  readonly title: string;
}

export interface OnlywayStationView {
  readonly contractVersion: typeof ONLYWAY_STATION_CONTRACT_VERSION;
  readonly coverage: OnlywayStationCoverage;
  readonly externalActions: "LOCKED";
  readonly generatedAt: string;
  readonly opportunityLanes: readonly OnlywayStationOpportunityLane[];
  readonly publication: "LOCKED";
  readonly rooms: readonly OnlywayStationRoom[];
}

export function buildOnlywayStationView(input: OnlywayStationBuildInput): OnlywayStationView {
  validateInput(input);

  const rooms: OnlywayStationRoom[] = [
    room({
      callSign: "OW",
      coverage: input.command.coverage,
      detail: `${observed(input.command.decisionsRequired, input.command.coverage)} decisioni nella finestra · capacità, non attività simulata`,
      href: "#agents",
      index: "00",
      metric: `${String(input.command.agentsReady)}/${String(input.command.agentsTotal)} capacità ready`,
      owners: ["NEXUS", "APEX"],
      roomId: "command",
      status: input.command.system,
      title: "Founder Bridge",
      tone: "gold",
    }),
    room({
      callSign: "OR",
      coverage: input.research.coverage,
      detail: `${observed(input.research.sources, input.research.coverage)} fonti · ${observed(input.research.missions, input.research.coverage)} missioni`,
      href: "#evidence",
      index: "01",
      metric: input.research.evidencePacks === 0
        ? "Evidence Pack assente"
        : `${observed(input.research.evidencePacks, input.research.coverage)} Evidence Pack`,
      owners: ["ORACLE", "ARCHIVE"],
      roomId: "research",
      status: researchStatus(input.research),
      title: "Signal Observatory",
      tone: "violet",
    }),
    room({
      callSign: "VE",
      coverage: input.venture.coverage,
      detail: `${observed(input.venture.ventures, input.venture.coverage)} venture · ${observed(input.venture.experiments, input.venture.coverage)} esperimenti`,
      href: "#venture",
      index: "02",
      metric: `${observed(input.venture.opportunities, input.venture.coverage)} opportunità`,
      owners: ["VECTOR", "LEDGER"],
      roomId: "venture",
      status: ventureStatus(input.venture.health),
      title: "Venture Foundry",
      tone: "cool",
    }),
    room({
      callSign: "FO",
      coverage: input.factory.coverage,
      detail: `${observed(input.factory.pendingFabio, input.factory.coverage)} in review · ${observed(input.factory.blocked, input.factory.coverage)} bloccate`,
      href: "#production",
      index: "03",
      metric: input.factory.productions === 0
        ? "Produzioni non osservate"
        : `${observed(input.factory.productions, input.factory.coverage)} produzioni`,
      owners: ["PRISM", "FORGE"],
      roomId: "factory",
      status: factoryStatus(input.factory),
      title: "Media Forge",
      tone: "violet",
    }),
    room({
      callSign: "SI",
      coverage: input.communications.coverage,
      detail: `${observed(input.communications.trendObservations, input.communications.coverage)} trend · inbox e messaggi non osservati`,
      href: "#social",
      index: "04",
      metric: input.communications.socialPacks === 0
        ? "Social Pack assenti"
        : `${observed(input.communications.socialPacks, input.communications.coverage)} Social Pack`,
      owners: ["PULSE", "BRIDGE"],
      roomId: "communications",
      status: input.communications.socialPacks + input.communications.trendObservations === 0 ? "NOT_AVAILABLE" : "DRAFT_ONLY",
      title: "Relationship Desk",
      tone: "cool",
    }),
    room({
      callSign: "LE",
      coverage: input.treasury.coverage,
      detail: `${observed(input.treasury.attempts, input.treasury.coverage)} tentativi · ${observed(input.treasury.providerCalls, input.treasury.coverage)} provider call`,
      href: "#business",
      index: "05",
      metric: input.treasury.attempts === 0
        ? "Costo non osservato"
        : `${String(input.treasury.measuredCostCents)} cent misurati`,
      owners: ["LEDGER", "SCALE"],
      roomId: "treasury",
      status: input.treasury.attempts === 0 ? "NOT_AVAILABLE" : "MEASURED",
      title: "Capital Chamber",
      tone: "gold",
    }),
    room({
      callSign: "LA",
      coverage: input.publishing.coverage,
      detail: `${observed(input.publishing.readyForFabio, input.publishing.coverage)} pronte per Fabio · nessun post autorizzato`,
      href: "#approvals",
      index: "06",
      metric: "Publication locked",
      owners: ["LAUNCH", "AEGIS"],
      roomId: "publishing",
      status: "LOCKED",
      title: "Distribution Airlock",
      tone: "warning",
    }),
    room({
      callSign: "WR",
      coverage: input.warRoom.coverage,
      detail: `${observed(input.warRoom.openIncidents, input.warRoom.coverage)} incidenti · ${observed(input.warRoom.deadLetterJobs, input.warRoom.coverage)} dead-letter`,
      href: "#system",
      index: "07",
      metric: input.warRoom.decisions === 0
        ? "Record di crisi non osservati"
        : `${observed(input.warRoom.decisions, input.warRoom.coverage)} decisioni`,
      owners: ["SENTINEL", "CIPHER"],
      roomId: "war_room",
      status: warRoomStatus(input.warRoom),
      title: "Experiment & Recovery",
      tone: "warning",
    }),
    room({
      callSign: "AR",
      coverage: input.archives.coverage,
      detail: `${observed(input.archives.decisions, input.archives.coverage)} decisioni · ${observed(input.archives.rightsBlockers, input.archives.coverage)} blocker diritti`,
      href: "#vault",
      index: "08",
      metric: input.archives.assets === 0
        ? "Riferimenti non osservati"
        : `${observed(input.archives.assets, input.archives.coverage)} riferimenti`,
      owners: ["ARCHIVE", "VAULT"],
      roomId: "archives",
      status: input.archives.assets + input.archives.decisions + input.archives.outcomeLinks === 0 ? "NOT_AVAILABLE" : "AVAILABLE",
      title: "Intelligence Vault",
      tone: "violet",
    }),
  ];

  const view: OnlywayStationView = {
    contractVersion: ONLYWAY_STATION_CONTRACT_VERSION,
    coverage: combineCoverage(...rooms.map(({ coverage }) => coverage)),
    externalActions: "LOCKED",
    generatedAt: input.generatedAt,
    opportunityLanes: opportunityLanes(),
    publication: "LOCKED",
    rooms,
  };
  return deepFreeze(view);
}

function room(input: Omit<OnlywayStationRoom, "externalActions" | "publication">): OnlywayStationRoom {
  return {
    ...input,
    externalActions: "LOCKED",
    publication: "LOCKED",
  };
}

function researchStatus(input: OnlywayStationBuildInput["research"]): OnlywayStationRoomStatus {
  const observedRecords = input.sources + input.evidence + input.evidencePacks + input.missions;
  if (observedRecords === 0) return "NOT_AVAILABLE";
  return input.evidencePacks > 0 ? "MEASURED" : "VALIDATION_REQUIRED";
}

function ventureStatus(health: OnlywayStationBuildInput["venture"]["health"]): OnlywayStationRoomStatus {
  if (health === "READY") return "READY";
  if (health === "NOT_AVAILABLE") return "NOT_AVAILABLE";
  return "ATTENTION_REQUIRED";
}

function factoryStatus(input: OnlywayStationBuildInput["factory"]): OnlywayStationRoomStatus {
  if (input.blocked > 0) return "ATTENTION_REQUIRED";
  if (input.pendingFabio > 0) return "VALIDATION_REQUIRED";
  return input.productions + input.workdays === 0 ? "NOT_AVAILABLE" : "MEASURED";
}

function warRoomStatus(input: OnlywayStationBuildInput["warRoom"]): OnlywayStationRoomStatus {
  const attention = input.decisions + input.openIncidents + input.failedJobs + input.deadLetterJobs;
  return attention === 0 ? "NOT_AVAILABLE" : "ATTENTION_REQUIRED";
}

function opportunityLanes(): OnlywayStationOpportunityLane[] {
  return [
    lane("original_commerce", "01", "Original Commerce", "#venture", "Asset originali o autorizzati; domanda, fee, resi e delivery devono essere verificati."),
    lane("transparent_services", "02", "Transparent Creative Services", "#business", "Valore, revisioni, licenza, tempi e responsabilità devono essere dichiarati al cliente."),
    lane("licensed_assets", "03", "Licensed Digital Assets", "#vault", "Provenance, licenza, allowed use e controllo IP precedono qualsiasi offerta."),
    lane("evidence_editorial", "04", "Evidence-led Editorial", "#evidence", "Fonti verificabili, disclosure affiliate e separazione netta tra prova, opinione e claim."),
    lane("software_experiments", "05", "Software Experiments", "#venture", "Customer discovery e acceptance criteria prima di build, deploy o accesso cliente."),
    lane("rights_cleared_media", "06", "Rights-cleared Media", "#production", "Origine, licenza, fingerprint e compatibilità di canale devono essere attestati."),
  ];
}

function lane(
  laneId: OnlywayStationOpportunityLaneId,
  index: string,
  title: string,
  href: OnlywayStationOpportunityLane["href"],
  guardrail: string,
): OnlywayStationOpportunityLane {
  return {
    externalActions: "LOCKED",
    guardrail,
    href,
    index,
    laneId,
    publication: "LOCKED",
    status: "VALIDATION_REQUIRED",
    title,
  };
}

function observed(value: number, coverage: OnlywayStationCoverage): string {
  return coverage === "LIMIT_REACHED" ? `≥ ${String(value)}` : String(value);
}

function combineCoverage(...values: readonly OnlywayStationCoverage[]): OnlywayStationCoverage {
  if (values.includes("LIMIT_REACHED")) return "LIMIT_REACHED";
  if (values.includes("NOT_AVAILABLE")) return "NOT_AVAILABLE";
  return "COMPLETE";
}

function validateInput(input: OnlywayStationBuildInput): void {
  if (!Number.isFinite(Date.parse(input.generatedAt))) throw new TypeError("Onlyway Station generatedAt must be an ISO timestamp");
  for (const [sector, value] of Object.entries(input)) {
    if (sector === "generatedAt") continue;
    if (!value || typeof value !== "object") throw new TypeError(`Onlyway Station ${sector} must be an object`);
    const record = value as Readonly<Record<string, unknown>>;
    if (!isCoverage(record.coverage)) throw new TypeError(`Onlyway Station ${sector}.coverage is invalid`);
    for (const [field, candidate] of Object.entries(record)) {
      if (field === "coverage" || field === "health" || field === "system") continue;
      if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate < 0 || !Number.isInteger(candidate)) {
        throw new TypeError(`Onlyway Station ${sector}.${field} must be a non-negative integer`);
      }
    }
  }
  if (!["ATTENTION_REQUIRED", "READY"].includes(input.command.system)) throw new TypeError("Onlyway Station command.system is invalid");
  if (!["ATTENTION_REQUIRED", "FOUNDER_INPUT_REQUIRED", "NOT_AVAILABLE", "READY"].includes(input.venture.health)) {
    throw new TypeError("Onlyway Station venture.health is invalid");
  }
}

function isCoverage(value: unknown): value is OnlywayStationCoverage {
  return value === "COMPLETE" || value === "LIMIT_REACHED" || value === "NOT_AVAILABLE";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
