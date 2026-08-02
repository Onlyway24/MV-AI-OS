import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  join,
  relative,
} from "node:path";

import {
  canonicalSha256,
} from "../contracts/canonical-fingerprint.js";
import type {
  MetodoVeloceContentProductionBrief,
} from "../content-production/metodo-veloce-content-production.js";
import type {
  MetodoVeloceContentProductionRecord,
} from "../content-production/metodo-veloce-content-production-record.js";
import {
  FileProductionCostLedgerRepository,
  ProductionCostControl,
} from "../cost-control/production-cost-control.js";
import {
  DailyOperatingBriefService,
} from "../daily-brief/daily-operating-brief-service.js";
import {
  RepositoryBackedDailyOperatingBriefSource,
} from "../daily-brief/repository-backed-daily-operating-brief-source.js";
import {
  createLocalOperationsJobHandlerRegistry,
} from "../operations-runtime/operations-handler-registry.js";
import {
  OperationsRuntimeControlService,
} from "../operations-runtime/operations-runtime-control-service.js";
import {
  createOperationsSchedule,
  OperationsSchedulerService,
} from "../operations-runtime/operations-scheduler-service.js";
import {
  OperationsWorkerService,
} from "../operations-runtime/operations-worker-service.js";
import {
  createSqliteBackup,
  restoreSqliteBackup,
} from "../persistence/sqlite/sqlite-backup.js";
import {
  SqliteReferenceVaultTransactionRunner,
} from "../persistence/sqlite/sqlite-reference-vault-transaction-runner.js";
import {
  SqliteRepositoryTransactionRunner,
} from "../persistence/sqlite/sqlite-repository-transaction-runner.js";
import {
  ReferenceVaultCommandBoundary,
} from "../reference-vault/reference-vault-command-boundary.js";
import type {
  CreativeFingerprint,
  OutcomeLink,
  ReferenceAsset,
  ReferenceImportCandidate,
  ReferenceVaultCommand,
  ReferenceVaultOperation,
} from "../reference-vault/reference-vault.js";
import {
  referenceInputFingerprint,
} from "../reference-vault/reference-vault-validator.js";
import {
  createLocalWorkflowCommandBoundary,
} from "../runtime/create-local-workflow-command-boundary.js";
import type {
  LocalWorkflowCommandResponse,
  LocalWorkflowOperation,
} from "../runtime/local-workflow-command.js";
import {
  SOCIAL_OPPORTUNITY_CRITERIA,
  type MetodoVeloceSocialIntelligenceRequest,
} from "../social-intelligence/metodo-veloce-social-intelligence.js";
import {
  visualApprovalManifestFingerprint,
} from "../command-center/visual-approval-gate.js";
import {
  DeterministicOfflineProviderSuite,
  type OfflineProviderReceipt,
} from "./deterministic-offline-provider-suite.js";

export const OFFLINE_PRODUCTION_REHEARSAL_CONTRACT_VERSION = "1" as const;

