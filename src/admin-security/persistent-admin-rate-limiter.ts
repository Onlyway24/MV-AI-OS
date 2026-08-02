import {
  AdminSecurityError,
  type AdminRateLimitRecord,
  type AdminRateLimitScope,
} from "./admin-security-contracts.js";
import type { AdminSecurityRepository } from "./admin-security-repository.js";
import {
  mutateAdminSecurityState,
  withoutRevision,
} from "./admin-security-state.js";

const DEFAULT_MAX_ENTRIES = 1_024;
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_LOCKOUT_MS = 15 * 60_000;
const DEFAULT_WINDOW_MS = 60_000;
const RETENTION_MS = 24 * 60 * 60_000;

export interface AdminRateLimiterConfig {
  readonly lockoutMs?: number;
  readonly maxEntries?: number;
  readonly maxFailures?: number;
  readonly maxRequests?: number;
  readonly windowMs?: number;
}

export interface AdminRateLimitClock {
  now(): Date;
}

export class PersistentAdminRateLimiter {
  readonly #clock: AdminRateLimitClock;
  readonly #config: Required<AdminRateLimiterConfig>;
  readonly #repository: AdminSecurityRepository;

  public constructor(options: {
    readonly clock?: AdminRateLimitClock;
    readonly config?: AdminRateLimiterConfig;
    readonly repository: AdminSecurityRepository;
  }) {
    this.#repository = options.repository;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#config = validateConfig(options.config ?? {});
  }

  public async checkAndConsume(
    scope: AdminRateLimitScope,
    keyHash: string,
  ): Promise<void> {
    assertKeyHash(keyHash);
    const now = this.#clock.now();
    const permitted = await mutateAdminSecurityState(
      this.#repository,
      (state) => {
        const active = activeRecords(state.rateLimits, now);
        const existing = active.find(
          (record) => record.keyHash === keyHash && record.scope === scope,
        );
        const next = consumeAttempt(existing, scope, keyHash, now, this.#config);
        return {
          result: !isLocked(next, now),
          state: {
            ...withoutRevision(state),
            rateLimits: boundedRecords(
              [
                ...active.filter(
                  (record) =>
                    record.keyHash !== keyHash || record.scope !== scope,
                ),
                next,
              ],
              this.#config.maxEntries,
            ),
          },
        };
      },
    );
    if (!permitted) {
      throw new AdminSecurityError(
        "RATE_LIMITED",
        "Too many security-sensitive requests.",
      );
    }
  }

  public async recordFailure(
    scope: AdminRateLimitScope,
    keyHash: string,
  ): Promise<void> {
    assertKeyHash(keyHash);
    const now = this.#clock.now();
    await mutateAdminSecurityState(this.#repository, (state) => {
      const active = activeRecords(state.rateLimits, now);
      const existing = active.find(
        (record) => record.keyHash === keyHash && record.scope === scope,
      );
      const current = existing
        ?? newRecord(scope, keyHash, now);
      const failures = current.failures + 1;
      const lockedUntil = failures >= this.#config.maxFailures
        ? new Date(now.getTime() + this.#config.lockoutMs).toISOString()
        : current.lockedUntil;
      const next: AdminRateLimitRecord = Object.freeze({
        ...current,
        failures,
        lockedUntil,
        updatedAt: now.toISOString(),
      });
      return {
        result: undefined,
        state: {
          ...withoutRevision(state),
          rateLimits: boundedRecords(
            [
              ...active.filter(
                (record) =>
                  record.keyHash !== keyHash || record.scope !== scope,
              ),
              next,
            ],
            this.#config.maxEntries,
          ),
        },
      };
    });
  }

  public async recordSuccess(
    scope: AdminRateLimitScope,
    keyHash: string,
  ): Promise<void> {
    assertKeyHash(keyHash);
    const now = this.#clock.now();
    await mutateAdminSecurityState(this.#repository, (state) => ({
      result: undefined,
      state: {
        ...withoutRevision(state),
        rateLimits: state.rateLimits.map((record) =>
          record.keyHash === keyHash && record.scope === scope
            ? Object.freeze({
                ...record,
                failures: 0,
                lockedUntil: null,
                updatedAt: now.toISOString(),
              })
            : record),
      },
    }));
  }
}

