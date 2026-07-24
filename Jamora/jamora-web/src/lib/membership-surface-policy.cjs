"use strict";

function membershipSurfaceEnabled(env = process.env) {
  return env.MEMBERSHIP_ENABLED === "true";
}

function visibleAdminNavigation(groups, role, membershipEnabled) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.roles.includes(role) && (!item.membershipOnly || membershipEnabled)),
    }))
    .filter((group) => group.items.length > 0);
}

function membershipCheckoutMode(body, env = process.env) {
  if (!body?.membershipCheckout) return "ordinary";
  return membershipSurfaceEnabled(env) ? "membership" : "membership-disabled";
}

module.exports = {
  membershipCheckoutMode,
  membershipSurfaceEnabled,
  visibleAdminNavigation,
};
