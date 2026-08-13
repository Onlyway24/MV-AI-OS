import { constants as fileConstants } from "node:fs";
import { access, lstat, statfs } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import type { OperationsRuntimeCounts } from "../operations-runtime/operations-runtime.js";
import type { RepositoryTransactionRunner } from "../persistence/repository-transaction.js";
import {
  SQLITE_SCHEMA_VERSION,
  verifyCurrentSqliteSchema,
} from "../persistence/sqlite/sqlite-schema.js";
import type { Clock } from "../ports/clock.js";
import type { LocalRuntimeConfig } from "../runtime/local-runtime-config.js";
import {
  evaluateProviderModePolicy,
  resolveProductionProviderMode,
  type ProductionProviderMode,
} from "./provider-mode.js";

const DEFAULT_MAX_QUEUE_DEPTH = 1_000;
const DEFAULT_MINIMUM_FREE_BYTES = 64 * 1_024 * 1_024;
const MAX_REQUIRED_BRAND_ASSETS = 16;
const DEFAULT_REQUIRED_BRAND_ASSET = fileURLToPath(
  new URL(
    "../../assets/brand/onlyway-obsidian-chrome-original.png",
    import.meta.url,
  ),
);

export type ProductionDiagnosticKind = "DIAGNOSTIC" | "READINESS" | "STARTUP";
export type ProductionDiagnosticStatus = "NOT_READY" | "READY";
export type ProductionCheckStatus = "FAIL" | "NOT_REQUIRED" | "PASS";

export type ProductionCheckName =
  | "brand_assets"
  | "database_file"
  | "database_integrity"
  | "database_schema"
  | "diagnostics"
  | "disk_capacity"
  | "provider_policy"
  | "provider_secret"
  | "publication_lock"
  | "queue_depth"
  | "runtime_control"
  | "runtime_supervision"
  | "storage_writable";

export interface ProductionDiagnosticCheck {
  readonly name: ProductionCheckName;
  readonly reasonCode: string;
  readonly status: ProductionCheckStatus;
}

export interface ProductionDiagnosticSummary {
  readonly activeWorkers?: number;
  readonly maxQueueDepth: number;
  readonly minimumFreeBytes: number;
  readonly providerMode: ProductionProviderMode;
  readonly publicationLocked?: boolean;
  readonly queueDepth?: number;
  readonly releaseCommit?: string;
  readonly schedulerReady?: boolean;
  readonly schemaVersion: typeof SQLITE_SCHEMA_VERSION;
}

export interface ProductionDiagnosticReport {
  readonly checks: readonly ProductionDiagnosticCheck[];
  readonly contractVersion: "1";
  readonly generatedAt: string;
  readonly kind: ProductionDiagnosticKind;
  readonly status: ProductionDiagnosticStatus;
  readonly summary: ProductionDiagnosticSummary;
  readonly unauthorizedExternalEffectOccurred: false;
}

export interface ProductionDiagnostics {
  diagnostic(): Promise<ProductionDiagnosticReport>;
  readiness(): Promise<ProductionDiagnosticReport>;
  startup(): Promise<ProductionDiagnosticReport>;
}

interface RuntimeSnapshot {
  readonly counts: OperationsRuntimeCounts;
  readonly control?: Readonly<{
    readonly killSwitch: "ACTIVE" | "RELEASED";
    readonly maintenanceMode: "DISABLED" | "ENABLED";
  }>;
  readonly publicationLocked?: boolean;
  readonly schedulerReady: boolean;
  readonly workerCount: number;
}

export interface ProductionDiagnosticsServiceOptions {
  readonly clock: Clock;
  readonly databasePath: string;
  readonly maxQueueDepth?: number;
  readonly minimumFreeBytes?: number;
  readonly releaseCommit?: string;
  readonly repositories: RepositoryTransactionRunner;
  readonly requiredBrandAssets?: readonly string[];
  readonly runtime: Pick<
    LocalRuntimeConfig,
    | "contentAgentMode"
    | "livePaidActivation"
    | "modelBudget"
    | "modelOperationLimits"
    | "modelProvider"
    | "providerMode"
    | "workspaceId"
  >;
  readonly secretAvailable?: () => boolean | Promise<boolean>;
}

