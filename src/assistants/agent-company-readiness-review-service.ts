import { AgentSpecificationValidator } from "../agents/specification/agent-specification-validator.js";
import type { AgentSpecification } from "../agents/specification/agent-specification.js";
import type { ValidationResult } from "../validation/validation.js";
import {
  AgentCompanyCapabilityRegistryValidator,
} from "./agent-capability-registry-validator.js";
import type {
  AgentCompanyCapability,
  AgentCompanyCapabilityId,
} from "./agent-capability-registry.js";
import { AgentCompanyMapValidator } from "./agent-company-specification-validator.js";
import type { AgentCompanyRoleId } from "./agent-company-specification.js";
import { AgentHandoffContractSetValidator } from "./agent-handoff-contracts-validator.js";
import type {
  AgentHandoffId,
  AgentHandoffRequest,
} from "./agent-handoff-contracts.js";
import { AgentCompanyPermissionMatrixValidator } from "./agent-permission-matrix-validator.js";
import type {
  AgentCompanyPermissionRule,
  AgentCompanyPermissionRuleId,
} from "./agent-permission-matrix.js";
import {
  AGENT_COMPANY_READINESS_CONTRACT_VERSION,
  type AgentCompanyReadinessCategory,
  type AgentCompanyReadinessEvaluator,
  type AgentCompanyReadinessFinding,
  type AgentCompanyReadinessReport,
  type AgentCompanyReadinessReviewInput,
  type AgentCompanyReadinessSeverity,
  type AgentCompanyReadinessStatus,
  AgentCompanyReadinessValidationError,
} from "./agent-company-readiness-review.js";
import {
  AgentCompanyReadinessReportValidator,
  AgentCompanyReadinessReviewInputValidator,
} from "./agent-company-readiness-review-validator.js";
import { ResponsibilityMatrixValidator } from "./inter-agent-responsibility-matrix-validator.js";
import type {
  ResponsibilityArea,
  ResponsibilityAreaId,
} from "./inter-agent-responsibility-matrix.js";

const EVALUATED_ARTIFACT_IDS = [
  "agent-company-map",
  "agent-specifications",
  "responsibility-matrix",
  "capability-registry",
  "permission-matrix",
  "handoff-contracts",
] as const;

interface FindingInput {
  readonly affectedCapabilityId?: AgentCompanyCapabilityId | undefined;
  readonly affectedHandoffId?: AgentHandoffId | undefined;
  readonly affectedPermissionId?: AgentCompanyPermissionRuleId | undefined;
  readonly affectedResponsibilityAreaId?: ResponsibilityAreaId | undefined;
  readonly affectedRoleId?: AgentCompanyRoleId | undefined;
  readonly category: AgentCompanyReadinessCategory;
  readonly code: string;
  readonly evidenceRefs: readonly string[];
  readonly recommendation: string;
  readonly severity?: AgentCompanyReadinessSeverity;
  readonly summary: string;
  readonly title: string;
}

export class DeterministicAgentCompanyReadinessEvaluator
  implements AgentCompanyReadinessEvaluator
{
  readonly #inputValidator = new AgentCompanyReadinessReviewInputValidator();
  readonly #reportValidator = new AgentCompanyReadinessReportValidator();

  public evaluate(
    input: AgentCompanyReadinessReviewInput,
  ): AgentCompanyReadinessReport {
    const inputValidation = this.#inputValidator.validate(input);
    if (!inputValidation.ok) {
      throw new AgentCompanyReadinessValidationError(
        "Agent Company readiness input is invalid",
        inputValidation.issues,
      );
    }

    const validInput = inputValidation.value;
    const findings = new Map<string, AgentCompanyReadinessFinding>();
    evaluateCanonicalArtifacts(validInput, findings);
    evaluateRoleAndSpecificationCoverage(validInput, findings);
    evaluateResponsibilities(validInput, findings);
    evaluateCapabilities(validInput, findings);
    evaluatePermissions(validInput, findings);
    evaluateHandoffs(validInput, findings);
    evaluateExecutionSafety(validInput, findings);

    const orderedFindings = Object.freeze(
      [...findings.values()].sort(compareFindings),
    );
    const criticalFindings = countSeverity(orderedFindings, "critical");
    const warningFindings = countSeverity(orderedFindings, "warning");
    const informationalFindings = countSeverity(orderedFindings, "info");
    const status: AgentCompanyReadinessStatus =
      criticalFindings > 0
        ? "NOT_READY"
        : warningFindings > 0
          ? "READY_WITH_NON_BLOCKING_WARNINGS"
          : "READY";
    const report: AgentCompanyReadinessReport = {
      contractVersion: AGENT_COMPANY_READINESS_CONTRACT_VERSION,
      evaluatedArtifactIds: EVALUATED_ARTIFACT_IDS,
      findings: orderedFindings,
      nonExecuting: true,
      reportId: validInput.reviewId,
      summary: {
        criticalFindings,
        evaluatedArtifacts: EVALUATED_ARTIFACT_IDS.length,
        informationalFindings,
        readinessScore: Math.max(
          0,
          100 - criticalFindings * 20 - warningFindings * 5,
        ),
        status,
        totalFindings: orderedFindings.length,
        warningFindings,
      },
    };

    const reportValidation = this.#reportValidator.validate(report);
    if (!reportValidation.ok) {
      throw new AgentCompanyReadinessValidationError(
        "Agent Company readiness evaluator produced an invalid report",
        reportValidation.issues,
      );
    }
    return deepFreeze(reportValidation.value);
  }
}

