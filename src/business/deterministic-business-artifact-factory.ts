import { createHash } from "node:crypto";

import type { BusinessArtifact, BusinessCommercialPlan, BusinessEconomicsScenario, BusinessMissionDefinition, BusinessOpportunityCandidate, BusinessOpportunityScorecard } from "./business-mission.js";

export class DeterministicBusinessArtifactFactory {
  public produce(input: {
    readonly commercialPlan: BusinessCommercialPlan;
    readonly economics: readonly BusinessEconomicsScenario[];
    readonly evidencePackIds: readonly string[];
    readonly mission: BusinessMissionDefinition;
    readonly selected: BusinessOpportunityCandidate;
    readonly selectionExplanation: string;
    readonly scorecards: readonly BusinessOpportunityScorecard[];
  }): readonly BusinessArtifact[] {
    const shared = { evidencePackIds: input.evidencePackIds, missionId: input.mission.missionId, opportunityId: input.selected.opportunityId };
    const report = opportunityReport(input);
    const offer = offerDocument(input.commercialPlan);
    const economics = economicsCsv(input.economics);
    const validation = JSON.stringify(input.commercialPlan.validation, null, 2);
    const artifacts: readonly Omit<BusinessArtifact, "agent" | "approvalStatus" | "artifactId" | "evidencePackIds" | "fingerprint" | "missionId" | "opportunityId" | "reviewStatus" | "version">[] = [
      { content: report, kind: "OPPORTUNITY_REPORT", mediaType: "text/markdown" },
      { content: presentationHtml(input), kind: "PRESENTATION", mediaType: "text/html" },
      { content: offer, kind: "OFFER_DOCUMENT", mediaType: "text/markdown" },
      { content: economics, kind: "ECONOMICS_SHEET", mediaType: "text/csv" },
      { content: landingCopy(input.commercialPlan), kind: "LANDING_COPY", mediaType: "text/plain" },
      { content: emailSequence(input.commercialPlan), kind: "EMAIL_SEQUENCE", mediaType: "text/plain" },
      { content: input.commercialPlan.acquisition.outreachScript, kind: "OUTREACH_SCRIPT", mediaType: "text/plain" },
      { content: faq(input.commercialPlan), kind: "FAQ", mediaType: "text/markdown" },
      { content: validation, kind: "VALIDATION_PLAN", mediaType: "application/json" },
      { content: input.commercialPlan.acquisition.socialSupport.join("\n\n---\n\n"), kind: "SOCIAL_SUPPORT", mediaType: "text/plain" },
    ];
    return Object.freeze(artifacts.map((artifact) => {
      const artifactId = `${input.mission.missionId}-${artifact.kind.toLowerCase().replaceAll("_", "-")}`;
      const fingerprint = createHash("sha256").update(JSON.stringify({ ...artifact, ...shared, artifactId }), "utf8").digest("hex");
      return Object.freeze({
        ...artifact,
        ...shared,
        agent: "artifact-producer@1.0.0" as const,
        approvalStatus: "PENDING" as const,
        artifactId,
        fingerprint,
        reviewStatus: "PENDING" as const,
        version: 0 as const,
      });
    }));
  }
}

function opportunityReport(input: Parameters<DeterministicBusinessArtifactFactory["produce"]>[0]): string {
  const ranking = input.scorecards.map((card) => `- ${card.opportunityId}: ${card.totalScore === undefined ? "dati mancanti" : `${String(card.totalScore)}/100`} (confidenza corretta ${card.confidenceAdjustedScore === undefined ? "n.d." : String(card.confidenceAdjustedScore)})`).join("\n");
  return `# Report opportunità — ${input.mission.missionId}\n\n## Decisione\n${input.selectionExplanation}\n\nOpportunità selezionata: **${input.selected.title}**.\n\n## Confronto deterministico\n${ranking}\n\n## Problema\n${input.selected.problem}\n\n## Cliente\n${input.selected.customer}\n\n## Evidenze\nEvidence Pack: ${input.selected.evidencePackId}.\n\n## Limiti e informazioni mancanti\n${input.selected.missingInformation.length === 0 ? "Nessuna informazione mancante dichiarata." : input.selected.missingInformation.map((item) => `- ${item}`).join("\n")}\n\n## Assunzioni\n${input.selected.assumptions.length === 0 ? "Nessuna assunzione dichiarata." : input.selected.assumptions.map((item) => `- ${item}`).join("\n")}\n`;
}

