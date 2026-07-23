import type { VentureEconomicsScenario as VentureEconomicsScenarioRecord } from "./venture-domain.js";

export type VentureEconomicInputKind = "ASSUMPTION" | "FOUNDER_SUPPLIED" | "MEASURED" | "VERIFIED_ESTIMATE";
export type VentureEconomicValue =
  | { readonly evidenceRefs: readonly string[]; readonly kind: VentureEconomicInputKind; readonly status: "AVAILABLE"; readonly value: string }
  | { readonly missingInputs: readonly string[]; readonly reasonCode: "FOUNDER_INPUT_REQUIRED" | "INVALID_INPUT" | "NOT_AVAILABLE"; readonly status: "NOT_AVAILABLE" };

export type VentureEconomicBps =
  | { readonly evidenceRefs: readonly string[]; readonly kind: VentureEconomicInputKind; readonly status: "AVAILABLE"; readonly value: number }
  | { readonly missingInputs: readonly string[]; readonly reasonCode: "FOUNDER_INPUT_REQUIRED" | "INVALID_INPUT" | "NOT_AVAILABLE"; readonly status: "NOT_AVAILABLE" };

export interface VentureEconomicsScenarioInput {
  readonly acquisitionCostMinorUnits: VentureEconomicValue;
  readonly availableCapitalMinorUnits: VentureEconomicValue;
  readonly availableFounderTimeMilliHours: VentureEconomicValue;
  readonly currency: string;
  readonly deliveryCostMinorUnits: VentureEconomicValue;
  readonly fixedCostsMinorUnits: VentureEconomicValue;
  readonly founderHourlyCostMinorUnits: VentureEconomicValue;
  readonly founderTimePerClientMilliHours: VentureEconomicValue;
  readonly minimumContributionMarginBps: VentureEconomicBps;
  readonly monthlyClients: VentureEconomicValue;
  readonly name: "AMBITIOUS" | "BASE" | "PRUDENT";
  readonly priceMinorUnits: VentureEconomicValue;
  readonly refundRateBps: VentureEconomicBps;
  readonly targetMonthlyContributionMinorUnits: VentureEconomicValue;
  readonly toolCostsMinorUnits: VentureEconomicValue;
}

export interface VentureCalculatedEconomicValue {
  readonly formula: string;
  readonly missingInputs?: readonly string[];
  readonly reasonCode?: "INVALID_INPUT" | "NON_POSITIVE_CONTRIBUTION" | "NOT_AVAILABLE";
  readonly status: "CALCULATED" | "NOT_AVAILABLE";
  readonly unit: "BASIS_POINTS" | "COUNT" | "MILLI_HOURS" | "MILLI_MONTHS" | "MINOR_CURRENCY";
  readonly value?: string;
}

export interface VentureEconomicsScenario extends Pick<VentureEconomicsScenarioRecord, "name"> {
  readonly breakEvenClients: VentureCalculatedEconomicValue;
  readonly capacityClients: VentureCalculatedEconomicValue;
  readonly capacityUtilizationBps: VentureCalculatedEconomicValue;
  readonly cashRequirementMinorUnits: VentureCalculatedEconomicValue;
  readonly clientsRequired: VentureCalculatedEconomicValue;
  readonly contributionMarginBps: VentureCalculatedEconomicValue;
  readonly contributionMarginMinorUnits: VentureCalculatedEconomicValue;
  readonly currency: string;
  readonly deliveryCostMinorUnits: VentureCalculatedEconomicValue;
  readonly fixedCostsMinorUnits: VentureCalculatedEconomicValue;
  readonly founderTimeCostMinorUnits: VentureCalculatedEconomicValue;
  readonly grossMarginMinorUnits: VentureCalculatedEconomicValue;
  readonly maximumSustainableCacMinorUnits: VentureCalculatedEconomicValue;
  readonly monthlyContributionMinorUnits: VentureCalculatedEconomicValue;
  readonly netUnitRevenueMinorUnits: VentureCalculatedEconomicValue;
  readonly paybackMilliMonths: VentureCalculatedEconomicValue;
  readonly runwayMilliMonths: VentureCalculatedEconomicValue;
  readonly sensitivity: readonly { readonly driver: string; readonly formula: string; readonly status: "FORMULA_ONLY" }[];
  readonly variableUnitCostMinorUnits: VentureCalculatedEconomicValue;
}

