export interface LedgerEntryData {
  kind?: string;
  credits?: number;
  creditDelta?: number;
  reason?: string;
}

export function validateLedgerEntry(data: LedgerEntryData): void;
