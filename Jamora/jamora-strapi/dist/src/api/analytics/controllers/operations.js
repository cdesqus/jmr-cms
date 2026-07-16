"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function asString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function asNumber(value, fallback = 0) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function requireAdmin(ctx) {
    const secret = process.env.JAMORA_ADMIN_API_SECRET;
    if (!secret || ctx.get("x-jamora-admin-secret") === secret)
        return true;
    ctx.status = 401;
    ctx.body = { error: "Admin API secret required." };
    return false;
}
function actor(ctx) {
    return {
        actor: asString(ctx.get("x-jamora-admin-actor"), "Jamora Admin"),
        role: asString(ctx.get("x-jamora-admin-role"), "owner"),
    };
}
const documents = (uid) => strapi.documents(uid);
async function audit(ctx, input) {
    var _a;
    const identity = actor(ctx);
    await documents("api::audit-log.audit-log").create({
        data: { ...input, ...identity, details: (_a = input.details) !== null && _a !== void 0 ? _a : {} },
    });
}
async function prepareBatchRows(rows, defaults = {}) {
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
    const existingNumbers = new Set(batches.map((batch) => asString(batch.batchNumber).toUpperCase()));
    const incomingNumbers = new Set();
    const errors = [];
    const prepared = [];
    rows.forEach((row, index) => {
        const rowNumber = index + 1;
        const product = products.find((candidate) => (row.productDocumentId && candidate.documentId === row.productDocumentId) ||
            (asString(row.sku) && asString(candidate.sku).toLowerCase() === asString(row.sku).toLowerCase()) ||
            (asString(row.slug) && asString(candidate.slug).toLowerCase() === asString(row.slug).toLowerCase()));
        const batchNumber = asString(row.batchNumber).toUpperCase();
        const quantity = Math.max(0, Math.round(asNumber(row.quantity, asNumber(row.qty))));
        const productionDate = asString(row.productionDate);
        const expiryDate = asString(row.expiryDate);
        if (!product)
            errors.push({ row: rowNumber, message: "Product SKU or slug was not found." });
        if (!batchNumber)
            errors.push({ row: rowNumber, message: "Batch number is required." });
        if (existingNumbers.has(batchNumber) || incomingNumbers.has(batchNumber)) {
            errors.push({ row: rowNumber, message: `Batch ${batchNumber} already exists.` });
        }
        if (quantity <= 0)
            errors.push({ row: rowNumber, message: "Quantity must be greater than zero." });
        if (!productionDate)
            errors.push({ row: rowNumber, message: "Production date is required." });
        if (!expiryDate)
            errors.push({ row: rowNumber, message: "Expiry date is required." });
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
async function receivePreparedBatch(ctx, item) {
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
function parseCartonPayload(value) {
    const raw = asString(value);
    if (!raw.startsWith("JMR1:"))
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(raw.slice(5), "base64url").toString("utf8"));
        const poNumber = asString(parsed.p).toUpperCase();
        const productDocumentId = asString(parsed.d);
        const batchNumber = asString(parsed.b).toUpperCase();
        const carton = Math.max(0, Math.round(asNumber(parsed.c)));
        const quantity = Math.max(0, Math.round(asNumber(parsed.q)));
        if (parsed.v !== 1 || !poNumber || !productDocumentId || !batchNumber || !carton || !quantity)
            return null;
        return {
            poNumber,
            productDocumentId,
            batchNumber,
            carton,
            quantity,
            cartonId: `${poNumber}:${productDocumentId}:${batchNumber}:${carton}`,
        };
    }
    catch {
        return null;
    }
}
async function addReceivedStock(ctx, input) {
    if (input.quantity <= 0)
        return null;
    const product = await documents("api::product.product").findOne({
        documentId: input.item.productDocumentId,
        fields: ["documentId", "name", "sku", "slug", "stock"],
    });
    if (!product)
        throw new Error(`Product ${input.item.productName} no longer exists.`);
    const matchingBatches = await documents("api::inventory-batch.inventory-batch").findMany({
        filters: { batchNumber: { $eq: input.item.batchNumber } },
        limit: 2,
    });
    const existingBatch = matchingBatches[0];
    if (existingBatch && existingBatch.productDocumentId !== product.documentId) {
        throw new Error(`Batch ${input.item.batchNumber} belongs to another product.`);
    }
    const batch = existingBatch
        ? await documents("api::inventory-batch.inventory-batch").update({
            documentId: existingBatch.documentId,
            data: {
                quantity: asNumber(existingBatch.quantity) + input.quantity,
                status: existingBatch.status === "depleted" ? "active" : existingBatch.status,
            },
        })
        : await documents("api::inventory-batch.inventory-batch").create({
            data: {
                productDocumentId: product.documentId,
                productName: product.name,
                sku: product.sku,
                slug: product.slug,
                batchNumber: input.item.batchNumber,
                quantity: input.quantity,
                reservedQuantity: 0,
                productionDate: input.item.productionDate,
                expiryDate: input.item.expiryDate,
                certificateUrl: input.item.certificateUrl,
                supplierName: input.supplierName,
                purchaseOrderNumber: input.poNumber,
                status: "active",
            },
        });
    const balanceAfter = asNumber(product.stock) + input.quantity;
    await documents("api::product.product").update({
        documentId: product.documentId,
        data: { stock: balanceAfter },
        status: "published",
    });
    await documents("api::inventory-movement.inventory-movement").create({
        data: {
            productDocumentId: product.documentId,
            productName: product.name,
            sku: product.sku,
            slug: product.slug,
            delta: input.quantity,
            balanceAfter,
            reason: "restock",
            reference: input.poNumber,
            actor: actor(ctx).actor,
        },
    });
    return batch;
}
function supplierData(body) {
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
exports.default = {
    async suppliers(ctx) {
        if (!requireAdmin(ctx))
            return;
        ctx.body = { suppliers: await documents("api::supplier.supplier").findMany({ sort: { name: "asc" }, limit: 1000 }) };
    },
    async createSupplier(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const data = supplierData((_a = ctx.request.body) !== null && _a !== void 0 ? _a : {});
        if (!data.name || !data.code) {
            ctx.status = 400;
            ctx.body = { error: "Supplier name and code are required." };
            return;
        }
        const supplier = await documents("api::supplier.supplier").create({ data });
        await audit(ctx, { action: "supplier.created", entityType: "supplier", entityId: supplier.documentId, entityLabel: supplier.name });
        ctx.body = { ok: true, supplier };
    },
    async updateSupplier(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const supplier = await documents("api::supplier.supplier").update({ documentId: ctx.params.documentId, data: supplierData((_a = ctx.request.body) !== null && _a !== void 0 ? _a : {}) });
        await audit(ctx, { action: "supplier.updated", entityType: "supplier", entityId: supplier.documentId, entityLabel: supplier.name });
        ctx.body = { ok: true, supplier };
    },
    async purchaseOrders(ctx) {
        if (!requireAdmin(ctx))
            return;
        const [purchaseOrders, receipts] = await Promise.all([
            documents("api::purchase-order.purchase-order").findMany({ sort: { createdAt: "desc" }, limit: 1000 }),
            documents("api::goods-receipt.goods-receipt").findMany({ sort: { receivedAt: "desc" }, limit: 5000 }),
        ]);
        ctx.body = {
            purchaseOrders: purchaseOrders.map((purchaseOrder) => ({
                ...purchaseOrder,
                receipts: receipts.filter((receipt) => receipt.purchaseOrderDocumentId === purchaseOrder.documentId),
            })),
        };
    },
    async createPurchaseOrder(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const body = (_a = ctx.request.body) !== null && _a !== void 0 ? _a : {};
        const supplier = await documents("api::supplier.supplier").findOne({ documentId: asString(body.supplierDocumentId) });
        const requestedItems = Array.isArray(body.items) ? body.items : [];
        if (!supplier || requestedItems.length === 0) {
            ctx.status = 400;
            ctx.body = { error: "Supplier and at least one item are required." };
            return;
        }
        const items = [];
        const errors = [];
        for (const [index, requested] of requestedItems.entries()) {
            const product = await documents("api::product.product").findOne({
                documentId: asString(requested.productDocumentId),
                fields: ["documentId", "name", "sku", "supplierDocumentIds"],
            });
            const supplierIds = Array.isArray(product === null || product === void 0 ? void 0 : product.supplierDocumentIds) ? product.supplierDocumentIds.map((value) => asString(value)) : [];
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
            ctx.status = 400;
            ctx.body = { error: "Purchase order contains invalid supplier products.", errors };
            return;
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
    async updatePurchaseOrder(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const body = (_a = ctx.request.body) !== null && _a !== void 0 ? _a : {};
        const existing = await documents("api::purchase-order.purchase-order").findOne({ documentId: ctx.params.documentId });
        if (!existing) {
            ctx.status = 404;
            ctx.body = { error: "Purchase order not found." };
            return;
        }
        const allowed = ["draft", "ordered", "in_transit", "partially_received", "received", "cancelled"];
        const status = allowed.includes(asString(body.status)) ? asString(body.status) : existing.status;
        if ((status === "received" || status === "partially_received") && existing.status !== status) {
            ctx.status = 400;
            ctx.body = { error: "Use Receive stock to record incoming goods." };
            return;
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
        await audit(ctx, { action: `purchase-order.${status}`, entityType: "purchase-order", entityId: purchaseOrder.documentId, entityLabel: purchaseOrder.poNumber, details: { previousStatus: existing.status } });
        ctx.body = { ok: true, purchaseOrder };
    },
    async receivePurchaseOrder(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const existing = await documents("api::purchase-order.purchase-order").findOne({ documentId: ctx.params.documentId });
        if (!existing) {
            ctx.status = 404;
            ctx.body = { error: "Purchase order not found." };
            return;
        }
        if (!["ordered", "in_transit", "partially_received"].includes(existing.status)) {
            ctx.status = 409;
            ctx.body = { error: "This purchase order is not open for receiving." };
            return;
        }
        const body = (_a = ctx.request.body) !== null && _a !== void 0 ? _a : {};
        const requestedLines = Array.isArray(body.lines) ? body.lines : [];
        const currentItems = Array.isArray(existing.items) ? existing.items : [];
        const errors = [];
        const prepared = [];
        const receiptCartons = new Set();
        for (const [index, requested] of requestedLines.entries()) {
            const productDocumentId = asString(requested.productDocumentId);
            const batchNumber = asString(requested.batchNumber).toUpperCase();
            const itemIndex = currentItems.findIndex((item) => item.productDocumentId === productDocumentId && asString(item.batchNumber).toUpperCase() === batchNumber);
            const item = currentItems[itemIndex];
            if (!item) {
                errors.push({ row: index + 1, message: "Product and batch do not belong to this PO." });
                continue;
            }
            const receivedQuantity = Math.max(0, Math.round(asNumber(requested.receivedQuantity)));
            const damagedQuantity = Math.max(0, Math.round(asNumber(requested.damagedQuantity)));
            const previouslyReceived = Math.max(0, Math.round(asNumber(item.receivedQuantity)));
            const outstanding = Math.max(0, Math.round(asNumber(item.quantity)) - previouslyReceived);
            if (receivedQuantity === 0 && damagedQuantity === 0)
                continue;
            if (receivedQuantity > outstanding) {
                errors.push({ row: index + 1, message: `Received quantity exceeds ${outstanding} outstanding units.` });
            }
            if (receivedQuantity + damagedQuantity > outstanding) {
                errors.push({ row: index + 1, message: `Accepted and damaged units exceed ${outstanding} outstanding units.` });
            }
            const previousCartons = new Set(Array.isArray(item.scannedCartonIds) ? item.scannedCartonIds.map((value) => asString(value)) : []);
            const scannedPayloads = Array.isArray(requested.scannedPayloads) ? requested.scannedPayloads : [];
            const scannedCartonIds = [];
            let scannedQuantity = 0;
            for (const value of scannedPayloads) {
                const carton = parseCartonPayload(value);
                if (!carton) {
                    errors.push({ row: index + 1, message: "One scanned carton code is invalid." });
                    continue;
                }
                if (carton.poNumber !== existing.poNumber || carton.productDocumentId !== productDocumentId || carton.batchNumber !== batchNumber) {
                    errors.push({ row: index + 1, message: `Carton ${carton.cartonId} does not match this PO line.` });
                    continue;
                }
                if (previousCartons.has(carton.cartonId) || receiptCartons.has(carton.cartonId)) {
                    errors.push({ row: index + 1, message: `Carton ${carton.carton} was already scanned.` });
                    continue;
                }
                receiptCartons.add(carton.cartonId);
                scannedCartonIds.push(carton.cartonId);
                scannedQuantity += carton.quantity;
            }
            if (scannedPayloads.length > 0 && scannedQuantity !== receivedQuantity) {
                errors.push({ row: index + 1, message: `Scanned cartons contain ${scannedQuantity} units, not ${receivedQuantity}.` });
            }
            prepared.push({ itemIndex, item, receivedQuantity, damagedQuantity, scannedCartonIds });
        }
        if (prepared.length === 0)
            errors.push({ row: 0, message: "Enter or scan at least one received quantity." });
        if (prepared.some((line) => line.damagedQuantity > 0) && !asString(body.notes)) {
            errors.push({ row: 0, message: "A discrepancy note is required for damaged stock." });
        }
        if (errors.length > 0) {
            ctx.status = 400;
            ctx.body = { error: "Goods receipt validation failed.", errors };
            return;
        }
        const updatedItems = currentItems.map((item) => ({ ...item }));
        const receiptLines = [];
        const receivedBatches = [];
        try {
            for (const line of prepared) {
                const receivedQuantity = asNumber(line.item.receivedQuantity) + line.receivedQuantity;
                const damagedQuantity = asNumber(line.item.damagedQuantity) + line.damagedQuantity;
                const scannedCartonIds = [
                    ...(Array.isArray(line.item.scannedCartonIds) ? line.item.scannedCartonIds : []),
                    ...line.scannedCartonIds,
                ];
                updatedItems[line.itemIndex] = { ...line.item, receivedQuantity, damagedQuantity, scannedCartonIds };
                const batch = await addReceivedStock(ctx, {
                    item: line.item,
                    quantity: line.receivedQuantity,
                    supplierName: existing.supplierName,
                    poNumber: existing.poNumber,
                });
                if (batch)
                    receivedBatches.push(batch);
                receiptLines.push({
                    productDocumentId: line.item.productDocumentId,
                    productName: line.item.productName,
                    sku: line.item.sku,
                    batchNumber: line.item.batchNumber,
                    receivedQuantity: line.receivedQuantity,
                    damagedQuantity: line.damagedQuantity,
                    scannedCartonIds: line.scannedCartonIds,
                    outstandingAfter: Math.max(0, asNumber(line.item.quantity) - receivedQuantity),
                });
            }
        }
        catch (caught) {
            strapi.log.error(caught);
            ctx.status = 500;
            ctx.body = { error: caught instanceof Error ? caught.message : "Could not receive stock." };
            return;
        }
        const complete = updatedItems.every((item) => asNumber(item.receivedQuantity) >= asNumber(item.quantity));
        const now = new Date().toISOString();
        const receiptNumber = `GR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const receipt = await documents("api::goods-receipt.goods-receipt").create({
            data: {
                receiptNumber,
                purchaseOrderDocumentId: existing.documentId,
                poNumber: existing.poNumber,
                supplierName: existing.supplierName,
                lines: receiptLines,
                receivedBy: asString(body.receivedBy, actor(ctx).actor),
                receivedAt: now,
                notes: asString(body.notes),
            },
        });
        const purchaseOrder = await documents("api::purchase-order.purchase-order").update({
            documentId: existing.documentId,
            data: {
                items: updatedItems,
                status: complete ? "received" : "partially_received",
                receivedAt: complete ? now : existing.receivedAt,
            },
        });
        await audit(ctx, {
            action: "purchase-order.receipt",
            entityType: "purchase-order",
            entityId: purchaseOrder.documentId,
            entityLabel: purchaseOrder.poNumber,
            details: { receiptNumber, lineCount: receiptLines.length, complete },
        });
        ctx.body = { ok: true, purchaseOrder, receipt, receivedBatches };
    },
    async importBatches(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const rows = Array.isArray((_a = ctx.request.body) === null || _a === void 0 ? void 0 : _a.rows) ? ctx.request.body.rows : [];
        if (rows.length === 0) {
            ctx.status = 400;
            ctx.body = { error: "Import contains no rows." };
            return;
        }
        const result = await prepareBatchRows(rows);
        if (result.errors.length > 0) {
            ctx.status = 400;
            ctx.body = { error: "Import validation failed.", errors: result.errors };
            return;
        }
        const batches = [];
        for (const item of result.prepared)
            batches.push(await receivePreparedBatch(ctx, item));
        await audit(ctx, { action: "batch.imported", entityType: "inventory-batch", entityLabel: `${batches.length} batches`, details: { count: batches.length } });
        ctx.body = { ok: true, batches };
    },
    async batchTraceability(ctx) {
        if (!requireAdmin(ctx))
            return;
        const batch = await documents("api::inventory-batch.inventory-batch").findOne({ documentId: ctx.params.documentId });
        if (!batch) {
            ctx.status = 404;
            ctx.body = { error: "Batch not found." };
            return;
        }
        const orders = await documents("api::order.order").findMany({
            fields: ["documentId", "orderNumber", "customerName", "email", "status", "trackingNumber", "batchAllocations", "createdAt"],
            sort: { createdAt: "desc" }, limit: 10000,
        });
        const impactedOrders = orders.filter((order) => (Array.isArray(order.batchAllocations) ? order.batchAllocations : []).some((allocation) => allocation.batchDocumentId === batch.documentId || allocation.batchNumber === batch.batchNumber));
        ctx.body = { batch, impactedOrders, impactedCustomers: new Set(impactedOrders.map((order) => asString(order.email).toLowerCase()).filter(Boolean)).size };
    },
    async recallBatch(ctx) {
        var _a;
        if (!requireAdmin(ctx))
            return;
        const existing = await documents("api::inventory-batch.inventory-batch").findOne({ documentId: ctx.params.documentId });
        if (!existing) {
            ctx.status = 404;
            ctx.body = { error: "Batch not found." };
            return;
        }
        const reason = asString((_a = ctx.request.body) === null || _a === void 0 ? void 0 : _a.reason);
        if (!reason) {
            ctx.status = 400;
            ctx.body = { error: "Recall reason is required." };
            return;
        }
        const batch = await documents("api::inventory-batch.inventory-batch").update({
            documentId: existing.documentId,
            data: { status: "recalled", recallReason: reason, recalledAt: new Date().toISOString() },
        });
        await audit(ctx, { action: "batch.recalled", entityType: "inventory-batch", entityId: batch.documentId, entityLabel: batch.batchNumber, details: { reason } });
        ctx.body = { ok: true, batch };
    },
    async auditLogs(ctx) {
        if (!requireAdmin(ctx))
            return;
        ctx.body = { auditLogs: await documents("api::audit-log.audit-log").findMany({ sort: { createdAt: "desc" }, limit: 1000 }) };
    },
};
