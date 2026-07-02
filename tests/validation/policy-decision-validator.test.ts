import { describe, expect, it } from "vitest";

import {
  PolicyDecisionValidator,
  type PolicyDecision,
} from "../../src/index.js";

describe("PolicyDecisionValidator", () => {
  const validator = new PolicyDecisionValidator();

  it("accepts a deterministic partition of requested permissions", () => {
    const decision = policyDecision();

    expect(validator.validate(decision)).toEqual({
      ok: true,
      value: decision,
    });
  });

  it("rejects unsupported, unsorted, overlapping, and incomplete permissions", () => {
    const result = validator.validate({
      ...policyDecision(),
      deniedPermissions: [
        "memory:read:semantic",
        "model:invoke:content-quality",
      ],
      effectivePermissions: [
        "memory:read:semantic",
        "knowledge:search",
        "unscoped-permission",
      ],
      evaluatedAt: "not-a-timestamp",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_value",
            path: "effectivePermissions[2]",
          }),
          expect.objectContaining({
            code: "invalid_order",
            path: "effectivePermissions",
          }),
          expect.objectContaining({
            code: "invalid_timestamp",
            path: "evaluatedAt",
          }),
        ]),
      );
    }
  });

  it("rejects permissions not declared in the requested partition", () => {
    const result = validator.validate({
      ...policyDecision(),
      deniedPermissions: [],
      effectivePermissions: ["memory:read:semantic"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_partition",
            path: "requestedPermissions",
          }),
        ]),
      );
    }
  });
});

function policyDecision(): PolicyDecision {
  return {
    actorId: "actor-local",
    agent: {
      agentId: "content",
      version: "1.0.0",
    },
    contractVersion: "1",
    decisionId: "policy-decision-001",
    deniedPermissions: ["model:invoke:content-quality"],
    effectivePermissions: [
      "knowledge:search",
      "memory:read:semantic",
    ],
    evaluatedAt: "2026-07-02T10:00:01.000Z",
    requestedPermissions: [
      "knowledge:search",
      "memory:read:semantic",
      "model:invoke:content-quality",
    ],
    taskId: "task-001",
    workspaceId: "workspace-local",
  };
}
