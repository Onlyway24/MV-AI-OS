import { createHash, randomUUID } from "node:crypto";
import { constants as filesystemConstants } from "node:fs";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const MAX_LEDGER_BYTES = 4_194_304;
const LOCK_ATTEMPTS = 100;
const LOCK_RETRY_MS = 20;
const CORRUPT_LOCK_RECOVERY_MS = 30_000;

export const ZERO_COST_POLICY: ProductionCostPolicy = Object.freeze({
  currency: "EUR",
  dailyLimitCents: 0,
  monthlyLimitCents: 0,
  perAgentLimitCents: 0,
  perMissionLimitCents: 0,
  perProviderLimitCents: 0,
  spendingAuthorized: false,
});

export interface ProductionCostPolicy {
  readonly currency: "EUR";
  readonly dailyLimitCents: number;
  readonly monthlyLimitCents: number;
  readonly perAgentLimitCents: number;
  readonly perMissionLimitCents: number;
  readonly perProviderLimitCents: number;
  readonly spendingAuthorized: boolean;
}

export interface FabioCostApproval {
  readonly actorId: string;
  readonly approvedAt: string;
  readonly commandFingerprint: string;
  readonly maxCostCents: number;
  readonly receiptId: string;
}

export interface FabioCostApprovalVerifier {
  verify(input: Readonly<{
    readonly approval: FabioCostApproval;
    readonly request: Omit<CostReservationRequest, "approval">;
  }>): Promise<boolean>;
}

export interface CostReservationRequest {
  readonly agentId: string;
  readonly approval?: FabioCostApproval;
  readonly estimatedCostCents: number;
  readonly estimatedProviderCalls: number;
  readonly missionId: string;
  readonly providerId: string;
  readonly reservationId: string;
}

export interface CostSettlementRequest {
  readonly actualCostCents: number;
  readonly actualProviderCalls: number;
  readonly providerReceiptRef: string;
  readonly reservationId: string;
}

export interface CostReservationReceipt {
  readonly costCents: number;
  readonly currency: "EUR";
  readonly providerCalls: number;
  readonly receiptId: string;
  readonly reservationId: string;
  readonly status: "RESERVED";
}

export interface CostSettlementReceipt {
  readonly actualCostCents: number;
  readonly actualProviderCalls: number;
  readonly currency: "EUR";
  readonly receiptId: string;
  readonly reservationId: string;
  readonly status: "BLOCKED_ANOMALY" | "SETTLED";
}

export interface CostControlStatus {
  readonly anomalyStop: boolean;
  readonly currency: "EUR";
  readonly killSwitch: "ACTIVE" | "RELEASED";
  readonly openReservations: number;
  readonly paidProviderCallsAllowed: boolean;
  readonly settledCostCents: number;
  readonly spendingAuthorized: boolean;
}

interface ReservationRecord {
  readonly agentId: string;
  readonly createdAt: string;
  readonly estimatedCostCents: number;
  readonly estimatedProviderCalls: number;
  readonly missionId: string;
  readonly providerId: string;
  readonly reservationId: string;
  readonly status: "OPEN" | "SETTLED";
}

interface SettlementRecord {
  readonly actualCostCents: number;
  readonly actualProviderCalls: number;
  readonly providerReceiptRef: string;
  readonly recordedAt: string;
  readonly reservationId: string;
}

export interface ProductionCostLedgerState {
  readonly anomalyStop: boolean;
  readonly contractVersion: "1";
  readonly killSwitch: "ACTIVE" | "RELEASED";
  readonly reservations: readonly ReservationRecord[];
  readonly settlements: readonly SettlementRecord[];
}

export interface ProductionCostLedgerRepository {
  transaction<T>(
    operation: (
      current: ProductionCostLedgerState,
    ) => Readonly<{ readonly next: ProductionCostLedgerState; readonly result: T }>,
  ): Promise<T>;
}

export class ProductionCostControl {
  readonly #approvalVerifier: FabioCostApprovalVerifier | undefined;
  readonly #policy: ProductionCostPolicy;

