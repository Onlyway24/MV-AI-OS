import type { Clock } from "../ports/clock.js";
import type { Validator } from "../validation/validation.js";
import { DeterministicMetodoVeloceContentProductionLine } from "../content-production/deterministic-metodo-veloce-content-production-line.js";
import type { MetodoVeloceContentProductionBrief, MetodoVeloceContentProductionPackage } from "../content-production/metodo-veloce-content-production.js";
import { MetodoVeloceContentProductionPackageValidator } from "../content-production/metodo-veloce-content-production-validator.js";
import type { MetodoVeloceSocialIntelligenceRequest } from "./metodo-veloce-social-intelligence.js";
import { DeterministicMetodoVeloceSocialIntelligenceEngine } from "./deterministic-metodo-veloce-social-intelligence-engine.js";

export class DeterministicMetodoVeloceSocialProductionLine {
  readonly #content: DeterministicMetodoVeloceContentProductionLine;
  readonly #intelligence: DeterministicMetodoVeloceSocialIntelligenceEngine;
  readonly #package = new MetodoVeloceContentProductionPackageValidator();

  public constructor(clock: Clock) {
    this.#content = new DeterministicMetodoVeloceContentProductionLine(clock);
    this.#intelligence = new DeterministicMetodoVeloceSocialIntelligenceEngine(clock);
  }

  public produce(brief: MetodoVeloceContentProductionBrief, intelligence: MetodoVeloceSocialIntelligenceRequest): MetodoVeloceContentProductionPackage {
    if (brief.productionId !== intelligence.productionId) throw new Error("Social Intelligence production ID does not match the content brief");
    const base = this.#content.produce(brief);
    if (base.assets === undefined) return base;
    const socialPublishingPack = this.#intelligence.analyze(intelligence, base.assets.carousel);
    if (socialPublishingPack.status === "READY_FOR_FABIO_APPROVAL") return validate({ ...base, socialPublishingPack }, this.#package, "Social content production package");
    const withoutAssets: Omit<MetodoVeloceContentProductionPackage, "assets"> = {
      approval: base.approval,
      contractVersion: base.contractVersion,
      editorialPlan: base.editorialPlan,
      evidence: base.evidence,
      externalActionsAllowed: base.externalActionsAllowed,
      generatedAt: base.generatedAt,
      metrics: base.metrics,
      missionReference: base.missionReference,
      productionId: base.productionId,
      quality: base.quality,
      risk: base.risk,
      status: base.status,
      version: base.version,
    };
    const reason = socialPublishingPack.status === "REQUIRES_RESEARCH"
      ? "Social Intelligence incompleta: acquisire i segnali mancanti prima della review di Fabio."
      : socialPublishingPack.blockingReasons.join(" ");
    return validate({
      ...withoutAssets,
      approval: { required: true, status: "NOT_ELIGIBLE" },
      quality: { ...base.quality, readinessScore: 0 },
      risk: { findings: [reason], status: "BLOCKED" },
      socialPublishingPack,
      status: "BLOCKED",
    }, this.#package, "Blocked Social content production package");
  }
}

function validate<T>(value: unknown, validator: Validator<T>, label: string): T { const result = validator.validate(value); if (!result.ok) throw new Error(`${label} failed validation`); return result.value; }
