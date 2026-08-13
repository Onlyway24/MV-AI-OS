import { canonicalSha256 } from "../contracts/canonical-fingerprint.js";
import { RepositoryValidationError } from "../errors/core-error.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import type { Clock } from "../ports/clock.js";
import type { VentureExperiment, VentureOpportunity } from "../venture-holding/venture-domain.js";
import { VentureHoldingService } from "../venture-holding/venture-holding-service.js";
import type { VentureHoldingTransactionRunner } from "../venture-holding/venture-repository.js";
import type { VentureOperationsJobType } from "./operations-handler-registry.js";
import type { OperationsJobBlock, OperationsJobPayload } from "./operations-runtime.js";

const LIST_LIMIT = 101;
type VentureBlockCode = Extract<
  OperationsJobBlock["code"],
  | "VENTURE_EVIDENCE_COVERAGE_REQUIRED"
  | "VENTURE_POLICY_REQUIRED"
  | "VENTURE_PORTFOLIO_COVERAGE_REQUIRED"
  | "VENTURE_REAL_OBSERVATION_REQUIRED"
>;
type VentureOperationResult = Readonly<{
  readonly fingerprint: string;
  readonly reasonCode?: VentureBlockCode;
  readonly status: "BLOCKED" | "COMPLETED";
}>;

/**
 * Production adapter for the eight local-only Venture H24 jobs. It initializes
 * the canonical append-only Venture aggregate idempotently, then evaluates a
 * bounded identity-scoped snapshot. It never spends, publishes, contacts, or
 * performs provider/tool calls; missing evidence or Founder policy stays
 * explicit and default-deny.
 */
export class RepositoryBackedVentureOperationsBoundary {
  readonly #service: VentureHoldingService;

  public constructor(private readonly dependencies: {
    readonly actorId: string;
    readonly clock: Clock;
    readonly coreRepositories: RepositoryTransactionRunner;
    readonly repositories: VentureHoldingTransactionRunner;
    readonly workspaceId: string;
  }) {
    this.#service = new VentureHoldingService(dependencies);
  }

  public async run(input: Readonly<{
    readonly jobType: VentureOperationsJobType;
    readonly operationIdentity: string;
    readonly payload: OperationsJobPayload;
    readonly signal: AbortSignal;
  }>): Promise<VentureOperationResult> {
    assertOperationIdentity(input.operationIdentity);
    input.signal.throwIfAborted();
    const now = this.dependencies.clock.now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new RepositoryValidationError("Venture operations clock is invalid");
    }
    const identity = {
      actorId: this.dependencies.actorId,
      workspaceId: this.dependencies.workspaceId,
    };
    const preflight = await this.dependencies.repositories.transaction(
      async (repository) => ({
        killSwitch: await repository.getKillSwitch(identity),
        policy: await repository.listRecords({ ...identity, limit: 1, type: "FOUNDER_VENTURE_POLICY" }),
      }),
    );
    input.signal.throwIfAborted();
    if (preflight.killSwitch?.enabled === true && preflight.policy.length === 0) {
      return outcome(input, [], "VENTURE_POLICY_REQUIRED");
    }

    const evidencePacks = await this.dependencies.coreRepositories.transaction(
      ({ operationalPlanes }) =>
        operationalPlanes.listEvidencePacksByWorkspaceId(
          this.dependencies.workspaceId,
          100,
        ),
    );
    if (
      evidencePacks.some(
        ({ actorId, workspaceId }) =>
          actorId !== this.dependencies.actorId ||
          workspaceId !== this.dependencies.workspaceId,
      )
    ) {
      throw new RepositoryValidationError(
        "Venture operations Evidence Pack identity is invalid",
      );
    }
    if (evidencePacks.length >= 100) {
      return outcome(input, [], "VENTURE_EVIDENCE_COVERAGE_REQUIRED");
    }
    const initialized = preflight.policy.length === 0
      ? await this.#service.runOnlywayVenture001()
      : undefined;
    input.signal.throwIfAborted();
    const snapshot = await this.dependencies.repositories.transaction(
      async (repository) => {
        const [policies, portfolios, opportunities, experiments, briefs, capital, killSwitch] =
          await Promise.all([
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "FOUNDER_VENTURE_POLICY" }),
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "VENTURE_PORTFOLIO" }),
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "VENTURE_OPPORTUNITY" }),
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "VENTURE_EXPERIMENT" }),
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "FOUNDER_PORTFOLIO_BRIEF" }),
            repository.listRecords({ ...identity, limit: LIST_LIMIT, type: "CAPITAL_ALLOCATION_PROPOSAL" }),
            repository.getKillSwitch(identity),
          ]);
        return { briefs, capital, experiments, killSwitch, opportunities, policies, portfolios };
      },
    );
    input.signal.throwIfAborted();

    const records = [
      ...snapshot.policies,
      ...snapshot.portfolios,
      ...snapshot.opportunities,
      ...snapshot.experiments,
      ...snapshot.briefs,
      ...snapshot.capital,
    ];
    if ([snapshot.policies, snapshot.portfolios, snapshot.opportunities, snapshot.experiments, snapshot.briefs, snapshot.capital].some((values) => values.length >= LIST_LIMIT)) {
      return outcome(input, records, "VENTURE_PORTFOLIO_COVERAGE_REQUIRED", initialized?.command.receipt.fingerprint);
    }
    if (snapshot.killSwitch?.enabled === true) {
      return outcome(input, records, "VENTURE_POLICY_REQUIRED", initialized?.command.receipt.fingerprint);
    }
    if (snapshot.policies.length === 0 || snapshot.portfolios.length === 0) {
      return outcome(input, records, "VENTURE_PORTFOLIO_COVERAGE_REQUIRED", initialized?.command.receipt.fingerprint);
    }

    const reasonCode = blockReason(
      input.jobType,
      input.payload,
      evidencePacks.length,
      snapshot.opportunities,
      snapshot.experiments,
      snapshot.briefs.map(({ kind }) => kind),
      snapshot.capital.map(({ amountMinorUnits }) => amountMinorUnits.status),
      now,
      snapshot.policies[0],
    );
    return outcome(
      input,
      records,
      reasonCode,
      initialized?.command.receipt.fingerprint,
    );
  }
}

