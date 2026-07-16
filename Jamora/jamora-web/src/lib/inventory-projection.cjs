const ALLOCATED_ORDER_STATUSES = new Set(["paid", "processing"]);
const INCOMING_PURCHASE_ORDER_STATUSES = new Set(["ordered", "in_transit", "partially_received"]);

function units(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function productIndex(products) {
  const byDocumentId = new Map();
  const bySlug = new Map();
  const bySku = new Map();

  products.forEach((product, index) => {
    if (product.documentId) byDocumentId.set(product.documentId, index);
    if (product.slug) bySlug.set(product.slug, index);
    if (product.sku) bySku.set(product.sku, index);
  });

  return { byDocumentId, bySlug, bySku };
}

function findProductIndex(index, item) {
  if (item.productDocumentId && index.byDocumentId.has(item.productDocumentId)) {
    return index.byDocumentId.get(item.productDocumentId);
  }
  if (item.productId && index.byDocumentId.has(item.productId)) {
    return index.byDocumentId.get(item.productId);
  }
  if (item.slug && index.bySlug.has(item.slug)) return index.bySlug.get(item.slug);
  if (item.sku && index.bySku.has(item.sku)) return index.bySku.get(item.sku);
  return undefined;
}

function buildInventoryProjection(products, orders, purchaseOrders) {
  const index = productIndex(products);
  const allocated = products.map(() => 0);
  const incoming = products.map(() => 0);

  for (const order of orders) {
    if (!ALLOCATED_ORDER_STATUSES.has(order.status)) continue;
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const productPosition = findProductIndex(index, item);
      if (productPosition !== undefined) allocated[productPosition] += units(item.qty);
    }
  }

  for (const purchaseOrder of purchaseOrders) {
    if (!INCOMING_PURCHASE_ORDER_STATUSES.has(purchaseOrder.status)) continue;
    for (const item of Array.isArray(purchaseOrder.items) ? purchaseOrder.items : []) {
      const productPosition = findProductIndex(index, item);
      const outstanding = Math.max(0, units(item.quantity) - units(item.receivedQuantity));
      if (productPosition !== undefined) incoming[productPosition] += outstanding;
    }
  }

  const rows = products.map((product, index) => {
    const available = units(product.stock);
    return {
      productDocumentId: product.documentId,
      available,
      allocated: allocated[index],
      onHand: available + allocated[index],
      incoming: incoming[index],
      projected: available + incoming[index],
    };
  });

  const totals = rows.reduce(
    (result, row) => ({
      available: result.available + row.available,
      allocated: result.allocated + row.allocated,
      onHand: result.onHand + row.onHand,
      incoming: result.incoming + row.incoming,
      projected: result.projected + row.projected,
    }),
    { available: 0, allocated: 0, onHand: 0, incoming: 0, projected: 0 },
  );

  return { rows, totals };
}

function getInventoryHealth({ available, incoming, projected, minStock, maxStock }) {
  if (available <= minStock && incoming > 0 && projected > minStock) return "Restocking";
  if (available === 0) return "Out";
  if (available <= minStock) return "Low";
  if (projected > maxStock) return "Over max";
  return "Healthy";
}

module.exports = { buildInventoryProjection, getInventoryHealth };
