"use strict";

const { ledgerBalance } = require("./membership-domain.cjs");

async function listCustomerMemberships(adapter, customerDocumentId, options = {}) {
  const pageSize = options.pageSize ?? 500;
  const maximumEntries = options.maximumEntries ?? 10000;
  const memberships = await adapter.findMemberships({
    filters: { customerDocumentId: { $eq: customerDocumentId } },
    sort: { createdAt: "desc" },
    limit: 100,
  });
  if (!memberships.length) return [];
  const membershipIds = memberships.map((item) => item.documentId);
  const entries = [];
  for (let start = 0; start < maximumEntries; start += pageSize) {
    const page = await adapter.findEntries({
      filters: { membershipDocumentId: { $in: membershipIds } },
      fields: ["entryId", "membershipDocumentId", "kind", "credits", "creditDelta", "reason", "occurredAt"],
      sort: { occurredAt: "desc" },
      start,
      limit: pageSize,
    });
    entries.push(...page);
    if (page.length < pageSize) return project(memberships, entries);
  }
  throw new Error("Membership ledger result exceeds the bounded customer view.");
}

function project(memberships, entries) {
  const grouped = new Map(memberships.map((membership) => [membership.documentId, []]));
  for (const entry of entries) {
    if (!grouped.has(entry.membershipDocumentId)) {
      throw new Error("Ledger entry belongs to an unexpected membership.");
    }
    grouped.get(entry.membershipDocumentId).push(entry);
  }
  return memberships.map((membership) => {
    const membershipEntries = grouped.get(membership.documentId);
    return {
      documentId: membership.documentId,
      membershipNumber: membership.membershipNumber,
      planDocumentId: membership.planDocumentId,
      planSnapshot: planSnapshot(membership.planSnapshot),
      status: membership.status,
      startsAt: membership.startsAt ?? null,
      endsAt: membership.endsAt ?? null,
      ledgerBalance: ledgerBalance(membershipEntries),
      creditEntries: membershipEntries.map(entryDto),
    };
  });
}

function planSnapshot(value = {}) {
  return {
    name: value.name,
    durationMonths: value.durationMonths,
    packageCredits: value.packageCredits,
    priceEurMinor: value.priceEurMinor,
    priceRonMinor: value.priceRonMinor,
    eligibleProductSlugs: Array.isArray(value.eligibleProductSlugs)
      ? value.eligibleProductSlugs
      : [],
  };
}

function entryDto(entry) {
  return {
    entryId: entry.entryId,
    kind: entry.kind,
    ...(entry.credits === undefined || entry.credits === null ? {} : { credits: entry.credits }),
    ...(entry.creditDelta === undefined || entry.creditDelta === null ? {} : { creditDelta: entry.creditDelta }),
    ...(entry.reason ? { reason: entry.reason } : {}),
    occurredAt: entry.occurredAt,
  };
}

module.exports = { listCustomerMemberships };
