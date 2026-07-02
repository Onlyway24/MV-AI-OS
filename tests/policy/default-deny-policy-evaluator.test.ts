import { describe, expect, it } from "vitest";

import {
  DefaultDenyPolicyEvaluator,
  permissionsDeclaredByAgent,
  type EffectivePermission,
  type PolicyEvaluationInput,
} from "../../src/index.js";
import { createManifest } from "../support/fixtures.js";
import { StaticPermissionGrantResolver } from "../support/policy-fixtures.js";

describe("DefaultDenyPolicyEvaluator", () => {
  it("denies every manifest permission when grants are missing", async () => {
    const evaluator = new DefaultDenyPolicyEvaluator(
      new StaticPermissionGrantResolver(),
    );

    const decision = await evaluator.evaluate(evaluationInput());

    expect(decision.effectivePermissions).toEqual([]);
    expect(decision.deniedPermissions).toEqual(
      decision.requestedPermissions,
    );
  });

  it("allows only permissions explicitly present in every required grant set", async () => {
    const allowed = [
      "knowledge:search",
      "memory:read:semantic",
      "model:invoke:content-quality",
      "tool:read:catalog",
    ] as const satisfies readonly EffectivePermission[];
    const evaluator = new DefaultDenyPolicyEvaluator(
      new StaticPermissionGrantResolver({
        actorGrants: [
          ...allowed,
          "tool:execute:undeclared",
          "memory:read:semantic",
        ],
        policyGrants: [...allowed].reverse(),
        taskGrants: [...allowed, "workflow:execute:undeclared"],
      }),
    );

    const decision = await evaluator.evaluate(evaluationInput());

    expect(decision.effectivePermissions).toEqual(allowed);
    expect(decision.effectivePermissions).not.toContain(
      "tool:execute:undeclared",
    );
    expect(decision.requestedPermissions).toEqual(
      permissionsDeclaredByAgent(evaluationInput().agent),
    );
  });

  it("applies approval grants when they are available", async () => {
    const common = [
      "memory:read:semantic",
      "model:invoke:content-quality",
      "tool:execute:catalog",
    ] as const satisfies readonly EffectivePermission[];
    const evaluator = new DefaultDenyPolicyEvaluator(
      new StaticPermissionGrantResolver({
        actorGrants: common,
        approvalGrants: ["tool:execute:catalog"],
        policyGrants: common,
        taskGrants: common,
      }),
    );

    const decision = await evaluator.evaluate(evaluationInput());

    expect(decision.effectivePermissions).toEqual([
      "tool:execute:catalog",
    ]);
  });

  it("returns deterministic sorted permissions regardless of grant order or duplicates", async () => {
    const grants = [
      "tool:read:catalog",
      "memory:read:semantic",
      "tool:read:catalog",
      "knowledge:search",
      "model:invoke:content-quality",
    ] as const satisfies readonly EffectivePermission[];
    const evaluator = new DefaultDenyPolicyEvaluator(
      new StaticPermissionGrantResolver({
        actorGrants: grants,
        policyGrants: [...grants].reverse(),
        taskGrants: grants,
      }),
    );

    const decision = await evaluator.evaluate(evaluationInput());

    expect(decision.effectivePermissions).toEqual([
      "knowledge:search",
      "memory:read:semantic",
      "model:invoke:content-quality",
      "tool:read:catalog",
    ]);
  });
});

function evaluationInput(): PolicyEvaluationInput {
  return {
    actorId: "actor-local",
    agent: createManifest({
      knowledgeAccess: ["workspace-local"],
      memoryAccess: {
        proposeWrites: false,
        read: ["semantic", "user"],
      },
      tools: ["catalog"],
      workflowProposals: ["content.export"],
    }),
    contractVersion: "1",
    decisionId: "policy-decision-001",
    evaluatedAt: "2026-07-02T10:00:01.000Z",
    taskId: "task-001",
    taskType: "business.content",
    workspaceId: "workspace-local",
  };
}
