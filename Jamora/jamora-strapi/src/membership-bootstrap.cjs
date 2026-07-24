"use strict";

async function runMembershipStartupSweeps(service, log, now = new Date()) {
  const sweeps = [
    {
      run: () => service.expireDueMembershipCheckouts(now, 100),
      success: (count) => `Membership checkout expiry sweep processed ${count} checkouts`,
      failure: "Membership checkout expiry startup sweep failed",
    },
    {
      run: () => service.expireDueMemberships(now, 100),
      success: (count) => `Membership expiry sweep processed ${count} memberships`,
      failure: "Membership expiry startup sweep failed",
    },
  ];
  for (const sweep of sweeps) {
    try {
      log.info(sweep.success(await sweep.run()));
    } catch {
      log.error(sweep.failure);
    }
  }
}

module.exports = { runMembershipStartupSweeps };
