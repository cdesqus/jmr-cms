"use strict";

function hasStorefrontSecret(provided, configured) {
  return Boolean(configured) && provided === configured;
}

module.exports = { hasStorefrontSecret };