function evaluateCanonicalArtifacts(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  addArtifactValidationFinding(
    new AgentCompanyMapValidator().validate(input.agentCompanyMap),
    "agent-company-map",
    "Agent Company map",
    findings,
  );
  for (const [index, specification] of input.agentSpecifications.entries()) {
    addArtifactValidationFinding(
      new AgentSpecificationValidator().validate(specification),
      `agent-specification-${String(index + 1).padStart(2, "0")}`,
      "AgentSpecification",
      findings,
    );
  }
  addArtifactValidationFinding(
    new ResponsibilityMatrixValidator().validate(input.responsibilityMatrix),
    "responsibility-matrix",
    "Inter-Agent Responsibility Matrix",
    findings,
  );
  addArtifactValidationFinding(
    new AgentCompanyCapabilityRegistryValidator().validate(
      input.capabilityRegistry,
    ),
    "capability-registry",
    "Agent Capability Registry",
    findings,
  );
  addArtifactValidationFinding(
    new AgentCompanyPermissionMatrixValidator().validate(
      input.permissionMatrix,
    ),
    "permission-matrix",
    "Agent Permission Matrix",
    findings,
  );
  addArtifactValidationFinding(
    new AgentHandoffContractSetValidator().validate(input.handoffContracts),
    "handoff-contracts",
    "Agent Handoff Contracts",
    findings,
  );
}

function addArtifactValidationFinding<T>(
  validation: ValidationResult<T>,
  artifactRef: string,
  artifactTitle: string,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  if (validation.ok) {
    return;
  }
  addFinding(findings, {
    category: "artifact_validation",
    code: `${artifactRef}-invalid`,
    evidenceRefs: [`artifact:${artifactRef}`],
    recommendation: `Repair the ${artifactTitle} through its existing validator before mission planning.`,
    summary: `${artifactTitle} failed its canonical runtime validation boundary.`,
    title: `${artifactTitle} is invalid`,
  });
}

function evaluateRoleAndSpecificationCoverage(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const roles = safeArray(input.agentCompanyMap.roles);
  const specifications = safeArray(input.agentSpecifications);
  const roleIds = new Set(roles.map(({ roleId }) => roleId));
  const specificationsByAgent = groupBy(
    specifications,
    ({ agentId }) => agentId,
  );

  reportDuplicates(
    roles.map(({ roleId }) => roleId),
    (roleId) => {
      addFinding(findings, {
        affectedRoleId: knownRoleId(roleId, roleIds),
        category: "role_coverage",
        code: `duplicate-role-${safeId(roleId)}`,
        evidenceRefs: [knownRef("role", roleId, roleIds)],
        recommendation: "Keep exactly one Agent Company declaration per role ID.",
        summary: "A role ID appears more than once in the Agent Company map.",
        title: "Duplicate Agent Company role",
      });
    },
  );
  reportDuplicates(
    specifications.map(({ agentId }) => agentId),
    (agentId) => {
      addFinding(findings, {
        affectedRoleId: knownRoleId(agentId, roleIds),
        category: "specification_coverage",
        code: `duplicate-specification-${safeId(agentId)}`,
        evidenceRefs: [knownRef("role", agentId, roleIds)],
        recommendation:
          "Keep exactly one current AgentSpecification for each Agent Company role.",
        summary: "More than one current specification declares the same agent role.",
        title: "Duplicate AgentSpecification role",
      });
    },
  );

  for (const role of roles) {
    const matching = specificationsByAgent.get(role.roleId) ?? [];
    const exact = matching.find(
      ({ agentId, version }) =>
        agentId === role.futureAgentSpecification.agentId &&
        version === role.futureAgentSpecification.version &&
        `${agentId}@${version}` ===
          role.futureAgentSpecification.specificationId,
    );
    if (exact === undefined) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "specification_coverage",
        code: `missing-specification-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Add the exact mapped AgentSpecification ID and version before planning with this role.",
        summary:
          "The Agent Company role has no exact AgentSpecification matching its declared ID and version.",
        title: "AgentSpecification coverage is missing",
      });
      continue;
    }
    if (exact.status !== role.futureAgentSpecification.expectedStatus) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "identifier_consistency",
        code: `specification-status-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Align the role mapping and AgentSpecification status before mission planning.",
        summary:
          "The mapped AgentSpecification status differs from the role declaration.",
        title: "AgentSpecification status is inconsistent",
      });
    }
  }

  for (const [index, specification] of specifications.entries()) {
    if (!roleIds.has(specification.agentId as AgentCompanyRoleId)) {
      addFinding(findings, {
        category: "role_coverage",
        code: `unknown-specification-role-${String(index + 1).padStart(2, "0")}`,
        evidenceRefs: ["artifact:agent-specifications"],
        recommendation:
          "Remove the orphan specification or declare its role through the Agent Company map.",
        summary:
          "An AgentSpecification references a role absent from the Agent Company map.",
        title: "Unknown AgentSpecification role",
      });
    }
  }
}

