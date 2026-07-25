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

## Independent-Findings Follow-up

- Pending-payment orders now use the server product catalogue for product identity, unit prices, line totals, subtotal, shipping, discounts, and total even when `STRUCTURED_CHECKOUT_ENABLED` is off. Missing products fail closed, and a live opaque reservation is mandatory and must exactly cover the authoritative order items.
- Signed-customer and guest ordinary payments now lock the order-bound reservation. Preparation inherits the reservation expiry, while preparation and settlement reject expired, consumed, released, missing, or mismatched reservations.
- Promotion use is checked and incremented under its locked row during settlement. The configured usage cap is enforced transactionally, payment/order/inventory changes roll back when exhausted, and exact paid replay does not increment twice.
- Paid timeline entries now use the safe `{ id, status, createdAt, note }` shape. The storefront normalizes and bounds server history before rendering so malformed timestamps or extra fields cannot break the timeline.
- Follow-up verification: all 82 `jamora-web` tests and 229 `jamora-strapi` tests passed; web lint passed with the same two pre-existing `no-img-element` warnings; both production builds passed.
- Generated Strapi `dist/` files and `.strapi-updater.json` were restored after the follow-up build. Docker was not run.
