import { describe, expect, it } from "vitest";

import {
  ConfirmControlActionInputValidator,
  ControlActionProposalValidator,
  ControlActionReceiptValidator,
  OperationsIncidentRecordValidator,
  ProductionControlRecordValidator,
  ProposeControlActionInputValidator,
  controlFingerprint,
} from "../../src/operations-control/operations-control-validator.js";

const HASH = "a".repeat(64);

describe("operations control contracts", () => {
  it("accepts a bounded structured revision and rejects unsafe arbitrary text", () => {
    const validator = new ProposeControlActionInputValidator();
    const input = revisionInput();
    expect(validator.validate(input).ok).toBe(true);
    expect(validator.validate({ ...input, reason: { code: "REVISION_REQUIRED", detail: "Bearer abcdefghijklmnopqrstuvwxyz" } }).ok).toBe(false);
    expect(validator.validate({ ...input, revision: undefined }).ok).toBe(false);
    expect(validator.validate({ ...input, actorId: "Fabio:Local", entityId: "Job:Recovery:001", workspaceId: "Onlyway:EU" }).ok).toBe(true);
  });

  it("binds confirmations to exact identity and fingerprint", () => {
    const validator = new ConfirmControlActionInputValidator();
    expect(validator.validate({ actorId: "fabio", confirmationToken: "b".repeat(64), contractVersion: "1", entityFingerprint: HASH, proposalId: "proposal-001", workspaceId: "onlyway" }).ok).toBe(true);
    expect(validator.validate({ actorId: "fabio", confirmationToken: "raw-token", contractVersion: "1", entityFingerprint: HASH, proposalId: "proposal-001", workspaceId: "onlyway" }).ok).toBe(false);
  });

  it("validates durable proposal, production-control history and incident acknowledgement", () => {
    const input = revisionInput();
    const proposal = {
      action: input.action,
      actorId: input.actorId,
      confirmationTokenHash: HASH,
      contractVersion: "1",
      createdAt: "2026-07-19T08:00:00.000Z",
      expiresAt: "2026-07-19T08:05:00.000Z",
      idempotencyKey: input.idempotencyKey,
      proposalId: "proposal-001",
      reason: input.reason,
      revision: input.revision,
      state: "PENDING",
      target: { entityFingerprint: HASH, entityId: "production-001", entityVersion: 4, kind: "PRODUCTION" },
      updatedAt: "2026-07-19T08:00:00.000Z",
      version: 0,
      workspaceId: "onlyway",
    } as const;
    expect(new ControlActionProposalValidator().validate(proposal).ok).toBe(true);

    const control = {
      actorId: "fabio",
      contractVersion: "1",
      createdAt: "2026-07-19T08:00:00.000Z",
      history: [{ action: "REQUEST_REVISION", actorId: "fabio", occurredAt: "2026-07-19T08:01:00.000Z", reasonCode: "REVISION_REQUIRED", state: "REVISION_REQUIRED", version: 1 }],
      productionId: "production-001",
      revisions: [{ category: "CLAIM", createdAt: "2026-07-19T08:01:00.000Z", priority: "HIGH", reason: input.reason, requestedBy: "fabio", revisionId: "revision-001", sourcePackageFingerprint: HASH, sourceProductionVersion: 4, status: "REQUESTED", targets: [{ kind: "CLAIM", reference: "carousel.slide-2.claim-1" }] }],
      sourcePackageFingerprint: HASH,
      sourceProductionVersion: 4,
      state: "REVISION_REQUIRED",
      updatedAt: "2026-07-19T08:01:00.000Z",
      version: 1,
      workspaceId: "onlyway",
    } as const;
    expect(new ProductionControlRecordValidator().validate(control).ok).toBe(true);

    const incidentBase = {
      acknowledgedAt: "2026-07-19T08:02:00.000Z",
      acknowledgedBy: "fabio",
      actorId: "system",
      contractVersion: "1",
      createdAt: "2026-07-19T07:58:00.000Z",
      incidentId: "incident-001",
      severity: "HIGH",
      status: "ACKNOWLEDGED",
      summaryCode: "WORKER_HEARTBEAT_STALE",
      updatedAt: "2026-07-19T08:02:00.000Z",
      version: 1,
      workspaceId: "onlyway",
    } as const;
    const incident = { ...incidentBase, fingerprint: controlFingerprint(incidentBase) } as const;
    expect(new OperationsIncidentRecordValidator().validate(incident).ok).toBe(true);
    expect(new OperationsIncidentRecordValidator().validate({ ...incident, fingerprint: HASH }).ok).toBe(false);
    expect(new ControlActionProposalValidator().validate({ ...proposal, state: "EXPIRED" }).ok).toBe(false);
  });

  it("verifies the durable receipt fingerprint", () => {
    const base = {
      action: "PAUSE_PRODUCTION",
      actorId: "fabio",
      contractVersion: "1",
      idempotencyKey: "pause-production-001-v0",
      proposalId: "proposal-pause-001",
      receiptId: "receipt-pause-001",
      recordedAt: "2026-07-19T08:01:00.000Z",
      resultEntityId: "production-001",
      resultEntityVersion: 1,
      target: { entityFingerprint: HASH, entityId: "production-001", entityVersion: 0, kind: "PRODUCTION" },
      workspaceId: "onlyway",
    } as const;
    const receipt = { ...base, outcomeFingerprint: controlFingerprint(base) } as const;
    expect(new ControlActionReceiptValidator().validate(receipt).ok).toBe(true);
    expect(new ControlActionReceiptValidator().validate({ ...receipt, resultEntityVersion: 2 }).ok).toBe(false);
  });

  it("produces stable canonical fingerprints independent of object key order", () => {
    expect(controlFingerprint({ a: 1, b: { c: 2 } })).toBe(controlFingerprint({ b: { c: 2 }, a: 1 }));
  });
});

function revisionInput() {
  return {
    action: "REQUEST_PRODUCTION_REVISION",
    actorId: "fabio",
    contractVersion: "1",
    entityId: "production-001",
    entityVersion: 4,
    fingerprint: HASH,
    idempotencyKey: "request-revision-production-001-v4",
    reason: { code: "REVISION_REQUIRED", detail: "Il claim deve essere ristretto alle evidenze disponibili." },
    revision: { category: "CLAIM", priority: "HIGH", targets: [{ kind: "CLAIM", reference: "carousel.slide-2.claim-1" }] },
    workspaceId: "onlyway",
  } as const;
}