const validateConfig = (
  config: AdminRateLimiterConfig,
): Required<AdminRateLimiterConfig> => {
  const result = {
    lockoutMs: config.lockoutMs ?? DEFAULT_LOCKOUT_MS,
    maxEntries: config.maxEntries ?? DEFAULT_MAX_ENTRIES,
    maxFailures: config.maxFailures ?? DEFAULT_MAX_FAILURES,
    maxRequests: config.maxRequests ?? DEFAULT_MAX_REQUESTS,
    windowMs: config.windowMs ?? DEFAULT_WINDOW_MS,
  };
  for (const [name, value] of Object.entries(result)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new AdminSecurityError(
        "INPUT_INVALID",
        `${name} must be a positive safe integer.`,
      );
    }
  }
  return Object.freeze(result);
};

const consumeAttempt = (
  existing: AdminRateLimitRecord | undefined,
  scope: AdminRateLimitScope,
  keyHash: string,
  now: Date,
  config: Required<AdminRateLimiterConfig>,
): AdminRateLimitRecord => {
  if (existing === undefined) {
    return Object.freeze({
      ...newRecord(scope, keyHash, now),
      attempts: 1,
    });
  }
  if (isLocked(existing, now)) {
    return Object.freeze({
      ...existing,
      updatedAt: now.toISOString(),
    });
  }
  const elapsed = now.getTime() - Date.parse(existing.windowStartedAt);
  if (elapsed >= config.windowMs || elapsed < 0) {
    return Object.freeze({
      ...existing,
      attempts: 1,
      failures: 0,
      lockedUntil: null,
      updatedAt: now.toISOString(),
      windowStartedAt: now.toISOString(),
    });
  }
  const attempts = existing.attempts + 1;
  return Object.freeze({
    ...existing,
    attempts,
    lockedUntil: attempts > config.maxRequests
      ? new Date(now.getTime() + config.lockoutMs).toISOString()
      : existing.lockedUntil,
    updatedAt: now.toISOString(),
  });
};

const newRecord = (
  scope: AdminRateLimitScope,
  keyHash: string,
  now: Date,
): AdminRateLimitRecord =>
  Object.freeze({
    attempts: 0,
    failures: 0,
    keyHash,
    lockedUntil: null,
    scope,
    updatedAt: now.toISOString(),
    windowStartedAt: now.toISOString(),
  });

const isLocked = (record: AdminRateLimitRecord, now: Date): boolean =>
  record.lockedUntil !== null
  && Date.parse(record.lockedUntil) > now.getTime();

const activeRecords = (
  records: readonly AdminRateLimitRecord[],
  now: Date,
): readonly AdminRateLimitRecord[] =>
  records.filter((record) => {
    const updatedAt = Date.parse(record.updatedAt);
    const lockedUntil = record.lockedUntil === null
      ? 0
      : Date.parse(record.lockedUntil);
    return lockedUntil > now.getTime()
      || now.getTime() - updatedAt <= RETENTION_MS;
  });

const boundedRecords = (
  records: readonly AdminRateLimitRecord[],
  maxEntries: number,
): readonly AdminRateLimitRecord[] =>
  Object.freeze(
    [...records]
      .sort(
        (left, right) =>
          Date.parse(left.updatedAt) - Date.parse(right.updatedAt),
      )
      .slice(-maxEntries),
  );

const assertKeyHash = (value: string): void => {
  if (!/^[a-f0-9]{64}$/u.test(value)) {
    throw new AdminSecurityError(
      "INPUT_INVALID",
      "Rate-limit key hash is invalid.",
    );
  }
};
