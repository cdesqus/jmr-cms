export interface CartonPayloadInput {
  poNumber: string;
  productDocumentId: string;
  batchNumber: string;
  carton: number;
  quantity: number;
}

export interface ParsedCartonPayload extends CartonPayloadInput {
  version: 1;
  cartonId: string;
}

export function createCartonPayload(input: CartonPayloadInput): string;
export function parseCartonPayload(value: string): ParsedCartonPayload | null;
export function purchaseOrderOutstanding(order: { items?: Array<{ quantity: number; receivedQuantity?: number }> }): number;
export function isPurchaseOrderReceivable(order: { status?: string; items?: Array<{ quantity: number; receivedQuantity?: number }> }): boolean;
