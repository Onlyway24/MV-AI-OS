import type { AgentReference } from "../agents/agent-manifest.js";
import type { RequestContractVersion } from "../contracts/request-envelope.js";
import type { EffectivePermission } from "./effective-permissions.js";

export interface PolicyDecision {
  readonly contractVersion: RequestContractVersion;
  readonly decisionId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly agent: AgentReference;
  readonly requestedPermissions: readonly EffectivePermission[];
  readonly effectivePermissions: readonly EffectivePermission[];
  readonly deniedPermissions: readonly EffectivePermission[];
  readonly evaluatedAt: string;
}
