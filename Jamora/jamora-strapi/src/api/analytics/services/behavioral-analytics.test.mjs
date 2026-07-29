import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { aggregateProductEvents, buildInsightPrompt } = createRequire(import.meta.url)("./behavioral-analytics.cjs");

test("aggregates product funnel and conversion rates from consented events", () => {
  const rows = aggregateProductEvents([
    { productId: "p1", eventType: "product.viewed" }, { productId: "p1", eventType: "cart.item_added" },
    { productId: "p1", eventType: "checkout.started" }, { productId: "p1", eventType: "payment.completed" },
  ]);
  assert.deepEqual(rows[0], { productId: "p1", views: 1, cartAdds: 1, checkoutStarts: 1, purchases: 1, viewToCartRate: 100, cartToCheckoutRate: 100, checkoutToPurchaseRate: 100 });
});

test("insight prompt contains period and aggregate only", () => {
  const prompt = buildInsightPrompt({ period: "last_30_days", purchases: 3 });
  assert.match(prompt, /last_30_days/);
  assert.match(prompt, /purchases/);
});
