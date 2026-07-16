const PREFIX = "JMR1:";

function positiveInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function createCartonPayload(input) {
  const poNumber = String(input.poNumber ?? "").trim().toUpperCase();
  const productDocumentId = String(input.productDocumentId ?? "").trim();
  const batchNumber = String(input.batchNumber ?? "").trim().toUpperCase();
  const carton = positiveInteger(input.carton);
  const quantity = positiveInteger(input.quantity);
  if (!poNumber || !productDocumentId || !batchNumber || !carton || !quantity) return "";
  return `${PREFIX}${encode({ v: 1, p: poNumber, d: productDocumentId, b: batchNumber, c: carton, q: quantity })}`;
}

function parseCartonPayload(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith(PREFIX)) return null;
  try {
    const parsed = decode(raw.slice(PREFIX.length));
    const poNumber = String(parsed.p ?? "").trim().toUpperCase();
    const productDocumentId = String(parsed.d ?? "").trim();
    const batchNumber = String(parsed.b ?? "").trim().toUpperCase();
    const carton = positiveInteger(parsed.c);
    const quantity = positiveInteger(parsed.q);
    if (parsed.v !== 1 || !poNumber || !productDocumentId || !batchNumber || !carton || !quantity) return null;
    return {
      version: 1,
      poNumber,
      productDocumentId,
      batchNumber,
      carton,
      quantity,
      cartonId: `${poNumber}:${productDocumentId}:${batchNumber}:${carton}`,
    };
  } catch {
    return null;
  }
}

function purchaseOrderOutstanding(order) {
  return (Array.isArray(order?.items) ? order.items : []).reduce(
    (total, item) => total + Math.max(0, positiveInteger(item.quantity) - positiveInteger(item.receivedQuantity)),
    0,
  );
}

function isPurchaseOrderReceivable(order) {
  return ["ordered", "in_transit", "partially_received"].includes(order?.status) && purchaseOrderOutstanding(order) > 0;
}

module.exports = { createCartonPayload, parseCartonPayload, purchaseOrderOutstanding, isPurchaseOrderReceivable };
