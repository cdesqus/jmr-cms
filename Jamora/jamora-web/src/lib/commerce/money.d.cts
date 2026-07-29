export type Money = Readonly<{ amountMinor: number; currency: string }>;
export type FxSnapshot = Readonly<{
  reference: Money;
  charge: Money;
  rate: string;
  source: string;
  capturedAt: string;
}>;
export function createMoney(amountMinor: number, currency: string): Money;
export function createFxSnapshot(input: {
  eurMinor: number; ronMinor: number; rate: string; source: string; capturedAt: string;
}): FxSnapshot;