export interface OfflineProductionRehearsalConfig {
  readonly backupPath: string;
  readonly databasePath: string;
  readonly receiptPath: string;
  readonly restoredDatabasePath: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface OfflineProductionRehearsalReceipt {
  readonly authorization: Readonly<{
    readonly costGate: Readonly<{
      readonly actualCostCents: 0;
      readonly actualProviderCalls: 0;
      readonly paidProviderCallsAllowed: false;
      readonly reservationReceiptId: string;
      readonly settlementReceiptId: string;
      readonly spendingAuthorized: false;
    }>;
    readonly fabioApproval: Readonly<{
      readonly actorId: "fabio-rehearsal";
      readonly approvalFingerprint: string;
      readonly scope: "OFFLINE_FAKE_PUBLICATION_ONLY";
      readonly visualBindingFingerprint: string;
    }>;
    readonly publicationKillSwitch: Readonly<{
      readonly finalLocked: true;
      readonly initialLocked: true;
      readonly lockedAuthorizationDenied: true;
      readonly releaseVersion: number;
      readonly relockedVersion: number;
    }>;
  }>;
  readonly backup: Readonly<{
    readonly contentFingerprint: string;
    readonly pageCount: number;
    readonly restoreVerified: true;
    readonly schemaVersion: number;
  }>;
  readonly completedAt: string;
  readonly content: Readonly<{
    readonly brandLockFingerprint: string;
    readonly carouselSlides: 6;
    readonly instagramCopyFingerprint: string;
    readonly packageFingerprint: string;
    readonly promptOperatingFingerprint: string;
    readonly productionId: string;
    readonly qualityGate: "PASSED";
    readonly reelBlueprintFingerprint: string;
    readonly riskGate: "PASSED";
    readonly status: "SCHEDULED";
    readonly tiktokBlueprintFingerprint: string;
  }>;
  readonly contractVersion: "1";
  readonly costCents: 0;
  readonly decision: Readonly<{
    readonly approvalDecision: "APPROVED";
    readonly dailyBriefId: string;
    readonly decisionId: string;
    readonly finalDailyBriefId: string;
    readonly reviewedBy: "fabio-rehearsal";
    readonly visualBindingFingerprint: string;
  }>;
  readonly evidence: Readonly<{
    readonly evidenceId: string;
    readonly packFingerprint: string;
    readonly packId: string;
    readonly sourceId: string;
    readonly status: "READY";
  }>;
  readonly externalEffectsExecuted: false;
  readonly feedback: Readonly<{
    readonly analysisFingerprint: string;
    readonly creativeFingerprint: string;
    readonly outcomeLinkFingerprint: string;
    readonly snapshotFingerprint: string;
    readonly snapshotId: string;
  }>;
  readonly h24Runtime: Readonly<{
    readonly jobId: string;
    readonly jobStatus: "COMPLETED";
    readonly scheduleId: string;
    readonly schedulerStatus: "SCHEDULED";
    readonly workerStatus: "COMPLETED";
  }>;
  readonly paidProviderCalls: 0;
  readonly providerMode: "OFFLINE_REHEARSAL";
  readonly providerReceipts: readonly OfflineProviderReceipt[];
  readonly publication: Readonly<{
    readonly dryRun: true;
    readonly platform: "instagram";
    readonly publicationId: string;
    readonly receiptFingerprint: string;
    readonly simulatedTransport: true;
    readonly status: "SUCCEEDED";
  }>;
  readonly receiptFingerprint: string;
  readonly recovery: Readonly<{
    readonly costLedgerReopenVerified: true;
    readonly dailyBriefReopenVerified: true;
    readonly expiredClaimsRecovered: 1;
    readonly fullDatabaseReopenVerified: true;
    readonly h24JobReopenVerified: true;
    readonly referenceVaultReopenVerified: true;
    readonly retryCompleted: true;
  }>;
  readonly runId: string;
  readonly startedAt: string;
  readonly status: "PASSED";
}

interface RehearsalPaths {
  readonly assetRoot: string;
  readonly costLedgerPath: string;
  readonly manifestPath: string;
  readonly repositoryRoot: string;
  readonly visualAssetPath: string;
}

interface VisualGateFixture {
  readonly assetBytes: Buffer;
  readonly assetSetFingerprint: string;
  readonly bindingFingerprint: string;
  readonly brandLockFingerprint: string;
  readonly manifestFingerprint: string;
}

interface CreativeMemoryResult {
  readonly creativeFingerprint: CreativeFingerprint;
  readonly outcomeLink: OutcomeLink;
}

interface ReelBlueprint {
  readonly audio: "NONE";
  readonly contractVersion: "1";
  readonly durationSeconds: 35;
  readonly externalActionsAllowed: false;
  readonly format: "REEL_BLUEPRINT";
  readonly scenes: readonly Readonly<{
    readonly body: string;
    readonly scene: number;
    readonly title: string;
  }>[];
}

const ACTOR_ID = "fabio-rehearsal";
const WORKSPACE_ID = "production-rehearsal";
const MAX_RECEIPT_BYTES = 1_048_576;
const VISUAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function runOfflineProductionRehearsal(
  candidate: OfflineProductionRehearsalConfig,
): Promise<OfflineProductionRehearsalReceipt> {
  const config = validateConfig(candidate);
  const paths = rehearsalPaths(config);
  await assertTargetsAbsent(config, paths);
  const clock = new RehearsalClock(config.startedAt);
  const runtimeJobId = `${config.runId}-runtime-job`;
  const runtimeProductionId = `${config.runId}-runtime-content`;
  await createInterruptedRuntimeClaim(
    config.databasePath,
    clock,
    config.runId,
    runtimeJobId,
    runtimeProductionId,
  );

  clock.advance(120_000);
  const execution = await executeDurableWorkflow(
    config,
    paths,
    clock,
    runtimeJobId,
    runtimeProductionId,
  );
  const creativeMemory = await persistCreativeMemory(
    config,
    clock,
    execution.content,
    paths,
    execution.feedback,
  );

  const backup = await createSqliteBackup({
    contractVersion: "1",
    destinationPath: config.backupPath,
    overwriteDestination: false,
    sourcePath: config.databasePath,
    timeoutMs: 60_000,
  });
  const backupContentFingerprint = await fileSha256(config.backupPath);
  await restoreSqliteBackup({
    backupPath: config.backupPath,
    contractVersion: "1",
    destinationPath: config.restoredDatabasePath,
    overwriteDestination: false,
    timeoutMs: 60_000,
  });
  await verifyRestoredState(
    config,
    execution,
    creativeMemory,
    runtimeJobId,
  );
  await verifyCostLedger(paths.costLedgerPath, clock);

  const receiptWithoutFingerprint = Object.freeze({
    authorization: execution.authorization,
    backup: Object.freeze({
      contentFingerprint: backupContentFingerprint,
      pageCount: backup.pageCount,
      restoreVerified: true as const,
      schemaVersion: backup.schemaVersion,
    }),
    completedAt: clock.now().toISOString(),
    content: Object.freeze({
      brandLockFingerprint: execution.visual.brandLockFingerprint,
      carouselSlides: 6 as const,
      instagramCopyFingerprint: sha256(
        execution.content.package.assets?.instagram.caption ?? "",
      ),
      packageFingerprint: canonicalSha256(execution.content.package),
      promptOperatingFingerprint: execution.promptOperatingFingerprint,
      productionId: execution.content.productionId,
      qualityGate: "PASSED" as const,
      reelBlueprintFingerprint: canonicalSha256(execution.reelBlueprint),
      riskGate: "PASSED" as const,
      status: "SCHEDULED" as const,
      tiktokBlueprintFingerprint: canonicalSha256(
        execution.content.package.socialPublishingPack?.masterContentPack
          .nativeVariants.tiktok,
      ),
    }),
    contractVersion: OFFLINE_PRODUCTION_REHEARSAL_CONTRACT_VERSION,
    costCents: 0 as const,
    decision: Object.freeze({
      approvalDecision: "APPROVED" as const,
      dailyBriefId: execution.decisionBriefId,
      decisionId: execution.decisionId,
      finalDailyBriefId: execution.finalDailyBriefId,
      reviewedBy: ACTOR_ID,
      visualBindingFingerprint: execution.visual.bindingFingerprint,
    }),
    evidence: execution.evidence,
    externalEffectsExecuted: false as const,
    feedback: Object.freeze({
      analysisFingerprint: execution.feedback.analysisFingerprint,
      creativeFingerprint: creativeMemory.creativeFingerprint.fingerprint,
      outcomeLinkFingerprint: creativeMemory.outcomeLink.fingerprint,
      snapshotFingerprint: execution.feedback.snapshotFingerprint,
      snapshotId: execution.feedback.snapshotId,
    }),
    h24Runtime: execution.h24Runtime,
    paidProviderCalls: 0 as const,
    providerMode: "OFFLINE_REHEARSAL" as const,
    providerReceipts: execution.providerReceipts,
    publication: execution.publication,
    recovery: Object.freeze({
      costLedgerReopenVerified: true as const,
      dailyBriefReopenVerified: true as const,
      expiredClaimsRecovered: 1 as const,
      fullDatabaseReopenVerified: true as const,
      h24JobReopenVerified: true as const,
      referenceVaultReopenVerified: true as const,
      retryCompleted: true as const,
    }),
    runId: config.runId,
    startedAt: config.startedAt,
    status: "PASSED" as const,
  });
  const receipt: OfflineProductionRehearsalReceipt = Object.freeze({
    ...receiptWithoutFingerprint,
    receiptFingerprint: sha256(JSON.stringify(receiptWithoutFingerprint)),
  });
  assertOfflineRehearsalReceipt(receipt);
  await writeReceipt(config.receiptPath, receipt);
  return receipt;
}

export function assertOfflineRehearsalReceipt(
  candidate: unknown,
): asserts candidate is OfflineProductionRehearsalReceipt {
  const receipt = asRecord(candidate);
  if (receipt === undefined) {
    throw new Error("Offline rehearsal receipt is not an object");
  }
  const fingerprint = receipt.receiptFingerprint;
  const unsigned = { ...receipt };
  delete unsigned.receiptFingerprint;
  const content = asRecord(receipt.content);
  const evidence = asRecord(receipt.evidence);
  const publication = asRecord(receipt.publication);
  const recovery = asRecord(receipt.recovery);
  const authorization = asRecord(receipt.authorization);
  const costGate = asRecord(authorization?.costGate);
  const killSwitch = asRecord(authorization?.publicationKillSwitch);
  const h24Runtime = asRecord(receipt.h24Runtime);
  const feedback = asRecord(receipt.feedback);
  const decision = asRecord(receipt.decision);
  const backup = asRecord(receipt.backup);
  if (
    receipt.contractVersion !== "1" ||
    receipt.status !== "PASSED" ||
    receipt.providerMode !== "OFFLINE_REHEARSAL" ||
    receipt.costCents !== 0 ||
    receipt.paidProviderCalls !== 0 ||
    receipt.externalEffectsExecuted !== false ||
    !sha256Fingerprint(fingerprint) ||
    fingerprint !== sha256(JSON.stringify(unsigned)) ||
    !Array.isArray(receipt.providerReceipts) ||
    receipt.providerReceipts.length !== 9 ||
    !offlineProviderReceiptsValid(receipt.providerReceipts) ||
    content?.status !== "SCHEDULED" ||
    content.carouselSlides !== 6 ||
    content.qualityGate !== "PASSED" ||
    content.riskGate !== "PASSED" ||
    !sha256Fingerprint(content.packageFingerprint) ||
    !sha256Fingerprint(content.promptOperatingFingerprint) ||
    !sha256Fingerprint(content.reelBlueprintFingerprint) ||
    !sha256Fingerprint(content.tiktokBlueprintFingerprint) ||
    !sha256Fingerprint(content.instagramCopyFingerprint) ||
    !sha256Fingerprint(content.brandLockFingerprint) ||
    evidence?.status !== "READY" ||
    !sha256Fingerprint(evidence.packFingerprint) ||
    publication?.dryRun !== true ||
    publication.simulatedTransport !== true ||
    publication.status !== "SUCCEEDED" ||
    !sha256Fingerprint(publication.receiptFingerprint) ||
    costGate?.actualCostCents !== 0 ||
    costGate.actualProviderCalls !== 0 ||
    costGate.paidProviderCallsAllowed !== false ||
    costGate.spendingAuthorized !== false ||
    killSwitch?.initialLocked !== true ||
    killSwitch.lockedAuthorizationDenied !== true ||
    killSwitch.finalLocked !== true ||
    h24Runtime?.schedulerStatus !== "SCHEDULED" ||
    h24Runtime.workerStatus !== "COMPLETED" ||
    h24Runtime.jobStatus !== "COMPLETED" ||
    decision?.approvalDecision !== "APPROVED" ||
    decision.reviewedBy !== ACTOR_ID ||
    !sha256Fingerprint(decision.visualBindingFingerprint) ||
    !sha256Fingerprint(feedback?.analysisFingerprint) ||
    !sha256Fingerprint(feedback.creativeFingerprint) ||
    !sha256Fingerprint(feedback.outcomeLinkFingerprint) ||
    !sha256Fingerprint(feedback.snapshotFingerprint) ||
    backup?.restoreVerified !== true ||
    !sha256Fingerprint(backup.contentFingerprint) ||
    recovery?.expiredClaimsRecovered !== 1 ||
    recovery.retryCompleted !== true ||
    recovery.fullDatabaseReopenVerified !== true ||
    recovery.h24JobReopenVerified !== true ||
    recovery.dailyBriefReopenVerified !== true ||
    recovery.referenceVaultReopenVerified !== true ||
    recovery.costLedgerReopenVerified !== true
  ) {
    throw new Error("Offline rehearsal receipt failed capability verification");
  }
}

async function createInterruptedRuntimeClaim(
  databasePath: string,
  clock: RehearsalClock,
  runId: string,
  jobId: string,
  productionId: string,
): Promise<void> {
  const repositories = new SqliteRepositoryTransactionRunner({
    path: databasePath,
    timeoutMs: 2_000,
  });
  try {
    const commands = createLocalWorkflowCommandBoundary({
      actorId: ACTOR_ID,
      clock,
      repositories,
      workspaceId: WORKSPACE_ID,
    });
    await commands.execute(command(
      `${runId}-runtime-enqueue`,
      "ENQUEUE_METODO_VELOCE_CONTENT_PRODUCTION",
      {
        brief: rehearsalBrief(
          productionId,
          `${runId}-runtime-evidence`,
          `${runId}-runtime-source`,
        ),
        jobId,
        runAfter: clock.now().toISOString(),
      },
    ));
    const claimed = await repositories.transaction(
      ({ productionRuntimeJobs }) =>
        productionRuntimeJobs.claimNextDue(
          WORKSPACE_ID,
          clock.now().toISOString(),
          new Date(clock.now().getTime() + 60_000).toISOString(),
        ),
    );
    if (claimed?.status !== "RUNNING") {
      throw new Error("Rehearsal could not create a durable interrupted claim");
    }
  } finally {
    await repositories.close();
  }
}

async function executeDurableWorkflow(
  config: OfflineProductionRehearsalConfig,
  paths: RehearsalPaths,
  clock: RehearsalClock,
  runtimeJobId: string,
  runtimeProductionId: string,
) {
  const repositories = new SqliteRepositoryTransactionRunner({
    path: config.databasePath,
    timeoutMs: 2_000,
  });
  let scheduler: OperationsSchedulerService | undefined;
  let worker: OperationsWorkerService | undefined;
  try {
    const commands = createLocalWorkflowCommandBoundary({
      actorId: ACTOR_ID,
      clock,
      repositories,
      visualApproval: {
        assetRoot: paths.assetRoot,
        manifestPath: paths.manifestPath,
        repositoryRoot: paths.repositoryRoot,
      },
      workspaceId: WORKSPACE_ID,
    });
    const recovery = await commands.execute(command(
      `${config.runId}-runtime-recover`,
      "RUN_PRODUCTION_RUNTIME_ONCE",
      {},
    ));
    assertRecoveryResponse(recovery);
    clock.advance(30_000);
    const retry = await commands.execute(command(
      `${config.runId}-runtime-retry`,
      "RUN_PRODUCTION_RUNTIME_ONCE",
      {},
    ));
    assertCompletionResponse(retry, runtimeProductionId);

    const sourceId = `${config.runId}-source`;
    const evidenceId = `${config.runId}-evidence`;
    const packId = `${config.runId}-pack`;
    const productionId = `${config.runId}-content`;
    const publicationId = `${config.runId}-publication`;
    const statement =
      "La prova offline richiede una decisione verificabile, reversibile e senza effetti esterni.";
    await commands.execute(command(
      `${config.runId}-source`,
      "REGISTER_EVIDENCE_SOURCE",
      {
        canonicalReference: "https://offline.invalid/evidence/",
        category: "OFFICIAL_DOCUMENTATION",
        maxFreshnessDays: 30,
        name: "Fixture offline autorizzata",
        permittedRiskDomains: ["GENERAL"],
        publicCitationAllowed: true,
        reliability: "HIGH",
        requiresSecondSource: false,
        sourceId,
        status: "AUTHORIZED",
      },
    ));
    await commands.execute(command(
      `${config.runId}-evidence`,
      "RECORD_EVIDENCE",
      {
        claimMappings: [{ claimId: `${config.runId}-claim`, statement }],
        contentPublishedAt: new Date(
          clock.now().getTime() - 86_400_000,
        ).toISOString(),
        corroboratingEvidenceIds: [],
        evidenceId,
        excerpt:
          "Fixture deterministica: ogni passaggio deve lasciare una ricevuta locale verificabile.",
        fingerprint: sha256(`${config.runId}\nevidence`),
        freshnessExpiresAt: new Date(
          clock.now().getTime() + 7 * 86_400_000,
        ).toISOString(),
        limitations: [
          "La fixture non rappresenta domanda reale e non autorizza pubblicazione.",
        ],
        riskDomain: "GENERAL",
        sourceId,
        sourceReference: "https://offline.invalid/evidence/rehearsal",
        status: "VERIFIED",
      },
    ));
    const packResponse = await commands.execute(command(
      `${config.runId}-pack`,
      "CREATE_EVIDENCE_PACK",
      { evidenceIds: [evidenceId], packId },
    ));
    const pack = requiredResultRecord(packResponse, "Evidence Pack");

    await commands.execute(command(
      `${config.runId}-publication-lock`,
      "SET_PUBLICATION_KILL_SWITCH",
      { enabled: true, expectedVersion: 0 },
    ));
    await new OperationsRuntimeControlService({
      clock,
      repositories,
      workspaceId: WORKSPACE_ID,
    }).update({
      expectedVersion: 0,
      killSwitch: "RELEASED",
      maintenanceMode: "DISABLED",
      reasonCode: "OFFLINE_REHEARSAL_START",
      updatedBy: ACTOR_ID,
    });

    scheduler = new OperationsSchedulerService({
      actorId: ACTOR_ID,
      clock,
      instanceId: `${config.runId}-scheduler`,
      repositories,
      schedulerLeaseMs: 30_000,
      workspaceId: WORKSPACE_ID,
    });
    const scheduleId = `${config.runId}-h24-schedule`;
    await scheduler.registerSchedule(createOperationsSchedule({
      actorId: ACTOR_ID,
      budget: {
        maxCostCents: 0,
        maxProviderCalls: 0,
        maxToolCalls: 0,
      },
      cadence: { kind: "ONCE" },
      catchUpPolicy: "CATCH_UP_ONE",
      heartbeatIntervalMs: 500,
      jobType: "SOCIAL_SIGNAL_REFRESH",
      leaseDurationMs: 20_000,
      nextRunAt: clock.now().toISOString(),
      owner: "offline-opportunity-fixture",
      payload: { mode: "LOCAL_RECONCILIATION" },
      priority: 100,
      retryPolicy: {
        automaticRetries: 0,
        initialBackoffMs: 1_000,
        maxBackoffMs: 1_000,
      },
      scheduleId,
      status: "ENABLED",
      timeoutMs: 15_000,
      workspaceId: WORKSPACE_ID,
    }, clock));
    const schedulerResult = await scheduler.tick();
    const h24JobId = schedulerResult.enqueuedJobIds[0];
    if (
      schedulerResult.status !== "SCHEDULED" ||
      h24JobId === undefined
    ) {
      throw new Error("H24 scheduler rehearsal did not enqueue its fixture");
    }
    worker = new OperationsWorkerService({
      clock,
      handlers: createLocalOperationsJobHandlerRegistry({
        commandBoundary: commands,
        repositories,
      }),
      instanceId: `${config.runId}-worker`,
      repositories,
      workerId: "offline-worker",
      workerLeaseMs: 30_000,
      workspaceId: WORKSPACE_ID,
    });
    const workerResult = await worker.runOnce();
    if (
      workerResult.status !== "COMPLETED" ||
      workerResult.job?.jobId !== h24JobId ||
      workerResult.job.receipt?.costCents !== 0 ||
      workerResult.job.receipt.providerCalls !== 0
    ) {
      throw new Error("H24 worker rehearsal failed its zero-effect contract");
    }

    const brief = rehearsalBrief(
      productionId,
      evidenceId,
      sourceId,
      statement,
    );
    const socialIntelligence = rehearsalSocialIntelligence(
      productionId,
      evidenceId,
      clock.now().toISOString(),
    );
    const promptOperatingFingerprint = canonicalSha256({
      brief,
      operation: "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK",
      socialIntelligence,
    });
    const productionResponse = await commands.execute(command(
      `${config.runId}-social-production`,
      "PRODUCE_METODO_VELOCE_SOCIAL_PACK_FROM_EVIDENCE_PACK",
      {
        brief,
        evidencePackId: packId,
        socialIntelligence,
      },
    ));
    const content = productionResponse.result as
      MetodoVeloceContentProductionRecord;
    assertSocialContent(content);
    const decisionBrief = await dailyBrief(repositories, clock).generate(
      config.startedAt.slice(0, 10),
    );
    const decision = decisionBrief.sections.recommendedFounderDecisions.value
      .find(({ question }) => question.includes(productionId));
    if (decision === undefined) {
      throw new Error("Decision Inbox rehearsal did not expose Fabio review");
    }

    const reelBlueprint = createReelBlueprint(content);
    const visual = await materializeVisualGate(paths, content);
    const providerReceipts = simulateOfflineProviders(
      config.runId,
      content,
      reelBlueprint,
    );
    assertZeroEffectReceipts(providerReceipts);
    const reviewedResponse = await commands.execute(command(
      `${config.runId}-fabio-visual-approval`,
      "REVIEW_METODO_VELOCE_CONTENT",
      {
        decision: "APPROVED",
        expectedVersion: 0,
        note:
          "Approvazione Fabio simulata, limitata alla fixture e vincolata al Visual Gate.",
        productionId,
      },
    ));
    const reviewed = reviewedResponse.result as
      MetodoVeloceContentProductionRecord;
    if (
      reviewed.status !== "APPROVED_FOR_SCHEDULING" ||
      reviewed.review?.reviewedBy !== ACTOR_ID ||
      reviewed.review.visualApprovalBindingFingerprint !==
        visual.bindingFingerprint
    ) {
      throw new Error("Controlled Fabio approval did not bind the Visual Gate");
    }
    const scheduledFor = new Date(
      clock.now().getTime() + 3_600_000,
    ).toISOString();
    const scheduledResponse = await commands.execute(command(
      `${config.runId}-schedule`,
      "SCHEDULE_METODO_VELOCE_CONTENT",
      {
        expectedVersion: 1,
        productionId,
        scheduledFor,
      },
    ));
    const scheduled = scheduledResponse.result as
      MetodoVeloceContentProductionRecord;
    if (scheduled.status !== "SCHEDULED" || scheduled.version !== 2) {
      throw new Error("Approved content did not reach durable scheduling");
    }

    const costControl = new ProductionCostControl({
      clock,
      repository: new FileProductionCostLedgerRepository(
        paths.costLedgerPath,
      ),
    });
    const reservation = await costControl.reserve({
      agentId: "content-director",
      estimatedCostCents: 0,
      estimatedProviderCalls: 0,
      missionId: `${config.runId}-mission`,
      providerId: "onlyway-offline-rehearsal",
      reservationId: `${config.runId}-zero-cost`,
    });
    const settlement = await costControl.settle({
      actualCostCents: 0,
      actualProviderCalls: 0,
      providerReceiptRef: providerReceipts[0]?.receiptId ??
        `${config.runId}-no-provider-call`,
      reservationId: reservation.reservationId,
    });
    const costStatus = await costControl.status();
    if (
      reservation.costCents !== 0 ||
      reservation.providerCalls !== 0 ||
      settlement.actualCostCents !== 0 ||
      settlement.actualProviderCalls !== 0 ||
      costStatus.paidProviderCallsAllowed ||
      costStatus.spendingAuthorized ||
      costStatus.settledCostCents !== 0
    ) {
      throw new Error("Cost Gate did not preserve its zero-cost policy");
    }

    await commands.execute(command(
      `${config.runId}-publication-dry-run`,
      "CREATE_PUBLICATION_DRY_RUN",
      {
        accountRef: "offline-instagram-account",
        contentVersion: scheduled.version,
        idempotencyKey: `${config.runId}-publish-once`,
        platform: "instagram",
        productionId,
        publicationId,
        scheduledFor,
      },
    ));
    let lockedAuthorizationDenied = false;
    try {
      await commands.execute(command(
        `${config.runId}-locked-authorization-probe`,
        "AUTHORIZE_PUBLICATION_DRY_RUN",
        { expectedVersion: 0, publicationId },
      ));
    } catch (error) {
      lockedAuthorizationDenied =
        error instanceof Error &&
        error.message.includes("kill switch") &&
        error.message.includes("enabled");
    }
    if (!lockedAuthorizationDenied) {
      throw new Error("Publication authorization bypassed the kill switch");
    }
    const approvalBase = Object.freeze({
      actorId: ACTOR_ID,
      costReservationReceiptId: reservation.receiptId,
      publicationId,
      scope: "OFFLINE_FAKE_PUBLICATION_ONLY" as const,
      visualBindingFingerprint: visual.bindingFingerprint,
    });
    const approvalFingerprint = canonicalSha256(approvalBase);
    assertControlledOfflineApproval({
      ...approvalBase,
      approvalFingerprint,
    });
    const releasedResponse = await commands.execute(command(
      `${config.runId}-controlled-kill-release`,
      "SET_PUBLICATION_KILL_SWITCH",
      { enabled: false, expectedVersion: 1 },
    ));
    const released = requiredResultRecord(
      releasedResponse,
      "Publication kill release",
    );
    const authorizedResponse = await commands.execute(command(
      `${config.runId}-publication-authorize`,
      "AUTHORIZE_PUBLICATION_DRY_RUN",
      { expectedVersion: 0, publicationId },
    ));
    const authorized = requiredResultRecord(
      authorizedResponse,
      "Publication authorization",
    );
    if (authorized.status !== "AUTHORIZED" || authorized.version !== 1) {
      throw new Error("Publication dry-run authorization failed");
    }

    const publicationProviderReceipt = providerReceipts.find(
      ({ operation }) => operation === "PUBLICATION",
    );
    if (publicationProviderReceipt === undefined) {
      throw new Error("Fake publication transport receipt is missing");
    }
    const publicationReceiptFingerprint = sha256(
      `${publicationProviderReceipt.receiptId}\n${publicationProviderReceipt.outputFingerprint}`,
    );
    const publishedResponse = await commands.execute(command(
      `${config.runId}-fake-platform-receipt`,
      "RECORD_PUBLICATION_RECEIPT",
      {
        expectedVersion: 1,
        outcome: "SUCCEEDED",
        platformContentRef: `offline:${publicationId}`,
        publicationId,
        receiptFingerprint: publicationReceiptFingerprint,
      },
    ));
    const published = requiredResultRecord(
      publishedResponse,
      "Fake publication receipt",
    );
    if (
      published.status !== "SUCCEEDED" ||
      published.version !== 2
    ) {
      throw new Error("Fake platform receipt was not persisted");
    }

    const metrics = Object.freeze({
      clicks: 4,
      comments: 2,
      completionCount: 18,
      conversions: 0,
      leadCount: 1,
      profileVisits: 3,
      saves: 7,
      shares: 2,
      views: 25,
      watchTimeSeconds: 420,
    });
    const snapshotId = `${config.runId}-analytics`;
    const snapshotFingerprint = canonicalSha256({
      metrics,
      publicationId,
      snapshotId,
    });
    await commands.execute(command(
      `${config.runId}-analytics-import`,
      "IMPORT_FEEDBACK_METRICS",
      {
        conversionAttribution: "NOT_ATTRIBUTED",
        metrics,
        periodEnd: clock.now().toISOString(),
        periodStart: new Date(
          clock.now().getTime() - 3_600_000,
        ).toISOString(),
        publicationId,
        publicationReceiptFingerprint,
        snapshotFingerprint,
        snapshotId,
      },
    ));
    const feedbackResponse = await commands.execute(command(
      `${config.runId}-feedback-analysis`,
      "ANALYZE_PUBLICATION_FEEDBACK",
      { publicationId },
    ));
    const feedbackAnalysis = requiredResultRecord(
      feedbackResponse,
      "Feedback analysis",
    );
    if (
      feedbackAnalysis.snapshotCount !== 1 ||
      feedbackAnalysis.unauthorizedExternalEffectOccurred !== false
    ) {
      throw new Error("Feedback analysis did not bind its imported snapshot");
    }
    await commands.execute(command(
      `${config.runId}-content-metrics`,
      "RECORD_METODO_VELOCE_CONTENT_METRICS",
      {
        conversions: 0,
        costCents: 0,
        expectedVersion: 2,
        leadCount: 1,
        productionId,
        saves: 7,
        views: 25,
      },
    ));
    const relockedResponse = await commands.execute(command(
      `${config.runId}-publication-relock`,
      "SET_PUBLICATION_KILL_SWITCH",
      { enabled: true, expectedVersion: 2 },
    ));
    const relocked = requiredResultRecord(
      relockedResponse,
      "Publication relock",
    );
    if (relocked.enabled !== true) {
      throw new Error("Publication kill switch was not restored to LOCKED");
    }
    const finalBrief = await dailyBrief(repositories, clock).generate(
      config.startedAt.slice(0, 10),
    );
    const finalContent = await repositories.transaction(
      ({ contentProductions }) =>
        contentProductions.getById(productionId),
    );
    if (
      finalContent?.status !== "SCHEDULED" ||
      finalContent.metrics?.costCents !== 0
    ) {
      throw new Error("Final content outcome is not durable and zero-cost");
    }

    return Object.freeze({
      authorization: Object.freeze({
        costGate: Object.freeze({
          actualCostCents: 0 as const,
          actualProviderCalls: 0 as const,
          paidProviderCallsAllowed: false as const,
          reservationReceiptId: reservation.receiptId,
          settlementReceiptId: settlement.receiptId,
          spendingAuthorized: false as const,
        }),
        fabioApproval: Object.freeze({
          actorId: ACTOR_ID,
          approvalFingerprint,
          scope: "OFFLINE_FAKE_PUBLICATION_ONLY" as const,
          visualBindingFingerprint: visual.bindingFingerprint,
        }),
        publicationKillSwitch: Object.freeze({
          finalLocked: true as const,
          initialLocked: true as const,
          lockedAuthorizationDenied: true as const,
          releaseVersion: Number(released.version),
          relockedVersion: Number(relocked.version),
        }),
      }),
      content: finalContent,
      decisionBriefId: decisionBrief.briefId,
      decisionId: decision.decisionId,
      evidence: Object.freeze({
        evidenceId,
        packFingerprint: String(pack.fingerprint),
        packId,
        sourceId,
        status: "READY" as const,
      }),
      feedback: Object.freeze({
        analysisFingerprint: canonicalSha256(feedbackAnalysis),
        metrics,
        publicationReceiptFingerprint,
        snapshotFingerprint,
        snapshotId,
      }),
      finalDailyBriefId: finalBrief.briefId,
      h24Runtime: Object.freeze({
        jobId: h24JobId,
        jobStatus: "COMPLETED" as const,
        scheduleId,
        schedulerStatus: "SCHEDULED" as const,
        workerStatus: "COMPLETED" as const,
      }),
      providerReceipts,
      promptOperatingFingerprint,
      publication: Object.freeze({
        dryRun: true as const,
        platform: "instagram" as const,
        publicationId,
        receiptFingerprint: publicationReceiptFingerprint,
        simulatedTransport: true as const,
        status: "SUCCEEDED" as const,
      }),
      reelBlueprint,
      runtimeJobId,
      visual,
    });
  } finally {
    await worker?.close().catch(() => undefined);
    await scheduler?.close().catch(() => undefined);
    await repositories.close();
  }
}

async function persistCreativeMemory(
  config: OfflineProductionRehearsalConfig,
  clock: RehearsalClock,
  content: MetodoVeloceContentProductionRecord,
  paths: RehearsalPaths,
  feedback: Readonly<{
    readonly metrics: Readonly<Record<string, number>>;
    readonly snapshotFingerprint: string;
  }>,
): Promise<CreativeMemoryResult> {
  const repositories = new SqliteReferenceVaultTransactionRunner({
    path: config.databasePath,
    timeoutMs: 2_000,
  });
  const boundary = new ReferenceVaultCommandBoundary({
    actorId: ACTOR_ID,
    approvalAuthority: {
      authorityId: ACTOR_ID,
      confirmedByFabio: true,
      contractVersion: "1",
      scope: "REFERENCE_VAULT_AUTHORITY_OPERATIONS",
      workspaceId: WORKSPACE_ID,
    },
    clock,
    repositories,
    workspaceId: WORKSPACE_ID,
  });
  const assetId = `${config.runId}-brand-asset`;
  try {
    const assetBytes = await readFile(paths.visualAssetPath);
    const request = {
      assets: [
        referenceAssetCandidate(
          assetId,
          assetBytes,
          clock.now().toISOString(),
          content.productionId,
        ),
      ],
      batchId: `${config.runId}-brand-import`,
    };
    await boundary.execute(referenceCommand(
      config.runId,
      "IMPORT_REFERENCE_ASSET",
      "brand-import",
      { request },
      request.batchId,
      "NOT_EXISTS",
      "NOT_AVAILABLE",
    ));
    const imported = await requiredReferenceAsset(repositories, assetId);
    await boundary.execute(referenceCommand(
      config.runId,
      "APPROVE_REFERENCE_ASSET",
      "brand-approve",
      {
        assetId,
        findings: [],
        purpose: "CREATIVE_DIRECTION",
        reason:
          "Fabio rehearsal authority approved only this deterministic local asset.",
      },
      assetId,
      imported.version,
      imported.fingerprint,
    ));
    const approved = await requiredReferenceAsset(repositories, assetId);
    const assetRef = Object.freeze({
      assetId: approved.assetId,
      fingerprint: approved.fingerprint,
      version: approved.version,
    });
    const creativeFingerprintId = `${config.runId}-creative-fingerprint`;
    const creativeResponse = await boundary.execute(referenceCommand(
      config.runId,
      "UPDATE_CREATIVE_FINGERPRINT",
      "creative-fingerprint",
      {
        creativeFingerprintId,
        negativeReferences: [],
        visual: {
          colorUsage: ["brand-restrained"],
          composition: ["evidence-first-carousel"],
          contrast: ["controlled-high"],
          depth: ["single-plane"],
          focalHierarchy: ["single-focus"],
          forbiddenElements: ["unverified-claim"],
          lighting: ["not-applicable-local-fixture"],
          luxuryLevel: ["not-applicable"],
          negativeSpace: ["generous"],
          objectDensity: ["low"],
          preferenceId: `${config.runId}-visual-preference`,
          realism: ["deterministic-local"],
          sampleAssetRefs: [assetRef],
          textDensity: ["bounded"],
        },
        writing: {
          ctaStyle: ["specific"],
          directness: ["high"],
          evidenceLanguage: ["qualified"],
          forbiddenExpressions: ["guaranteed-results"],
          guruRisk: ["zero"],
          practicalDensity: ["high"],
          preferenceId: `${config.runId}-writing-preference`,
          sampleAssetRefs: [assetRef],
          sentenceLength: ["short-medium"],
          titleLength: ["short"],
          urgency: ["measured"],
          vocabulary: ["plain"],
        },
      },
      creativeFingerprintId,
      "NOT_EXISTS",
      "NOT_AVAILABLE",
    ));
    const creativeFingerprint = creativeResponse.result as
      CreativeFingerprint;
    const outcomeLinkId = `${config.runId}-outcome`;
    const outcomeResponse = await boundary.execute(referenceCommand(
      config.runId,
      "LINK_REFERENCE_OUTCOME",
      "outcome",
      {
        assetRefs: [assetRef],
        links: {
          missionIds: [`${config.runId}-mission`],
          outcomeIds: [outcomeLinkId],
          packageIds: [content.productionId],
        },
        metrics: {
          ...feedback.metrics,
          costCents: 0,
          externalEffects: 0,
          snapshotFingerprint: feedback.snapshotFingerprint,
        },
        observedAt: clock.now().toISOString(),
        outcomeLinkId,
        result: "MIXED",
      },
      outcomeLinkId,
      "NOT_EXISTS",
      "NOT_AVAILABLE",
    ));
    const outcomeLink = outcomeResponse.result as OutcomeLink;
    if (
      !sha256Fingerprint(creativeFingerprint.fingerprint) ||
      !sha256Fingerprint(outcomeLink.fingerprint)
    ) {
      throw new Error("Creative memory receipts are invalid");
    }
    return Object.freeze({ creativeFingerprint, outcomeLink });
  } finally {
    await repositories.close();
  }
}

async function verifyRestoredState(
  config: OfflineProductionRehearsalConfig,
  execution: Awaited<ReturnType<typeof executeDurableWorkflow>>,
  creativeMemory: CreativeMemoryResult,
  runtimeJobId: string,
): Promise<void> {
  const restored = new SqliteRepositoryTransactionRunner({
    path: config.restoredDatabasePath,
    timeoutMs: 2_000,
  });
  try {
    const verification = await restored.transaction(async (repositories) => ({
      briefs: await repositories.dailyOperatingBriefs.listByWorkspaceId(
        WORKSPACE_ID,
        10,
      ),
      content: await repositories.contentProductions.getById(
        execution.content.productionId,
      ),
      feedback: await repositories.operationalPlanes
        .getFeedbackSnapshotById(execution.feedback.snapshotId),
      h24Job: await repositories.operationsRuntime
        .getJobById(execution.h24Runtime.jobId),
      pack: await repositories.operationalPlanes.getEvidencePackById(
        execution.evidence.packId,
      ),
      publication: await repositories.operationalPlanes.getPublicationById(
        execution.publication.publicationId,
      ),
      publicationLock: await repositories.operationalPlanes
        .getPublicationKillSwitch(WORKSPACE_ID),
      runtimeJob: await repositories.productionRuntimeJobs
        .getById(runtimeJobId),
    }));
    if (
      verification.content?.status !== "SCHEDULED" ||
      verification.content.metrics?.costCents !== 0 ||
      verification.feedback?.snapshotFingerprint !==
        execution.feedback.snapshotFingerprint ||
      verification.h24Job?.status !== "COMPLETED" ||
      verification.pack?.fingerprint !== execution.evidence.packFingerprint ||
      verification.publication?.status !== "SUCCEEDED" ||
      verification.publicationLock?.enabled !== true ||
      verification.runtimeJob?.status !== "COMPLETED" ||
      !verification.briefs.some(
        ({ briefId }) => briefId === execution.finalDailyBriefId,
      )
    ) {
      throw new Error("Restored rehearsal database failed durable verification");
    }
  } finally {
    await restored.close();
  }

  const reference = new SqliteReferenceVaultTransactionRunner({
    path: config.restoredDatabasePath,
    timeoutMs: 2_000,
  });
  try {
    const restoredMemory = await reference.transaction(
      async (repository) => ({
        creative: await repository.getRecord({
          actorId: ACTOR_ID,
          entityId: creativeMemory.creativeFingerprint.creativeFingerprintId,
          type: "CREATIVE_FINGERPRINT",
          workspaceId: WORKSPACE_ID,
        }),
        outcome: await repository.getRecord({
          actorId: ACTOR_ID,
          entityId: creativeMemory.outcomeLink.outcomeLinkId,
          type: "OUTCOME_LINK",
          workspaceId: WORKSPACE_ID,
        }),
      }),
    );
    if (
      restoredMemory.creative?.fingerprint !==
        creativeMemory.creativeFingerprint.fingerprint ||
      restoredMemory.outcome?.fingerprint !==
        creativeMemory.outcomeLink.fingerprint
    ) {
      throw new Error("Restored Reference Vault failed durable verification");
    }
  } finally {
    await reference.close();
  }
}

async function verifyCostLedger(
  path: string,
  clock: RehearsalClock,
): Promise<void> {
  const service = new ProductionCostControl({
    clock,
    repository: new FileProductionCostLedgerRepository(path),
  });
  const status = await service.status();
  if (
    status.settledCostCents !== 0 ||
    status.openReservations !== 0 ||
    status.paidProviderCallsAllowed ||
    status.spendingAuthorized
  ) {
    throw new Error("Reopened Cost Control ledger failed verification");
  }
}

function validateConfig(
  candidate: OfflineProductionRehearsalConfig,
): OfflineProductionRehearsalConfig {
  if (
    !/^[a-z0-9][a-z0-9-]{2,39}$/u.test(candidate.runId) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      candidate.startedAt,
    ) ||
    !Number.isFinite(Date.parse(candidate.startedAt))
  ) {
    throw new Error("Offline rehearsal identity or timestamp is invalid");
  }
  const paths = [
    candidate.backupPath,
    candidate.databasePath,
    candidate.receiptPath,
    candidate.restoredDatabasePath,
  ];
  if (
    paths.some((path) => !isAbsolute(path) || path.includes("\0")) ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error("Offline rehearsal paths must be distinct absolute paths");
  }
  return Object.freeze({ ...candidate });
}

