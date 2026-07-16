"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    routes: [
        { method: "GET", path: "/jamora/admin/suppliers", handler: "operations.suppliers", config: { auth: false } },
        { method: "POST", path: "/jamora/admin/suppliers", handler: "operations.createSupplier", config: { auth: false } },
        { method: "PATCH", path: "/jamora/admin/suppliers/:documentId", handler: "operations.updateSupplier", config: { auth: false } },
        { method: "GET", path: "/jamora/admin/purchase-orders", handler: "operations.purchaseOrders", config: { auth: false } },
        { method: "POST", path: "/jamora/admin/purchase-orders", handler: "operations.createPurchaseOrder", config: { auth: false } },
        { method: "PATCH", path: "/jamora/admin/purchase-orders/:documentId", handler: "operations.updatePurchaseOrder", config: { auth: false } },
        { method: "POST", path: "/jamora/admin/purchase-orders/:documentId/receipts", handler: "operations.receivePurchaseOrder", config: { auth: false } },
        { method: "POST", path: "/jamora/admin/inventory-batches/import", handler: "operations.importBatches", config: { auth: false } },
        { method: "GET", path: "/jamora/admin/inventory-batches/:documentId/traceability", handler: "operations.batchTraceability", config: { auth: false } },
        { method: "POST", path: "/jamora/admin/inventory-batches/:documentId/recall", handler: "operations.recallBatch", config: { auth: false } },
        { method: "GET", path: "/jamora/admin/audit-logs", handler: "operations.auditLogs", config: { auth: false } }
    ]
};