function evaluateResponsibilities(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const roles = safeArray(input.agentCompanyMap.roles);
  const roleIds = new Set(roles.map(({ roleId }) => roleId));
  const areas = safeArray(input.responsibilityMatrix.areas);

  reportDuplicates(
    areas.map(({ areaId }) => areaId),
    (areaId) => {
      addFinding(findings, {
        affectedResponsibilityAreaId: knownResponsibilityId(areaId, areas),
        category: "responsibility_ownership",
        code: `duplicate-responsibility-${safeId(areaId)}`,
        evidenceRefs: [knownAreaRef(areaId, areas)],
        recommendation: "Keep each responsibility area ID unique.",
        summary: "A responsibility area ID is declared more than once.",
        title: "Duplicate responsibility area",
      });
    },
  );

  const representedRoles = new Set<AgentCompanyRoleId>();
  for (const area of areas) {
    const areaRef = `responsibility:${area.areaId}`;
    const owners = safeArray(area.primaryOwners);
    if (owners.length !== 1) {
      addFinding(findings, {
        affectedResponsibilityAreaId: area.areaId,
        category: "responsibility_ownership",
        code: `primary-owner-count-${area.areaId}`,
        evidenceRefs: [areaRef],
        recommendation:
          "Assign exactly one known primary owner to the responsibility area.",
        summary:
          "The responsibility area does not have exactly one accountable primary owner.",
        title: "Responsibility ownership is ambiguous",
      });
    }
    const participants = responsibilityParticipants(area);
    participants.forEach((roleId) => {
      if (roleIds.has(roleId)) {
        representedRoles.add(roleId);
      } else {
        addFinding(findings, {
          category: "role_coverage",
          code: `unknown-responsibility-role-${area.areaId}-${safeId(roleId)}`,
          evidenceRefs: [areaRef],
          recommendation:
            "Use only roles declared by the supplied Agent Company map.",
          summary:
            "A responsibility assignment references a role absent from the Agent Company map.",
          title: "Unknown role in responsibility matrix",
        });
      }
    });
    const forbidden = new Set(
      safeArray(area.forbiddenRoles).map(({ agentId }) => agentId),
    );
    for (const owner of owners) {
      if (forbidden.has(owner.agentId)) {
        addFinding(findings, {
          affectedResponsibilityAreaId: area.areaId,
          affectedRoleId: knownRoleId(owner.agentId, roleIds),
          category: "responsibility_ownership",
          code: `forbidden-owner-${area.areaId}-${safeId(owner.agentId)}`,
          evidenceRefs: [areaRef],
          recommendation:
            "Remove the ownership conflict and assign a non-forbidden primary owner.",
          summary:
            "The primary owner is also forbidden from the same responsibility area.",
          title: "Forbidden role owns responsibility",
        });
      }
    }
  }

  for (const role of roles) {
    if (!representedRoles.has(role.roleId)) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "responsibility_coverage",
        code: `missing-responsibility-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Assign the role to at least one bounded responsibility area.",
        summary:
          "The Agent Company role has no responsibility ownership, support, consultation, approval, or prohibition boundary.",
        title: "Role has no responsibility coverage",
      });
    }
  }
}

function evaluateCapabilities(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const roles = safeArray(input.agentCompanyMap.roles);
  const roleIds = new Set(roles.map(({ roleId }) => roleId));
  const areas = safeArray(input.responsibilityMatrix.areas);
  const capabilities = safeArray(input.capabilityRegistry.capabilities);
  const ownedByRole = new Map<AgentCompanyRoleId, number>();

  reportDuplicates(
    capabilities.map(({ capabilityId }) => capabilityId),
    (capabilityId) => {
      addFinding(findings, {
        affectedCapabilityId: knownCapabilityId(capabilityId, capabilities),
        category: "capability_ownership",
        code: `duplicate-capability-${safeId(capabilityId)}`,
        evidenceRefs: [knownCapabilityRef(capabilityId, capabilities)],
        recommendation: "Keep each capability ID unique.",
        summary: "A capability ID is declared more than once.",
        title: "Duplicate capability",
      });
    },
  );

  for (const capability of capabilities) {
    const owners = safeArray(capability.primaryOwners);
    if (owners.length !== 1) {
      addFinding(findings, {
        affectedCapabilityId: capability.capabilityId,
        category: "capability_ownership",
        code: `capability-owner-count-${capability.capabilityId}`,
        evidenceRefs: [`capability:${capability.capabilityId}`],
        recommendation: "Assign exactly one known primary capability owner.",
        summary: "The capability does not have exactly one accountable owner.",
        title: "Capability ownership is ambiguous",
      });
    }
    for (const owner of owners) {
      if (!roleIds.has(owner.agentId)) {
        addFinding(findings, {
          affectedCapabilityId: capability.capabilityId,
          category: "role_coverage",
          code: `unknown-capability-owner-${capability.capabilityId}`,
          evidenceRefs: [`capability:${capability.capabilityId}`],
          recommendation:
            "Assign capability ownership only to a declared Agent Company role.",
          summary: "The capability owner is absent from the Agent Company map.",
          title: "Unknown capability owner",
        });
        continue;
      }
      ownedByRole.set(owner.agentId, (ownedByRole.get(owner.agentId) ?? 0) + 1);
      if (!areas.some((area) => roleParticipatesInArea(area, owner.agentId))) {
        addFinding(findings, {
          affectedCapabilityId: capability.capabilityId,
          affectedRoleId: owner.agentId,
          category: "capability_coverage",
          code: `capability-responsibility-${capability.capabilityId}`,
          evidenceRefs: [
            `capability:${capability.capabilityId}`,
            `role:${owner.agentId}`,
          ],
          recommendation:
            "Align capability ownership with an explicit responsibility boundary.",
          summary:
            "The capability owner has no corresponding role in the responsibility matrix.",
          title: "Capability lacks responsibility alignment",
        });
      }
    }
    for (const supporter of safeArray(capability.supportingRoles)) {
      if (!roleIds.has(supporter.agentId)) {
        addFinding(findings, {
          affectedCapabilityId: capability.capabilityId,
          category: "role_coverage",
          code: `unknown-capability-support-${capability.capabilityId}-${safeId(supporter.agentId)}`,
          evidenceRefs: [`capability:${capability.capabilityId}`],
          recommendation:
            "Reference only declared Agent Company roles as capability supporters.",
          summary:
            "A capability supporting role is absent from the Agent Company map.",
          title: "Unknown capability supporting role",
        });
      }
    }
  }

  for (const role of roles) {
    if ((ownedByRole.get(role.roleId) ?? 0) === 0) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "capability_coverage",
        code: `missing-capability-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Assign at least one bounded, meaningful planning capability to the role.",
        summary: "The Agent Company role owns no declared capability.",
        title: "Role has no capability ownership",
      });
    }
  }
}

