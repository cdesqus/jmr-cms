# Phase 2 Bank Transfer and RoPay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1 mock-only settlement with auditable manual bank transfer and provider-verified RoPay payment flows for ordinary orders and memberships.

**Architecture:** Strapi owns payment attempts, immutable status events, reconciliation, and activation/finalization side effects. A focused provider adapter supplies a signed mock RoPay lifecycle until real bank credentials exist; Next.js exposes allowlisted BFF routes and never treats browser redirects as proof of payment.

**Tech Stack:** Next.js 16, React 19, TypeScript, Strapi 5, PostgreSQL 16, Node `node:test`, Web Crypto/Node crypto.

## Global Constraints

- Manual transfer records beneficiary, IBAN, amount, currency, expiry, and a unique payment reference.
- Underpayment, overpayment, and currency mismatch remain unresolved until an owner records a resolution.
- Only verified provider callback or server-to-server status verification may mark RoPay paid.
- Browser redirects are advisory and cannot activate membership or finalize an order.
- Manual bank transfer remains available when RoPay is unavailable.
- Payment settlement and membership/order side effects are idempotent and transactionally coordinated.
- Provider secrets, signatures, unrestricted QR payloads, and internal payment metadata never reach the browser.
- `PAYMENTS_ENABLED` and `ROPAY_ENABLED` require the exact string `true`; disabled payment surfaces return `404`.
- Existing guest one-time checkout and Phase 1 membership behavior remain available through manual transfer.
- Docker is not run locally; dev-server PostgreSQL/provider smoke is mandatory before production.

---

### Task 1: Payment Domain, Attempts, and Immutable Events

**Files:**
- Create: `jamora-strapi/src/api/payment-operations/services/payment-domain.cjs`
- Create: `jamora-strapi/src/api/payment-operations/services/payment-domain.d.cts`
- Create: `jamora-strapi/src/api/payment-operations/services/payment-domain.test.mjs`
- Modify: `jamora-strapi/src/api/payment/content-types/payment/schema.json`
- Create: `jamora-strapi/src/api/payment-event/content-types/payment-event/schema.json`
- Create lifecycle/controller/service files for `payment-event` without public CRUD routes.

**Interfaces:**
- Produces: `normaliseMoney({ amountMinor, currency })`, `classifyReceipt(expected, received)`, `canTransition(from, to)`, `paymentReference(prefix, entropy)`.
- Produces statuses: `awaiting_payment`, `pending_provider`, `paid`, `underpaid`, `overpaid`, `currency_mismatch`, `expired`, `cancelled`, `failed`, `refunded`.

- [ ] **Step 1: Write failing domain tests**

```js
assert.deepEqual(classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 9000, currency: "RON" }), { status: "underpaid", differenceMinor: -1000 });
assert.deepEqual(classifyReceipt({ amountMinor: 10000, currency: "RON" }, { amountMinor: 10000, currency: "EUR" }), { status: "currency_mismatch", differenceMinor: 0 });
assert.equal(canTransition("paid", "awaiting_payment"), false);
assert.match(paymentReference("JMR", "8f3a2c"), /^JMR-[A-Z0-9-]+$/);
```

- [ ] **Step 2: Run `node --test src/api/payment-operations/services/payment-domain.test.mjs`; expect module-not-found failure**
- [ ] **Step 3: Implement safe-integer money validation, uppercase `RON|EUR`, explicit transition table, and deterministic reference formatting**
- [ ] **Step 4: Add payment fields for owner/customer binding, purpose (`order|membership_purchase|membership_renewal`), amount/currency, method, provider/reference, expiry, received values, status, and immutable settlement key**
- [ ] **Step 5: Add append-only event fields for event ID, payment ID, transition, actor, reason, provider event ID, occurred time; reject update/delete/createMany invalid input**
- [ ] **Step 6: Run focused tests and Strapi build; commit `feat: add payment attempt domain`**

### Task 2: Manual Bank Transfer and Reconciliation

**Files:**
- Create: `jamora-strapi/src/api/payment-operations/services/payment-operations.ts`
- Create: `jamora-strapi/src/api/payment-operations/services/payment-transaction.cjs`
- Create: `jamora-strapi/src/api/payment-operations/services/payment-transaction.test.mjs`
- Create: `jamora-strapi/src/api/payment-operations/controllers/payment-operations.ts`
- Create: `jamora-strapi/src/api/payment-operations/routes/payment-operations.ts`

**Interfaces:**
- Produces: `prepareBankTransfer`, `recordBankReceipt`, `resolvePaymentMismatch`, `expireDuePayments`, `settlePayment`.
- Consumes Phase 1 membership activation/finalization as idempotent settlement adapters.

- [ ] **Step 1: Write transaction tests for duplicate preparation, exact receipt, under/over/currency mismatch, owner resolution, expiry, and rollback of downstream settlement failure**
- [ ] **Step 2: Implement row-locked transaction adapter; authoritative payment/event re-read occurs inside `strapi.db.transaction`**
- [ ] **Step 3: Generate a unique reference and immutable beneficiary snapshot from server configuration; set a bounded expiry**
- [ ] **Step 4: Require owner session/internal secret for receipt/resolution; require verified customer session or guest checkout capability for preparation**
- [ ] **Step 5: Exact receipt settles once; mismatch records received data without activating/finalizing; owner resolution requires reason and audit actor**
- [ ] **Step 6: Add bounded idempotent expiry sweep and feature gates to direct services and controllers**
- [ ] **Step 7: Run payment tests and Strapi build; commit `feat: add manual transfer reconciliation`**

### Task 3: Signed RoPay Adapter and Callback