  public constructor(
    private readonly input: Readonly<{
      readonly approvalVerifier?: FabioCostApprovalVerifier;
      readonly clock: Readonly<{ now(): Date }>;
      readonly policy?: ProductionCostPolicy;
      readonly repository: ProductionCostLedgerRepository;
    }>,
  ) {
    this.#policy = validatePolicy(input.policy ?? ZERO_COST_POLICY);
    this.#approvalVerifier = input.approvalVerifier;
    if (this.#policy.spendingAuthorized && this.#approvalVerifier === undefined) {
      throw new Error(
        "Authorized spending policy requires a Fabio approval verifier",
      );
    }
  }

  public async reserve(request: CostReservationRequest): Promise<CostReservationReceipt> {
    validateReservationRequest(request);
    if (
      request.estimatedCostCents > 0 ||
      request.estimatedProviderCalls > 0
    ) {
      const approval = request.approval;
      const unsignedRequest = Object.freeze({
        agentId: request.agentId,
        estimatedCostCents: request.estimatedCostCents,
        estimatedProviderCalls: request.estimatedProviderCalls,
        missionId: request.missionId,
        providerId: request.providerId,
        reservationId: request.reservationId,
      });
      if (
        approval === undefined ||
        this.#approvalVerifier === undefined ||
        !await this.#approvalVerifier.verify({
          approval,
          request: unsignedRequest,
        })
      ) {
        throw new Error(
          "Paid provider reservation requires verified Fabio approval authority",
        );
      }
    }
    return this.input.repository.transaction((current) => {
      const existing = current.reservations.find(
        ({ reservationId }) => reservationId === request.reservationId,
      );
      if (existing !== undefined) {
        if (!sameReservation(existing, request)) {
          throw new Error("Cost reservation identity conflicts with durable state");
        }
        return {
          next: current,
          result: reservationReceipt(existing),
        };
      }
      assertCostControlOpen(current);
      const now = this.input.clock.now();
      assertApproval(request, this.#policy, now);
      assertWithinBudgets(current, request, this.#policy, now);
      const record: ReservationRecord = Object.freeze({
        agentId: request.agentId,
        createdAt: this.input.clock.now().toISOString(),
        estimatedCostCents: request.estimatedCostCents,
        estimatedProviderCalls: request.estimatedProviderCalls,
        missionId: request.missionId,
        providerId: request.providerId,
        reservationId: request.reservationId,
        status: "OPEN",
      });
      const next = state({
        ...current,
        reservations: [...current.reservations, record],
      });
      return { next, result: reservationReceipt(record) };
    });
  }

  public async settle(request: CostSettlementRequest): Promise<CostSettlementReceipt> {
    validateSettlementRequest(request);
    return this.input.repository.transaction((current) => {
      const reservation = current.reservations.find(
        ({ reservationId }) => reservationId === request.reservationId,
      );
      if (reservation === undefined) throw new Error("Cost reservation does not exist");
      const prior = current.settlements.find(
        ({ reservationId }) => reservationId === request.reservationId,
      );
      if (prior !== undefined) {
        if (
          prior.actualCostCents !== request.actualCostCents ||
          prior.actualProviderCalls !== request.actualProviderCalls ||
          prior.providerReceiptRef !== request.providerReceiptRef
        ) {
          throw new Error("Cost settlement identity conflicts with durable state");
        }
        const priorWasAnomaly =
          prior.actualCostCents > reservation.estimatedCostCents ||
          prior.actualProviderCalls > reservation.estimatedProviderCalls;
        return {
          next: current,
          result: settlementReceipt(
            prior,
            priorWasAnomaly ? "BLOCKED_ANOMALY" : "SETTLED",
          ),
        };
      }
      const anomaly =
        request.actualCostCents > reservation.estimatedCostCents ||
        request.actualProviderCalls > reservation.estimatedProviderCalls;
      const settlement: SettlementRecord = Object.freeze({
        actualCostCents: request.actualCostCents,
        actualProviderCalls: request.actualProviderCalls,
        providerReceiptRef: request.providerReceiptRef,
        recordedAt: this.input.clock.now().toISOString(),
        reservationId: request.reservationId,
      });
      const reservations = current.reservations.map((entry) =>
        entry.reservationId === request.reservationId
          ? Object.freeze({ ...entry, status: "SETTLED" as const })
          : entry,
      );
      const next = state({
        ...current,
        anomalyStop: current.anomalyStop || anomaly,
        killSwitch: anomaly ? "ACTIVE" : current.killSwitch,
        reservations,
        settlements: [...current.settlements, settlement],
      });
      return {
        next,
        result: settlementReceipt(
          settlement,
          anomaly ? "BLOCKED_ANOMALY" : "SETTLED",
        ),
      };
    });
  }

  public async activateKillSwitch(): Promise<void> {
    await this.input.repository.transaction((current) => ({
      next: state({ ...current, killSwitch: "ACTIVE" }),
      result: undefined,
    }));
  }

  public async status(): Promise<CostControlStatus> {
    return this.input.repository.transaction((current) => ({
      next: current,
      result: Object.freeze({
        anomalyStop: current.anomalyStop,
        currency: this.#policy.currency,
        killSwitch: current.killSwitch,
        openReservations: current.reservations.filter(({ status }) => status === "OPEN").length,
        paidProviderCallsAllowed:
          this.#policy.spendingAuthorized &&
          Math.min(
            this.#policy.dailyLimitCents,
            this.#policy.monthlyLimitCents,
            this.#policy.perAgentLimitCents,
            this.#policy.perMissionLimitCents,
            this.#policy.perProviderLimitCents,
          ) > 0 &&
          !current.anomalyStop &&
          current.killSwitch === "RELEASED",
        settledCostCents: current.settlements.reduce(
          (total, { actualCostCents }) => total + actualCostCents,
          0,
        ),
        spendingAuthorized: this.#policy.spendingAuthorized,
      }),
    }));
  }
}

