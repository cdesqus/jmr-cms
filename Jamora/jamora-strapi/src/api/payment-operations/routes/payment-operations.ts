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
      path: "/jamora/payments/ropay/intent",
      handler: "payment-operations.prepareRoPay",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/payments/ropay/callback",
      handler: "payment-operations.handleRoPayCallback",
      config: { auth: false },
    },
    {
      method: "POST",
      path: "/jamora/internal/payments/ropay/status",
      handler: "payment-operations.verifyRoPayStatus",
      config: { auth: false },
    },
    {
      method: "GET",
      path: "/jamora/payments/ropay/return/:reference",
      handler: "payment-operations.readRoPayReturn",
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