function evaluatePermissions(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const capabilities = safeArray(input.capabilityRegistry.capabilities);
  const rules = safeArray(input.permissionMatrix.permissionRules);
  const boundaries = safeArray(input.permissionMatrix.roleBoundaries);
  const roles = safeArray(input.agentCompanyMap.roles);
  const capabilityById = new Map(
    capabilities.map((capability) => [capability.capabilityId, capability]),
  );
  const ruleGroups = groupBy(rules, ({ capabilityId }) => capabilityId);

  if (!isTrue(input.permissionMatrix.defaultDeny)) {
    addFinding(findings, {
      category: "permission_boundary",
      code: "default-deny-disabled",
      evidenceRefs: ["artifact:permission-matrix"],
      recommendation:
        "Restore the explicit default-deny planning boundary before mission planning.",
      summary: "The Agent Permission Matrix does not declare default-deny behavior.",
      title: "Default-deny boundary is missing",
    });
  }

  for (const capability of capabilities) {
    const matching = ruleGroups.get(capability.capabilityId) ?? [];
    if (matching.length !== 1) {
      addFinding(findings, {
        affectedCapabilityId: capability.capabilityId,
        category: "permission_coverage",
        code: `permission-count-${capability.capabilityId}`,
        evidenceRefs: [`capability:${capability.capabilityId}`],
        recommendation:
          "Map each capability to exactly one non-executing permission rule.",
        summary:
          "The capability does not have exactly one permission-policy declaration.",
        title: "Capability permission coverage is incomplete",
      });
      continue;
    }
    const rule = matching[0];
    const owner = capability.primaryOwners[0];
    if (rule === undefined || owner === undefined) {
      continue;
    }
    if (
      rule.subject.agentId !== owner.agentId ||
      rule.subject.specificationId !== owner.specificationId ||
      rule.subject.version !== owner.version
    ) {
      addFinding(findings, {
        affectedCapabilityId: capability.capabilityId,
        affectedPermissionId: rule.permissionId,
        category: "permission_coverage",
        code: `permission-owner-${capability.capabilityId}`,
        evidenceRefs: [
          `capability:${capability.capabilityId}`,
          `permission:${rule.permissionId}`,
        ],
        recommendation:
          "Align the permission subject with the capability's exact owner specification.",
        summary:
          "The permission rule subject differs from the capability owner.",
        title: "Permission owner is inconsistent",
      });
    }
    if (!permissionMatchesCapability(rule, capability)) {
      addFinding(findings, {
        affectedCapabilityId: capability.capabilityId,
        affectedPermissionId: rule.permissionId,
        category: "permission_boundary",
        code: `permission-controls-${capability.capabilityId}`,
        evidenceRefs: [
          `capability:${capability.capabilityId}`,
          `permission:${rule.permissionId}`,
        ],
        recommendation:
          "Preserve capability risk, approval, guardian, and non-execution controls in its permission rule.",
        summary:
          "The permission rule weakens or conflicts with capability safety metadata.",
        title: "Permission controls are inconsistent",
      });
    }
  }

  for (const rule of rules) {
    if (!capabilityById.has(rule.capabilityId)) {
      addFinding(findings, {
        affectedPermissionId: rule.permissionId,
        category: "permission_coverage",
        code: `orphan-permission-${safeId(rule.permissionId)}`,
        evidenceRefs: ["artifact:permission-matrix"],
        recommendation:
          "Remove the orphan permission or map it to an existing capability.",
        summary: "A permission rule references no supplied capability.",
        title: "Orphan permission rule",
      });
    }
  }

  for (const role of roles) {
    const matching = boundaries.filter(
      ({ role: boundaryRole }) => boundaryRole.agentId === role.roleId,
    );
    if (matching.length !== 1) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "permission_coverage",
        code: `role-boundary-count-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Declare exactly one default-deny permission boundary for the role.",
        summary:
          "The role does not have exactly one permission boundary declaration.",
        title: "Role permission boundary is missing or duplicated",
      });
      continue;
    }
    const boundary = matching[0];
    if (
      boundary === undefined ||
      boundary.allowedPermissionIds.length === 0 ||
      boundary.forbiddenActions.length === 0
    ) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "permission_boundary",
        code: `role-boundary-incomplete-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Declare both bounded allowed planning permissions and explicit forbidden actions.",
        summary:
          "The role permission boundary lacks allowed or forbidden behavior.",
        title: "Role permission boundary is incomplete",
      });
    }
  }
}