export function costApprovalFingerprint(
  request: Omit<CostReservationRequest, "approval">,
): string {
  return createHash("sha256")
    .update(
      [
        request.reservationId,
        request.missionId,
        request.agentId,
        request.providerId,
        String(request.estimatedCostCents),
        String(request.estimatedProviderCalls),
      ].join("\n"),
      "utf8",
    )
    .digest("hex");
}

export class FileProductionCostLedgerRepository
  implements ProductionCostLedgerRepository
{
  readonly #lockPath: string;
  readonly #path: string;
  #tail: Promise<unknown> = Promise.resolve();

  public constructor(path: string) {
    this.#path = resolve(path);
    this.#lockPath = `${this.#path}.lock`;
  }

  public transaction<T>(
    operation: (
      current: ProductionCostLedgerState,
    ) => Readonly<{ readonly next: ProductionCostLedgerState; readonly result: T }>,
  ): Promise<T> {
    const pending = this.#tail.then(() => this.#execute(operation));
    this.#tail = pending.catch(() => undefined);
    return pending;
  }

  async #execute<T>(
    operation: (
      current: ProductionCostLedgerState,
    ) => Readonly<{ readonly next: ProductionCostLedgerState; readonly result: T }>,
  ): Promise<T> {
    await mkdir(dirname(this.#path), { mode: 0o700, recursive: true });
    const lockToken = await acquireLock(this.#lockPath);
    try {
      const current = await readState(this.#path);
      const output = operation(current);
      validateState(output.next);
      if (output.next !== current) await writeState(this.#path, output.next);
      return output.result;
    } finally {
      await releaseLock(this.#lockPath, lockToken);
    }
  }
}

function emptyState(): ProductionCostLedgerState {
  return state({
    anomalyStop: false,
    contractVersion: "1",
    killSwitch: "RELEASED",
    reservations: [],
    settlements: [],
  });
}

function state(input: ProductionCostLedgerState): ProductionCostLedgerState {
  return Object.freeze({
    ...input,
    reservations: Object.freeze([...input.reservations]),
    settlements: Object.freeze([...input.settlements]),
  });
}

async function readState(path: string): Promise<ProductionCostLedgerState> {
  try {
    const file = await lstat(path);
    const currentUserId = process.getuid?.();
    if (
      !file.isFile() ||
      file.isSymbolicLink() ||
      file.size < 1 ||
      file.size > MAX_LEDGER_BYTES ||
      (file.mode & 0o077) !== 0 ||
      (currentUserId !== undefined && file.uid !== currentUserId)
    ) {
      throw new Error("Cost ledger permissions or size are invalid");
    }
    const handle = await open(
      path,
      filesystemConstants.O_RDONLY | filesystemConstants.O_NOFOLLOW,
    );
    let bytes: Buffer;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.dev !== file.dev ||
        opened.ino !== file.ino ||
        opened.uid !== file.uid ||
        opened.size !== file.size ||
        (opened.mode & 0o077) !== 0
      ) {
        throw new Error("Cost ledger identity changed before read");
      }
      bytes = Buffer.alloc(opened.size);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead !== opened.size) {
        throw new Error("Cost ledger changed during read");
      }
      const completed = await handle.stat();
      if (
        completed.dev !== opened.dev ||
        completed.ino !== opened.ino ||
        completed.size !== opened.size ||
        completed.mtimeMs !== opened.mtimeMs
      ) {
        throw new Error("Cost ledger changed during read");
      }
    } finally {
      await handle.close();
    }
    const parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
    validateState(parsed);
    return state(parsed);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return emptyState();
    throw error;
  }
}

async function writeState(path: string, value: ProductionCostLedgerState): Promise<void> {
  const temporary = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  let installed = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, 0o600);
    await rename(temporary, path);
    installed = true;
    await chmod(path, 0o600);
  } finally {
    if (!installed) await rm(temporary, { force: true });
  }
}

