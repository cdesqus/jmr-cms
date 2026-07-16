function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requireAdmin(ctx: any) {
  const secret = process.env.JAMORA_ADMIN_API_SECRET;
  if (!secret || ctx.get("x-jamora-admin-secret") === secret) return true;
  ctx.status = 401;
  ctx.body = { error: "Admin API secret required." };
  return false;
}

function actor(ctx: any) {
  return {
    actor: asString(ctx.get("x-jamora-admin-actor"), "Jamora Admin"),
    role: asString(ctx.get("x-jamora-admin-role"), "owner"),
  };
}

const documents = (uid: string) => (strapi.documents as any)(uid);

async function audit(ctx: any, input: {
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  details?: Record<string, unknown>;
}) {
  const identity = actor(ctx);
  await documents("api::audit-log.audit-log").create({
    data: { ...input, ...identity, details: input.details ?? {} },
  });
}

async function prepareBatchRows(rows: any[], defaults: { supplierName?: string; purchaseOrderNumber?: string } = {}) {
  const [products, batches] = await Promise.all([
    documents("api::product.product").findMany({
      fields: ["documentId", "name", "sku", "slug", "stock"],
      limit: 10000,
    }),
    documents("api::inventory-batch.inventory-batch").findMany({
      fields: ["batchNumber"],
      limit: 10000,
    }),
  ]);
  const existingNumbers = new Set(batches.map((batch: any) => asString(batch.batchNumber).toUpperCase()));
  const incomingNumbers = new Set<string>();
  const errors: { row: number; message: string }[] = [];
  const prepared: any[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const product = products.find((candidate: any) =>
      (row.productDocumentId && candidate.documentId === row.productDocumentId) ||
      (asString(row.sku) && asString(candidate.sku).toLowerCase() === asString(row.sku).toLowerCase()) ||
      (asString(row.slug) && asString(candidate.slug).toLowerCase() === asString(row.slug).toLowerCase()),
    );
    const batchNumber = asString(row.batchNumber).toUpperCase();
    const quantity = Math.max(0, Math.round(asNumber(row.quantity, asNumber(row.qty))));
    const productionDate = asString(row.productionDate);
    const expiryDate = asString(row.expiryDate);
    if (!product) errors.push({ row: rowNumber, message: "Product SKU or slug was not found." });
    if (!batchNumber) errors.push({ row: rowNumber, message: "Batch number is required." });
    if (existingNumbers.has(batchNumber) || incomingNumbers.has(batchNumber)) {
      errors.push({ row: rowNumber, message: `Batch ${batchNumber} already exists.` });
    }
    if (quantity <= 0) errors.push({ row: rowNumber, message: "Quantity must be greater than zero." });
    if (!productionDate) errors.push({ row: rowNumber, message: "Production date is required." });
    if (!expiryDate) errors.push({ row: rowNumber, message: "Expiry date is required." });
    if (productionDate && expiryDate && new Date(productionDate).getTime() >= new Date(expiryDate).getTime()) {
      errors.push({ row: rowNumber, message: "Expiry date must be after production date." });
    }
    incomingNumbers.add(batchNumber);
    if (product) {
      prepared.push({
        product,
        batchNumber,
        quantity,
        productionDate,
        expiryDate,
        certificateUrl: asString(row.certificateUrl),
        supplierName: asString(row.supplierName, defaults.supplierName),
        purchaseOrderNumber: asString(row.purchaseOrderNumber, defaults.purchaseOrderNumber),
      });
    }
  });
  return { prepared, errors };
}

async function receivePreparedBatch(ctx: any, item: any) {
  const batch = await documents("api::inventory-batch.inventory-batch").create({
    data: {
      productDocumentId: item.product.documentId,
      productName: item.product.name,
      sku: item.product.sku,
      slug: item.product.slug,
      batchNumber: item.batchNumber,
      quantity: item.quantity,
      reservedQuantity: 0,
      productionDate: item.productionDate,
      expiryDate: item.expiryDate,
      certificateUrl: item.certificateUrl,
      supplierName: item.supplierName,
      purchaseOrderNumber: item.purchaseOrderNumber,
      status: "active",
    },
  });
  const balanceAfter = asNumber(item.product.stock) + item.quantity;
  await documents("api::product.product").update({
    documentId: item.product.documentId,
    data: { stock: balanceAfter },
    status: "published",
  });
  item.product.stock = balanceAfter;
  await documents("api::inventory-movement.inventory-movement").create({
    data: {
      productDocumentId: item.product.documentId,
      productName: item.product.name,
      sku: item.product.sku,
      slug: item.product.slug,
      delta: item.quantity,
      balanceAfter,
      reason: "restock",
      reference: item.purchaseOrderNumber || item.batchNumber,
      actor: actor(ctx).actor,
    },
  });
  await audit(ctx, {
    action: "batch.received",
    entityType: "inventory-batch",
    entityId: batch.documentId,
    entityLabel: batch.batchNumber,
    details: { product: item.product.name, quantity: item.quantity, purchaseOrderNumber: item.purchaseOrderNumber },
  });
  return batch;
}

