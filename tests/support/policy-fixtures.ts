import {
  DefaultDenyPolicyEvaluator,
  PolicyDecisionValidator,
  type PermissionGrantResolutionInput,
  type PermissionGrantResolver,
  type PermissionGrantSet,
} from "../../src/index.js";

export class StaticPermissionGrantResolver
  implements PermissionGrantResolver
{
  readonly #grants: PermissionGrantSet;

  public constructor(grants: PermissionGrantSet = emptyGrants()) {
    this.#grants = freezeGrants(grants);
  }

  public resolve(): Promise<PermissionGrantSet> {
    return Promise.resolve(this.#grants);
  }
}

export class AllowDeclaredPermissionGrantResolver
  implements PermissionGrantResolver
{
  public resolve(
    input: PermissionGrantResolutionInput,
  ): Promise<PermissionGrantSet> {
    const permissions = Object.freeze([...input.requestedPermissions]);
    return Promise.resolve(
      Object.freeze({
        actorGrants: permissions,
        policyGrants: permissions,
        taskGrants: permissions,
      }),
    );
  }
}

export function createAllowDeclaredPolicyDependencies(): {
  readonly policyDecisionValidator: PolicyDecisionValidator;
  readonly policyEvaluator: DefaultDenyPolicyEvaluator;
} {
  return {
    policyDecisionValidator: new PolicyDecisionValidator(),
    policyEvaluator: new DefaultDenyPolicyEvaluator(
      new AllowDeclaredPermissionGrantResolver(),
    ),
  };
}

function emptyGrants(): PermissionGrantSet {
  return Object.freeze({});
}

function freezeGrants(grants: PermissionGrantSet): PermissionGrantSet {
  return Object.freeze({
    actorGrants: Object.freeze([...(grants.actorGrants ?? [])]),
    ...(grants.approvalGrants === undefined
      ? {}
      : {
          approvalGrants: Object.freeze([...grants.approvalGrants]),
        }),
    policyGrants: Object.freeze([...(grants.policyGrants ?? [])]),
    taskGrants: Object.freeze([...(grants.taskGrants ?? [])]),
  });
}
