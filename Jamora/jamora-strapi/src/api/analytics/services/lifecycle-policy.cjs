"use strict";
function reminderSchedule({ email, consent, cartUpdatedAt, now = Date.now(), sent = [] }) {
  if (!email || consent !== true || !cartUpdatedAt) return [];
  if (sent.includes("abandoned_cart_2")) return [];
  const age = now - new Date(cartUpdatedAt).getTime();
  const result = [];
  if (!sent.includes("abandoned_cart_1") && age >= 60 * 60 * 1000) result.push({ template: "abandoned_cart_1", idempotencyKey: `${email}:${cartUpdatedAt}:1` });
  if (age >= 24 * 60 * 60 * 1000 && !sent.includes("abandoned_cart_2")) result.push({ template: "abandoned_cart_2", idempotencyKey: `${email}:${cartUpdatedAt}:2` });
  return result;
}
module.exports = { reminderSchedule };
