import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import type { JsonObject } from "../contracts/json.js";
import { RepositoryConflictError, RepositoryValidationError } from "../errors/core-error.js";
import type { Clock } from "../ports/clock.js";
import { OPERATIONAL_AGENT_COMPANY_CATALOG, type OperationalAgentGate, type OperationalAgentId } from "../agent-company/operational-agent-company.js";

export const VENTURE_CELL_CONTRACT_VERSION = "1" as const;
export type VentureCellStatus = "AWAITING_FABIO" | "BLOCKED" | "RUNNING";
export type VentureCellTaskStatus = "BLOCKED" | "COMPLETED" | "QUEUED" | "RUNNING";

export interface VentureCellInput {
  readonly cellId: string;
  readonly evidenceRefs: readonly string[];
  readonly externalActions: "LOCKED";
  readonly maxBudgetCents: number;
  readonly objective: string;
  readonly thesisFingerprint: string;
  readonly thesisId: string;
  readonly thesisVersion: number;
  readonly ventureId: string;
}

export interface VentureCellBlocker {
  readonly evidence: readonly string[];
  readonly missingInput: string;
  readonly nextAction: string;
  readonly owner: OperationalAgentId | "FABIO" | "OPERATIONS_RUNTIME";
  readonly reasonCode: string;
}

export interface VentureCellTaskReceipt {
  readonly costCents: number;
  readonly externalActionsExecuted: false;
  readonly outcome: "BLOCKED" | "COMPLETED";
  readonly outputFingerprint?: string;
  readonly providerCalls: 0;
  readonly receiptId: string;
  readonly recordedAt: string;
  readonly toolCalls: number;
}

export interface VentureCellTask {
  readonly agentId: OperationalAgentId;
  readonly attempts: number;
  readonly blocker?: VentureCellBlocker;
  readonly completedAt?: string;
  readonly dependencies: readonly OperationalAgentId[];
  readonly executorId: string;
  readonly gates: readonly OperationalAgentGate[];
  readonly output?: JsonObject;
  readonly outputFingerprint?: string;
  readonly receipt?: VentureCellTaskReceipt;
  readonly startedAt?: string;
  readonly status: VentureCellTaskStatus;
  readonly taskType: VentureCellTaskType;
}

export type VentureCellTaskType =
  | "VENTURE_BACKUP_RECOVERY_REVIEW"
  | "VENTURE_CAPITAL_AND_COST_GATE"
  | "VENTURE_CONTENT_ACQUISITION_DIRECTION"
  | "VENTURE_CONTENT_SOURCE_PACK"
  | "VENTURE_DELIVERY_BLUEPRINT"
  | "VENTURE_ECONOMICS_AND_SENSITIVITY"
  | "VENTURE_EVIDENCE_MAP"
  | "VENTURE_FOUNDER_DECISION_PACK"
  | "VENTURE_KNOWLEDGE_PROVENANCE"
  | "VENTURE_LAUNCH_DRY_RUN"
  | "VENTURE_OPPORTUNITY_THESIS_EXPERIMENTS"
  | "VENTURE_OUTREACH_DRAFTS"
  | "VENTURE_QUALITY_GATE"
  | "VENTURE_RISK_GATE"
  | "VENTURE_RISK_REGISTER"
  | "VENTURE_TECHNICAL_PROTOTYPE_PLAN"
  | "VENTURE_TECHNICAL_SAFETY_REVIEW";

export interface VentureCellRecord {
  readonly actorId: string;
  readonly cellId: string;
  readonly contractVersion: typeof VENTURE_CELL_CONTRACT_VERSION;
  readonly createdAt: string;
  readonly externalActionsExecuted: false;
  readonly input: VentureCellInput;
  readonly inputFingerprint: string;
  readonly publication: "LOCKED";
  readonly status: VentureCellStatus;
  readonly tasks: readonly VentureCellTask[];
  readonly updatedAt: string;
  readonly version: number;
  readonly workspaceId: string;
}