function offerDocument(plan: BusinessCommercialPlan): string {
  const offer = plan.offer;
  return `# Documento dell'offerta\n\n## Cliente ideale\n${offer.idealCustomer}\n\n## Problema prioritario\n${offer.primaryProblem}\n\n## Risultato promesso\n${offer.promisedOutcome}\n\n## Meccanismo\n${offer.mechanism}\n\n## Deliverable\n${offer.deliverables.map((item) => `- ${item}`).join("\n")}\n\n## Limiti\n${offer.limits.map((item) => `- ${item}`).join("\n")}\n\n## Garanzia\n${offer.guarantee}\n\n## Posizionamento\n${offer.positioning}\n\n## Differenziazione\n${offer.differentiation}\n\n## Livelli\n${offer.tiers.map((tier) => `- ${tier.name}: ${tier.priceCents === undefined ? "prezzo non ancora disponibile" : formatEuro(tier.priceCents)}`).join("\n")}\n`;
}

function economicsCsv(scenarios: readonly BusinessEconomicsScenario[]): string {
  const header = "scenario,revenue_cents,net_revenue_cents,variable_costs_cents,fixed_costs_cents,gross_margin_cents,contribution_margin_cents,break_even_clients,max_sustainable_cac_cents,payback_months";
  const rows = scenarios.map((scenario) => [scenario.name, cell(scenario.revenueCents.value), cell(scenario.netRevenueCents.value), cell(scenario.variableCostsCents.value), cell(scenario.fixedCostsCents.value), cell(scenario.grossMarginCents.value), cell(scenario.contributionMarginCents.value), cell(scenario.breakEvenClients.value), cell(scenario.maximumSustainableCacCents.value), cell(scenario.paybackMonths.value)].join(","));
  return [header, ...rows].join("\n");
}

function presentationHtml(input: Parameters<DeterministicBusinessArtifactFactory["produce"]>[0]): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${escapeHtml(input.selected.title)}</title></head><body><main><section><h1>${escapeHtml(input.selected.title)}</h1><p>${escapeHtml(input.selectionExplanation)}</p></section><section><h2>Cliente e problema</h2><p>${escapeHtml(input.commercialPlan.offer.idealCustomer)}</p><p>${escapeHtml(input.commercialPlan.offer.primaryProblem)}</p></section><section><h2>Offerta</h2><p>${escapeHtml(input.commercialPlan.offer.promisedOutcome)}</p></section><section><h2>Validazione</h2><p>${String(input.commercialPlan.validation.length)} esperimento/i, nessuna azione esterna eseguita.</p></section></main></body></html>`;
}

function landingCopy(plan: BusinessCommercialPlan): string { const copy = plan.acquisition.landingCopy; return `${copy.headline}\n${copy.subheadline}\n\n${copy.proof}\n\nCTA: ${copy.callToAction}`; }
function emailSequence(plan: BusinessCommercialPlan): string { return plan.acquisition.emailSequence.map((email, index) => `EMAIL ${String(index + 1)}\nOggetto: ${email.subject}\n\n${email.body}`).join("\n\n---\n\n"); }
function faq(plan: BusinessCommercialPlan): string { return `# FAQ e obiezioni\n\n${plan.acquisition.faq.map((entry) => `## ${entry.question}\n${entry.answer}`).join("\n\n")}`; }
function cell(value: number | undefined): string { return value === undefined ? "NOT_AVAILABLE" : String(value); }
function formatEuro(cents: number): string { return new Intl.NumberFormat("it-IT", { currency: "EUR", style: "currency" }).format(cents / 100); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
