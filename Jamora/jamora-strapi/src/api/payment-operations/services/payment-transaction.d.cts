export interface PaymentTransactionOptions {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  beneficiary?: { name?: string; iban?: string; bank?: string };
  randomUUID?: () => string;
  now?: () => Date;
  settleSubject?: (payment: any, context: { settlementKey: string; trx?: any }) => Promise<unknown>;
}

export function beneficiaryFromEnv(env?: NodeJS.ProcessEnv | Record<string, string | undefined>): {
  name: string;
  iban: string;
  bank?: string;
};
export function validateGuestCheckoutCapability(
  reservation: any,
  input: any,
  now?: Date,
): string;
export function deriveAuthoritativePaymentSubject(
  input: any,
  subject: any,
  reservation?: any,
  now?: Date,
  checkout?: any,
): any;
export function assertOrderPaymentBinding(order: any, payment: any): void;
export function assertAuthoritativePaymentSubjectBinding(
  payment: any,
  resolved: any,
): void;
export function lockMembershipCheckoutOrder(
  adapters: {
    lockCheckout(reference: string): Promise<any>;
    lockOrder(documentId: string): Promise<any>;
  },
  binding: {
    checkoutReference: string;
    orderDocumentId: string;
    customerDocumentId?: string;
    membershipDocumentId?: string;
    now?: Date;
  },
): Promise<{ checkout: any; order: any }>;
export function createPaymentSubjectSettlement(adapters: {
  activateMembership(input: any): Promise<any>;
  finalizeMembershipCheckout(input: any): Promise<any>;
  settleOrder(payment: any, context: any): Promise<any>;
}): (payment: any, context: any) => Promise<any>;
export function createPaymentTransactions(adapter: any, options?: PaymentTransactionOptions): {
  prepareBankTransfer(input: any): Promise<any>;
  recordBankReceipt(input: any): Promise<any>;
  resolvePaymentMismatch(input: any): Promise<any>;
  expireDuePayments(now?: Date, limit?: number): Promise<number>;
  settlePayment(input: any): Promise<any>;
};
export function createMemoryPaymentAdapter(options?: any): any;
export function createStrapiPaymentAdapter(strapi: any, options?: any): any;
export function ttlSeconds(value?: string | number): number;
