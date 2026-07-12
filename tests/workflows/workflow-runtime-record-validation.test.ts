import { describe, expect, it } from "vitest";

import {
  LocalWorkflowCommandResponseValidator,
  WorkflowAgentInvocationReceiptValidator,
  WorkflowLifecycleRecordValidator,
  WorkflowStepOutcomeReceiptValidator,
} from "../../src/index.js";

describe("Workflow durable record validation", () => {
  it("rejects unsupported and incomplete Agent invocation receipt fields", () => {
    const validator = new WorkflowAgentInvocationReceiptValidator();
    const receipt = failedInvocation();

    expect(validator.validate(receipt).ok).toBe(true);
    expect(validator.validate({ ...receipt, untrusted: "value" }).ok).toBe(false);
    expect(
      validator.validate({
        ...receipt,
        failure: { ...receipt.failure, diagnostic: "value" },
      }).ok,
    ).toBe(false);
  });

  it("rejects unsupported outcome and lifecycle record fields", () => {
    const outcome = blockedOutcome();
    const lifecycle = cancellationRecord();

    expect(new WorkflowStepOutcomeReceiptValidator().validate(outcome).ok).toBe(true);
    expect(
      new WorkflowStepOutcomeReceiptValidator().validate({
        ...outcome,
        rawDiagnostic: "value",
      }).ok,
    ).toBe(false);
    expect(new WorkflowLifecycleRecordValidator().validate(lifecycle).ok).toBe(true);
    expect(
      new WorkflowLifecycleRecordValidator().validate({
        ...lifecycle,
        rawDiagnostic: "value",
      }).ok,
    ).toBe(false);
  });

  it("fails closed for non-JSON-safe or redaction-unsafe local command responses", () => {
    const validator = new LocalWorkflowCommandResponseValidator();
    const response = localResponse();

    expect(validator.validate(response).ok).toBe(true);
    expect(
      validator.validate({ ...response, result: { count: Number.POSITIVE_INFINITY } }).ok,
    ).toBe(false);
    expect(
      validator.validate({ ...response, result: { token: "sk-not-a-real-token" } }).ok,
    ).toBe(false);
  });
});

function failedInvocation() {
  return {
    capabilityIds: ["content-strategy"],
    completedAt: "2026-07-12T00:00:01.000Z",
    contractVersion: "1" as const,
    definitionId: "workflow@1.0.0",
    executorId: "deterministic-content-director",
    executorVersion: "1.0.0",
    externalEffectsAllowed: false as const,
    failure: { code: "AGENT_EXECUTION_FAILED" as const, message: "Agent execution failed safely" },
    fingerprint: "a".repeat(64),
    instanceId: "instance-1",
    invocationId: "invocation-1",
    reservedAt: "2026-07-12T00:00:00.000Z",
    reservedInstanceVersion: 2,
    runtimeAgentId: "content-director",
    runtimeAgentVersion: "1.0.0",
    specificationId: "content-director@1.0.0",
    specificationVersion: "1.0.0",
    status: "FAILED" as const,
    stepId: "direction",
    workflowId: "workflow",
    workflowVersion: "1.0.0",
  };
}

function blockedOutcome() {
  return {
    contractVersion: "1" as const,
    decision: "BLOCKED" as const,
    externalEffects: false as const,
    fingerprint: "b".repeat(64),
    instanceId: "instance-1",
    invocationFingerprint: "a".repeat(64),
    invocationId: "invocation-1",
    outcomeId: "outcome-1",
    remediation: ["Durable invocation is missing"],
    reviewedAt: "2026-07-12T00:00:01.000Z",
    stepId: "direction",
  };
}

function cancellationRecord() {
  return {
    actorId: "fabio",
    contractVersion: "1" as const,
    definitionId: "workflow@1.0.0",
    externalEffects: false as const,
    fingerprint: "c".repeat(64),
    instanceId: "instance-1",
    instanceVersion: 1,
    kind: "CANCELLATION" as const,
    recordedAt: "2026-07-12T00:00:01.000Z",
    recordId: "cancel-1",
    recoveryInstructions: ["Workflow is cancelled and no further step invocation is authorized."],
    stepId: "workflow",
    workflowVersion: "1.0.0",
  };
}

function localResponse() {
  return {
    commandId: "command-1",
    contractVersion: "1" as const,
    nextAction: "Inspect the deterministic local result.",
    operation: "CREATE_MISSION" as const,
    replayed: false,
    result: { nonExecuting: true },
    status: "ok" as const,
    unauthorizedExternalEffectOccurred: false as const,
  };
}