function rehearsalPaths(
  config: OfflineProductionRehearsalConfig,
): RehearsalPaths {
  const repositoryRoot = dirname(config.receiptPath);
  const assetRoot = join(repositoryRoot, `${config.runId}-visual-assets`);
  const visualAssetPath = join(assetRoot, "carousel-1.png");
  return Object.freeze({
    assetRoot,
    costLedgerPath: join(
      repositoryRoot,
      `${config.runId}-cost-ledger.json`,
    ),
    manifestPath: join(assetRoot, "manifest.json"),
    repositoryRoot,
    visualAssetPath,
  });
}

async function assertTargetsAbsent(
  config: OfflineProductionRehearsalConfig,
  paths: RehearsalPaths,
): Promise<void> {
  for (const path of [
    config.databasePath,
    config.backupPath,
    config.restoredDatabasePath,
    config.receiptPath,
    paths.assetRoot,
    paths.costLedgerPath,
  ]) {
    try {
      await lstat(path);
      throw new Error("Offline rehearsal refuses to overwrite an existing target");
    } catch (error) {
      if (hasCode(error, "ENOENT")) continue;
      throw error;
    }
  }
}

function command(
  commandId: string,
  operation: LocalWorkflowOperation,
  input: Readonly<Record<string, unknown>>,
) {
  return Object.freeze({
    actorId: ACTOR_ID,
    commandId,
    contractVersion: "1" as const,
    input,
    operation,
    workspaceId: WORKSPACE_ID,
  });
}

