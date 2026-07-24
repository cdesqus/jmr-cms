"use strict";

const { ledgerBalance } = require("./membership-domain.cjs");

async function listAdminMemberships(adapter, options = {}) {
  const pageSize = options.pageSize ?? 500;
  const maximumEntries = options.maximumEntries ?? 10000;
  const memberships = await adapter.findMemberships({
    sort: { createdAt: "desc" },
    limit: 100,
  });
  if (memberships.length === 0) return [];
  const membershipIds = memberships.map((membership) => membership.documentId);
  const entries = [];
  for (let start = 0; start < maximumEntries; start += pageSize) {
    const page = await adapter.findEntries({
      filters: { membershipDocumentId: { $in: membershipIds } },
      fields: ["entryId", "membershipDocumentId", "kind", "credits", "creditDelta", "actor", "reason", "occurredAt"],
      sort: { occurredAt: "desc" },
      start,
      limit: pageSize,
    });
    entries.push(...page);
    if (page.length < pageSize) return projectAdminMemberships(memberships, entries);
  }
  throw new Error("Membership ledger result exceeds the bounded admin view.");
}

function projectAdminMemberships(memberships, entries) {
  if (!Array.isArray(memberships) || !Array.isArray(entries)) {
    throw new TypeError("memberships and entries must be arrays.");
  }
  const membershipIds = new Set(memberships.map((membership) => membership.documentId));
  const grouped = new Map(memberships.map((membership) => [membership.documentId, []]));
  for (const entry of entries) {
    if (!membershipIds.has(entry?.membershipDocumentId)) {
      throw new Error("Ledger entry belongs to an unexpected membership.");
    }
    grouped.get(entry.membershipDocumentId).push(entry);
  }
  return memberships.map((membership) => {
    const membershipEntries = grouped.get(membership.documentId)
      .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
    const creditEntries = membershipEntries.map(publicEntry);
    return {
      ...membership,
      ledgerBalance: ledgerBalance(membershipEntries),
      creditEntries,
      adjustmentHistory: creditEntries.filter((entry) => entry.kind === "admin_adjustment"),
    };
  });
}

function publicEntry(entry) {
  return {
    entryId: entry.entryId,
    kind: entry.kind,
    ...(entry.credits === undefined || entry.credits === null ? {} : { credits: entry.credits }),
    ...(entry.creditDelta === undefined || entry.creditDelta === null ? {} : { creditDelta: entry.creditDelta }),
    actor: entry.actor,
    ...(entry.reason ? { reason: entry.reason } : {}),
    occurredAt: entry.occurredAt,
  };
}

module.exports = { listAdminMemberships, projectAdminMemberships };
