"use strict";

const EVENT_TYPES = ["product.viewed", "cart.item_added", "checkout.started", "payment.completed"];

function aggregateProductEvents(events = []) {
  const byProduct = new Map();
  for (const event of events) {
    const productId = String(event.productId || event.aggregateId || "").trim();
    if (!productId || !EVENT_TYPES.includes(event.eventType)) continue;
    const row = byProduct.get(productId) || { productId, views: 0, cartAdds: 0, checkoutStarts: 0, purchases: 0 };
    if (event.eventType === "product.viewed") row.views++;
    if (event.eventType === "cart.item_added") row.cartAdds++;
    if (event.eventType === "checkout.started") row.checkoutStarts++;
    if (event.eventType === "payment.completed") row.purchases++;
    byProduct.set(productId, row);
  }
  return [...byProduct.values()].map((row) => ({ ...row,
    viewToCartRate: row.views ? Math.round((row.cartAdds / row.views) * 1000) / 10 : 0,
    cartToCheckoutRate: row.cartAdds ? Math.round((row.checkoutStarts / row.cartAdds) * 1000) / 10 : 0,
    checkoutToPurchaseRate: row.checkoutStarts ? Math.round((row.purchases / row.checkoutStarts) * 1000) / 10 : 0,
  })).sort((a, b) => b.purchases - a.purchases || b.views - a.views);
}

function buildInsightPrompt(summary) {
  return `Analyze this ecommerce aggregate for ${summary.period}. Use only these facts; separate observations from hypotheses.\n${JSON.stringify(summary)}`;
}

module.exports = { aggregateProductEvents, buildInsightPrompt };