export type VentureCellExecutorResult = Readonly<
  | {
    readonly costCents: number;
    readonly externalActionsExecuted: false;
    readonly output: JsonObject;
    readonly providerCalls: 0;
    readonly status: "COMPLETED";
    readonly toolCalls: number;
  }
  | {
    readonly blocker: VentureCellBlocker;
    readonly costCents: number;
    readonly externalActionsExecuted: false;
    readonly providerCalls: 0;
    readonly status: "BLOCKED";
    readonly toolCalls: number;
  }
>;

export interface VentureCellExecutor {
  execute(input: Readonly<{
    readonly cell: VentureCellRecord;
    readonly signal: AbortSignal;
    readonly task: VentureCellTask;
  }>): Promise<VentureCellExecutorResult>;
}

export interface VentureCellRepository {
  getByOwner(input: Readonly<{ readonly actorId: string; readonly cellId: string; readonly workspaceId: string }>): Promise<VentureCellRecord | undefined>;
  insert(record: VentureCellRecord): Promise<void>;
  update(record: VentureCellRecord, expected: Readonly<{ readonly version: number }>): Promise<void>;
}

const TASK_BY_AGENT: Readonly<Record<OperationalAgentId, VentureCellTaskType>> = Object.freeze({
  "backup-guardian": "VENTURE_BACKUP_RECOVERY_REVIEW",
  "business-agent": "VENTURE_OPPORTUNITY_THESIS_EXPERIMENTS",
  "content-director": "VENTURE_CONTENT_ACQUISITION_DIRECTION",
  "content-producer": "VENTURE_CONTENT_SOURCE_PACK",
  "cost-guardian": "VENTURE_CAPITAL_AND_COST_GATE",
  "customer-delivery-agent": "VENTURE_DELIVERY_BLUEPRINT",
  "developer-agent": "VENTURE_TECHNICAL_PROTOTYPE_PLAN",
  "finance-cost-analyst": "VENTURE_ECONOMICS_AND_SENSITIVITY",
  "knowledge-curator": "VENTURE_KNOWLEDGE_PROVENANCE",
  "legal-risk-reviewer": "VENTURE_RISK_REGISTER",
  "onlyway-assistant": "VENTURE_FOUNDER_DECISION_PACK",
  "publisher-agent": "VENTURE_LAUNCH_DRY_RUN",
  "quality-guardian": "VENTURE_QUALITY_GATE",
  "research-agent": "VENTURE_EVIDENCE_MAP",
  "risk-guardian": "VENTURE_RISK_GATE",
  "sales-agent": "VENTURE_OUTREACH_DRAFTS",
  "security-guardian": "VENTURE_TECHNICAL_SAFETY_REVIEW",
});

const DEPENDENCIES: Readonly<Record<OperationalAgentId, readonly OperationalAgentId[]>> = deepFreeze({
  "backup-guardian": ["knowledge-curator"],
  "business-agent": ["research-agent"],
  "content-director": ["business-agent"],
  "content-producer": ["content-director"],
  "cost-guardian": ["finance-cost-analyst"],
  "customer-delivery-agent": ["business-agent"],
  "developer-agent": ["onlyway-assistant"],
  "finance-cost-analyst": ["business-agent"],
  "knowledge-curator": ["research-agent", "business-agent"],
  "legal-risk-reviewer": ["business-agent"],
  "onlyway-assistant": [],
  "publisher-agent": ["content-producer", "legal-risk-reviewer"],
  "quality-guardian": ["content-producer", "sales-agent", "customer-delivery-agent"],
  "research-agent": ["onlyway-assistant"],
  "risk-guardian": ["legal-risk-reviewer"],
  "sales-agent": ["business-agent"],
  "security-guardian": ["developer-agent", "publisher-agent"],
});

/**
 * Venture-specific orchestration over the existing seventeen executor identities.
 * It cannot publish or spend; each task receives a receipt and is checkpointed for restart.
 */
