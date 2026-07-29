"use strict";
const REQUIRED = new Set(["necessary", "analytics", "lifecycle_email"]);

function coherent(existing) {
  return existing.length === 3 &&
    existing.every((row) => REQUIRED.has(row.purpose)) &&
    new Set(existing.map((row) => row.purpose)).size === 3;
}

async function persistConsentRows(adapter, rows) {
  const decisionId = rows[0]?.decisionId;
  const existing = await adapter.find(decisionId);
  if (existing.length) {
    if (!coherent(existing)) throw new Error("Incoherent consent decision.");
    return { created: false, rows: existing };
  }
  try {
    await adapter.transaction(async (transaction) => {
      for (const row of rows) await transaction.create(row);
    });
    return { created: true, rows };
  } catch (error) {
    const raced = await adapter.find(decisionId);
    if (coherent(raced)) return { created: false, rows: raced };
    throw error;
  }
}

function strapiConsentAdapter(strapi, uid) {
  const query = () => strapi.db.query(uid);
  return {
    find: (decisionId) => query().findMany({ where: { decisionId } }),
    transaction: (work) => strapi.db.transaction(async ({ trx }) =>
      work({
        create: (row) => query().create({ data: row, transacting: trx }),
      })),
  };
}
module.exports = { persistConsentRows, strapiConsentAdapter };
