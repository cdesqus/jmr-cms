# Shipping Finalization Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every shipping-enabled order finalization consume one live, exact, customer-bound stock reservation and make payments-off success UI use only the authoritative returned RON order.

**Architecture:** Centralize reservation validation and safe checkout-order projection in focused policy modules. The analytics controller will lock and revalidate the reservation before order creation, reject any binding mismatch, and consume exact allocations without clamp-based stock fallback. Web checkout will project the safe server DTO into local order state instead of retaining its zero-shipping placeholder.

**Tech Stack:** Strapi 5, Next.js 16, React 19, TypeScript, CommonJS policy modules, Node test runner, ReactDOM with Happy DOM.

## Global Constraints

- `SHIPPING_ENABLED=true` requires a non-empty reservation capability for pending and legacy ordinary checkout.
- Reservation status, expiry, customer email, exact item allocations, and selected quote lifetime must match before order creation.
- Legacy paid consumption must decrement exactly reserved rows and fail rather than clamp.
- Membership checkout keeps its transactional checkout-reference lock and authoritative stock/credit settlement.
- Returned browser order data is a strict safe allowlist and authoritative RON breakdown.
- No Docker.

---

### Task 1: Reservation authority policy

**Files:**
- Create: `jamora-strapi/src/api/analytics/services/shipping-order-finalization.cjs`
- Create: `jamora-strapi/src/api/analytics/services/shipping-order-finalization.d.cts`
- Create: `jamora-strapi/src/api/analytics/services/shipping-order-finalization.test.mjs`
- Modify: `jamora-strapi/src/api/analytics/controllers/analytics.ts`

**Interfaces:**
- Consumes: reservation token/row, authoritative items, customer email, selected shipping snapshot, current time.
- Produces: strict live binding validation and exact allocation consumption instructions.

- [ ] Write adversarial tests for omitted token, expired/consumed reservation, customer mismatch, allocation mismatch, quote later than reservation, missing stock rows, and insufficient exact quantities.
- [ ] Run the focused test and observe failures for the missing policy.
- [ ] Implement the policy and wire a locked reservation transaction into ordinary pending/legacy order creation.
- [ ] Remove shipping finalization’s optional-token branch and clamp-based decrement path.
- [ ] Run the focused policy and analytics checkout tests green.

### Task 2: Quote and membership lifetime

**Files:**
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout.cjs`
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout.test.mjs`
- Modify: `jamora-strapi/src/api/analytics/controllers/analytics.ts`

**Interfaces:**
- Consumes: selected quote expiry and newly issued reservation/checkout expiry.
- Produces: persisted reservation expiry that is never earlier than its selected quote.

- [ ] Add failing ordinary and membership tests proving selected quote expiry cannot exceed the reservation/checkout expiry.
- [ ] Extend the authoritative reservation lifetime to cover the selected quote while retaining finalization-time expiry checks.
- [ ] Run the focused tests green.

### Task 3: Safe authoritative order response

**Files:**
- Create: `jamora-strapi/src/api/analytics/services/checkout-order-response.cjs`
- Create: `jamora-strapi/src/api/analytics/services/checkout-order-response.d.cts`
- Create: `jamora-strapi/src/api/analytics/services/checkout-order-response.test.mjs`
- Modify: `jamora-strapi/src/api/analytics/services/checkout.ts`
- Modify: `jamora-strapi/src/api/analytics/controllers/analytics.ts`
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-checkout.cjs`
- Modify: `jamora-strapi/src/api/membership-operations/controllers/membership-operations.ts`

**Interfaces:**
- Consumes: persisted ordinary/member order and authoritative shipping/price snapshots.
- Produces: safe order DTO with RON subtotal, shipping, discount, and total plus carrier/service/address/estimate.

- [ ] Add failing projection tests proving secrets/internal fields are stripped and ordinary/member RON breakdowns are exact.
- [ ] Persist the authoritative ordinary and membership shipping price snapshots.
- [ ] Return only the safe projected order from legacy finalize controllers.
- [ ] Run focused projection and membership tests green.

### Task 4: Browser authoritative replacement

**Files:**
- Modify: `jamora-web/src/lib/mock-orders.ts`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Modify: `jamora-web/src/components/order-detail.tsx`
- Modify: `jamora-web/src/components/cart-view.integration.test.tsx`

**Interfaces:**
- Consumes: safe backend order DTO returned by ordinary mock-paid or membership finalize.
- Produces: saved authoritative order and RON success summary.

- [ ] Add real DOM tests returning adversarially different server totals for ordinary and membership shipping checkout.
- [ ] Observe failures showing the local zero-shipping order is saved/rendered.
- [ ] Project the safe response into `MockOrder`, replace the placeholder order, save it, and format success money by its authoritative currency.
- [ ] Run the DOM suite green.

### Task 5: Verification and handoff

**Files:**
- Write scratch report outside the committed source set.

**Interfaces:**
- Consumes: all test/build evidence.
- Produces: one clean commit and scratch-only report.

- [ ] Run web tests, lint, and build.
- [ ] Run full Strapi tests and build.
- [ ] Restore generated Strapi and cache output and run `git diff --check`.
- [ ] Write the scratch report without staging it.
- [ ] Commit only source, tests, and the implementation plan.