export class VentureCellService {
  readonly #executors: ReadonlyMap<OperationalAgentId, VentureCellExecutor>;

  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly executors: Readonly<Partial<Record<OperationalAgentId, VentureCellExecutor>>>;
    readonly repository: VentureCellRepository;
    readonly workspaceId: string;
  }) {
    assertId(dependencies.actorId, "Venture Cell actor");
    assertId(dependencies.workspaceId, "Venture Cell workspace");
    const executors = new Map<OperationalAgentId, VentureCellExecutor>();
    for (const agent of OPERATIONAL_AGENT_COMPANY_CATALOG) {
      const executor = dependencies.executors[agent.agentId];
      if (executor === undefined) throw new RepositoryValidationError("Venture Cell executor registry is incomplete");
      executors.set(agent.agentId, executor);
    }
    this.#executors = executors;
  }

  public async run(value: unknown, signal: AbortSignal = new AbortController().signal): Promise<VentureCellRecord> {
    const input = validateInput(value);
    signal.throwIfAborted();
    const inputFingerprint = canonicalSha256(input);
    let record = await this.dependencies.repository.getByOwner({ actorId: this.dependencies.actorId, cellId: input.cellId, workspaceId: this.dependencies.workspaceId });
    if (record === undefined) {
      record = initialRecord(this.dependencies.actorId, this.dependencies.workspaceId, input, inputFingerprint, this.dependencies.clock.now().toISOString());
      await this.dependencies.repository.insert(record);
    } else if (record.actorId !== this.dependencies.actorId || record.workspaceId !== this.dependencies.workspaceId || record.inputFingerprint !== inputFingerprint) throw new RepositoryConflictError("Venture Cell identity conflicts with durable state");
    if (record.status === "AWAITING_FABIO" || record.status === "BLOCKED") return record;
    if (record.tasks.some(({ status }) => status === "RUNNING")) record = await this.#recover(record);

    for (const catalog of OPERATIONAL_AGENT_COMPANY_CATALOG) {
      const current: VentureCellRecord = record;
      const task: VentureCellTask | undefined = current.tasks.find(({ agentId }: VentureCellTask) => agentId === catalog.agentId);
      if (task === undefined) throw new RepositoryValidationError("Venture Cell task is missing");
      if (task.status === "COMPLETED") continue;
      const incomplete: readonly OperationalAgentId[] = task.dependencies.filter((dependency: OperationalAgentId) => current.tasks.find(({ agentId }: VentureCellTask) => agentId === dependency)?.status !== "COMPLETED");
      if (incomplete.length > 0) return this.#blockDependency(current, task.agentId, incomplete);
      record = await this.#markRunning(current, task.agentId);
      const executor = this.#executors.get(task.agentId);
      if (executor === undefined) throw new RepositoryValidationError("Venture Cell executor is unavailable");
      const result = await executor.execute({ cell: record, signal, task: record.tasks.find(({ agentId }) => agentId === task.agentId) ?? task });
      signal.throwIfAborted();
      validateExecutorResult(result);
      record = result.status === "BLOCKED" ? await this.#block(record, task.agentId, result) : await this.#complete(record, task.agentId, result);
      if (record.status === "BLOCKED") return record;
    }
    return this.#update(record, { status: "AWAITING_FABIO", updatedAt: this.dependencies.clock.now().toISOString() });
  }

  public async inspect(cellId: string): Promise<VentureCellRecord> {
    assertId(cellId, "Venture Cell ID");
    const value = await this.dependencies.repository.getByOwner({ actorId: this.dependencies.actorId, cellId, workspaceId: this.dependencies.workspaceId });
    if (value?.actorId !== this.dependencies.actorId || value.workspaceId !== this.dependencies.workspaceId) throw new RepositoryConflictError("Venture Cell is unavailable");
    return value;
  }

  async #recover(record: VentureCellRecord): Promise<VentureCellRecord> {
    return this.#update(record, {
      tasks: record.tasks.map((task) => task.status !== "RUNNING" ? task : deepFreeze({ ...without(task, "startedAt"), status: "QUEUED" as const })),
      updatedAt: this.dependencies.clock.now().toISOString(),
    });
  }

  async #markRunning(record: VentureCellRecord, agentId: OperationalAgentId): Promise<VentureCellRecord> {
    const now = this.dependencies.clock.now().toISOString();
    return this.#update(record, { tasks: record.tasks.map((task) => task.agentId !== agentId ? task : deepFreeze({ ...task, attempts: task.attempts + 1, gates: [], startedAt: now, status: "RUNNING" as const })), updatedAt: now });
  }

  async #complete(record: VentureCellRecord, agentId: OperationalAgentId, result: Extract<VentureCellExecutorResult, { readonly status: "COMPLETED" }>): Promise<VentureCellRecord> {
    const now = this.dependencies.clock.now().toISOString();
    const outputFingerprint = canonicalSha256(result.output);
    const gates = gatesFor(result, record.input.maxBudgetCents, record.tasks);
    const blocked = gates.find(({ status }) => status === "BLOCKED");
    if (blocked !== undefined) return this.#block(record, agentId, { blocker: gateBlocker(agentId, blocked), costCents: result.costCents, externalActionsExecuted: false, providerCalls: 0, status: "BLOCKED", toolCalls: result.toolCalls });
    const receipt = receiptFor(record, agentId, "COMPLETED", now, result.costCents, result.toolCalls, outputFingerprint);
    return this.#update(record, { tasks: record.tasks.map((task) => task.agentId !== agentId ? task : deepFreeze({ ...task, completedAt: now, gates, output: result.output, outputFingerprint, receipt, status: "COMPLETED" as const })), updatedAt: now });
  }

  async #block(record: VentureCellRecord, agentId: OperationalAgentId, result: Extract<VentureCellExecutorResult, { readonly status: "BLOCKED" }>): Promise<VentureCellRecord> {
    const now = this.dependencies.clock.now().toISOString();
    const receipt = receiptFor(record, agentId, "BLOCKED", now, result.costCents, result.toolCalls);
    return this.#update(record, { status: "BLOCKED", tasks: record.tasks.map((task) => task.agentId !== agentId ? task : deepFreeze({ ...task, blocker: result.blocker, completedAt: now, gates: [gate("QUALITY", [result.blocker.reasonCode])], receipt, status: "BLOCKED" as const })), updatedAt: now });
  }

  #blockDependency(record: VentureCellRecord, agentId: OperationalAgentId, incomplete: readonly OperationalAgentId[]): Promise<VentureCellRecord> {
    return this.#block(record, agentId, {
      blocker: deepFreeze({ evidence: incomplete.map((dependency) => `${dependency}:INCOMPLETE`), missingInput: "Manca una receipt COMPLETED per ogni dipendenza.", nextAction: "Recupera o completa la dipendenza senza saltare il grafo della Venture Cell.", owner: "OPERATIONS_RUNTIME", reasonCode: "DEPENDENCY_NOT_COMPLETED" }),
      costCents: 0,
      externalActionsExecuted: false,
      providerCalls: 0,
      status: "BLOCKED",
      toolCalls: 0,
    });
  }

  async #update(record: VentureCellRecord, changes: Partial<VentureCellRecord>): Promise<VentureCellRecord> {
    const next = deepFreeze({ ...record, ...changes, version: record.version + 1 });
    await this.dependencies.repository.update(next, { version: record.version });
    return next;
  }
}

