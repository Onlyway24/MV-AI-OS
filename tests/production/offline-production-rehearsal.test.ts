import {
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertOfflineRehearsalReceipt,
  runOfflineProductionRehearsal,
} from "../../src/production/offline-production-rehearsal.js";

describe("offline Production Closure rehearsal", () => {
  it("crosses durable H24, evidence, approval, publication, feedback, memory, and recovery boundaries at zero cost", async () => {
    const root = await mkdtemp(join(tmpdir(), "mv-production-rehearsal-"));
    const receiptPath = join(root, "rehearsal-receipt.json");
    try {
      const receipt = await runOfflineProductionRehearsal({
        backupPath: join(root, "runtime.backup.sqlite"),
        databasePath: join(root, "runtime.sqlite"),
        receiptPath,
        restoredDatabasePath: join(root, "runtime.restored.sqlite"),
        runId: "closure-rehearsal-001",
        startedAt: "2026-07-26T12:00:00.000Z",
      });

      expect(receipt).toMatchObject({
        backup: {
          restoreVerified: true,
        },
        content: {
          carouselSlides: 6,
          productionId: "closure-rehearsal-001-content",
          qualityGate: "PASSED",
          riskGate: "PASSED",
          status: "SCHEDULED",
        },
        costCents: 0,
        decision: {
          approvalDecision: "APPROVED",
          reviewedBy: "fabio-rehearsal",
        },
        evidence: {
          status: "READY",
        },
        externalEffectsExecuted: false,
        h24Runtime: {
          jobStatus: "COMPLETED",
          schedulerStatus: "SCHEDULED",
          workerStatus: "COMPLETED",
        },
        paidProviderCalls: 0,
        providerMode: "OFFLINE_REHEARSAL",
        publication: {
          dryRun: true,
          simulatedTransport: true,
          status: "SUCCEEDED",
        },
        recovery: {
          costLedgerReopenVerified: true,
          dailyBriefReopenVerified: true,
          expiredClaimsRecovered: 1,
          fullDatabaseReopenVerified: true,
          h24JobReopenVerified: true,
          referenceVaultReopenVerified: true,
          retryCompleted: true,
        },
        status: "PASSED",
      });
      expect(receipt.providerReceipts.map(({ operation }) => operation))
        .toEqual([
          "TEXT",
          "RESEARCH",
          "IMAGE",
          "VIDEO",
          "INSTAGRAM",
          "TIKTOK",
          "TELEGRAM",
          "PUBLICATION",
          "ANALYTICS",
        ]);
      expect(receipt.authorization).toMatchObject({
        costGate: {
          actualCostCents: 0,
          actualProviderCalls: 0,
          paidProviderCallsAllowed: false,
          spendingAuthorized: false,
        },
        publicationKillSwitch: {
          finalLocked: true,
          initialLocked: true,
          lockedAuthorizationDenied: true,
        },
      });
      expect(receipt.feedback.analysisFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(receipt.feedback.creativeFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(receipt.feedback.outcomeLinkFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(receipt.feedback.snapshotFingerprint).toMatch(/^[a-f0-9]{64}$/u);
      expect(receipt.feedback.snapshotId).toBe(
        "closure-rehearsal-001-analytics",
      );
      expect(receipt.content.promptOperatingFingerprint).toMatch(
        /^[a-f0-9]{64}$/u,
      );
      for (let slide = 1; slide <= 6; slide += 1) {
        const assetPath = join(
          root,
          "closure-rehearsal-001-visual-assets",
          `carousel-${String(slide)}.png`,
        );
        expect((await stat(assetPath)).size).toBeGreaterThan(0);
        expect((await stat(assetPath)).mode & 0o777).toBe(0o600);
      }
      expect(() => {
        assertOfflineRehearsalReceipt(receipt);
      }).not.toThrow();
      const stored = JSON.parse(await readFile(receiptPath, "utf8")) as {
        readonly receiptFingerprint: string;
      };
      expect(stored.receiptFingerprint).toBe(receipt.receiptFingerprint);
      expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
      expect(
        (await stat(join(
          root,
          "closure-rehearsal-001-cost-ledger.json",
        ))).mode & 0o777,
      ).toBe(0o600);
      expect(() => {
        assertOfflineRehearsalReceipt({
          ...receipt,
          costCents: 1,
        });
      }).toThrow("capability verification");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
