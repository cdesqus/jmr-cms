export interface DecimalRate {
  rate: string;
  numerator: bigint;
  denominator: bigint;
}

export function parseDecimalRate(
  value: unknown,
  fallback?: string,
): DecimalRate;
export function convertEurMinorToRonMinor(
  value: number,
  rate: DecimalRate,
): number;
export function convertRonMinorToEurMinor(
  value: number,
  rate: DecimalRate,
): number;
export function authoritativeRonTotals(input: {
  subtotalEurMinor: number;
  discountEurMinor: number;
  shippingRonMinor: number;
  rate: DecimalRate;
}): {
  subtotalEurMinor: number;
  discountEurMinor: number;
  merchandiseEurMinor: number;
  shippingEurMinor: number;
  referenceTotalEurMinor: number;
  subtotalRonMinor: number;
  discountRonMinor: number;
  merchandiseRonMinor: number;
  shippingRonMinor: number;
  chargeTotalRonMinor: number;
};
export function allocateRonLineTotals(
  amounts: number[],
  rate: DecimalRate,
): number[];