function initialRecord(actorId: string, workspaceId: string, input: VentureCellInput, inputFingerprint: string, now: string): VentureCellRecord {
  return deepFreeze({ actorId, cellId: input.cellId, contractVersion: VENTURE_CELL_CONTRACT_VERSION, createdAt: now, externalActionsExecuted: false, input, inputFingerprint, publication: "LOCKED", status: "RUNNING", tasks: OPERATIONAL_AGENT_COMPANY_CATALOG.map((agent) => ({ agentId: agent.agentId, attempts: 0, dependencies: DEPENDENCIES[agent.agentId], executorId: agent.executorId, gates: [], status: "QUEUED", taskType: TASK_BY_AGENT[agent.agentId] })), updatedAt: now, version: 0, workspaceId });
}

function validateInput(value: unknown): VentureCellInput {
  if (!record(value) || Object.keys(value).sort().join(",") !== "cellId,evidenceRefs,externalActions,maxBudgetCents,objective,thesisFingerprint,thesisId,thesisVersion,ventureId" || !id(value.cellId) || !id(value.ventureId) || !id(value.thesisId) || !fingerprint(value.thesisFingerprint) || !integer(value.thesisVersion, 0, Number.MAX_SAFE_INTEGER) || !integer(value.maxBudgetCents, 0, 1_000_000_000) || value.externalActions !== "LOCKED" || typeof value.objective !== "string" || value.objective.trim().length === 0 || value.objective.length > 500 || secretLike(value.objective) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 100 || value.evidenceRefs.some((item) => !id(item)) || new Set(value.evidenceRefs).size !== value.evidenceRefs.length) throw new RepositoryValidationError("Venture Cell input is invalid");
  return deepFreeze(structuredClone(value as unknown as VentureCellInput));
}
function validateExecutorResult(value: VentureCellExecutorResult): void {
  if (!integer(value.costCents, 0, 1_000_000_000) || !integer(value.toolCalls, 0, 1_000)) throw new RepositoryValidationError("Venture Cell executor result is invalid");
  if (value.status === "COMPLETED" && (!record(value.output) || Object.keys(value.output).length === 0 || externalEffectClaim(value.output))) throw new RepositoryValidationError("Venture Cell completed output is invalid");
  if (value.status === "BLOCKED" && (!reasonCode(value.blocker.reasonCode) || value.blocker.nextAction.trim().length === 0 || value.blocker.missingInput.trim().length === 0)) throw new RepositoryValidationError("Venture Cell blocker is invalid");
}
function gatesFor(result: Extract<VentureCellExecutorResult, { readonly status: "COMPLETED" }>, maxBudgetCents: number, tasks: readonly VentureCellTask[]): readonly OperationalAgentGate[] {
  const cost = tasks.reduce((sum, task) => sum + (task.receipt?.costCents ?? 0), 0) + result.costCents;
  return deepFreeze([gate("QUALITY", []), gate("RISK", externalEffectClaim(result.output) ? ["EXTERNAL_EFFECT_DECLARED"] : []), gate("COST", cost > maxBudgetCents ? ["VENTURE_CELL_BUDGET_EXCEEDED"] : [])]);
}
function gate(name: OperationalAgentGate["gate"], findings: readonly string[]): OperationalAgentGate { return deepFreeze({ findings: [...findings], gate: name, score: findings.length === 0 ? 100 : 0, status: findings.length === 0 ? "PASSED" : "BLOCKED" }); }
function gateBlocker(agentId: OperationalAgentId, value: OperationalAgentGate): VentureCellBlocker { return deepFreeze({ evidence: value.findings, missingInput: `Manca un output che superi il ${value.gate} Gate.`, nextAction: "Correggi l'output e riesegui la stessa Venture Cell identity.", owner: agentId, reasonCode: `${value.gate}_GATE_BLOCKED` }); }
function receiptFor(record: VentureCellRecord, agentId: OperationalAgentId, outcome: VentureCellTaskReceipt["outcome"], now: string, costCents: number, toolCalls: number, outputFingerprint?: string): VentureCellTaskReceipt {
  return deepFreeze({ costCents, externalActionsExecuted: false, outcome, ...(outputFingerprint === undefined ? {} : { outputFingerprint }), providerCalls: 0, receiptId: `venture-cell-${canonicalSha256({ agentId, attempt: record.tasks.find((task) => task.agentId === agentId)?.attempts, cellId: record.cellId, outcome }).slice(0, 48)}`, recordedAt: now, toolCalls });
}
function externalEffectClaim(value: JsonObject): boolean { return /"(?:contactExecuted|deliveryExecuted|deployExecuted|externalActionsExecuted|mergeExecuted|publicationExecuted|spendingExecuted)":true/u.test(JSON.stringify(value)); }
function secretLike(value: string): boolean { return /(?:\bsk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~-]{8,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/iu.test(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value); }
function assertId(value: string, label: string): void { if (!id(value)) throw new RepositoryValidationError(`${label} is invalid`); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function integer(value: unknown, minimum: number, maximum: number): value is number { return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum; }
function reasonCode(value: string): boolean { return /^[A-Z][A-Z0-9_]{1,63}$/u.test(value); }
function without<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> { const { [key]: removed, ...rest } = value; void removed; return rest; }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
