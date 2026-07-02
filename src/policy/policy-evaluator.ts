import type {
  AgentManifest,
  AgentReference,
} from "../agents/agent-manifest.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type {
  EffectivePermission,
  PermissionGrantSet,
} from "./effective-permissions.js";
import type { PolicyDecision } from "./policy-decision.js";

export interface PolicyEvaluationInput {
  readonly contractVersion: RequestContractVersion;
  readonly decisionId: string;
  readonly taskId: string;
  readonly taskType: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentManifest;
  readonly evaluatedAt: string;
}

export interface PermissionGrantResolutionInput {
  readonly taskId: string;
  readonly taskType: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentReference;
  readonly requestedPermissions: readonly EffectivePermission[];
}

export interface PermissionGrantResolver {
  resolve(
    input: PermissionGrantResolutionInput,
  ): Promise<PermissionGrantSet>;
}

export interface PolicyEvaluator {
  evaluate(input: PolicyEvaluationInput): Promise<PolicyDecision>;
}