function evaluateHandoffs(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const roles = safeArray(input.agentCompanyMap.roles);
  const roleIds = new Set(roles.map(({ roleId }) => roleId));
  const specifications = safeArray(input.agentSpecifications);
  const specsByAgent = new Map(
    specifications.map((specification) => [specification.agentId, specification]),
  );
  const areas = safeArray(input.responsibilityMatrix.areas);
  const areaById = new Map(areas.map((area) => [area.areaId, area]));
  const capabilities = safeArray(input.capabilityRegistry.capabilities);
  const capabilityById = new Map(
    capabilities.map((capability) => [capability.capabilityId, capability]),
  );
  const permissionRules = safeArray(input.permissionMatrix.permissionRules);
  const permissionById = new Map(
    permissionRules.map((rule) => [rule.permissionId, rule]),
  );
  const handoffs = safeArray(input.handoffContracts.handoffs);
  const coveredRoles = new Set<AgentCompanyRoleId>();

  reportDuplicates(
    handoffs.map(({ handoffId }) => handoffId),
    (handoffId) => {
      addFinding(findings, {
        affectedHandoffId: knownHandoffId(handoffId, handoffs),
        category: "handoff_alignment",
        code: `duplicate-handoff-${safeId(handoffId)}`,
        evidenceRefs: [knownHandoffRef(handoffId, handoffs)],
        recommendation: "Keep each handoff ID unique.",
        summary: "A handoff ID is declared more than once.",
        title: "Duplicate handoff contract",
      });
    },
  );

  for (const handoff of handoffs) {
    const handoffRef = `handoff:${handoff.handoffId}`;
    const sourceKnown = roleIds.has(handoff.source.agentId);
    const targetKnown = roleIds.has(handoff.target.agentId);
    if (sourceKnown) {
      coveredRoles.add(handoff.source.agentId);
    }
    if (targetKnown) {
      coveredRoles.add(handoff.target.agentId);
    }
    if (!sourceKnown || !targetKnown || handoff.source.agentId === handoff.target.agentId) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "handoff_alignment",
        code: `handoff-endpoints-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Use distinct source and target roles declared by the Agent Company map.",
        summary:
          "The handoff has an unknown, identical, or otherwise impossible endpoint.",
        title: "Handoff endpoints are invalid",
      });
      continue;
    }
    const sourceSpec = specsByAgent.get(handoff.source.agentId);
    const targetSpec = specsByAgent.get(handoff.target.agentId);
    if (
      sourceSpec === undefined ||
      targetSpec === undefined ||
      !roleReferenceMatchesSpecification(handoff.source, sourceSpec) ||
      !roleReferenceMatchesSpecification(handoff.target, targetSpec)
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "specification_coverage",
        code: `handoff-specification-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Align both handoff endpoints with exact supplied AgentSpecification IDs and versions.",
        summary:
          "A handoff endpoint does not match its exact AgentSpecification.",
        title: "Handoff specification reference is inconsistent",
      });
    }
    if (
      sourceSpec !== undefined &&
      !sourceSpec.handoffTargets.includes(handoff.target.agentId)
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        affectedRoleId: handoff.source.agentId,
        category: "handoff_alignment",
        code: `undeclared-handoff-target-${handoff.handoffId}`,
        evidenceRefs: [handoffRef, `role:${handoff.source.agentId}`],
        recommendation:
          "Declare the target in the source AgentSpecification or remove the handoff contract.",
        summary:
          "The handoff target is absent from the source AgentSpecification allowlist.",
        title: "Handoff target is not declared",
      });
    }

    const relatedAreas = handoff.relatedResponsibilityAreaIds
      .map((areaId) => areaById.get(areaId))
      .filter((area): area is ResponsibilityArea => area !== undefined);
    if (
      relatedAreas.length !== handoff.relatedResponsibilityAreaIds.length ||
      !relatedAreas.some((area) =>
        roleParticipatesInArea(area, handoff.source.agentId),
      ) ||
      !relatedAreas.some((area) =>
        roleParticipatesInArea(area, handoff.target.agentId),
      )
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "handoff_alignment",
        code: `handoff-responsibility-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Reference responsibility areas that explicitly include both handoff participants.",
        summary:
          "The handoff is not supported by its declared responsibility paths.",
        title: "Handoff responsibility alignment is missing",
      });
    }

    const relatedCapabilities = handoff.relatedCapabilityIds
      .map((capabilityId) => capabilityById.get(capabilityId))
      .filter(
        (capability): capability is AgentCompanyCapability =>
          capability !== undefined,
      );
    if (
      relatedCapabilities.length !== handoff.relatedCapabilityIds.length ||
      !relatedCapabilities.some((capability) =>
        roleOwnsOrSupportsCapability(capability, handoff.target.agentId),
      )
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "handoff_alignment",
        code: `handoff-capability-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Reference at least one supplied capability owned or supported by the target role.",
        summary:
          "The handoff target is incompatible with the declared capability set.",
        title: "Handoff target capability is missing",
      });
    }

    const relatedCapabilityIds = new Set(handoff.relatedCapabilityIds);
    const relatedPermissions = handoff.relatedPermissionRuleIds
      .map((permissionId) => permissionById.get(permissionId))
      .filter(
        (rule): rule is AgentCompanyPermissionRule => rule !== undefined,
      );
    if (
      relatedPermissions.length !== handoff.relatedPermissionRuleIds.length ||
      relatedPermissions.some(
        ({ capabilityId }) => !relatedCapabilityIds.has(capabilityId),
      )
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "permission_coverage",
        code: `handoff-permission-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Map every handoff permission to one of the handoff's declared capabilities.",
        summary:
          "The handoff contains a missing or incompatible permission declaration.",
        title: "Handoff permission alignment is missing",
      });
    }

    const approvalSensitive =
      handoff.reason === "approval_preparation" ||
      handoff.futureTool.approvalSensitive ||
      handoff.futureWorkflow.approvalSensitive;
    if (
      approvalSensitive &&
      (!handoff.approvalRequired || handoff.approvalRequirements.length === 0)
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "approval_control",
        code: `handoff-approval-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Restore explicit Fabio approval markers for the approval-sensitive handoff.",
        summary:
          "An approval-sensitive handoff lacks an explicit Fabio approval requirement.",
        title: "Handoff approval control is missing",
      });
    }
    const guardianSensitive =
      handoff.futureTool.guardianSensitive ||
      handoff.futureWorkflow.guardianSensitive;
    if (
      guardianSensitive &&
      (!handoff.guardianRequired || handoff.guardianRequirements.length === 0)
    ) {
      addFinding(findings, {
        affectedHandoffId: handoff.handoffId,
        category: "guardian_control",
        code: `handoff-guardian-${handoff.handoffId}`,
        evidenceRefs: [handoffRef],
        recommendation:
          "Restore an explicit existing guardian-domain requirement for the handoff.",
        summary:
          "A guardian-sensitive handoff lacks an explicit guardian requirement.",
        title: "Handoff guardian control is missing",
      });
    }
  }

  for (const role of roles) {
    if (!coveredRoles.has(role.roleId)) {
      addFinding(findings, {
        affectedRoleId: role.roleId,
        category: "handoff_coverage",
        code: `missing-handoff-${role.roleId}`,
        evidenceRefs: [`role:${role.roleId}`],
        recommendation:
          "Add at least one safe, non-executing handoff involving this role.",
        summary:
          "The role is isolated from every declared Agent Company handoff.",
        title: "Role has no handoff coverage",
      });
    }
  }
}

