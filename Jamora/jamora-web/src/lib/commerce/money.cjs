function createMoney(amountMinor, currency) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError("amountMinor must be a non-negative integer");
  }
  const normalisedCurrency = String(currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalisedCurrency)) throw new TypeError("currency must be ISO-4217");
  return Object.freeze({ amountMinor, currency: normalisedCurrency });
}

function createFxSnapshot({ eurMinor, ronMinor, rate, source, capturedAt }) {
  if (!(Number(rate) > 0)) throw new TypeError("rate must be positive");
  if (!source?.trim()) throw new TypeError("source is required");
  if (Number.isNaN(Date.parse(capturedAt))) throw new TypeError("capturedAt must be ISO datetime");
  return Object.freeze({
    reference: createMoney(eurMinor, "EUR"),
    charge: createMoney(ronMinor, "RON"),
    rate: String(rate),
    source: source.trim(),
    capturedAt: new Date(capturedAt).toISOString(),
  });
}

module.exports = { createMoney, createFxSnapshot };
