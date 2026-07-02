import {
  calculateEffectivePermissions,
  normalizedPermissions,
  permissionsDeclaredByAgent,
} from "./effective-permissions.js";
import type {
  PermissionGrantResolver,
  PolicyEvaluationInput,
  PolicyEvaluator,
} from "./policy-evaluator.js";
import type { PolicyDecision } from "./policy-decision.js";

export class DefaultDenyPolicyEvaluator implements PolicyEvaluator {
  readonly #grants: PermissionGrantResolver;

  public constructor(grants: PermissionGrantResolver) {
    this.#grants = grants;
  }

  public async evaluate(
    input: PolicyEvaluationInput,
  ): Promise<PolicyDecision> {
    const requestedPermissions = permissionsDeclaredByAgent(input.agent);
    const grants = await this.#grants.resolve({
      actorId: input.actorId,
      agent: Object.freeze({
        agentId: input.agent.agentId,
        version: input.agent.version,
      }),
      requestedPermissions,
      taskId: input.taskId,
      taskType: input.taskType,
      workspaceId: input.workspaceId,
    });
    const effectivePermissions = calculateEffectivePermissions(
      requestedPermissions,
      grants,
    );
    const effectiveSet = new Set(effectivePermissions);
    const deniedPermissions = normalizedPermissions(
      requestedPermissions.filter(
        (permission) => !effectiveSet.has(permission),
      ),
    );

    return Object.freeze({
      actorId: input.actorId,
      agent: Object.freeze({
        agentId: input.agent.agentId,
        version: input.agent.version,
      }),
      contractVersion: input.contractVersion,
      decisionId: input.decisionId,
      deniedPermissions,
      effectivePermissions,
      evaluatedAt: input.evaluatedAt,
      requestedPermissions,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
    });
  }
}