const MONEY = "MINOR_CURRENCY" as const;
const COUNT = "COUNT" as const;
const BPS = "BASIS_POINTS" as const;

export class DeterministicVentureEconomicsEngine {
  public calculate(input: VentureEconomicsScenarioInput): VentureEconomicsScenario {
    validateScenario(input);
    const price = source(input.priceMinorUnits, "priceMinorUnits");
    const refunds = sourceBps(input.refundRateBps, "refundRateBps");
    const delivery = source(input.deliveryCostMinorUnits, "deliveryCostMinorUnits");
    const hourly = source(input.founderHourlyCostMinorUnits, "founderHourlyCostMinorUnits");
    const time = source(input.founderTimePerClientMilliHours, "founderTimePerClientMilliHours");
    const acquisition = source(input.acquisitionCostMinorUnits, "acquisitionCostMinorUnits");
    const fixed = source(input.fixedCostsMinorUnits, "fixedCostsMinorUnits");
    const tools = source(input.toolCostsMinorUnits, "toolCostsMinorUnits");
    const clients = source(input.monthlyClients, "monthlyClients");
    const availableTime = source(input.availableFounderTimeMilliHours, "availableFounderTimeMilliHours");
    const targetContribution = source(input.targetMonthlyContributionMinorUnits, "targetMonthlyContributionMinorUnits");
    const availableCapital = source(input.availableCapitalMinorUnits, "availableCapitalMinorUnits");
    const minimumMargin = sourceBps(input.minimumContributionMarginBps, "minimumContributionMarginBps");

    const netRevenue = binary(price, refunds, "round(priceMinorUnits * (10000 - refundRateBps) / 10000)", MONEY, (p, r) => roundRatio(p, 10_000n - r, 10_000n));
    const founderTimeCost = binary(hourly, time, "round(founderHourlyCostMinorUnits * founderTimePerClientMilliHours / 1000)", MONEY, (h, t) => roundRatio(h, t, 1_000n));
    const deliveryMetric = passthrough(delivery, "deliveryCostMinorUnits", MONEY);
    const fixedMetric = binary(fixed, tools, "fixedCostsMinorUnits + toolCostsMinorUnits", MONEY, (f, t) => f + t);
    const grossMargin = ternary(netRevenue, deliveryMetric, founderTimeCost, "netUnitRevenueMinorUnits - deliveryCostMinorUnits - founderTimeCostMinorUnits", MONEY, (net, d, founder) => net - d - founder);
    const variableUnitCost = ternary(deliveryMetric, founderTimeCost, passthrough(acquisition, "acquisitionCostMinorUnits", MONEY), "deliveryCostMinorUnits + founderTimeCostMinorUnits + acquisitionCostMinorUnits", MONEY, (d, founder, cac) => d + founder + cac);
    const contribution = binary(netRevenue, variableUnitCost, "netUnitRevenueMinorUnits - variableUnitCostMinorUnits", MONEY, (net, variable) => net - variable);
    const marginBps = ratio(contribution, netRevenue, "round(contributionMarginMinorUnits / netUnitRevenueMinorUnits * 10000)", BPS);
    const breakEven = positiveDenominatorRatio(fixedMetric, contribution, "ceil(fixedCostsMinorUnits / contributionMarginMinorUnits)", COUNT);
    const clientsRequired = positiveDenominatorRatio(passthrough(targetContribution, "targetMonthlyContributionMinorUnits", MONEY), contribution, "ceil(targetMonthlyContributionMinorUnits / contributionMarginMinorUnits)", COUNT);
    const capacity = positiveDenominatorRatio(passthrough(availableTime, "availableFounderTimeMilliHours", "MILLI_HOURS"), passthrough(time, "founderTimePerClientMilliHours", "MILLI_HOURS"), "floor(availableFounderTimeMilliHours / founderTimePerClientMilliHours)", COUNT, "FLOOR");
    const utilization = ratio(passthrough(clients, "monthlyClients", COUNT), capacity, "round(monthlyClients / capacityClients * 10000)", BPS);
    const minimumContribution = binary(netRevenue, passthrough(minimumMargin, "minimumContributionMarginBps", BPS), "round(netUnitRevenueMinorUnits * minimumContributionMarginBps / 10000)", MONEY, (net, bps) => roundRatio(net, bps, 10_000n));
    const maxCac = quaternary(netRevenue, deliveryMetric, founderTimeCost, minimumContribution, "max(netUnitRevenueMinorUnits - deliveryCostMinorUnits - founderTimeCostMinorUnits - minimumContributionMinorUnits, 0)", MONEY, (net, d, founder, minimum) => max(net - d - founder - minimum, 0n));
    const payback = positiveDenominatorRatio(passthrough(acquisition, "acquisitionCostMinorUnits", MONEY), grossMargin, "round(acquisitionCostMinorUnits / grossMarginBeforeAcquisitionMinorUnits * 1000)", "MILLI_MONTHS", "ROUND", 1_000n);
    const monthlyVariable = binary(variableUnitCost, passthrough(clients, "monthlyClients", COUNT), "variableUnitCostMinorUnits * monthlyClients", MONEY, (variable, count) => variable * count);
    const cashRequirement = binary(fixedMetric, monthlyVariable, "fixedCostsMinorUnits + variableUnitCostMinorUnits * monthlyClients", MONEY, (f, variable) => f + variable);
    const monthlyContribution = binary(contribution, passthrough(clients, "monthlyClients", COUNT), "contributionMarginMinorUnits * monthlyClients", MONEY, (unit, count) => unit * count);
    const monthlyContributionAfterFixed = binary(monthlyContribution, fixedMetric, "contributionMarginMinorUnits * monthlyClients - fixedCostsMinorUnits", MONEY, (beforeFixed, f) => beforeFixed - f);
    const runway = positiveDenominatorRatio(passthrough(availableCapital, "availableCapitalMinorUnits", MONEY), fixedMetric, "floor(availableCapitalMinorUnits / fixedCostsMinorUnits * 1000)", "MILLI_MONTHS", "FLOOR", 1_000n);

    return Object.freeze({
      breakEvenClients: breakEven,
      capacityClients: capacity,
      capacityUtilizationBps: utilization,
      cashRequirementMinorUnits: cashRequirement,
      clientsRequired,
      contributionMarginBps: marginBps,
      contributionMarginMinorUnits: contribution,
      currency: input.currency,
      deliveryCostMinorUnits: deliveryMetric,
      fixedCostsMinorUnits: fixedMetric,
      founderTimeCostMinorUnits: founderTimeCost,
      grossMarginMinorUnits: grossMargin,
      maximumSustainableCacMinorUnits: maxCac,
      monthlyContributionMinorUnits: monthlyContributionAfterFixed,
      name: input.name,
      netUnitRevenueMinorUnits: netRevenue,
      paybackMilliMonths: payback,
      runwayMilliMonths: runway,
      sensitivity: Object.freeze([
        Object.freeze({ driver: "priceMinorUnits", formula: "Recalculate net revenue, margins, break-even, CAC and payback from a founder-supplied price variant.", status: "FORMULA_ONLY" as const }),
        Object.freeze({ driver: "monthlyClients", formula: "Recalculate capacity utilization, cash requirement and monthly contribution from a declared volume variant.", status: "FORMULA_ONLY" as const }),
        Object.freeze({ driver: "founderTimePerClientMilliHours", formula: "Recalculate founder cost and capacity from a measured or founder-supplied time variant.", status: "FORMULA_ONLY" as const }),
      ]),
      variableUnitCostMinorUnits: variableUnitCost,
    });
  }
}

