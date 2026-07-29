"use strict";

const {
  hashOpaqueToken,
  issueOpaqueToken,
} = require("./customer-credentials.cjs");

const RECOVERY_PRIVACY_FLOOR_MS = 250;

function createRecoveryTokenWork() {
  const token = issueOpaqueToken();
  return { token, tokenHash: hashOpaqueToken(token) };
}

async function waitForRecoveryPrivacyFloor(startedAt, options = {}) {
  const minimumMs = options.minimumMs ?? RECOVERY_PRIVACY_FLOOR_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const remaining = minimumMs - (now() - startedAt);
  if (remaining > 0) await sleep(remaining);
}

async function runRecoveryPrivacyWork(operation, dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const createTokenWork =
    dependencies.createTokenWork ?? createRecoveryTokenWork;
  const waitForFloor =
    dependencies.waitForFloor ?? waitForRecoveryPrivacyFloor;
  const startedAt = now();
  const tokenWork = createTokenWork();
  try {
    return await operation(tokenWork);
  } finally {
    await waitForFloor(startedAt);
  }
}

module.exports = {
  RECOVERY_PRIVACY_FLOOR_MS,
  createRecoveryTokenWork,
  runRecoveryPrivacyWork,
  waitForRecoveryPrivacyFloor,
};
