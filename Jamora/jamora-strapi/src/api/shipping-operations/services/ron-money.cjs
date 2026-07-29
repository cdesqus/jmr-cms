"use strict";

function parseDecimalRate(value, fallback = "4.975000") {
  const source = typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
  const match = /^(\d+)(?:\.(\d+))?$/.exec(source);
  if (!match) throw new TypeError("EUR/RON rate must be a positive decimal.");
  const decimals = match[2] ?? "";
  const denominator = 10n ** BigInt(decimals.length);
  const numerator =
    BigInt(match[1]) * denominator + BigInt(decimals || "0");
  if (numerator <= 0n) {
    throw new TypeError("EUR/RON rate must be a positive decimal.");
  }
  return { rate: source, numerator, denominator };
}

function safeMinor(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function roundedRatio(value, numerator, denominator, label) {
  safeMinor(value, label);
  const result = Number(
    (BigInt(value) * numerator + denominator / 2n) / denominator,
  );
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${label} exceeds the safe integer range.`);
  }
  return result;
}

function convertEurMinorToRonMinor(value, rate) {
  return roundedRatio(
    value,
    rate.numerator,
    rate.denominator,
    "RON amount",
  );
}

function convertRonMinorToEurMinor(value, rate) {
  return roundedRatio(
    value,
    rate.denominator,
    rate.numerator,
    "EUR amount",
  );
}

function authoritativeRonTotals({
  subtotalEurMinor,
  discountEurMinor,
  shippingRonMinor,
  rate,
}) {
  safeMinor(subtotalEurMinor, "EUR subtotal");
  safeMinor(discountEurMinor, "EUR discount");
  safeMinor(shippingRonMinor, "RON shipping");
  if (discountEurMinor > subtotalEurMinor) {
    throw new TypeError("EUR discount cannot exceed subtotal.");
  }
  const merchandiseEurMinor = subtotalEurMinor - discountEurMinor;
  const subtotalRonMinor = convertEurMinorToRonMinor(
    subtotalEurMinor,
    rate,
  );
  const merchandiseRonMinor = convertEurMinorToRonMinor(
    merchandiseEurMinor,
    rate,
  );
  const discountRonMinor = subtotalRonMinor - merchandiseRonMinor;
  const shippingEurMinor = convertRonMinorToEurMinor(
    shippingRonMinor,
    rate,
  );
  const referenceTotalEurMinor = merchandiseEurMinor + shippingEurMinor;
  const chargeTotalRonMinor = merchandiseRonMinor + shippingRonMinor;
  for (const value of [
    discountRonMinor,
    referenceTotalEurMinor,
    chargeTotalRonMinor,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError("Authoritative RON totals exceed safe integer range.");
    }
  }
  return {
    subtotalEurMinor,
    discountEurMinor,
    merchandiseEurMinor,
    shippingEurMinor,
    referenceTotalEurMinor,
    subtotalRonMinor,
    discountRonMinor,
    merchandiseRonMinor,
    shippingRonMinor,
    chargeTotalRonMinor,
  };
}

function allocateRonLineTotals(amounts, rate) {
  if (!Array.isArray(amounts) || amounts.length === 0) return [];
  const rows = amounts.map((amount, index) => {
    safeMinor(amount, "EUR line amount");
    const scaled = BigInt(amount) * rate.numerator;
    return {
      index,
      amount,
      floor: Number(scaled / rate.denominator),
      remainder: scaled % rate.denominator,
    };
  });
  const subtotal = rows.reduce((sum, row) => sum + row.amount, 0);
  if (!Number.isSafeInteger(subtotal)) {
    throw new RangeError("EUR line subtotal exceeds safe integer range.");
  }
  const target = convertEurMinorToRonMinor(subtotal, rate);
  const allocation = rows.map((row) => row.floor);
  let remaining = target - allocation.reduce((sum, value) => sum + value, 0);
  const ranked = [...rows].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (let index = 0; index < remaining; index += 1) {
    allocation[ranked[index].index] += 1;
  }
  return allocation;
}

module.exports = {
  allocateRonLineTotals,
  authoritativeRonTotals,
  convertEurMinorToRonMinor,
  convertRonMinorToEurMinor,
  parseDecimalRate,
};
