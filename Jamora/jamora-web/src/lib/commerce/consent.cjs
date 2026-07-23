const CONSENT_VERSION = "2026-07-24";

function parseConsent(raw) {
  try {
    const value = JSON.parse(raw);
    if (value.version !== CONSENT_VERSION || value.necessary !== true) return null;
    if (Number.isNaN(Date.parse(value.decidedAt))) return null;
    return {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: value.analytics === true,
      lifecycleEmail: value.lifecycleEmail === true,
      decidedAt: new Date(value.decidedAt).toISOString(),
    };
  } catch {
    return null;
  }
}

function allowsPurpose(consent, purpose) {
  return purpose === "necessary" || consent?.[purpose] === true;
}

module.exports = { CONSENT_VERSION, parseConsent, allowsPurpose };
