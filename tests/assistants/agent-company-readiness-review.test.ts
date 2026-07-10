import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  AgentCompanyReadinessReportValidator,
  AgentCompanyReadinessReviewInputValidator,
  AgentCompanyReadinessValidationError,
  DeterministicAgentCompanyReadinessEvaluator,
  type AgentCompanyReadinessCategory,
  type AgentCompanyReadinessReport,
  type AgentCompanyReadinessReviewInput,
} from "../../src/index.js";

type DeepMutable<T> = T extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

describe("Agent Company Readiness Review", () => {
  it("evaluates the actual Agent Company declarations as READY", () => {
    const report = evaluate();

    expect(report.summary).toEqual({
      criticalFindings: 0,
      evaluatedArtifacts: 6,
      informationalFindings: 0,
      readinessScore: 100,
      status: "READY",
      totalFindings: 0,
      warningFindings: 0,
    });
    expect(report.findings).toEqual([]);
    expect(new AgentCompanyReadinessReportValidator().validate(report)).toEqual({
      ok: true,
      value: report,
    });
  });

  it("returns identical deterministic reports for identical declarations", () => {
    expect(evaluate()).toEqual(evaluate());
    expect(JSON.stringify(evaluate())).toBe(JSON.stringify(evaluate()));
  });

  it("reports a missing exact AgentSpecification", () => {
    const input = cloneInput();
    input.agentSpecifications = input.agentSpecifications.filter(
      ({ agentId }) => agentId !== "research-agent",
    );

    expectCategory(evaluate(input), "specification_coverage");
    expectFinding(evaluate(input), "missing-specification-research-agent");
  });

  it("reports duplicate AgentSpecification role identity", () => {
    const input = cloneInput();
    const first = input.agentSpecifications[0];
    if (first === undefined) {
      throw new Error("missing AgentSpecification fixture");
    }
    input.agentSpecifications.push(structuredClone(first));

    expectFinding(evaluate(input), "duplicate-specification-research-agent");
  });

  it("reports an orphan responsibility area", () => {
    const input = cloneInput();
    const area = input.responsibilityMatrix.areas[0];
    if (area === undefined) {
      throw new Error("missing responsibility fixture");
    }
    area.primaryOwners = [];

    expectFinding(evaluate(input), "primary-owner-count-research");
  });

  it("reports duplicate responsibility ownership", () => {
    const input = cloneInput();
    const area = input.responsibilityMatrix.areas[0];
    const owner = area?.primaryOwners[0];
    if (area === undefined || owner === undefined) {
      throw new Error("missing responsibility owner fixture");
    }
    area.primaryOwners.push(structuredClone(owner));

    expectFinding(evaluate(input), "primary-owner-count-research");
  });

  it("reports missing capability ownership and role coverage", () => {
    const input = cloneInput();
    for (const capability of input.capabilityRegistry.capabilities) {
      if (capability.primaryOwners[0]?.agentId === "research-agent") {
        capability.primaryOwners = [];
      }
    }

    const report = evaluate(input);
    expectCategory(report, "capability_ownership");
    expectFinding(report, "missing-capability-research-agent");
  });

  it("reports a capability without permission coverage", () => {
    const input = cloneInput();
    input.permissionMatrix.permissionRules =
      input.permissionMatrix.permissionRules.filter(
        ({ capabilityId }) => capabilityId !== "source-research",
      );

    expectFinding(evaluate(input), "permission-count-source-research");
  });

  it("reports an approval-sensitive handoff bypass", () => {
    const input = cloneInput();
    const handoff = input.handoffContracts.handoffs.find(
      ({ handoffId }) =>
        handoffId === "content_to_publishing_preparation-handoff",
    );
    if (handoff === undefined) {
      throw new Error("missing approval handoff fixture");
    }
    (
      handoff as unknown as { approvalRequired: boolean }
    ).approvalRequired = false;
    handoff.approvalRequirements = [];

    expectFinding(
      evaluate(input),
      "handoff-approval-content-to-publishing-preparation-handoff",
    );
  });

  it("reports a guardian-sensitive handoff gap", () => {
    const input = cloneInput();
    const handoff = input.handoffContracts.handoffs.find(
      ({ handoffId }) => handoffId === "content_to_quality_review-handoff",
    );
    if (handoff === undefined) {
      throw new Error("missing guardian handoff fixture");
    }
    (
      handoff as unknown as { guardianRequired: boolean }
    ).guardianRequired = false;
    handoff.guardianRequirements = [];

    expectFinding(
      evaluate(input),
      "handoff-guardian-content-to-quality-review-handoff",
    );
  });

  it("reports an impossible self-handoff", () => {
    const input = cloneInput();
    const handoff = input.handoffContracts.handoffs[0];
    if (handoff === undefined) {
      throw new Error("missing handoff fixture");
    }
    handoff.target = structuredClone(handoff.source);

    expectFinding(
      evaluate(input),
      "handoff-endpoints-research-to-business-strategy-handoff",
    );
  });

  it("reports a handoff target absent from the source specification allowlist", () => {
    const input = cloneInput();
    const content = input.agentSpecifications.find(
      ({ agentId }) => agentId === "content-director",
    );
    if (content === undefined) {
      throw new Error("missing content specification fixture");
    }
    content.handoffTargets = content.handoffTargets.filter(
      (target) => target !== "publisher-agent",
    );

    expectFinding(
      evaluate(input),
      "undeclared-handoff-target-content-to-publishing-preparation-handoff",
    );
  });

  it("reports unknown downstream roles without echoing the raw identifier", () => {
    const input = cloneInput();
    const specification = input.agentSpecifications[0];
    if (specification === undefined) {
      throw new Error("missing specification fixture");
    }
    specification.agentId = "unknown-private-role";

    const serialized = JSON.stringify(evaluate(input));
    expect(serialized).not.toContain("unknown-private-role");
    expectCategory(evaluate(input), "role_coverage");
  });

  it("reports an unsafe runtime-permission implication", () => {
    const input = cloneInput();
    const rule = input.permissionMatrix.permissionRules[0];
    if (rule === undefined) {
      throw new Error("missing permission fixture");
    }
    (rule as unknown as { grantsRuntimeAccess: boolean }).grantsRuntimeAccess =
      true;

    expectCategory(evaluate(input), "execution_safety");
    expect(evaluate(input).summary.status).toBe("NOT_READY");
  });

  it("keeps findings redaction-safe when a declaration contains sensitive content", () => {
    const input = cloneInput();
    const role = input.agentCompanyMap.roles[0];
    if (role === undefined) {
      throw new Error("missing role fixture");
    }
    role.operatorFacingPurpose =
      "Use sk-private-value and /Users/private/source to inspect a raw prompt.";

    const serialized = JSON.stringify(evaluate(input));
    expect(serialized).not.toContain("sk-private-value");
    expect(serialized).not.toContain("/Users/private/source");
    expect(serialized).not.toContain("raw prompt");
    expectCategory(evaluate(input), "artifact_validation");
  });

  it("uses stable finding ordering independent of input order", () => {
    const findings = evaluate(multiDefectInput()).findings;
    const keys = findings.map(
      ({ category, findingId, severity }) =>
        `${severity}:${category}:${findingId}`,
    );
    const severityOrder = { critical: "0", info: "2", warning: "1" } as const;
    const expected = findings
      .map(
        ({ category, findingId, severity }) =>
          `${severityOrder[severity]}:${category}:${findingId}`,
      )
      .sort();
    const actual = findings.map(
      ({ category, findingId, severity }) =>
        `${severityOrder[severity]}:${category}:${findingId}`,
    );

    expect(actual).toEqual(expected);
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it("never lets a numerical score override a critical finding", () => {
    const input = cloneInput();
    input.agentSpecifications = input.agentSpecifications.slice(1);

    const report = evaluate(input);
    expect(report.summary.criticalFindings).toBeGreaterThan(0);
    expect(report.summary.status).toBe("NOT_READY");
  });

  it("returns deeply immutable reports", () => {
    const report = evaluate(multiDefectInput());

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.summary)).toBe(true);
    expect(Object.isFrozen(report.findings)).toBe(true);
    expect(Object.isFrozen(report.findings[0])).toBe(true);
    expect(Object.isFrozen(report.findings[0]?.evidenceRefs)).toBe(true);
  });

  it("rejects invalid public input before evaluation", () => {
    const input = cloneInput();
    (input as unknown as { nonExecuting: boolean }).nonExecuting = false;

    expect(() => evaluate(input)).toThrow(AgentCompanyReadinessValidationError);
    expect(
      new AgentCompanyReadinessReviewInputValidator().validate(input).ok,
    ).toBe(false);
  });

  it("rejects a report whose READY status conflicts with a critical finding", () => {
    const report = structuredClone(
      evaluate(multiDefectInput()),
    ) as DeepMutable<AgentCompanyReadinessReport>;
    report.summary.status = "READY";

    const validation = new AgentCompanyReadinessReportValidator().validate(report);
    expect(validation.ok).toBe(false);
    expect(validation.ok ? [] : validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "inconsistent_summary",
          path: "summary.status",
        }),
      ]),
    );
  });

  it("declares every current handoff target in the source AgentSpecification", () => {
    const specifications = new Map(
      DEFAULT_AGENT_COMPANY_READINESS_INPUT.agentSpecifications.map(
        (specification) => [specification.agentId, specification],
      ),
    );

    for (const handoff of DEFAULT_AGENT_COMPANY_READINESS_INPUT.handoffContracts
      .handoffs) {
      expect(
        specifications
          .get(handoff.source.agentId)
          ?.handoffTargets.includes(handoff.target.agentId),
      ).toBe(true);
    }
  });
});

