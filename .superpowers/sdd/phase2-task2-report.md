# Phase 2 Task 2 — Manual Bank Transfer and Reconciliation

## Status

DONE

Commit: `583ae57` (`feat: add manual transfer reconciliation`)

## Delivered

- Added the manual-transfer payment service, controller, and customer/owner routes.
- Added a transactional payment engine with:
  - row-locked payment settlement;
  - authoritative payment and event re-reads inside `strapi.db.transaction`;
  - duplicate-preparation and event idempotency conflict handling;
  - exact, underpaid, overpaid, and currency-mismatch receipt classification;
  - reasoned owner resolution;
  - bounded, idempotent expiry;
  - rollback when downstream membership/order settlement fails.
- Payment preparation now locks and resolves the authoritative order, membership, and guest reservation inside the creation transaction. Browser-supplied money, owner IDs, target IDs, and snapshots are replaced with server-derived values.
- Guest payment expiry is capped to the locked checkout capability lifetime.
- Added unique bank references and immutable beneficiary/IBAN snapshots from server configuration.
- Added customer-session, guest-capability, internal-secret, and owner-role trust boundaries. Customer preparation returns an explicit safe instruction DTO rather than the internal payment entity.
- Added exact `PAYMENTS_ENABLED === "true"` gates at controller, direct service, and transaction boundaries.
- Added settlement coordination for Phase 1 membership activation and membership-checkout finalization. A bound pending membership-checkout order is marked paid in the outer transaction before the idempotent Phase 1 finalizer runs.
- Strengthened payment persistence lifecycles so payment identity, target, expected money, expiry, and price/beneficiary snapshots cannot be changed after creation.
- No analytics controller additions were made.

## TDD Evidence

### Transaction RED

Command:

`node --test src/api/payment-operations/services/payment-transaction.test.mjs`

Observed exit code `1` with the expected `ERR_MODULE_NOT_FOUND` for `payment-transaction.cjs`.

### Controller RED

Command:

`node --test src/api/payment-operations/controllers/payment-operations.test.mjs`

Observed exit code `1` with the expected `ERR_MODULE_NOT_FOUND` for `controllers/payment-operations.ts`.

### Security and Invariant RED Cycles

Command:

`node --test src/api/payment-operations/services/payment-transaction.test.mjs src/api/payment-operations/controllers/payment-operations.test.mjs src/api/payment/content-types/payment/lifecycles.test.mjs`

Observed expected failures before their implementations for:

- raw internal payment metadata being returned to the customer;
- mutable payment identity/snapshot fields;
- mismatches being replaceable by a second exact receipt;
- mismatches being expired without owner resolution;
- late receipts/provider settlements;
- unrestricted generic settlement patches and replay payloads;
- missing authoritative subject derivation;
- incorrect guest settlement context/binding;
- currency-changing preparation replay;
- membership-checkout settlement sequencing.

Each failing assertion was rerun green after the corresponding minimal implementation.

### Final Focused GREEN

Command:

`node --test src/api/payment-operations/services/*.test.mjs src/api/payment-operations/controllers/*.test.mjs src/api/payment/content-types/payment/*.test.mjs src/api/payment-event/content-types/payment-event/*.test.mjs`

Observed exit code `0`: 32 tests passed, 0 failed.

## Full Verification

- `node --test` in `Jamora/jamora-strapi`: exit `0`; 145 tests passed, 0 failed.
- `npm run build` in `Jamora/jamora-strapi`: exit `0`; Strapi TypeScript compilation and admin build completed. Runtime packaging reported 32 CJS assets and 92 compiled JavaScript files validated.
- `git diff --cached --check`: exit `0` before commit.
- Build-generated `dist` and `.strapi-updater.json` changes were restored after verification.
- Docker was not run.

## Review

The required code-review loop found and drove fixes for authoritative pricing/targets, mismatch and expiry bypasses, safe customer projection, transactional guest capabilities, immutable persistence fields, generic settlement replay validation, guest settlement binding, and Phase 1 membership-checkout sequencing.

Final reviewer verdict: no remaining Critical or Important findings; ready to merge.

## Concerns / Follow-up Scope

- No live PostgreSQL claim is made. The test suite includes a Strapi adapter contract test proving transaction enlistment, `FOR UPDATE`, and authoritative payment/event reads use the same transaction object, plus memory concurrency/rollback tests. A real dev-server PostgreSQL concurrency and rollback smoke remains a production-promotion gate.
- Task 5 must wire the storefront to create/use authoritative pending order or membership subjects before calling preparation; this task deliberately does not add a browser payment surface.
- The existing Node test runner emits `MODULE_TYPELESS_PACKAGE_JSON` warnings for direct TypeScript test imports. They are pre-existing project behavior; all tests complete with zero failures.

## Independent Review Remediation

The follow-up review findings were fixed in a second TDD cycle:

- Generic provider settlement now rejects every mismatch status and requires explicit received money. It never defaults to expected money, never overwrites an existing receipt, and cannot turn a recorded 90/100 underpayment into a paid payment. Only the owner-only mismatch-resolution operation can settle a mismatch.
- Provider, receipt, and mismatch-resolution events persist a canonical replay payload. Replay checks exact optional-field presence and values, including provider/bank references, timestamps, reasons, money, resolution, actor, transition, and payment binding.
- Membership-checkout finalization persists a settlement key and validates the exact supplied order and payment binding on both first execution and replay. The payment coordinator also validates the Phase 1 result before accepting settlement.
- Membership checkout/order access uses the shared checkout-then-order lock helper. The contract test asserts this sequence, while the existing serialized finalize/release and unique-loss tests continue to cover concurrent terminal behavior.
- The generated payment content-type router now has no CRUD routes. Its core service rejects direct CRUD, and an `AsyncLocalStorage` capability guard permits payment lifecycle writes only while executing the payment-operations service.

### Remediation RED Evidence

Initial focused command:

`node --test src/api/payment-operations/services/payment-transaction.test.mjs src/api/membership-operations/services/membership-checkout.test.mjs src/api/payment/content-types/payment/lifecycles.test.mjs src/api/payment/routes/payment-routes.test.mjs`

Observed exit code `1` with the expected missing lock helper/write guard/private route modules and a missing rejection for paid-checkout replay with a changed immutable binding.

An additional focused RED command:

`node --test src/api/payment-operations/services/payment-transaction.test.mjs`

Observed exit code `1`, 23 passed and 1 failed, because a receipt replay incorrectly accepted a persisted event whose transition no longer matched the receipt-money classification.

Both commands were rerun green after their minimal implementations.

### Remediation Final Verification

- Focused hardening suite: exit `0`; 43 tests passed, 0 failed before the final transition-binding regression was added.
- Final `node --test` in `Jamora/jamora-strapi`: exit `0`; 155 tests passed, 0 failed.
- Final `npm run build` in `Jamora/jamora-strapi`: exit `0`; TypeScript compilation and Strapi admin build completed. Runtime packaging reported 35 CJS assets and 92 compiled JavaScript files validated.
- `git diff --check`: exit `0`.
- Build-generated `dist` and `.strapi-updater.json` changes were restored after verification.
- No Docker or live PostgreSQL verification was run. The deterministic adapter lock-sequence test and memory concurrency tests are evidence for this environment; a real PostgreSQL dev-server concurrency/rollback smoke remains a production-promotion gate.
