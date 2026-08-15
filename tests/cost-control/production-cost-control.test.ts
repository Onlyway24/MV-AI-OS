import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  costApprovalFingerprint,
  FileProductionCostLedgerRepository,
  ProductionCostControl,
  ZERO_COST_POLICY,
} from "../../src/cost-control/production-cost-control.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Production cost control", () => {
  it("refuses an authorized spending policy without an approval authority verifier", async () => {
    const root = await rootDirectory();
    expect(() => new ProductionCostControl({
      clock,
      policy: {
        currency: "EUR",
        dailyLimitCents: 100,
        monthlyLimitCents: 100,
        perAgentLimitCents: 100,
        perMissionLimitCents: 100,
        perProviderLimitCents: 100,
        spendingAuthorized: true,
      },
      repository: new FileProductionCostLedgerRepository(
        join(root, "cost-ledger.json"),
      ),
    })).toThrow("requires a Fabio approval verifier");
  });

  it("defaults to zero and rejects every paid reservation", async () => {
    const { ledgerPath, service } = await fixture();
    await expect(
      service.reserve(reservation({ estimatedCostCents: 1, estimatedProviderCalls: 1 })),
    ).rejects.toThrow("Fabio approval");
    await expect(
      service.reserve(reservation({ estimatedCostCents: 0, estimatedProviderCalls: 0 })),
    ).resolves.toMatchObject({ costCents: 0, providerCalls: 0, status: "RESERVED" });
    expect((await stat(ledgerPath)).mode & 0o777).toBe(0o600);
    await expect(service.status()).resolves.toMatchObject({
      paidProviderCallsAllowed: false,
      settledCostCents: 0,
      spendingAuthorized: false,
    });
  });

  it("enforces daily, monthly, mission, agent and provider budgets before reservation", async () => {
    const { service } = await fixture({
      currency: "EUR",
      dailyLimitCents: 100,
      monthlyLimitCents: 100,
      perAgentLimitCents: 100,
      perMissionLimitCents: 100,
      perProviderLimitCents: 100,
      spendingAuthorized: true,
    });
    await service.reserve(approvedReservation({
      estimatedCostCents: 100,
      estimatedProviderCalls: 1,
    }, 100));
    await expect(
      service.reserve(approvedReservation({
        estimatedCostCents: 1,
        estimatedProviderCalls: 1,
        reservationId: "reservation-2",
      }, 1)),
    ).rejects.toThrow("configured budget");
  });

  it("is idempotent and trips the anomaly kill switch on actual cost amplification", async () => {
    const { service } = await fixture({
      currency: "EUR",
      dailyLimitCents: 100,
      monthlyLimitCents: 100,
      perAgentLimitCents: 100,
      perMissionLimitCents: 100,
      perProviderLimitCents: 100,
      spendingAuthorized: true,
    });
    const request = approvedReservation({
      estimatedCostCents: 10,
      estimatedProviderCalls: 1,
    }, 10);
    const first = await service.reserve(request);
    await expect(service.reserve(request)).resolves.toMatchObject({
      ...first,
      status: "EXISTS_OPEN",
    });
    await expect(
      service.settle({
        actualCostCents: 11,
        actualCostUsd: 0.11,
        actualProviderCalls: 2,
        inputTokens: 10,
        outputTokens: 5,
        providerReceiptRef: "provider-receipt-1",
        reservationId: request.reservationId,
        totalTokens: 15,
      }),
    ).resolves.toMatchObject({ status: "BLOCKED_ANOMALY" });
    await expect(
      service.settle({
        actualCostCents: 11,
        actualCostUsd: 0.11,
        actualProviderCalls: 2,
        inputTokens: 10,
        outputTokens: 5,
        providerReceiptRef: "provider-receipt-1",
        reservationId: request.reservationId,
        totalTokens: 15,
      }),
    ).resolves.toMatchObject({ status: "BLOCKED_ANOMALY" });
    await expect(service.status()).resolves.toMatchObject({
      anomalyStop: true,
      killSwitch: "ACTIVE",
      paidProviderCallsAllowed: false,
    });
    await expect(
      service.reserve({ ...request, reservationId: "reservation-after-anomaly" }),
    ).rejects.toThrow("kill switch");
  });

  it("preserves receipts and state across repository recreation", async () => {
    const root = await rootDirectory();
    const path = join(root, "cost-ledger.json");
    const first = new ProductionCostControl({
      clock,
      policy: ZERO_COST_POLICY,
      repository: new FileProductionCostLedgerRepository(path),
    });
    await first.reserve(reservation({ estimatedCostCents: 0, estimatedProviderCalls: 0 }));
    await first.settle({
      actualCostCents: 0,
      actualCostUsd: 0,
      actualProviderCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerReceiptRef: "fake-provider-receipt",
      reservationId: "reservation-1",
      totalTokens: 0,
    });
    const recovered = new ProductionCostControl({
      clock,
      policy: ZERO_COST_POLICY,
      repository: new FileProductionCostLedgerRepository(path),
    });
    await expect(recovered.status()).resolves.toMatchObject({
      openReservations: 0,
      settledCostCents: 0,
    });
  });

  it("recovers an owner-identified lock left by a terminated process", async () => {
    const root = await rootDirectory();
    const path = join(root, "cost-ledger.json");
    const lockPath = `${path}.lock`;
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(
      join(lockPath, "owner.json"),
      JSON.stringify({
        createdAt: "2026-07-26T00:00:00.000Z",
        pid: 2_147_483_647,
        token: "00000000-0000-4000-8000-000000000000",
      }),
      { mode: 0o600 },
    );
    const service = new ProductionCostControl({
      clock,
      policy: ZERO_COST_POLICY,
      repository: new FileProductionCostLedgerRepository(path),
    });
    await expect(service.status()).resolves.toMatchObject({
      paidProviderCallsAllowed: false,
    });
  });

  it("rejects symlinked and internally inconsistent durable ledgers", async () => {
    const root = await rootDirectory();
    const target = join(root, "target.json");
    const link = join(root, "linked-ledger.json");
    await writeFile(target, JSON.stringify({
      anomalyStop: false,
      contractVersion: "2",
      killSwitch: "RELEASED",
      reservations: [],
      settlements: [],
    }), { mode: 0o600 });
    await symlink(target, link);
    const linked = new ProductionCostControl({
      clock,
      policy: ZERO_COST_POLICY,
      repository: new FileProductionCostLedgerRepository(link),
    });
    await expect(linked.status()).rejects.toThrow("permissions or size");

    const inconsistent = join(root, "inconsistent-ledger.json");
    await writeFile(inconsistent, JSON.stringify({
      anomalyStop: false,
      contractVersion: "2",
      killSwitch: "RELEASED",
      reservations: [{
        agentId: "content-agent",
        createdAt: "2026-07-26T00:00:00.000Z",
        estimatedCostCents: 0,
        estimatedProviderCalls: 0,
        invocationId: "invocation-1",
        missionId: "mission-1",
        modelId: "fake-model",
        providerId: "fake-text",
        reservationId: "reservation-1",
        status: "SETTLED",
        workflowId: "workflow-1",
      }],
      settlements: [],
    }), { mode: 0o600 });
    const corrupted = new ProductionCostControl({
      clock,
      policy: ZERO_COST_POLICY,
      repository: new FileProductionCostLedgerRepository(inconsistent),
    });
    await expect(corrupted.status()).rejects.toThrow(
      "Production cost ledger is invalid",
    );
  });
});

