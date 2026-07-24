"use strict";

const { projectAdminMemberships } = require("./membership-admin-projection.cjs");

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
      fields: ["entryId", "membershipDocumentId", "kind", "credits", "creditDelta", "actor", "reason", "occurredAt"],
      sort: { occurredAt: "desc" },
      start,
      limit: pageSize,
    });
    entries.push(...page);
    if (page.length < pageSize) {
      return projectAdminMemberships(memberships, entries).map((membership) => {
        const { adjustmentHistory, ...customerMembership } = membership;
        return {
          ...customerMembership,
          creditEntries: membership.creditEntries.map(({ actor, ...entry }) => entry),
        };
      });
    }
  }
  throw new Error("Membership ledger result exceeds the bounded customer view.");
}

module.exports = { listCustomerMemberships };
