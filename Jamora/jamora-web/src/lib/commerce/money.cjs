function createMoney(amountMinor, currency) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError("amountMinor must be a non-negative integer");
  }
  const normalisedCurrency = String(currency).trim().toUpperCase();
  if (!["EUR", "RON"].includes(normalisedCurrency)) {
    throw new TypeError("currency must be EUR or RON");
  }
  return Object.freeze({ amountMinor, currency: normalisedCurrency });
}

function createFxSnapshot({ eurMinor, ronMinor, rate, source, capturedAt }) {
  const isDecimalRate = typeof rate === "string" && /^\d+(?:\.\d+)?$/.test(rate);
  if (!isDecimalRate || !Number.isFinite(Number(rate)) || !(Number(rate) > 0)) {
    throw new TypeError("rate must be a finite positive base-10 decimal string");
  }
  if (!source?.trim()) throw new TypeError("source is required");
  const isIsoInstant = typeof capturedAt === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(capturedAt);
  if (!isIsoInstant || Number.isNaN(Date.parse(capturedAt))) {
    throw new TypeError("capturedAt must be ISO datetime");
  }
  return Object.freeze({
    reference: createMoney(eurMinor, "EUR"),
    charge: createMoney(ronMinor, "RON"),
    rate: String(rate),
    source: source.trim(),
    capturedAt: new Date(capturedAt).toISOString(),
  });
}

module.exports = { createMoney, createFxSnapshot };