function referenceCommand(
  runId: string,
  operation: ReferenceVaultOperation,
  suffix: string,
  input: Readonly<Record<string, unknown>>,
  targetId: string,
  expectedVersion: ReferenceVaultCommand["expectedVersion"],
  targetFingerprint: string,
): ReferenceVaultCommand {
  const commandId = `${runId}-${suffix}`;
  return Object.freeze({
    actorId: ACTOR_ID,
    commandId,
    contractVersion: "1",
    expectedVersion,
    idempotencyKey: `idem-${commandId}`,
    input,
    inputFingerprint: referenceInputFingerprint(input),
    operation,
    targetFingerprint,
    targetId,
    workspaceId: WORKSPACE_ID,
  });
}

function rehearsalBrief(
  productionId: string,
  evidenceId: string,
  sourceId: string,
  statement =
    "La simulazione locale richiede una decisione verificabile e reversibile.",
): MetodoVeloceContentProductionBrief {
  return Object.freeze({
    audience: "Piccoli business italiani che validano offerte digitali.",
    callToAction: "Salva la checklist e verifica una sola ipotesi.",
    contractVersion: "1",
    evidence: Object.freeze([
      Object.freeze({
        evidenceId,
        sourceRef: sourceId,
        statement,
      }),
    ]),
    language: "it",
    missionReference: "offline-mission-1",
    objective: "educate",
    offer: "un percorso locale di validazione controllata",
    productionId,
    topic: "validare una proposta con un test locale controllato",
  });
}

