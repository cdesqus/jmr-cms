"use strict";

module.exports = {
  routes: [{
    method: "POST",
    path: "/jamora/internal/consent-decisions",
    handler: "customer-consent.createDecision",
    config: { auth: false },
  }],
};
