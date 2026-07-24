export default {
  routes: [
    {
      method: "POST",
      path: "/jamora/payments/bank-transfer",
      handler: "payment-operations.prepareBankTransfer",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/payments/:documentId/receipt",
      handler: "payment-operations.recordBankReceipt",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/payments/:documentId/resolve",
      handler: "payment-operations.resolvePaymentMismatch",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/admin/payments/expire",
      handler: "payment-operations.expireDuePayments",
      config: { auth: false },
    },
  ],
};