function rehearsalSocialIntelligence(
  productionId: string,
  evidenceId: string,
  observedAt: string,
): MetodoVeloceSocialIntelligenceRequest {
  const measured = (note: string) => Object.freeze({
    dataKind: "MEASURED" as const,
    note,
    observedAt,
    sourceId: "offline-opportunity-fixture",
  });
  const evidence = (note: string) => Object.freeze({
    dataKind: "EVIDENCE" as const,
    evidenceId,
    note,
    observedAt,
  });
  return Object.freeze({
    audienceSignals: Object.freeze([
      Object.freeze({
        ...measured("Query della fixture deterministica."),
        intent: "PROBLEMA" as const,
        query: "come validare una proposta senza spendere",
        strength: 88,
      }),
      Object.freeze({
        ...measured("Segnale di salvataggio della fixture."),
        intent: "APPRENDIMENTO" as const,
        query: "checklist test locale",
        strength: 80,
      }),
    ]),
    audioCandidates: Object.freeze([]),
    brandChecks: Object.freeze([
      "CTA",
      "FONT",
      "LOGO",
      "PALETTE",
      "STRUCTURE",
      "TONE",
      "VISUAL_DIRECTION",
    ].map((component) => Object.freeze({ component, score: 90 }))) as
      MetodoVeloceSocialIntelligenceRequest["brandChecks"],
    competitorSignals: Object.freeze([
      Object.freeze({
        ...evidence("Gap attestato dalla fixture autorizzata."),
        authorized: true,
        competitorId: "offline-competitor-one",
        format: "carosello",
        observedGap: "Nessuna decisione reversibile esplicita.",
      }),
      Object.freeze({
        ...evidence("Secondo gap attestato dalla fixture."),
        authorized: true,
        competitorId: "offline-competitor-two",
        format: "slideshow",
        observedGap: "Nessun receipt locale verificabile.",
      }),
    ]),
    contractVersion: "1",
    conversionIntent: Object.freeze({
      commercialStep: "Conservare il percorso in modalità gratuita.",
      doNext: "Salva la checklist e verifica il gate.",
      feel: "Capace di decidere senza fretta.",
      understand: "Ogni passaggio deve avere evidenza e ricevuta.",
    }),
    criterionInputs: Object.freeze(
      SOCIAL_OPPORTUNITY_CRITERIA.map((criterion) => Object.freeze({
        criterion,
        ...measured("Valore deterministico della fixture."),
        value: 90,
      })),
    ),
    culturalRisks: Object.freeze([]),
    hashtagCandidates: Object.freeze([
      "#metodoveloce",
      "#validazione",
      "#microbusiness",
      "#costozero",
      "#checklist",
      "#testlocale",
    ].map((tag) => Object.freeze({
      ...evidence("Hashtag attestato solo dalla fixture."),
      cluster: tag === "#metodoveloce" ? "BRAND" as const : "TOPIC" as const,
      relevance: 85,
      saturation: 50,
      tag,
    }))),
    mode: "EVERGREEN",
    observedAt,
    platforms: Object.freeze(["INSTAGRAM", "TIKTOK"] as const),
    portfolioRole: "DISCOVERY",
    productionId,
    recentContents: Object.freeze([]),
    scheduling: Object.freeze({
      audienceSampleCount: 0,
      candidateWindows: Object.freeze([]),
      historicalPostCount: 0,
    }),
    topic: "validare una proposta con un test locale controllato",
  });
}

