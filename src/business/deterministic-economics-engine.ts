import type {
  BusinessCalculatedValue,
  BusinessEconomicsScenario,
  BusinessEconomicsScenarioInput,
} from "./business-mission.js";

const REQUIRED_FIELDS = Object.freeze([
  "acquisitionCostCents",
  "deliveryCostCents",
  "fixedCostsCents",
  "hourlyCostCents",
  "humanHoursPerClient",
  "monthlyVolume",
  "priceCents",
  "refundRateBps",
  "toolCostsCents",
] as const);

export class DeterministicBusinessEconomicsEngine {
  public calculate(input: BusinessEconomicsScenarioInput): BusinessEconomicsScenario {
    const missing = REQUIRED_FIELDS.filter((field) => input[field] === undefined);
    if (missing.length > 0) return unavailable(input.name, missing);

    const price = required(input.priceCents);
    const delivery = required(input.deliveryCostCents);
    const tools = required(input.toolCostsCents);
    const fixed = required(input.fixedCostsCents);
    const hours = required(input.humanHoursPerClient);
    const hourly = required(input.hourlyCostCents);
    const acquisition = required(input.acquisitionCostCents);
    const volume = required(input.monthlyVolume);
    const refundsBps = required(input.refundRateBps);
    const taxBps = input.taxRateBps;
    const laborPerClient = money(hours * hourly);
    const revenue = money(price * volume);
    const refunds = money(revenue * refundsBps / 10_000);
    const revenueAfterRefunds = money(revenue - refunds);
    const taxes = taxBps === undefined ? 0 : money(revenueAfterRefunds * taxBps / 10_000);
    const netRevenue = money(revenueAfterRefunds - taxes);
    const deliveryAndLabor = money((delivery + laborPerClient) * volume);
    const variableCosts = money((delivery + laborPerClient + acquisition) * volume);
    const fixedCosts = money(tools + fixed);
    const grossMargin = money(netRevenue - deliveryAndLabor);
    const contributionMargin = money(netRevenue - variableCosts - fixedCosts);
    const netRevenuePerClient = volume === 0 ? 0 : netRevenue / volume;
    const contributionBeforeAcquisitionPerClient = money(netRevenuePerClient - delivery - laborPerClient);
    const contributionAfterAcquisitionPerClient = money(contributionBeforeAcquisitionPerClient - acquisition);
    const breakEven = contributionAfterAcquisitionPerClient <= 0
      ? undefined
      : Math.ceil(fixedCosts / contributionAfterAcquisitionPerClient);
    const payback = contributionBeforeAcquisitionPerClient <= 0
      ? undefined
      : round(acquisition / contributionBeforeAcquisitionPerClient, 2);

    return Object.freeze({
      breakEvenClients: calculatedOrUnavailable(breakEven, "ceil((toolCostsCents + fixedCostsCents) / contributionAfterAcquisitionPerClient)"),
      contributionMarginCents: calculated(contributionMargin, "netRevenueCents - variableCostsCents - fixedCostsCents"),
      fixedCostsCents: calculated(fixedCosts, "toolCostsCents + fixedCostsCents"),
      grossMarginCents: calculated(grossMargin, "netRevenueCents - ((deliveryCostCents + humanHoursPerClient * hourlyCostCents) * monthlyVolume)"),
      maximumSustainableCacCents: calculated(Math.max(0, contributionBeforeAcquisitionPerClient), "netRevenuePerClient - deliveryCostCents - laborCostPerClient"),
      name: input.name,
      netRevenueCents: calculated(netRevenue, taxBps === undefined ? "revenueCents - refundsCents; fiscalità non applicata perché non fornita" : "revenueCents - refundsCents - declaredTaxCents"),
      paybackMonths: calculatedOrUnavailable(payback, "acquisitionCostCents / contributionBeforeAcquisitionPerClient"),
      revenueCents: calculated(revenue, "priceCents * monthlyVolume"),
      sensitivity: Object.freeze([
        "Il volume modifica ricavi, costi variabili e margine di contribuzione.",
        "Il CAC modifica direttamente il margine di contribuzione e il tempo di recupero.",
        "Prezzo, rimborsi e costo orario modificano il break-even.",
        taxBps === undefined ? "Fiscalità non calcolata: dato non fornito." : "Fiscalità calcolata esclusivamente dal tasso dichiarato.",
      ]),
      variableCostsCents: calculated(variableCosts, "(deliveryCostCents + laborCostPerClient + acquisitionCostCents) * monthlyVolume"),
    });
  }
}

function unavailable(name: BusinessEconomicsScenarioInput["name"], fields: readonly string[]): BusinessEconomicsScenario {
  const value = notAvailable(`Input mancanti: ${fields.join(", ")}`);
  return Object.freeze({
    breakEvenClients: value,
    contributionMarginCents: value,
    fixedCostsCents: value,
    grossMarginCents: value,
    maximumSustainableCacCents: value,
    name,
    netRevenueCents: value,
    paybackMonths: value,
    revenueCents: value,
    sensitivity: Object.freeze([`Scenario non calcolato. Input mancanti: ${fields.join(", ")}.`]),
    variableCostsCents: value,
  });
}

function calculated(value: number, formula: string): BusinessCalculatedValue {
  return Object.freeze({ formula, status: "CALCULATED" as const, value });
}

function calculatedOrUnavailable(value: number | undefined, formula: string): BusinessCalculatedValue {
  return value === undefined ? notAvailable(`${formula}; denominatore non positivo`) : calculated(value, formula);
}

function notAvailable(formula: string): BusinessCalculatedValue {
  return Object.freeze({ formula, status: "NOT_AVAILABLE" as const });
}

function money(value: number): number { return Math.round(value); }
function required(value: number | undefined): number { return value ?? 0; }
function round(value: number, digits: number): number { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