const clock = Object.freeze({ now: () => new Date("2026-07-26T01:00:00.000Z") });

async function fixture(policy = ZERO_COST_POLICY) {
  const root = await rootDirectory();
  const ledgerPath = join(root, "cost-ledger.json");
  return {
    ledgerPath,
    service: new ProductionCostControl({
      ...(policy.spendingAuthorized
        ? {
            approvalVerifier: {
              verify: ({ approval }: {
                readonly approval: { readonly actorId: string };
              }) => Promise.resolve(approval.actorId === "fabio"),
            },
          }
        : {}),
      clock,
      policy,
      repository: new FileProductionCostLedgerRepository(ledgerPath),
    }),
  };
}

async function rootDirectory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "onlyway-cost-control-"));
  roots.push(root);
  return root;
}

function reservation(overrides: Partial<Parameters<ProductionCostControl["reserve"]>[0]> = {}) {
  return {
    agentId: "content-agent",
    estimatedCostCents: 0,
    estimatedProviderCalls: 0,
    invocationId: "invocation-1",
    missionId: "mission-1",
    modelId: "fake-model",
    providerId: "fake-text",
    reservationId: "reservation-1",
    workflowId: "workflow-1",
    ...overrides,
  };
}

function approvedReservation(
  overrides: Partial<Parameters<ProductionCostControl["reserve"]>[0]>,
  maxCostCents: number,
) {
  const request = reservation(overrides);
  return {
    ...request,
    approval: approval(maxCostCents, costApprovalFingerprint(request)),
  };
}

function approval(maxCostCents: number, commandFingerprint: string) {
  return {
    actorId: "fabio" as const,
    approvedAt: "2026-07-26T00:59:00.000Z",
    commandFingerprint,
    maxCostCents,
    receiptId: `approval-${String(maxCostCents)}`,
  };
}