function assertSocialContent(
  content: MetodoVeloceContentProductionRecord,
): void {
  const assets = content.package.assets;
  const social = content.package.socialPublishingPack;
  if (
    content.status !== "PENDING_FABIO_APPROVAL" ||
    assets?.carousel.length !== 6 ||
    assets.tiktok.beats.length < 1 ||
    social?.status !== "READY_FOR_FABIO_APPROVAL" ||
    social.masterContentPack.nativeVariants.instagram.format !== "CAROUSEL" ||
    social.masterContentPack.nativeVariants.tiktok.platform !== "TIKTOK" ||
    content.package.quality.readinessScore < 82 ||
    content.package.quality.report.summary.criticalFindings !== 0 ||
    content.package.risk.status !== "CLEAR"
  ) {
    throw new Error("Social content pipeline failed a deterministic gate");
  }
}

function createReelBlueprint(
  content: MetodoVeloceContentProductionRecord,
): ReelBlueprint {
  const tiktok = content.package.socialPublishingPack?.masterContentPack
    .nativeVariants.tiktok;
  if (tiktok?.slides.length !== 6) {
    throw new Error("Reel blueprint requires the verified vertical variant");
  }
  return Object.freeze({
    audio: "NONE" as const,
    contractVersion: "1" as const,
    durationSeconds: 35 as const,
    externalActionsAllowed: false as const,
    format: "REEL_BLUEPRINT" as const,
    scenes: Object.freeze(tiktok.slides.map(({ body, slide, title }) =>
      Object.freeze({ body, scene: slide, title }))),
  });
}

