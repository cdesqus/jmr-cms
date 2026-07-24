# Phase 1 Task 2 Report

## Status

Implemented atomic membership operations, HTTP routes, trusted customer/admin
authorization, isolated Phase 1 payment confirmation, and the bounded startup
expiry sweep.

## Implementation notes

- Reservations use a conditional database update inside
  `strapi.db.transaction`; no unsupported row-lock API is claimed.
- The ledger write and cached-balance mutation share the same transaction.
  Unique `idempotencyKey` constraints and post-error reconciliation return a
  coherent committed result after retry races.
- Customer identity is resolved only after storefront-secret verification and
  validation of `documentId` plus `sessionVersion` through
  `findActiveSessionCustomer`.
- Admin routes fail closed unless the shared secret, non-empty actor, and
  `owner` role are all present.
- All routes directly return 404 while `MEMBERSHIP_ENABLED !== "true"`.
- Phase 1 mock activation is contained in
  `phase1-membership-confirmation.cjs`; activation itself is payment-provider
  independent for Phase 2 replacement.
- `beforeCreateMany` now validates every ledger entry.
- The startup expiry sweep is flag-gated, limited to 100 rows, idempotent per
  membership, and logs only the count.

## Verification

- Membership and ledger tests: 62 passed, 0 failed.
- `npm run build`: passed.
- Runtime CJS packaging: 17 assets packaged; 82 compiled JS files validated.
- Generated tracked build artifacts were restored and generated untracked
  artifacts removed after verification.

## Concerns

- The Strapi adapter uses a Knex arithmetic expression for atomic cached
  balance updates. It is compatible with the configured PostgreSQL runtime but
  should be exercised against the real database in deployment integration
  tests.
- Phase 1 purchase and renewal intentionally activate immediately through the
  isolated mock confirmation adapter. Phase 2 must replace only that adapter
  with verified payment-event dispatch.
