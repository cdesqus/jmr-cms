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

## Review remediation

The follow-up security review was addressed with test-first regressions:

- Membership rows are locked with the transaction's Knex handle, then the
  ledger is re-read and reduced to the authoritative balance before mutation.
- Release and redeem are mutually exclusive terminal operations for a
  reservation, including concurrent calls with different idempotency keys.
- Idempotency retries validate operation, membership, immutable financial
  fields, references, reason, and actor before returning stored data.
- Expiry derives its credit amount from the ledger rather than the cache.
- Activation conditionally updates `pending_payment` and verifies one row was
  matched, preventing a second grant under a different key.
- Every direct service and transaction operation checks the exact feature flag.
- Customer plan listing now requires the same trusted, validated customer
  session as other customer membership endpoints.
- Plan PATCH merges persisted data before domain normalization.

Fresh remediation verification passed 73 tests and the Strapi build. Runtime
packaging copied 18 CJS assets and validated 82 compiled JavaScript files.