function evaluateExecutionSafety(
  input: AgentCompanyReadinessReviewInput,
  findings: Map<string, AgentCompanyReadinessFinding>,
): void {
  const topLevelSafe =
    isTrue(input.nonExecuting) &&
    isTrue(input.agentCompanyMap.nonExecuting) &&
    isTrue(input.responsibilityMatrix.nonExecuting) &&
    isTrue(input.capabilityRegistry.nonExecuting) &&
    isTrue(input.permissionMatrix.nonExecuting) &&
    isTrue(input.handoffContracts.nonExecuting);
  const capabilitySafe = safeArray(input.capabilityRegistry.capabilities).every(
    (capability) =>
      isNonExecutingMode(capability.executionMode) &&
      isTrue(capability.forbiddenAsDirectPermission) &&
      isTrue(capability.futureTool.nonExecuting) &&
      isTrue(capability.futureWorkflow.nonExecuting),
  );
  const permissionSafe = safeArray(input.permissionMatrix.permissionRules).every(
    (rule) =>
      isTrue(rule.nonExecuting) &&
      isFalse(rule.grantsRuntimeAccess) &&
      isTrue(rule.forbiddenAsRuntimePermission) &&
      isTrue(rule.futureTool.nonExecuting) &&
      isTrue(rule.futureWorkflow.nonExecuting),
  );
  const handoffSafe = safeArray(input.handoffContracts.handoffs).every(
    (handoff) =>
      isTrue(handoff.nonExecuting) &&
      isTrue(handoff.futureTool.nonExecuting) &&
      isTrue(handoff.futureWorkflow.nonExecuting),
  );
  if (!topLevelSafe || !capabilitySafe || !permissionSafe || !handoffSafe) {
    addFinding(findings, {
      category: "execution_safety",
      code: "unsafe-execution-implication",
      evidenceRefs: ["artifact:agent-company"],
      recommendation:
        "Restore non-execution, no-runtime-grant, and no-direct-permission markers before planning.",
      summary:
        "At least one Agent Company declaration implies execution or runtime access.",
      title: "Unsafe execution implication detected",
    });
  }
}