function supplierData(body: any) {
  return {
    name: asString(body.name),
    code: asString(body.code).toUpperCase(),
    contactName: asString(body.contactName),
    email: asString(body.email),
    phone: asString(body.phone),
    country: asString(body.country),
    notes: asString(body.notes),
    active: body.active !== false,
  };
}

export default {
  async suppliers(ctx: any) {
    if (!requireAdmin(ctx)) return;
    ctx.body = { suppliers: await documents("api::supplier.supplier").findMany({ sort: { name: "asc" }, limit: 1000 }) };
  },

  async createSupplier(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const data = supplierData(ctx.request.body ?? {});
    if (!data.name || !data.code) {
      ctx.status = 400; ctx.body = { error: "Supplier name and code are required." }; return;
    }
    const supplier = await documents("api::supplier.supplier").create({ data });
    await audit(ctx, { action: "supplier.created", entityType: "supplier", entityId: supplier.documentId, entityLabel: supplier.name });
    ctx.body = { ok: true, supplier };
  },

  async updateSupplier(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const supplier = await documents("api::supplier.supplier").update({ documentId: ctx.params.documentId, data: supplierData(ctx.request.body ?? {}) });
    await audit(ctx, { action: "supplier.updated", entityType: "supplier", entityId: supplier.documentId, entityLabel: supplier.name });
    ctx.body = { ok: true, supplier };
  },

  async purchaseOrders(ctx: any) {
    if (!requireAdmin(ctx)) return;
    ctx.body = { purchaseOrders: await documents("api::purchase-order.purchase-order").findMany({ sort: { createdAt: "desc" }, limit: 1000 }) };
  },

  async createPurchaseOrder(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const body = ctx.request.body ?? {};
    const supplier = await documents("api::supplier.supplier").findOne({ documentId: asString(body.supplierDocumentId) });
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!supplier || requestedItems.length === 0) {
      ctx.status = 400; ctx.body = { error: "Supplier and at least one item are required." }; return;
    }
    const items: any[] = [];
    const errors: { row: number; message: string }[] = [];
    for (const [index, requested] of requestedItems.entries()) {
      const product = await documents("api::product.product").findOne({
        documentId: asString(requested.productDocumentId),
        fields: ["documentId", "name", "sku", "supplierDocumentIds"],
      });
      const supplierIds = Array.isArray(product?.supplierDocumentIds) ? product.supplierDocumentIds.map((value: unknown) => asString(value)) : [];
      if (!product) {
        errors.push({ row: index + 1, message: "Product was not found." });
        continue;
      }
      if (!supplierIds.includes(supplier.documentId)) {
        errors.push({ row: index + 1, message: `${product.name} is not assigned to ${supplier.name}.` });
        continue;
      }
      items.push({
        productDocumentId: product.documentId,
        productName: product.name,
        sku: product.sku,
        quantity: Math.max(0, Math.round(asNumber(requested.quantity))),
        unitsPerCarton: Math.max(1, Math.round(asNumber(requested.unitsPerCarton, 24))),
        batchNumber: asString(requested.batchNumber).toUpperCase(),
        productionDate: asString(requested.productionDate),
        expiryDate: asString(requested.expiryDate),
        certificateUrl: asString(requested.certificateUrl),
      });
    }
    if (errors.length > 0) {
      ctx.status = 400; ctx.body = { error: "Purchase order contains invalid supplier products.", errors }; return;
    }
    const poNumber = (asString(body.poNumber) || `PO-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`).toUpperCase();
    const purchaseOrder = await documents("api::purchase-order.purchase-order").create({
      data: {
        poNumber,
        supplierDocumentId: supplier.documentId,
        supplierName: supplier.name,
        status: "draft",
        items,
        expectedDate: asString(body.expectedDate) || null,
        notes: asString(body.notes),
      },
    });
    await audit(ctx, { action: "purchase-order.created", entityType: "purchase-order", entityId: purchaseOrder.documentId, entityLabel: poNumber, details: { supplier: supplier.name, itemCount: items.length } });
    ctx.body = { ok: true, purchaseOrder };
  },

  async updatePurchaseOrder(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const body = ctx.request.body ?? {};
    const existing = await documents("api::purchase-order.purchase-order").findOne({ documentId: ctx.params.documentId });
    if (!existing) { ctx.status = 404; ctx.body = { error: "Purchase order not found." }; return; }
    const allowed = ["draft", "ordered", "in_transit", "received", "cancelled"];
    const status = allowed.includes(asString(body.status)) ? asString(body.status) : existing.status;
    let receivedBatches: any[] = [];
    if (status === "received" && existing.status !== "received") {
      const result = await prepareBatchRows(Array.isArray(existing.items) ? existing.items : [], {
        supplierName: existing.supplierName,
        purchaseOrderNumber: existing.poNumber,
      });
      if (result.errors.length > 0) { ctx.status = 400; ctx.body = { error: "Purchase order cannot be received.", errors: result.errors }; return; }
      for (const item of result.prepared) receivedBatches.push(await receivePreparedBatch(ctx, item));
    }
    const purchaseOrder = await documents("api::purchase-order.purchase-order").update({
      documentId: existing.documentId,
      data: {
        status,
        expectedDate: typeof body.expectedDate === "string" ? body.expectedDate || null : existing.expectedDate,
        notes: typeof body.notes === "string" ? body.notes.trim() : existing.notes,
        receivedAt: status === "received" ? existing.receivedAt || new Date().toISOString() : existing.receivedAt,
      },
    });
    await audit(ctx, { action: `purchase-order.${status}`, entityType: "purchase-order", entityId: purchaseOrder.documentId, entityLabel: purchaseOrder.poNumber, details: { previousStatus: existing.status, batchCount: receivedBatches.length } });
    ctx.body = { ok: true, purchaseOrder, receivedBatches };
  },

  async importBatches(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const rows = Array.isArray(ctx.request.body?.rows) ? ctx.request.body.rows : [];
    if (rows.length === 0) { ctx.status = 400; ctx.body = { error: "Import contains no rows." }; return; }
    const result = await prepareBatchRows(rows);
    if (result.errors.length > 0) { ctx.status = 400; ctx.body = { error: "Import validation failed.", errors: result.errors }; return; }
    const batches = [];
    for (const item of result.prepared) batches.push(await receivePreparedBatch(ctx, item));
    await audit(ctx, { action: "batch.imported", entityType: "inventory-batch", entityLabel: `${batches.length} batches`, details: { count: batches.length } });
    ctx.body = { ok: true, batches };
  },

  async batchTraceability(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const batch = await documents("api::inventory-batch.inventory-batch").findOne({ documentId: ctx.params.documentId });
    if (!batch) { ctx.status = 404; ctx.body = { error: "Batch not found." }; return; }
    const orders = await documents("api::order.order").findMany({
      fields: ["documentId", "orderNumber", "customerName", "email", "status", "trackingNumber", "batchAllocations", "createdAt"],
      sort: { createdAt: "desc" }, limit: 10000,
    });
    const impactedOrders = orders.filter((order: any) => (Array.isArray(order.batchAllocations) ? order.batchAllocations : []).some((allocation: any) => allocation.batchDocumentId === batch.documentId || allocation.batchNumber === batch.batchNumber));
    ctx.body = { batch, impactedOrders, impactedCustomers: new Set(impactedOrders.map((order: any) => asString(order.email).toLowerCase()).filter(Boolean)).size };
  },

  async recallBatch(ctx: any) {
    if (!requireAdmin(ctx)) return;
    const existing = await documents("api::inventory-batch.inventory-batch").findOne({ documentId: ctx.params.documentId });
    if (!existing) { ctx.status = 404; ctx.body = { error: "Batch not found." }; return; }
    const reason = asString(ctx.request.body?.reason);
    if (!reason) { ctx.status = 400; ctx.body = { error: "Recall reason is required." }; return; }
    const batch = await documents("api::inventory-batch.inventory-batch").update({
      documentId: existing.documentId,
      data: { status: "recalled", recallReason: reason, recalledAt: new Date().toISOString() },
    });
    await audit(ctx, { action: "batch.recalled", entityType: "inventory-batch", entityId: batch.documentId, entityLabel: batch.batchNumber, details: { reason } });
    ctx.body = { ok: true, batch };
  },

  async auditLogs(ctx: any) {
    if (!requireAdmin(ctx)) return;
    ctx.body = { auditLogs: await documents("api::audit-log.audit-log").findMany({ sort: { createdAt: "desc" }, limit: 1000 }) };
  },
};