export class ProductionDiagnosticsService implements ProductionDiagnostics {
  readonly #clock: Clock;
  readonly #databasePath: string;
  readonly #maxQueueDepth: number;
  readonly #minimumFreeBytes: number;
  readonly #repositories: RepositoryTransactionRunner;
  readonly #releaseCommit: string | undefined;
  readonly #requiredBrandAssets: readonly string[];
  readonly #runtime: ProductionDiagnosticsServiceOptions["runtime"];
  readonly #secretAvailable: (() => boolean | Promise<boolean>) | undefined;

  public constructor(options: ProductionDiagnosticsServiceOptions) {
    this.#clock = options.clock;
    this.#databasePath = options.databasePath;
    this.#maxQueueDepth = boundedInteger(
      options.maxQueueDepth ?? DEFAULT_MAX_QUEUE_DEPTH,
      1,
      100_000,
      "maxQueueDepth",
    );
    this.#minimumFreeBytes = boundedInteger(
      options.minimumFreeBytes ?? DEFAULT_MINIMUM_FREE_BYTES,
      1,
      Number.MAX_SAFE_INTEGER,
      "minimumFreeBytes",
    );
    this.#repositories = options.repositories;
    if (
      options.releaseCommit !== undefined
      && !/^[a-f0-9]{40}$/u.test(options.releaseCommit)
    ) {
      throw new Error("releaseCommit is invalid");
    }
    this.#releaseCommit = options.releaseCommit;
    const assets = options.requiredBrandAssets ?? [DEFAULT_REQUIRED_BRAND_ASSET];
    if (
      assets.length < 1 ||
      assets.length > MAX_REQUIRED_BRAND_ASSETS ||
      assets.some((path) => path.trim().length === 0)
    ) {
      throw new Error("requiredBrandAssets is invalid");
    }
    this.#requiredBrandAssets = Object.freeze([...assets]);
    this.#runtime = options.runtime;
    this.#secretAvailable = options.secretAvailable;
  }

  public diagnostic(): Promise<ProductionDiagnosticReport> {
    return this.#evaluate("DIAGNOSTIC", true);
  }

  public readiness(): Promise<ProductionDiagnosticReport> {
    return this.#evaluate("READINESS", true);
  }

  public startup(): Promise<ProductionDiagnosticReport> {
    return this.#evaluate("STARTUP", false);
  }

  async #evaluate(
    kind: ProductionDiagnosticKind,
    includeRuntime: boolean,
  ): Promise<ProductionDiagnosticReport> {
    const checks: ProductionDiagnosticCheck[] = [];
    checks.push(await this.#databaseFileCheck());
    checks.push(this.#databaseSchemaCheck());
    checks.push(this.#databaseIntegrityCheck());
    checks.push(await this.#storageWritableCheck());
    checks.push(await this.#diskCapacityCheck());
    checks.push(await this.#brandAssetsCheck());

    const provider = evaluateProviderModePolicy({
      contentAgentMode: this.#runtime.contentAgentMode,
      ...(this.#runtime.livePaidActivation === undefined
        ? {}
        : { livePaidActivation: this.#runtime.livePaidActivation }),
      ...(this.#runtime.modelBudget === undefined
        ? {}
        : { modelBudget: this.#runtime.modelBudget }),
      ...(this.#runtime.modelOperationLimits === undefined
        ? {}
        : { modelOperationLimits: this.#runtime.modelOperationLimits }),
      ...(this.#runtime.modelProvider === undefined
        ? {}
        : { modelProvider: this.#runtime.modelProvider }),
      now: this.#clock.now(),
      ...(this.#runtime.providerMode === undefined
        ? {}
        : { providerMode: this.#runtime.providerMode }),
      workspaceId: this.#runtime.workspaceId,
    });
    checks.push(
      check(
        "provider_policy",
        provider.ready,
        provider.ready
          ? "PROVIDER_POLICY_READY"
          : provider.reasonCodes[0] ?? "PROVIDER_POLICY_BLOCKED",
      ),
    );
    checks.push(await this.#providerSecretCheck());

    let runtimeSnapshot: RuntimeSnapshot | undefined;
    if (includeRuntime) {
      try {
        runtimeSnapshot = await this.#runtimeSnapshot();
        const queueDepth = queuedWork(runtimeSnapshot.counts);
        checks.push(
          check(
            "queue_depth",
            queueDepth <= this.#maxQueueDepth,
            queueDepth <= this.#maxQueueDepth
              ? "QUEUE_WITHIN_LIMIT"
              : "QUEUE_LIMIT_EXCEEDED",
          ),
        );
        const controlReady =
          runtimeSnapshot.control?.killSwitch === "RELEASED" &&
          runtimeSnapshot.control.maintenanceMode === "DISABLED";
        checks.push(
          check(
            "runtime_control",
            controlReady,
            controlReady
              ? "RUNTIME_CONTROL_RELEASED"
              : "RUNTIME_CONTROL_STOPPED",
          ),
        );
        const publicationLocked = runtimeSnapshot.publicationLocked === true;
        checks.push(
          check(
            "publication_lock",
            publicationLocked,
            publicationLocked
              ? "PUBLICATION_KILL_SWITCH_ACTIVE"
              : "PUBLICATION_KILL_SWITCH_UNAVAILABLE_OR_RELEASED",
          ),
        );
        const supervisionReady =
          runtimeSnapshot.schedulerReady && runtimeSnapshot.workerCount > 0;
        checks.push(
          check(
            "runtime_supervision",
            supervisionReady,
            supervisionReady
              ? "RUNTIME_SUPERVISION_READY"
              : "RUNTIME_SUPERVISION_MISSING",
          ),
        );
      } catch {
        checks.push(
          check("queue_depth", false, "QUEUE_STATE_UNAVAILABLE"),
          check("runtime_control", false, "RUNTIME_CONTROL_UNAVAILABLE"),
          check("publication_lock", false, "PUBLICATION_LOCK_UNAVAILABLE"),
          check(
            "runtime_supervision",
            false,
            "RUNTIME_SUPERVISION_UNAVAILABLE",
          ),
        );
      }
    }

    const frozenChecks = Object.freeze(checks);
    const ready = frozenChecks.every(({ status }) => status !== "FAIL");
    return Object.freeze({
      checks: frozenChecks,
      contractVersion: "1",
      generatedAt: this.#clock.now().toISOString(),
      kind,
      status: ready ? "READY" : "NOT_READY",
      summary: Object.freeze({
        ...(runtimeSnapshot === undefined
          ? {}
          : {
              activeWorkers: runtimeSnapshot.workerCount,
              publicationLocked:
                runtimeSnapshot.publicationLocked === true,
              queueDepth: queuedWork(runtimeSnapshot.counts),
              schedulerReady: runtimeSnapshot.schedulerReady,
            }),
        maxQueueDepth: this.#maxQueueDepth,
        minimumFreeBytes: this.#minimumFreeBytes,
        providerMode: resolveProductionProviderMode(
          this.#runtime.providerMode,
        ),
        ...(this.#releaseCommit === undefined
          ? {}
          : { releaseCommit: this.#releaseCommit }),
        schemaVersion: SQLITE_SCHEMA_VERSION,
      }),
      unauthorizedExternalEffectOccurred: false,
    });
  }

  async #databaseFileCheck(): Promise<ProductionDiagnosticCheck> {
    try {
      const entry = await lstat(this.#databasePath);
      return check(
        "database_file",
        entry.isFile() && !entry.isSymbolicLink(),
        entry.isFile() && !entry.isSymbolicLink()
          ? "DATABASE_FILE_PRIVATE"
          : "DATABASE_FILE_INVALID",
      );
    } catch {
      return check("database_file", false, "DATABASE_FILE_UNAVAILABLE");
    }
  }

  #databaseSchemaCheck(): ProductionDiagnosticCheck {
    return withReadOnlyDatabase(
      this.#databasePath,
      (database) => {
        verifyCurrentSqliteSchema(database);
        return check("database_schema", true, "DATABASE_SCHEMA_CURRENT");
      },
      "database_schema",
      "DATABASE_SCHEMA_INVALID",
    );
  }

  #databaseIntegrityCheck(): ProductionDiagnosticCheck {
    return withReadOnlyDatabase(
      this.#databasePath,
      (database) => {
        const row = database.prepare("PRAGMA quick_check(1)").get();
        const healthy =
          row !== undefined && Object.values(row).some((value) => value === "ok");
        return check(
          "database_integrity",
          healthy,
          healthy
            ? "DATABASE_QUICK_CHECK_OK"
            : "DATABASE_QUICK_CHECK_FAILED",
        );
      },
      "database_integrity",
      "DATABASE_QUICK_CHECK_FAILED",
    );
  }

  async #storageWritableCheck(): Promise<ProductionDiagnosticCheck> {
    try {
      await access(dirname(this.#databasePath), fileConstants.W_OK);
      await access(this.#databasePath, fileConstants.R_OK | fileConstants.W_OK);
      return check("storage_writable", true, "STORAGE_WRITABLE");
    } catch {
      return check("storage_writable", false, "STORAGE_NOT_WRITABLE");
    }
  }

  async #diskCapacityCheck(): Promise<ProductionDiagnosticCheck> {
    try {
      const details = await statfs(dirname(this.#databasePath));
      const availableBytes = details.bavail * details.bsize;
      const ready =
        Number.isSafeInteger(availableBytes) &&
        availableBytes >= this.#minimumFreeBytes;
      return check(
        "disk_capacity",
        ready,
        ready ? "DISK_CAPACITY_READY" : "DISK_CAPACITY_LOW",
      );
    } catch {
      return check("disk_capacity", false, "DISK_CAPACITY_UNAVAILABLE");
    }
  }

  async #brandAssetsCheck(): Promise<ProductionDiagnosticCheck> {
    try {
      for (const path of this.#requiredBrandAssets) {
        const entry = await lstat(path);
        if (!entry.isFile() || entry.isSymbolicLink()) {
          return check("brand_assets", false, "BRAND_ASSET_INVALID");
        }
        await access(path, fileConstants.R_OK);
      }
      return check("brand_assets", true, "BRAND_ASSETS_READY");
    } catch {
      return check("brand_assets", false, "BRAND_ASSET_MISSING");
    }
  }

  async #providerSecretCheck(): Promise<ProductionDiagnosticCheck> {
    if (this.#runtime.contentAgentMode !== "model-backed-openai") {
      return Object.freeze({
        name: "provider_secret",
        reasonCode: "PROVIDER_SECRET_NOT_REQUIRED",
        status: "NOT_REQUIRED",
      });
    }
    if (this.#secretAvailable === undefined) {
      return check(
        "provider_secret",
        false,
        "PROVIDER_SECRET_CHECK_UNAVAILABLE",
      );
    }
    try {
      const available = await this.#secretAvailable();
      return check(
        "provider_secret",
        available,
        available ? "PROVIDER_SECRET_READY" : "PROVIDER_SECRET_MISSING",
      );
    } catch {
      return check(
        "provider_secret",
        false,
        "PROVIDER_SECRET_CHECK_UNAVAILABLE",
      );
    }
  }

  #runtimeSnapshot(): Promise<RuntimeSnapshot> {
    const now = this.#clock.now().getTime();
    return this.#repositories.transaction(async ({
      operationalPlanes,
      operationsRuntime,
    }) => {
      const counts = await operationsRuntime.summarize(
        this.#runtime.workspaceId,
      );
      const control = await operationsRuntime.getControl(
        this.#runtime.workspaceId,
      );
      const schedulerLeases = await operationsRuntime.listProcessLeases(
        this.#runtime.workspaceId,
        "SCHEDULER",
        10,
      );
      const workerLeases = await operationsRuntime.listProcessLeases(
        this.#runtime.workspaceId,
        "WORKER",
        100,
      );
      const publicationKillSwitch =
        await operationalPlanes.getPublicationKillSwitch(
          this.#runtime.workspaceId,
        );
      return Object.freeze({
        counts,
        ...(control === undefined
          ? {}
          : {
              control: Object.freeze({
                killSwitch: control.killSwitch,
                maintenanceMode: control.maintenanceMode,
              }),
            }),
        ...(publicationKillSwitch === undefined
          ? {}
          : { publicationLocked: publicationKillSwitch.enabled }),
        schedulerReady: schedulerLeases.some(
          ({ leaseKey, expiresAt }) =>
            leaseKey === "scheduler" && Date.parse(expiresAt) > now,
        ),
        workerCount: workerLeases.filter(
          ({ expiresAt }) => Date.parse(expiresAt) > now,
        ).length,
      });
    });
  }
}

function withReadOnlyDatabase(
  path: string,
  operation: (database: DatabaseSync) => ProductionDiagnosticCheck,
  name: Extract<
    ProductionCheckName,
    "database_integrity" | "database_schema"
  >,
  failureReason: string,
): ProductionDiagnosticCheck {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    return operation(database);
  } catch {
    return check(name, false, failureReason);
  } finally {
    database?.close();
  }
}

function check(
  name: ProductionCheckName,
  passed: boolean,
  reasonCode: string,
): ProductionDiagnosticCheck {
  return Object.freeze({
    name,
    reasonCode,
    status: passed ? "PASS" : "FAIL",
  });
}

function queuedWork(counts: OperationsRuntimeCounts): number {
  return counts.queued + counts.retryScheduled + counts.running;
}

function boundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}
