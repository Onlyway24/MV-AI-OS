const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = -MAX_SAFE_BIGINT;

export function addSafeIntegers(left: number, right: number): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  return safeNumber(BigInt(left) + BigInt(right));
}

export function subtractSafeIntegers(left: number, right: number): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  return safeNumber(BigInt(left) - BigInt(right));
}

export function multiplySafeIntegers(left: number, right: number): number | null {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  return safeNumber(BigInt(left) * BigInt(right));
}

export function sumSafeIntegers(values: readonly number[]): number | null {
  if (!values.every(Number.isSafeInteger)) return null;
  return safeNumber(values.reduce((sum, value) => sum + BigInt(value), 0n));
}

export function roundSafeIntegerRatio(numerator: number, multiplier: number, denominator: number): number | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(multiplier) || !Number.isSafeInteger(denominator) || denominator <= 0) return null;
  const product = BigInt(numerator) * BigInt(multiplier);
  const divisor = BigInt(denominator);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const quotient = magnitude / divisor;
  const remainder = magnitude % divisor;
  const roundsAwayFromZero = negative ? remainder * 2n > divisor : remainder * 2n >= divisor;
  return safeNumber((negative ? -1n : 1n) * (quotient + (roundsAwayFromZero ? 1n : 0n)));
}

export function ceilSafeIntegerRatio(numerator: number, denominator: number): number | null {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || numerator < 0 || denominator <= 0) return null;
  const dividend = BigInt(numerator);
  const divisor = BigInt(denominator);
  return safeNumber((dividend + divisor - 1n) / divisor);
}

export function floorSafeDecimalDifferenceRatio(available: number, reserved: number, hoursPerDelivery: number): number | null {
  const availableRatio = decimalRatio(available);
  const reservedRatio = decimalRatio(reserved);
  const hoursRatio = decimalRatio(hoursPerDelivery);
  if (availableRatio === null || reservedRatio === null || hoursRatio === null || hoursRatio.numerator <= 0n) return null;
  const usableNumerator = availableRatio.numerator * reservedRatio.denominator - reservedRatio.numerator * availableRatio.denominator;
  if (usableNumerator < 0n) return null;
  const usableDenominator = availableRatio.denominator * reservedRatio.denominator;
  const quotientNumerator = usableNumerator * hoursRatio.denominator;
  const quotientDenominator = usableDenominator * hoursRatio.numerator;
  return safeNumber(quotientNumerator / quotientDenominator);
}

export function roundRevenueExperimentPriority(impact: number, confidence: number, effort: number): number | null {
  const impactRatio = decimalRatio(impact);
  const confidenceRatio = decimalRatio(confidence);
  const effortRatio = decimalRatio(effort);
  if (impactRatio === null || confidenceRatio === null || effortRatio === null || effortRatio.numerator <= 0n) return null;
  const numerator = impactRatio.numerator * confidenceRatio.numerator * effortRatio.denominator;
  const denominator = impactRatio.denominator * confidenceRatio.denominator * effortRatio.numerator;
  const hundredths = safeNumber(roundBigIntRatio(numerator, denominator));
  return hundredths === null ? null : hundredths / 100;
}

interface DecimalRatio {
  readonly denominator: bigint;
  readonly numerator: bigint;
}

function decimalRatio(value: number): DecimalRatio | null {
  if (!Number.isFinite(value)) return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/u.exec(value.toString());
  if (match === null) return null;
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0") - fraction.length;
  const sign = match[1] === "-" ? -1n : 1n;
  let numerator = sign * BigInt(`${match[2] ?? "0"}${fraction}`);
  let denominator = 1n;
  if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
  else denominator = 10n ** BigInt(-exponent);
  const divisor = greatestCommonDivisor(numerator < 0n ? -numerator : numerator, denominator);
  return { denominator: denominator / divisor, numerator: numerator / divisor };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let currentLeft = left;
  let currentRight = right;
  while (currentRight !== 0n) {
    const remainder = currentLeft % currentRight;
    currentLeft = currentRight;
    currentRight = remainder;
  }
  return currentLeft === 0n ? 1n : currentLeft;
}

function roundBigIntRatio(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const roundsAwayFromZero = negative ? remainder * 2n > denominator : remainder * 2n >= denominator;
  return (negative ? -1n : 1n) * (quotient + (roundsAwayFromZero ? 1n : 0n));
}

function safeNumber(value: bigint): number | null {
  return value < MIN_SAFE_BIGINT || value > MAX_SAFE_BIGINT ? null : Number(value);
}