async function materializeVisualGate(
  paths: RehearsalPaths,
  production: MetodoVeloceContentProductionRecord,
): Promise<VisualGateFixture> {
  const socialPublishingPack = production.package.socialPublishingPack;
  if (socialPublishingPack === undefined) {
    throw new Error("Visual Gate requires a Social Publishing Pack");
  }
  await mkdir(paths.assetRoot, { mode: 0o700 });
  const carouselAssets = await Promise.all(
    Array.from({ length: 6 }, async (_, index) => {
      const path = join(paths.assetRoot, `carousel-${String(index + 1)}.png`);
      await writeExclusive(path, VISUAL_PNG);
      return Object.freeze({
        height: 1,
        path: relative(paths.repositoryRoot, path),
        sha256: sha256Bytes(VISUAL_PNG),
        width: 1,
      });
    }),
  );
  const assets = Object.freeze({
    instagram: Object.freeze(carouselAssets),
  });
  const approvalBinding = Object.freeze({
    assetSetFingerprint: canonicalSha256(assets),
    contentPackageFingerprint: canonicalSha256(production.package),
    masterContentPackFingerprint:
      socialPublishingPack.masterContentPack.fingerprint,
    productionId: production.productionId,
    productionVersion: production.version,
    socialPublishingPackFingerprint: socialPublishingPack.fingerprint,
    workspaceId: production.workspaceId,
  });
  const manifestPayload = Object.freeze({
    approvalBinding,
    assets,
    visualReview: Object.freeze({
      status: "READY_FOR_HUMAN_DECISION",
    }),
  });
  const manifestFingerprint = visualApprovalManifestFingerprint(
    manifestPayload,
  );
  const bindingFingerprint = canonicalSha256({
    ...approvalBinding,
    manifestFingerprint,
  });
  await writeExclusive(
    paths.manifestPath,
    Buffer.from(JSON.stringify({
      ...manifestPayload,
      fingerprint: manifestFingerprint,
    }), "utf8"),
  );
  return Object.freeze({
    assetBytes: VISUAL_PNG,
    assetSetFingerprint: approvalBinding.assetSetFingerprint,
    bindingFingerprint,
    brandLockFingerprint: canonicalSha256({
      assets: approvalBinding.assetSetFingerprint,
      master: approvalBinding.masterContentPackFingerprint,
      social: approvalBinding.socialPublishingPackFingerprint,
    }),
    manifestFingerprint,
  });
}

function simulateOfflineProviders(
  runId: string,
  content: MetodoVeloceContentProductionRecord,
  reelBlueprint: ReelBlueprint,
): readonly OfflineProviderReceipt[] {
  const providers = new DeterministicOfflineProviderSuite();
  return Object.freeze([
    providers.invoke("TEXT", {
      instagramCopyFingerprint: sha256(
        content.package.assets?.instagram.caption ?? "",
      ),
      runId,
    }),
    providers.invoke("RESEARCH", {
      evidenceCount: content.package.evidence.items.length,
      runId,
    }),
    providers.invoke("IMAGE", {
      productionId: content.productionId,
      slideCount: content.package.assets?.carousel.length ?? 0,
    }),
    providers.invoke("VIDEO", {
      productionId: content.productionId,
      reelBlueprintFingerprint: canonicalSha256(reelBlueprint),
    }),
    providers.invoke("INSTAGRAM", {
      mode: "SIMULATION_ONLY",
      productionId: content.productionId,
    }),
    providers.invoke("TIKTOK", {
      mode: "SIMULATION_ONLY",
      productionId: content.productionId,
    }),
    providers.invoke("TELEGRAM", {
      decision: "CONTROLLED_FAKE_APPROVAL",
      productionId: content.productionId,
    }),
    providers.invoke("PUBLICATION", {
      mode: "SIMULATION_ONLY",
      productionId: content.productionId,
    }),
    providers.invoke("ANALYTICS", {
      conversions: 0,
      productionId: content.productionId,
      views: 25,
    }),
  ]);
}

function assertZeroEffectReceipts(
  receipts: readonly Readonly<{
    readonly costCents: number;
    readonly externalEffectsExecuted: boolean;
    readonly paidProviderCalls: number;
    readonly simulated: boolean;
  }>[],
): void {
  if (
    receipts.length !== 9 ||
    receipts.some(
      ({ costCents, externalEffectsExecuted, paidProviderCalls, simulated }) =>
        costCents !== 0 ||
        externalEffectsExecuted ||
        paidProviderCalls !== 0 ||
        !simulated,
    )
  ) {
    throw new Error("Offline provider suite violated the zero-effect boundary");
  }
}