async function acquireLock(path: string): Promise<string> {
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      await mkdir(path, { mode: 0o700 });
      const token = randomUUID();
      const owner = await open(join(path, "owner.json"), "wx", 0o600);
      try {
        await owner.writeFile(`${JSON.stringify({
          createdAt: new Date().toISOString(),
          pid: process.pid,
          token,
        })}\n`, "utf8");
        await owner.sync();
      } finally {
        await owner.close();
      }
      return token;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      await recoverStaleLock(path);
      await new Promise<void>((resolveDelay) => {
        setTimeout(resolveDelay, LOCK_RETRY_MS);
      });
    }
  }
  throw new Error("Cost ledger lock is busy");
}

async function recoverStaleLock(path: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Cost ledger lock path is unsafe");
  }
  const ownerPath = join(path, "owner.json");
  try {
    const parsed = JSON.parse(await readFile(ownerPath, "utf8")) as unknown;
    if (
      !record(parsed) ||
      !Number.isSafeInteger(parsed.pid) ||
      (parsed.pid as number) < 1 ||
      typeof parsed.token !== "string" ||
      !/^[0-9a-f-]{36}$/u.test(parsed.token) ||
      !timestamp(parsed.createdAt)
    ) {
      throw new Error("invalid owner");
    }
    if (processIsAlive(parsed.pid as number)) return;
    await rm(path, { recursive: true });
  } catch (error) {
    if (
      hasCode(error, "ENOENT") ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "invalid owner")
    ) {
      if (Date.now() - metadata.mtimeMs < CORRUPT_LOCK_RECOVERY_MS) return;
      await rm(path, { recursive: true });
      return;
    }
    throw error;
  }
}

async function releaseLock(path: string, token: string): Promise<void> {
  try {
    const parsed = JSON.parse(
      await readFile(join(path, "owner.json"), "utf8"),
    ) as unknown;
    if (!record(parsed) || parsed.token !== token || parsed.pid !== process.pid) {
      throw new Error("Cost ledger lock ownership changed before release");
    }
    await rm(path, { recursive: true });
  } catch (error) {
    if (hasCode(error, "ENOENT")) return;
    throw error;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (hasCode(error, "ESRCH")) return false;
    return true;
  }
}

function assertCostControlOpen(state_: ProductionCostLedgerState): void {
  if (state_.killSwitch === "ACTIVE" || state_.anomalyStop) {
    throw new Error("Cost control kill switch is active");
  }
}

