import type { EffectivePermission } from "../../policy/effective-permissions.js";

export type AgentPolicyRequirementType =
  | "approval"
  | "audit"
  | "data_scope";

export interface AgentPolicyRequirement {
  readonly requirementId: string;
  readonly requirementType: AgentPolicyRequirementType;
  readonly permissions: readonly EffectivePermission[];
  readonly rationale: string;
}