function offlineProviderReceiptsValid(receipts: readonly unknown[]): boolean {
  const expected = [
    "TEXT",
    "RESEARCH",
    "IMAGE",
    "VIDEO",
    "INSTAGRAM",
    "TIKTOK",
    "TELEGRAM",
    "PUBLICATION",
    "ANALYTICS",
  ];
  return receipts.every((candidate, index) => {
    const receipt = asRecord(candidate);
    return receipt !== undefined &&
      receipt.operation === expected[index] &&
      receipt.costCents === 0 &&
      receipt.paidProviderCalls === 0 &&
      receipt.externalEffectsExecuted === false &&
      receipt.simulated === true &&
      sha256Fingerprint(receipt.outputFingerprint);
  });
}

function assertControlledOfflineApproval(
  receipt: Readonly<{
    readonly actorId: string;
    readonly approvalFingerprint: string;
    readonly costReservationReceiptId: string;
    readonly publicationId: string;
    readonly scope: string;
    readonly visualBindingFingerprint: string;
  }>,
): void {
  const { approvalFingerprint, ...base } = receipt;
  if (
    receipt.actorId !== ACTOR_ID ||
    receipt.scope !== "OFFLINE_FAKE_PUBLICATION_ONLY" ||
    !receipt.costReservationReceiptId.startsWith("cost-reservation-") ||
    !sha256Fingerprint(receipt.visualBindingFingerprint) ||
    approvalFingerprint !== canonicalSha256(base)
  ) {
    throw new Error("Controlled offline Fabio authorization is invalid");
  }
}

function dailyBrief(
  repositories: SqliteRepositoryTransactionRunner,
  clock: RehearsalClock,
): DailyOperatingBriefService {
  return new DailyOperatingBriefService({
    actorId: ACTOR_ID,
    clock,
    repositories,
    source: new RepositoryBackedDailyOperatingBriefSource(),
    workspaceId: WORKSPACE_ID,
  });
}

function referenceAssetCandidate(
  assetId: string,
  bytes: Buffer,
  observedAt: string,
  productionId: string,
): ReferenceImportCandidate {
  const observed = new Date(observedAt);
  const future = (days: number) =>
    new Date(observed.getTime() + days * 86_400_000).toISOString();
  return Object.freeze({
    aspectRatio: "1:1",
    assetId,
    audience: Object.freeze(["Metodo Veloce offline rehearsal"] as const),
    businessObjective: "Verify the local brand and creative-memory boundary",
    contentBase64: bytes.toString("base64"),
    declaredByteLength: bytes.byteLength,
    declaredSha256: sha256Bytes(bytes),
    dimensions: Object.freeze({
      height: 1,
      status: "AVAILABLE" as const,
      width: 1,
    }),
    fabioApprovalReason:
      "Imported only for a controlled offline Fabio rehearsal.",
    freshness: Object.freeze({
      freshUntil: future(365),
      observedAt,
    }),
    links: Object.freeze({
      missionIds: Object.freeze([`${productionId}-mission`] as const),
      outcomeIds: Object.freeze([] as const),
      packageIds: Object.freeze([productionId] as const),
    }),
    mimeType: "image/png",
    originalFilename: `${assetId}.png`,
    platforms: Object.freeze(["INSTAGRAM", "TIKTOK"] as const),
    privacy: Object.freeze({
      consentEvidence: Object.freeze({
        attestationFingerprint: sha256(`${assetId}\nconsent-not-applicable`),
        reasonCode: "SAFE_NON_PERSONAL_ASSET" as const,
        status: "NOT_APPLICABLE" as const,
        verifiedAt: observedAt,
      }),
      dataClasses: Object.freeze(["NONE"] as const),
      policyFingerprint: sha256("offline-reference-privacy-policy-v1"),
      privacyId: `privacy-${assetId}`,
      purpose: "CREATIVE_DIRECTION" as const,
      releaseEvidence: Object.freeze({
        attestationFingerprint: sha256(`${assetId}\nrelease-not-applicable`),
        reasonCode: "SAFE_NON_PERSONAL_ASSET" as const,
        status: "NOT_APPLICABLE" as const,
        verifiedAt: observedAt,
      }),
      retentionExpiresAt: future(1_460),
      status: "CLEARED" as const,
      verifiedAt: observedAt,
    }),
    referenceId: assetId,
    rights: Object.freeze({
      allowedUse: Object.freeze(["CREATIVE_DIRECTION"] as const),
      evidenceFingerprint: sha256(`${assetId}\nrights`),
      evidenceReference: `offline-rights-${assetId}`,
      owner: "Fabio rehearsal",
      rightsId: `rights-${assetId}`,
      status: "OWNED" as const,
      verifiedAt: observedAt,
      verifiedBy: ACTOR_ID,
    }),
    roles: Object.freeze(["BRAND_REFERENCE", "VISUAL_STYLE"] as const),
    source: Object.freeze({
      capturedAt: observedAt,
      owner: "Onlyway offline rehearsal",
      sourceId: `source-${assetId}`,
      type: "INTERNAL_GENERATED" as const,
    }),
    title: "Onlyway offline visual fixture",
    whatNotToCopy: Object.freeze(["Unverified external expression"] as const),
    whatToLearn: Object.freeze(["Evidence-first visual hierarchy"] as const),
  });
}

async function requiredReferenceAsset(
  repositories: SqliteReferenceVaultTransactionRunner,
  assetId: string,
): Promise<ReferenceAsset> {
  const asset = await repositories.transaction((repository) =>
    repository.getRecord({
      actorId: ACTOR_ID,
      entityId: assetId,
      type: "REFERENCE_ASSET",
      workspaceId: WORKSPACE_ID,
    }));
  if (asset === undefined) {
    throw new Error("Reference Vault rehearsal asset is missing");
  }
  return asset;
}

function assertRecoveryResponse(response: LocalWorkflowCommandResponse): void {
  const result = asRecord(response.result);
  if (
    result?.status !== "IDLE" ||
    result.recoveredExpiredClaims !== 1 ||
    result.unauthorizedExternalEffectOccurred !== false
  ) {
    throw new Error("Production Runtime recovery rehearsal failed");
  }
}

function assertCompletionResponse(
  response: LocalWorkflowCommandResponse,
  productionId: string,
): void {
  const result = asRecord(response.result);
  const job = asRecord(result?.job);
  const productionResult = asRecord(job?.result);
  if (
    result?.status !== "COMPLETED" ||
    result.unauthorizedExternalEffectOccurred !== false ||
    job?.status !== "COMPLETED" ||
    productionResult?.productionId !== productionId
  ) {
    throw new Error("Production Runtime completion rehearsal failed");
  }
}

function requiredResultRecord(
  response: LocalWorkflowCommandResponse,
  label: string,
): Readonly<Record<string, unknown>> {
  const result = asRecord(response.result);
  if (result === undefined) {
    throw new Error(`${label} returned an invalid result`);
  }
  return result;
}

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function writeExclusive(path: string, bytes: Buffer): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(path, 0o600);
}

async function writeReceipt(
  path: string,
  receipt: OfflineProductionRehearsalReceipt,
): Promise<void> {
  const serialized = `${JSON.stringify(receipt)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_RECEIPT_BYTES) {
    throw new Error("Offline rehearsal receipt exceeds its bounded size");
  }
  const temporary = `${path}.${process.pid.toString()}.tmp`;
  const handle = await open(temporary, "wx", 0o600);
  let temporaryExists = true;
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    await link(temporary, path);
    await chmod(path, 0o600);
    await unlink(temporary);
    temporaryExists = false;
  } finally {
    await handle.close().catch(() => undefined);
    if (temporaryExists) await unlink(temporary).catch(() => undefined);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function asRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

class RehearsalClock {
  #now: Date;

  public constructor(timestamp: string) {
    this.#now = new Date(timestamp);
  }

  public now(): Date {
    return new Date(this.#now);
  }

  public advance(milliseconds: number): void {
    this.#now = new Date(this.#now.getTime() + milliseconds);
  }
}
