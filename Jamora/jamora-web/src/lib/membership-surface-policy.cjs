"use strict";

function membershipSurfaceEnabled(env = process.env) {
  return env.MEMBERSHIP_ENABLED === "true";
}

function publicMembershipOffer(env = process.env) {
  if (!membershipSurfaceEnabled(env)) return { visible: false };
  return {
    visible: true,
    href: "/account/membership/plans",
    eyebrow: "Prepaid membership",
    title: "Stock your ritual for 3, 6, or 12 months.",
    description:
      "Members prepay for a plan, receive package credits during the membership period, and still pay shipping at checkout.",
    primaryCta: "View membership plans",
    secondaryCta: "Create an account",
  };
}

function visibleAdminNavigation(groups, role, membershipEnabled, paymentsEnabled = false) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.roles.includes(role) &&
        (!item.membershipOnly || membershipEnabled) &&
        (!item.paymentsOnly || paymentsEnabled)),
    }))
    .filter((group) => group.items.length > 0);
}

function membershipCheckoutMode(body, env = process.env) {
  if (!body?.membershipCheckout) return "ordinary";
  return membershipSurfaceEnabled(env) ? "membership" : "membership-disabled";
}

module.exports = {
  membershipCheckoutMode,
  publicMembershipOffer,
  membershipSurfaceEnabled,
  visibleAdminNavigation,
};