**Files:**
- Create: `jamora-strapi/src/api/payment-operations/services/ropay-adapter.cjs`
- Create: `jamora-strapi/src/api/payment-operations/services/ropay-adapter.test.mjs`
- Modify: `jamora-strapi/src/api/payment-operations/services/payment-operations.ts`
- Modify: `jamora-strapi/src/api/payment-operations/controllers/payment-operations.ts`
- Modify: `jamora-strapi/src/api/payment-operations/routes/payment-operations.ts`

**Interfaces:**
- Produces: `createRoPayIntent`, `verifyRoPayCallback`, `verifyRoPayStatus`, `handleRoPayCallback`.

- [ ] **Step 1: Write tests for HMAC-valid callback, invalid signature, replayed provider event, amount/currency/reference mismatch, out-of-order failure after paid, and browser-return non-settlement**
- [ ] **Step 2: Implement mock adapter using constant-time HMAC verification, timestamp tolerance, unique provider event IDs, short-lived QR/deep-link response values**
- [ ] **Step 3: Persist intent before returning provider data; callback locks payment and verifies all immutable fields before one settlement**
- [ ] **Step 4: Add server-to-server status verification boundary; browser return endpoint exposes status only and never mutates payment**
- [ ] **Step 5: Gate RoPay by both flags and fall back to manual transfer when unavailable**
- [ ] **Step 6: Run focused/full Strapi tests and build; commit `feat: add verified ropay payment flow`**

### Task 4: Owner Payment Reconciliation

**Files:**
- Create: `jamora-web/src/lib/payment-api.ts`
- Create: `jamora-web/src/app/admin/api/payments/[...path]/route.ts`
- Create: `jamora-web/src/app/admin/payments/page.tsx`
- Create: `jamora-web/src/components/admin-payment-manager.tsx`
- Modify: `jamora-web/src/components/admin-shell.tsx`

**Interfaces:**
- Produces owner-only payment list, receipt recording, mismatch resolution, and expiry action.

- [ ] **Step 1: Add tests for exact feature gates, owner-only BFF, strict method/path allowlist, trusted headers, and generic provider errors**
- [ ] **Step 2: Implement typed server-only API and BFF; browser cannot supply actor, owner identity, or internal secret**
- [ ] **Step 3: Build payment table showing reference, purpose, expected/received money, status, expiry, customer/order binding, and immutable event history**
- [ ] **Step 4: Build receipt/resolution forms with safe integer minor amount, `RON|EUR`, bank reference, mandatory reason for mismatch resolution**
- [ ] **Step 5: Add feature-gated owner navigation and disabled `notFound()` behavior**
- [ ] **Step 6: Run web tests, lint, build; commit `feat: add payment reconciliation admin`**

### Task 5: Storefront Payment Selection and Status

**Files:**
- Create: `jamora-web/src/app/api/jamora/payments/[...path]/route.ts`
- Create: `jamora-web/src/components/payment-method-selector.tsx`
- Create: `jamora-web/src/components/payment-instructions.tsx`
- Create: `jamora-web/src/app/payment/status/[reference]/page.tsx`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Modify: `jamora-web/src/components/membership-plan-picker.tsx`

**Interfaces:**
- Produces manual-transfer instructions, RoPay QR/deep link, and read-only payment status.

- [ ] **Step 1: Add BFF tests for signed customer identity, guest checkout capability, allowlist, feature-off 404, and no provider-secret leakage**
- [ ] **Step 2: Add checkout selector with manual transfer always available; show RoPay only when returned available by server**
- [ ] **Step 3: Render beneficiary/IBAN/reference/amount/expiry exactly from payment snapshot and warn that fulfillment begins after confirmation**
- [ ] **Step 4: Treat provider redirect as pending; poll safe status endpoint and render paid only after verified server state**
- [ ] **Step 5: Bind both ordinary order and membership purchase/renewal to payment purpose; remove Phase 1 auto-confirm from customer path while retaining test-only adapter**
- [ ] **Step 6: Run web and Strapi integration tests, lint, builds; commit `feat: add storefront payment flows`**

### Task 6: Phase 2 Verification and Deployment Documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `BUSINESS_FLOW.md`
- Modify: `DEPLOYMENT.md`
- Modify: `CORE_FEATURE_PRESENTATION.md`
- Create: `jamora-strapi/src/api/payment-operations/phase2-route-service-smoke.test.mjs`

**Interfaces:**
- Verifies all Phase 2 public/admin/direct boundaries without Docker.

- [ ] **Step 1: Add `PAYMENTS_ENABLED=false`, `ROPAY_ENABLED=false`, beneficiary/IBAN, callback secret, provider mode, and payment TTL configuration; never commit real secrets**
- [ ] **Step 2: Add integrated smoke for transfer preparation, mismatch/no settlement, owner resolution, exact settlement, signed RoPay callback, replay, invalid signature, redirect non-settlement, expiry, membership activation, and ordinary order finalization**
- [ ] **Step 3: Run full web tests, lint, build; full Strapi tests and build; require zero failures/errors**
- [ ] **Step 4: Document schema migration, mock-to-real provider adapter contract, callback URL/signature setup, rollback flags, reconciliation runbook, and exact dev-server live smoke**
- [ ] **Step 5: State Docker was waived locally and dev-server PostgreSQL plus provider callback smoke blocks production promotion**
- [ ] **Step 6: Commit `docs: document payment phase`**

## Phase 2 Completion Gate

- Manual transfer exact settlement activates/finalizes once; mismatches require recorded owner resolution.
- Signed RoPay callback/status verification is the only RoPay settlement authority.
- Browser redirects cannot settle anything.
- Payment events are immutable, money uses safe minor units, and all retries are coherent.
- Owner and customer/guest trust boundaries are behaviorally tested.
- Full non-Docker tests, lint, and both builds pass.
- Dev-server PostgreSQL/provider smoke remains mandatory before production.