function blockReason(
  jobType: VentureOperationsJobType,
  payload: OperationsJobPayload,
  evidencePackCount: number,
  opportunities: readonly VentureOpportunity[],
  experiments: readonly VentureExperiment[],
  briefKinds: readonly string[],
  capitalAvailability: readonly string[],
  now: Date,
  policy: unknown,
): VentureBlockCode | undefined {
  if (jobType === "VENTURE_OPPORTUNITY_SCAN") {
    return evidencePackCount === 0
      ? "VENTURE_EVIDENCE_COVERAGE_REQUIRED"
      : undefined;
  }
  if (jobType === "VENTURE_EVIDENCE_REFRESH") {
    return evidencePackCount === 0 ||
      opportunities.some(({ evidenceMap }) => evidenceMap.freshness !== "CURRENT")
      ? "VENTURE_EVIDENCE_COVERAGE_REQUIRED"
      : undefined;
  }
  if (jobType === "VENTURE_EXPERIMENT_REVIEW") {
    return experiments.some(({ observations }) =>
      !observations.some(({ kind }) => kind === "REAL"),
    )
      ? "VENTURE_REAL_OBSERVATION_REQUIRED"
      : undefined;
  }
  if (jobType === "VENTURE_STALE_CHECK") {
    const seconds = "ventureStaleAfterSeconds" in payload
      ? payload.ventureStaleAfterSeconds
      : 0;
    const cutoff = now.getTime() - seconds * 1_000;
    return opportunities.some(({ expiresAt, updatedAt }) =>
      Date.parse(expiresAt) <= now.getTime() || Date.parse(updatedAt) <= cutoff,
    )
      ? "VENTURE_EVIDENCE_COVERAGE_REQUIRED"
      : undefined;
  }
  if (jobType === "PORTFOLIO_DAILY_BRIEF") {
    return briefKinds.includes("DAILY")
      ? undefined
      : "VENTURE_PORTFOLIO_COVERAGE_REQUIRED";
  }
  if (jobType === "PORTFOLIO_WEEKLY_REVIEW") {
    return briefKinds.includes("WEEKLY")
      ? undefined
      : "VENTURE_PORTFOLIO_COVERAGE_REQUIRED";
  }
  if (jobType === "CAPITAL_ALLOCATION_REVIEW") {
    return capitalAvailability.length > 0 &&
      capitalAvailability.every((status) => status === "AVAILABLE")
      ? undefined
      : "VENTURE_POLICY_REQUIRED";
  }
  return hasFounderInputRequired(policy)
    ? "VENTURE_POLICY_REQUIRED"
    : experiments.some(({ observations }) =>
        !observations.some(({ kind }) => kind === "REAL"),
      )
      ? "VENTURE_REAL_OBSERVATION_REQUIRED"
      : undefined;
}

function outcome(
  input: Readonly<{
    readonly jobType: VentureOperationsJobType;
    readonly operationIdentity: string;
    readonly payload: OperationsJobPayload;
  }>,
  records: readonly Readonly<{ readonly fingerprint: string }>[],
  reasonCode?: VentureBlockCode,
  initializationReceipt?: string,
): VentureOperationResult {
  const fingerprint = canonicalSha256({
    ...(initializationReceipt === undefined ? {} : { initializationReceipt }),
    jobType: input.jobType,
    operationIdentity: input.operationIdentity,
    payload: input.payload,
    recordFingerprints: records.map(({ fingerprint: value }) => value).sort(),
    ...(reasonCode === undefined ? {} : { reasonCode }),
  });
  return Object.freeze(
    reasonCode === undefined
      ? { fingerprint, status: "COMPLETED" as const }
      : { fingerprint, reasonCode, status: "BLOCKED" as const },
  );
}

function hasFounderInputRequired(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasFounderInputRequired);
  if (typeof value !== "object" || value === null) return false;
  const record = value as Readonly<Record<string, unknown>>;
  if (record.status === "FOUNDER_INPUT_REQUIRED") return true;
  return Object.values(record).some(hasFounderInputRequired);
}

function assertOperationIdentity(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,191}$/u.test(value)) {
    throw new RepositoryValidationError("Venture operation identity is invalid");
  }
}
