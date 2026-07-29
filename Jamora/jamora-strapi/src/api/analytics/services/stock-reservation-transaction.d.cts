export type StockReservationInput = {
  idempotencyKey: string;
  items: { slug: string; qty: number }[];
  email?: string;
  customerDocumentId?: string;
  shippingSelection?: unknown;
  now?: Date | string | number;
};

export function createStockReservationService(adapter: unknown): {
  reserve(input: StockReservationInput): Promise<any>;
  expireOne(documentId: string, now?: Date | string | number): Promise<boolean>;
  expireDue(now?: Date | string | number, limit?: number): Promise<number>;
};

export function createStrapiStockReservationAdapter(strapi: unknown): unknown;
export function createMemoryStockReservationAdapter(options?: unknown): any;