function assertApproval(
  request: CostReservationRequest,
  policy: ProductionCostPolicy,
  now: Date,
): void {
  if (request.estimatedCostCents === 0 && request.estimatedProviderCalls === 0) return;
  const approval = request.approval;
  const approvalTime = approval === undefined ? Number.NaN : Date.parse(approval.approvedAt);
  if (
    !policy.spendingAuthorized ||
    approval?.actorId !== "fabio" ||
    approval.maxCostCents < request.estimatedCostCents ||
    !timestamp(approval.approvedAt) ||
    approvalTime > now.getTime() ||
    now.getTime() - approvalTime > 10 * 60 * 1_000 ||
    !identifier(approval.receiptId) ||
    !fingerprint(approval.commandFingerprint) ||
    approval.commandFingerprint !== costApprovalFingerprint(request)
  ) {
    throw new Error("Paid provider reservation requires Fabio approval");
  }
}

function assertWithinBudgets(
  current: ProductionCostLedgerState,
  request: CostReservationRequest,
  policy: ProductionCostPolicy,
  now: Date,
): void {
  const settlementByReservation = new Map(
    current.settlements.map((settlement) => [settlement.reservationId, settlement] as const),
  );
  const spend = (records: readonly ReservationRecord[]): number =>
    records.reduce((total, record_) => {
      const actual = settlementByReservation.get(record_.reservationId)?.actualCostCents;
      return total + (actual ?? record_.estimatedCostCents);
    }, 0) +
    request.estimatedCostCents;
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  const checks: readonly [number, number][] = [
    [spend(current.reservations.filter(({ createdAt }) => createdAt.startsWith(day))), policy.dailyLimitCents],
    [spend(current.reservations.filter(({ createdAt }) => createdAt.startsWith(month))), policy.monthlyLimitCents],
    [spend(current.reservations.filter(({ missionId }) => missionId === request.missionId)), policy.perMissionLimitCents],
    [spend(current.reservations.filter(({ agentId }) => agentId === request.agentId)), policy.perAgentLimitCents],
    [spend(current.reservations.filter(({ providerId }) => providerId === request.providerId)), policy.perProviderLimitCents],
  ];
  if (checks.some(([actual, maximum]) => actual > maximum)) {
    throw new Error("Cost reservation exceeds a configured budget");
  }
}

function reservationReceipt(record: ReservationRecord): CostReservationReceipt {
  return Object.freeze({
    costCents: record.estimatedCostCents,
    currency: "EUR",
    providerCalls: record.estimatedProviderCalls,
    receiptId: `cost-reservation-${record.reservationId}`,
    reservationId: record.reservationId,
    status: "RESERVED",
  });
}

function settlementReceipt(
  record: SettlementRecord,
  status: CostSettlementReceipt["status"],
): CostSettlementReceipt {
  return Object.freeze({
    actualCostCents: record.actualCostCents,
    actualProviderCalls: record.actualProviderCalls,
    currency: "EUR",
    receiptId: `cost-actual-${record.reservationId}`,
    reservationId: record.reservationId,
    status,
  });
}

function validatePolicy(policy: ProductionCostPolicy): ProductionCostPolicy {
  const currency: unknown = policy.currency;
  if (
    currency !== "EUR" ||
    typeof policy.spendingAuthorized !== "boolean" ||
    ![
      policy.dailyLimitCents,
      policy.monthlyLimitCents,
      policy.perAgentLimitCents,
      policy.perMissionLimitCents,
      policy.perProviderLimitCents,
    ].every(nonNegativeInteger)
  ) {
    throw new Error("Production cost policy is invalid");
  }
  if (
    !policy.spendingAuthorized &&
    [
      policy.dailyLimitCents,
      policy.monthlyLimitCents,
      policy.perAgentLimitCents,
      policy.perMissionLimitCents,
      policy.perProviderLimitCents,
    ].some((value) => value !== 0)
  ) {
    throw new Error("Unauthorized spending policy must keep every budget at zero");
  }
  return Object.freeze({ ...policy });
}

function validateReservationRequest(value: CostReservationRequest): void {
  if (
    !identifier(value.agentId) ||
    !identifier(value.missionId) ||
    !identifier(value.providerId) ||
    !identifier(value.reservationId) ||
    !nonNegativeInteger(value.estimatedCostCents) ||
    !nonNegativeInteger(value.estimatedProviderCalls) ||
    value.estimatedProviderCalls > 100
  ) {
    throw new Error("Cost reservation request is invalid");
  }
}