function permissionMatchesCapability(
  rule: AgentCompanyPermissionRule,
  capability: AgentCompanyCapability,
): boolean {
  return (
    rule.permissionId === `${capability.capabilityId}-permission` &&
    rule.riskLevel === capability.riskLevel &&
    rule.approvalRequired === capability.approvalRequired &&
    rule.guardianRequired === capability.guardianRequired &&
    rule.futureTool.approvalSensitive ===
      capability.futureTool.approvalSensitive &&
    rule.futureTool.guardianSensitive ===
      capability.futureTool.guardianSensitive &&
    isTrue(rule.futureTool.nonExecuting) &&
    rule.futureWorkflow.approvalSensitive ===
      capability.futureWorkflow.approvalSensitive &&
    rule.futureWorkflow.guardianSensitive ===
      capability.futureWorkflow.guardianSensitive &&
    isTrue(rule.futureWorkflow.nonExecuting) &&
    isFalse(rule.grantsRuntimeAccess) &&
    isTrue(rule.forbiddenAsRuntimePermission) &&
    isTrue(rule.nonExecuting)
  );
}

function roleReferenceMatchesSpecification(
  reference: AgentHandoffRequest["source"],
  specification: AgentSpecification,
): boolean {
  return (
    reference.agentId === specification.agentId &&
    reference.version === specification.version &&
    reference.specificationId ===
      `${specification.agentId}@${specification.version}`
  );
}

function responsibilityParticipants(
  area: ResponsibilityArea,
): readonly AgentCompanyRoleId[] {
  return [
    ...safeArray(area.primaryOwners),
    ...safeArray(area.supportingRoles),
    ...safeArray(area.consultedRoles),
    ...safeArray(area.approvalRoles),
    ...safeArray(area.forbiddenRoles),
  ].map(({ agentId }) => agentId);
}

function roleParticipatesInArea(
  area: ResponsibilityArea,
  roleId: AgentCompanyRoleId,
): boolean {
  return responsibilityParticipants(area).includes(roleId);
}

function roleOwnsOrSupportsCapability(
  capability: AgentCompanyCapability,
  roleId: AgentCompanyRoleId,
): boolean {
  return (
    safeArray(capability.primaryOwners).some(
      ({ agentId }) => agentId === roleId,
    ) ||
    safeArray(capability.supportingRoles).some(
      ({ agentId }) => agentId === roleId,
    )
  );
}

