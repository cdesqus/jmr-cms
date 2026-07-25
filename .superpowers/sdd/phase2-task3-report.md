# Phase 2 Task 3 — Signed RoPay Adapter and Callback

## Status

DONE

Commit message: `feat: add verified ropay payment flow`

## Delivered

- Added a signed mock RoPay adapter with:
  - fixed-field canonical JSON payloads;
  - callback and server-status HMAC domain separation;
  - constant-time SHA-256 digest comparison;
  - bounded timestamp tolerance;
  - exact payload allowlisting and normalized safe-integer money;
  - short-lived intent, QR, and banking-app deep-link values.
- RoPay intent creation derives the payment target, owner, amount, currency, and
  price snapshot through the authoritative Task 2 resolver. The transaction
  persists the payment and initial event before provider presentation data is
  created or returned.
- Provider callbacks lock by the persisted payment reference and verify the
  provider reference, payment reference, amount, currency, method, provider,
  event identity, event ordering, expiry, and terminal transition before
  settlement.
- Exact provider event replay is idempotent. Changed replay semantics,
  out-of-order events, incoherent paid replay, and failure after payment reject
  without regressing state or repeating downstream settlement.
- Signed server-to-server status responses use a separate signing domain but
  the same locked settlement path. Browser return is an authenticated GET that
  performs only a read and returns an allowlisted status DTO.
- QR/deep-link generation receives only the provider-required payment fields,
  never the customer/guest binding, full snapshot, idempotency key, settlement
  key, callback secret, or signature.
- `PAYMENTS_ENABLED` and `ROPAY_ENABLED` both require the exact string `true`.
  RoPay additionally fails closed outside mock provider mode or without its
  callback secret. Manual bank transfer remains operational when only RoPay is
  unavailable.
- Extended the Task 2 adapter with transaction-enlisted payment-reference row
  locking and read-only payment-reference lookup.
- Provider references are write-once at the payment lifecycle boundary.
  Provider-delivery snapshot fields are excluded from authoritative subject
  comparison while the stored snapshot itself remains lifecycle-immutable.

## TDD Evidence

### Initial RED

Command:

`node --test src/api/payment-operations/services/ropay-adapter.test.mjs`

Observed exit code `1` with the expected `ERR_MODULE_NOT_FOUND` for the new
adapter.

### Controller/Route RED

Command:

`node --test src/api/payment-operations/controllers/payment-operations.test.mjs`

Observed exit code `1`: five new tests failed because the RoPay intent,
callback, server-status, browser-return handlers, and routes did not exist.

### Security and Transaction RED Cycles

Focused test runs produced the expected failures before each fix for:

- replacing an already assigned provider reference;
- changed provider-event replay semantics;
- incoherent paid-event replay;
- provider events older than the persisted intent;
- over-broad provider presentation input containing internal payment metadata;
- production authoritative settlement rejecting the persisted RoPay delivery
  snapshot.

The last regression reproduced the independent reviewer’s Critical finding:
an otherwise valid paid callback rolled back with
`Authoritative payment subject binding changed.` The focused callback test now
invokes the real authoritative binding assertion, failed before the fix, and
passes after provider-delivery metadata is normalized consistently.

## Final Verification

- Focused payment suite:
  `node --test src/api/payment-operations/services/*.test.mjs src/api/payment-operations/controllers/*.test.mjs src/api/payment/content-types/payment/*.test.mjs src/api/payment-event/content-types/payment-event/*.test.mjs`
  — exit `0`; 67 tests passed, 0 failed.
- Full Strapi suite: `node --test` — exit `0`; 183 tests passed, 0 failed.
- Strapi build: `npm run build` — exit `0`; TypeScript compilation and admin
  build completed; runtime packaging reported 36 CJS assets and 92 compiled
  JavaScript files validated.
- Independent final review: APPROVED; its focused transaction/adapter/controller
  selection passed 55 tests with no remaining Critical or Important findings.
- Build-generated `dist` and `.strapi-updater.json` changes were restored.
- Docker was not run.

## Concerns / Follow-up Scope

- This task implements the contract-compatible mock provider only. No real bank
  credentials or live provider endpoint are present.
- No live PostgreSQL callback/concurrency smoke is claimed. A supported-Node
  dev-server PostgreSQL smoke and provider callback/status smoke remain
  production-promotion gates.
- Verification in this environment used Node `v24.11.1`, while the package
  declares Node 20–22. CI/production verification should also run under a
  declared supported Node version.
- The direct TypeScript tests continue to emit the repository’s pre-existing
  `MODULE_TYPELESS_PACKAGE_JSON` warnings; all tests complete with zero
  failures.
- Environment examples, deployment configuration, and operational runbooks are
  intentionally assigned to Phase 2 Task 6.