function validateSettlementRequest(value: CostSettlementRequest): void {
  if (
    !identifier(value.reservationId) ||
    !identifier(value.providerReceiptRef) ||
    !nonNegativeInteger(value.actualCostCents) ||
    !nonNegativeInteger(value.actualProviderCalls) ||
    value.actualProviderCalls > 100
  ) {
    throw new Error("Cost settlement request is invalid");
  }
}

function validateState(value: unknown): asserts value is ProductionCostLedgerState {
  if (
    !record(value) ||
    !exactKeys(value, [
      "anomalyStop",
      "contractVersion",
      "killSwitch",
      "reservations",
      "settlements",
    ]) ||
    value.contractVersion !== "1" ||
    typeof value.anomalyStop !== "boolean" ||
    !["ACTIVE", "RELEASED"].includes(String(value.killSwitch)) ||
    !Array.isArray(value.reservations) ||
    !Array.isArray(value.settlements) ||
    value.reservations.length > 100_000 ||
    value.settlements.length > 100_000
  ) {
    throw new Error("Production cost ledger is invalid");
  }
  const reservationsValid = value.reservations.every(
    (entry) =>
      record(entry) &&
      exactKeys(entry, [
        "agentId",
        "createdAt",
        "estimatedCostCents",
        "estimatedProviderCalls",
        "missionId",
        "providerId",
        "reservationId",
        "status",
      ]) &&
      identifier(entry.agentId) &&
      timestamp(entry.createdAt) &&
      nonNegativeInteger(entry.estimatedCostCents) &&
      nonNegativeInteger(entry.estimatedProviderCalls) &&
      entry.estimatedProviderCalls <= 100 &&
      identifier(entry.missionId) &&
      identifier(entry.providerId) &&
      identifier(entry.reservationId) &&
      ["OPEN", "SETTLED"].includes(String(entry.status)),
  );
  const settlementsValid = value.settlements.every(
    (entry) =>
      record(entry) &&
      exactKeys(entry, [
        "actualCostCents",
        "actualProviderCalls",
        "providerReceiptRef",
        "recordedAt",
        "reservationId",
      ]) &&
      nonNegativeInteger(entry.actualCostCents) &&
      nonNegativeInteger(entry.actualProviderCalls) &&
      entry.actualProviderCalls <= 100 &&
      identifier(entry.providerReceiptRef) &&
      timestamp(entry.recordedAt) &&
      identifier(entry.reservationId),
  );
  const reservationIds = new Set(
    value.reservations
      .filter(record)
      .map(({ reservationId }) => reservationId),
  );
  const settlementIds = new Set(
    value.settlements
      .filter(record)
      .map(({ reservationId }) => reservationId),
  );
  const relationshipsValid =
    reservationIds.size === value.reservations.length &&
    settlementIds.size === value.settlements.length &&
    value.settlements.every((entry) =>
      record(entry) &&
      typeof entry.reservationId === "string" &&
      reservationIds.has(entry.reservationId)) &&
    value.reservations.every((entry) =>
      record(entry) &&
      typeof entry.reservationId === "string" &&
      (
        (entry.status === "OPEN" && !settlementIds.has(entry.reservationId)) ||
        (entry.status === "SETTLED" && settlementIds.has(entry.reservationId))
      )) &&
    (!value.anomalyStop || value.killSwitch === "ACTIVE");
  if (!reservationsValid || !settlementsValid || !relationshipsValid) {
    throw new Error("Production cost ledger is invalid");
  }
}

function sameReservation(left: ReservationRecord, right: CostReservationRequest): boolean {
  return (
    left.agentId === right.agentId &&
    left.estimatedCostCents === right.estimatedCostCents &&
    left.estimatedProviderCalls === right.estimatedProviderCalls &&
    left.missionId === right.missionId &&
    left.providerId === right.providerId
  );
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$/u.test(value);
}

function fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function hasCode(error: unknown, code: string): boolean {
  return record(error) && error.code === code;
}