function source(input: VentureEconomicValue, name: string): RawMetric { return input.status === "AVAILABLE" ? raw(BigInt(input.value)) : missing(input.missingInputs.length > 0 ? input.missingInputs : [name]); }
function sourceBps(input: VentureEconomicBps, name: string): RawMetric { return input.status === "AVAILABLE" ? raw(BigInt(input.value)) : missing(input.missingInputs.length > 0 ? input.missingInputs : [name]); }
type RawMetric = { readonly status: "AVAILABLE"; readonly value: bigint } | { readonly missingInputs: readonly string[]; readonly status: "NOT_AVAILABLE" };
function raw(value: bigint): RawMetric { return { status: "AVAILABLE", value }; }
function missing(inputs: readonly string[]): RawMetric { return { missingInputs: Object.freeze([...new Set(inputs)]), status: "NOT_AVAILABLE" }; }

function passthrough(input: RawMetric, formula: string, unit: VentureCalculatedEconomicValue["unit"]): VentureCalculatedEconomicValue { return input.status === "AVAILABLE" ? calculated(input.value, formula, unit) : unavailable(formula, unit, input.missingInputs); }
function binary(left: RawMetric | VentureCalculatedEconomicValue, right: RawMetric | VentureCalculatedEconomicValue, formula: string, unit: VentureCalculatedEconomicValue["unit"], operation: (left: bigint, right: bigint) => bigint): VentureCalculatedEconomicValue { const inputs = values([left, right]); return inputs.values === undefined ? unavailable(formula, unit, inputs.missing) : calculated(operation(inputs.values[0] ?? 0n, inputs.values[1] ?? 0n), formula, unit); }
function ternary(first: VentureCalculatedEconomicValue, second: VentureCalculatedEconomicValue, third: VentureCalculatedEconomicValue, formula: string, unit: VentureCalculatedEconomicValue["unit"], operation: (first: bigint, second: bigint, third: bigint) => bigint): VentureCalculatedEconomicValue { const inputs = values([first, second, third]); return inputs.values === undefined ? unavailable(formula, unit, inputs.missing) : calculated(operation(inputs.values[0] ?? 0n, inputs.values[1] ?? 0n, inputs.values[2] ?? 0n), formula, unit); }
function quaternary(first: VentureCalculatedEconomicValue, second: VentureCalculatedEconomicValue, third: VentureCalculatedEconomicValue, fourth: VentureCalculatedEconomicValue, formula: string, unit: VentureCalculatedEconomicValue["unit"], operation: (first: bigint, second: bigint, third: bigint, fourth: bigint) => bigint): VentureCalculatedEconomicValue { const inputs = values([first, second, third, fourth]); return inputs.values === undefined ? unavailable(formula, unit, inputs.missing) : calculated(operation(inputs.values[0] ?? 0n, inputs.values[1] ?? 0n, inputs.values[2] ?? 0n, inputs.values[3] ?? 0n), formula, unit); }