function evaluate(
  input: AgentCompanyReadinessReviewInput =
    DEFAULT_AGENT_COMPANY_READINESS_INPUT,
): AgentCompanyReadinessReport {
  return new DeterministicAgentCompanyReadinessEvaluator().evaluate(input);
}

function cloneInput(): DeepMutable<AgentCompanyReadinessReviewInput> {
  return structuredClone(
    DEFAULT_AGENT_COMPANY_READINESS_INPUT,
  ) as DeepMutable<AgentCompanyReadinessReviewInput>;
}

function multiDefectInput(): DeepMutable<AgentCompanyReadinessReviewInput> {
  const input = cloneInput();
  input.agentSpecifications = input.agentSpecifications.filter(
    ({ agentId }) => agentId !== "research-agent",
  );
  input.permissionMatrix.permissionRules =
    input.permissionMatrix.permissionRules.filter(
      ({ capabilityId }) => capabilityId !== "source-research",
    );
  const area = input.responsibilityMatrix.areas[0];
  if (area === undefined) {
    throw new Error("missing responsibility fixture");
  }
  area.primaryOwners = [];
  return input;
}

function expectCategory(
  report: AgentCompanyReadinessReport,
  category: AgentCompanyReadinessCategory,
): void {
  expect(report.findings).toEqual(
    expect.arrayContaining([expect.objectContaining({ category })]),
  );
}

function expectFinding(
  report: AgentCompanyReadinessReport,
  codeSuffix: string,
): void {
  expect(report.findings.some(({ findingId }) => findingId.endsWith(codeSuffix))).toBe(
    true,
  );
}
