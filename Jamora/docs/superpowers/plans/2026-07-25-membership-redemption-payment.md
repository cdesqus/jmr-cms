# Membership Redemption Payment Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require verified payment settlement before membership credit redemption while making payment expiry authoritative in the backend and UI.

**Architecture:** Membership checkout creates an immutable pending order from its reserved snapshot. Payment settlement recognizes that order, settles and finalizes membership checkout in one transaction, while direct customer finalization is gated when payments are enabled.

**Tech Stack:** Node.js service modules, Strapi 5, Next.js/React, `node:test`.

## Global Constraints

- Preserve checkout -> order -> payment lock order.
- Pending-order fields come only from the authoritative membership checkout.
- Direct finalize and mock-paid return not found when `PAYMENTS_ENABLED=true`.
- Legacy mock-paid behavior remains when payments are disabled.
- Settlement and membership finalization share one transaction.

---

### Task 1: Membership-owned pending order

**Files:**
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout.cjs`
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout-strapi-adapter.cjs`
- Test: `jamora-strapi/src/api/membership-operations/services/membership-checkout.test.mjs`

**Interfaces:**
- Produces: `preparePendingOrder({ checkoutReference, customerDocumentId, ... })`.
- Produces: adapter `createPendingOrder(checkout, context)` and immutable order validation.

- [ ] Add failing tests proving preparation creates one pending order from authoritative checkout data and replay returns the same matching order.
- [ ] Run `node --test src/api/membership-operations/services/membership-checkout.test.mjs` and confirm the missing operation fails.
- [ ] Implement locked, idempotent pending-order preparation and adapter persistence.
- [ ] Run the focused test and confirm it passes.

### Task 2: Customer routes and payments gate

**Files:**
- Modify: `jamora-strapi/src/api/membership-operations/controllers/membership-operations.ts`
- Modify: `jamora-strapi/src/api/membership-operations/routes/membership-operations.ts`
- Modify: `jamora-web/src/lib/membership-customer-policy.cjs`
- Modify: `jamora-web/src/app/api/jamora/membership/[operation]/route.ts`
- Modify: `jamora-web/src/app/api/jamora/orders/mock-paid/route.ts`
- Test: `jamora-strapi/src/api/membership-operations/controllers/membership-customer-authorization.test.mjs`
- Test: `jamora-web/src/lib/membership-customer-policy.test.mjs`

**Interfaces:**
- Consumes: `preparePendingOrder`.
- Produces: authenticated `POST checkout-order`.

- [ ] Add failing tests for checkout-order sanitization and payments-enabled finalize/mock-paid denial.
- [ ] Run the focused controller and policy tests and confirm failure.
- [ ] Add the route/controller/BFF operation and fail-closed environment gate.
- [ ] Run the focused tests and confirm passing behavior.

### Task 3: Atomic membership payment settlement

**Files:**
- Modify: `jamora-strapi/src/api/payment-operations/services/payment-transaction.cjs`
- Modify: `jamora-strapi/src/api/payment-operations/services/payment-strapi-adapter.cjs`
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout.cjs`
- Test: `jamora-strapi/src/api/payment-operations/services/payment-transaction.test.mjs`

**Interfaces:**
- Consumes: membership-bound pending order and checkout reference.
- Produces: settlement that finalizes membership checkout using the current transaction.

- [ ] Add failing adversarial tests for no-settlement/no-redemption, successful exact-once settlement, immutable binding rejection, and rollback on finalization failure.
- [ ] Run the payment transaction test and confirm failures.
- [ ] Propagate transaction context and implement membership-order settlement without ordinary stock-reservation consumption.
- [ ] Run payment and membership service tests and confirm passing behavior.

### Task 4: Membership cart payment UX

**Files:**
- Modify: `jamora-web/src/app/cart/page.tsx`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Test: `jamora-web/src/lib/membership-customer-policy.test.mjs`

**Interfaces:**
- Consumes: checkout-order BFF and existing payment preparation/status components.
- Produces: reserve -> pending order -> payment flow when payments are enabled.

- [ ] Add a failing policy/flow contract test proving the customer flow prepares an order rather than finalizing.
- [ ] Run the focused web tests and confirm failure.
- [ ] Branch the membership checkout UX by `paymentsEnabled`, reuse the payment selector/instructions, and retain disabled-mode mock checkout.
- [ ] Run focused web tests and confirm passing behavior.

### Task 5: Authoritative expiry

**Files:**
- Modify: `jamora-strapi/src/api/payment-operations/services/payment-transaction.cjs`
- Modify: `jamora-web/src/lib/payment-customer-view.cjs`
- Modify: `jamora-web/src/components/payment-instructions.tsx`
- Test: `jamora-strapi/src/api/payment-operations/services/payment-transaction.test.mjs`
- Test: `jamora-web/src/lib/payment-customer-view.test.mjs`

**Interfaces:**
- Produces: pending-provider sweep expiry and `effectivePaymentSnapshot` / snapshot-aware polling.

- [ ] Add failing tests for pending-provider expiry event idempotency and local expiry without a new response.
- [ ] Run the focused tests and confirm failure.
- [ ] Expand expirable statuses and add snapshot-aware expiry/polling plus an expiry timer.
- [ ] Run the focused tests and confirm passing behavior.

### Task 6: Verification and handoff

**Files:**
- Modify: `.scratch/phase2-task5.md`

- [ ] Run all jamora-web tests, lint, and build.
- [ ] Run all jamora-strapi tests and build.
- [ ] Restore generated/build artifacts and verify `git status`.
- [ ] Record behaviors and exact verification evidence in `.scratch/phase2-task5.md`.
- [ ] Commit the scoped implementation and report the commit hash.