function ratio(numerator: VentureCalculatedEconomicValue, denominator: VentureCalculatedEconomicValue, formula: string, unit: VentureCalculatedEconomicValue["unit"]): VentureCalculatedEconomicValue {
  const inputs = values([numerator, denominator]);
  if (inputs.values === undefined) return unavailable(formula, unit, inputs.missing);
  const divisor = inputs.values[1] ?? 0n;
  if (divisor <= 0n) return unavailable(formula, unit, ["positiveDenominator"], "INVALID_INPUT");
  return calculated(roundRatio(inputs.values[0] ?? 0n, 10_000n, divisor), formula, unit);
}

function positiveDenominatorRatio(numerator: VentureCalculatedEconomicValue, denominator: VentureCalculatedEconomicValue, formula: string, unit: VentureCalculatedEconomicValue["unit"], mode: "CEIL" | "FLOOR" | "ROUND" = "CEIL", scale = 1n): VentureCalculatedEconomicValue {
  const inputs = values([numerator, denominator]);
  if (inputs.values === undefined) return unavailable(formula, unit, inputs.missing);
  const divisor = inputs.values[1] ?? 0n;
  if (divisor <= 0n) return unavailable(formula, unit, ["positiveDenominator"], "NON_POSITIVE_CONTRIBUTION");
  const scaled = (inputs.values[0] ?? 0n) * scale;
  const result = mode === "ROUND" ? roundRatio(scaled, 1n, divisor) : mode === "FLOOR" ? scaled / divisor : ceilRatio(scaled, divisor);
  return calculated(result, formula, unit);
}

