"use strict";

const { createHash, timingSafeEqual } = require("node:crypto");

const digest = (value) => createHash("sha256").update(value).digest();

function hasStorefrontSecret(provided, configured) {
  if (typeof provided !== "string" || typeof configured !== "string" || !configured) {
    return false;
  }
  return timingSafeEqual(digest(provided), digest(configured));
}

module.exports = { hasStorefrontSecret };
