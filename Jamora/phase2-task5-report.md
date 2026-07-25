# Phase 2 Task 5 Report

## Delivered

- Added the feature-gated storefront payment BFF with an exact customer allowlist for methods, manual bank-transfer preparation, RoPay intent preparation, and read-only payment status.
- Bound every request to either the server-verified customer session or the guest stock-reservation capability; browser identity, money, provider metadata, and secret fields are discarded.
- Added manual-transfer and server-advertised RoPay selection to ordinary checkout, membership purchase, and membership renewal with exact `order`, `membership_purchase`, and `membership_renewal` purposes.
- Added pending ordinary-order creation and removed the Phase 1 auto-paid path from production customer checkout while retaining isolated Phase 1 test adapters.
- Added exact beneficiary, bank, IBAN, reference, amount, currency, and expiry instructions plus safe RoPay QR/deep-link presentation.
- Added read-only status polling. Only verified server state renders paid; terminal status removes provider action links, and mismatch states remain under review.
- Added coherent response-loss retries that reuse reservation, order, subject, and idempotency identity instead of creating inaccessible duplicate attempts.
- Made verified ordinary-order settlement transactional across reservation consumption, batch/product stock, inventory movement, promotion usage, order payment binding, invoice, and paid status. Exact replay cannot consume inventory or promotion twice.

## Verification

- `jamora-web`: all 81 tests passed; `npm run lint` passed with two pre-existing `no-img-element` warnings; `npm run build` passed.
- `jamora-strapi`: all 225 tests passed; `npm run build` passed.
- Focused code review approved the final settlement, retry, and provider-presentation invariants with no blocking or important findings.
- Docker was not run.

## Cleanup

- Restored generated Strapi `dist/` files and `.strapi-updater.json` after builds.