function addFinding(
  findings: Map<string, AgentCompanyReadinessFinding>,
  input: FindingInput,
): void {
  const findingId = `${input.category}:${safeId(input.code)}`;
  findings.set(findingId, {
    ...(input.affectedCapabilityId === undefined
      ? {}
      : { affectedCapabilityId: input.affectedCapabilityId }),
    ...(input.affectedHandoffId === undefined
      ? {}
      : { affectedHandoffId: input.affectedHandoffId }),
    ...(input.affectedPermissionId === undefined
      ? {}
      : { affectedPermissionId: input.affectedPermissionId }),
    ...(input.affectedResponsibilityAreaId === undefined
      ? {}
      : {
          affectedResponsibilityAreaId:
            input.affectedResponsibilityAreaId,
        }),
    ...(input.affectedRoleId === undefined
      ? {}
      : { affectedRoleId: input.affectedRoleId }),
    category: input.category,
    evidenceRefs: Object.freeze([...input.evidenceRefs]),
    findingId,
    recommendation: input.recommendation,
    severity: input.severity ?? "critical",
    summary: input.summary,
    title: input.title,
  });
}

function compareFindings(
  left: AgentCompanyReadinessFinding,
  right: AgentCompanyReadinessFinding,
): number {
  const severityOrder: Record<AgentCompanyReadinessSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return (
    severityOrder[left.severity] - severityOrder[right.severity] ||
    left.category.localeCompare(right.category) ||
    left.findingId.localeCompare(right.findingId)
  );
}

function countSeverity(
  findings: readonly AgentCompanyReadinessFinding[],
  severity: AgentCompanyReadinessSeverity,
): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function reportDuplicates(
  values: readonly string[],
  onDuplicate: (value: string) => void,
): void {
  const seen = new Set<string>();
  const reported = new Set<string>();
  for (const value of values) {
    if (seen.has(value) && !reported.has(value)) {
      onDuplicate(value);
      reported.add(value);
    }
    seen.add(value);
  }
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const groupKey = key(value);
    const group = groups.get(groupKey) ?? [];
    group.push(value);
    groups.set(groupKey, group);
  }
  return groups;
}

function safeArray<T>(value: readonly T[]): readonly T[] {
  const candidate: unknown = value;
  return Array.isArray(candidate) ? (candidate as readonly T[]) : [];
}

function isTrue(value: unknown): boolean {
  return value === true;
}

function isFalse(value: unknown): boolean {
  return value === false;
}

function isNonExecutingMode(value: unknown): boolean {
  return value === "non_executing_declaration";
}

function safeId(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized.length === 0 ? "unknown" : normalized;
}

function knownRoleId(
  value: string,
  roleIds: ReadonlySet<AgentCompanyRoleId>,
): AgentCompanyRoleId | undefined {
  return roleIds.has(value as AgentCompanyRoleId)
    ? (value as AgentCompanyRoleId)
    : undefined;
}

function knownRef<T extends string>(
  kind: string,
  value: string,
  known: ReadonlySet<T>,
): string {
  return known.has(value as T) ? `${kind}:${value}` : `artifact:${kind}`;
}

function knownCapabilityId(
  value: string,
  capabilities: readonly AgentCompanyCapability[],
): AgentCompanyCapabilityId | undefined {
  return capabilities.some(({ capabilityId }) => capabilityId === value)
    ? (value as AgentCompanyCapabilityId)
    : undefined;
}

function knownCapabilityRef(
  value: string,
  capabilities: readonly AgentCompanyCapability[],
): string {
  return knownCapabilityId(value, capabilities) === undefined
    ? "artifact:capability-registry"
    : `capability:${value}`;
}

function knownResponsibilityId(
  value: string,
  areas: readonly ResponsibilityArea[],
): ResponsibilityAreaId | undefined {
  return areas.some(({ areaId }) => areaId === value)
    ? (value as ResponsibilityAreaId)
    : undefined;
}

function knownAreaRef(
  value: string,
  areas: readonly ResponsibilityArea[],
): string {
  return knownResponsibilityId(value, areas) === undefined
    ? "artifact:responsibility-matrix"
    : `responsibility:${value}`;
}

function knownHandoffId(
  value: string,
  handoffs: readonly AgentHandoffRequest[],
): AgentHandoffId | undefined {
  return handoffs.some(({ handoffId }) => handoffId === value)
    ? (value as AgentHandoffId)
    : undefined;
}

function knownHandoffRef(
  value: string,
  handoffs: readonly AgentHandoffRequest[],
): string {
  return knownHandoffId(value, handoffs) === undefined
    ? "artifact:handoff-contracts"
    : `handoff:${value}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return value;
}