function values(inputs: readonly (RawMetric | VentureCalculatedEconomicValue)[]): { readonly missing: readonly string[]; readonly values?: readonly bigint[] } {
  const missingInputs = inputs.flatMap((input) => input.status === "NOT_AVAILABLE" ? ("missingInputs" in input ? input.missingInputs ?? ["NOT_AVAILABLE"] : ["NOT_AVAILABLE"]) : []);
  if (missingInputs.length > 0) return { missing: Object.freeze([...new Set(missingInputs)]) };
  return { missing: Object.freeze([]), values: inputs.map((input) => BigInt(("value" in input ? input.value : undefined) ?? "0")) };
}

function calculated(value: bigint, formula: string, unit: VentureCalculatedEconomicValue["unit"]): VentureCalculatedEconomicValue { return Object.freeze({ formula, status: "CALCULATED" as const, unit, value: value.toString() }); }
function unavailable(formula: string, unit: VentureCalculatedEconomicValue["unit"], missingInputs: readonly string[], reasonCode: NonNullable<VentureCalculatedEconomicValue["reasonCode"]> = "NOT_AVAILABLE"): VentureCalculatedEconomicValue { return Object.freeze({ formula, missingInputs: Object.freeze([...new Set(missingInputs)]), reasonCode, status: "NOT_AVAILABLE" as const, unit }); }
function roundRatio(left: bigint, right: bigint, denominator: bigint): bigint { const numerator = left * right; if (numerator < 0n) return -roundRatio(-left, right, denominator); return (numerator + denominator / 2n) / denominator; }
function ceilRatio(numerator: bigint, denominator: bigint): bigint { return (numerator + denominator - 1n) / denominator; }
function max(left: bigint, right: bigint): bigint { return left > right ? left : right; }

function validateScenario(input: VentureEconomicsScenarioInput): void {
  if (!/^[A-Z]{3}$/u.test(input.currency) || !["AMBITIOUS", "BASE", "PRUDENT"].includes(input.name)) throw new Error("Venture economics scenario identity is invalid");
  for (const value of [input.acquisitionCostMinorUnits, input.availableCapitalMinorUnits, input.availableFounderTimeMilliHours, input.deliveryCostMinorUnits, input.fixedCostsMinorUnits, input.founderHourlyCostMinorUnits, input.founderTimePerClientMilliHours, input.monthlyClients, input.priceMinorUnits, input.targetMonthlyContributionMinorUnits, input.toolCostsMinorUnits]) validateValue(value);
  for (const value of [input.minimumContributionMarginBps, input.refundRateBps]) validateBps(value);
}
function validateValue(value: VentureEconomicValue): void { if (value.status === "AVAILABLE") { if (!/^(0|[1-9]\d{0,39})$/u.test(value.value) || !evidence(value.evidenceRefs) || !["ASSUMPTION", "FOUNDER_SUPPLIED", "MEASURED", "VERIFIED_ESTIMATE"].includes(value.kind)) throw new Error("Venture economics value is invalid"); } else if (!missingList(value.missingInputs)) throw new Error("Venture economics missing value is invalid"); }
function validateBps(value: VentureEconomicBps): void { if (value.status === "AVAILABLE") { if (!Number.isSafeInteger(value.value) || value.value < 0 || value.value > 10_000 || !evidence(value.evidenceRefs)) throw new Error("Venture economics basis points are invalid"); } else if (!missingList(value.missingInputs)) throw new Error("Venture economics missing basis points are invalid"); }
function evidence(value: readonly string[]): boolean { return value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 1_000); }
function missingList(value: readonly string[]): boolean { return value.length > 0 && value.length <= 100 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 1_000); }
