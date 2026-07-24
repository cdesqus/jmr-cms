# Phase 1 Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add prepaid 3/6/12-month memberships with admin-configurable package credits, an immutable credit ledger, customer redemption checkout with customer-paid shipping, expiry, and manual renewal.

**Architecture:** Strapi/PostgreSQL owns plans, memberships, ledger entries, and atomic credit operations. Pure domain modules calculate balances and transitions; focused Strapi operations expose admin and customer boundaries. Next.js adds owner plan management, a verified-customer membership dashboard, purchase flow, and credit redemption to the existing checkout without changing guest one-time checkout.

**Tech Stack:** Next.js 16, React 19, TypeScript, Strapi 5, PostgreSQL 16, Node `node:test`, Tailwind CSS 4.

## Global Constraints

- Membership requires an active, verified customer account.
- Membership is prepaid for exactly 3, 6, or 12 months and renewed manually.
- Plan credit quantity is admin-configurable.
- Redeemed products use credits; shipping is always customer-paid for membership redemption.
- Unused credits expire at membership end.
- Credit accounting is append-only; cached balance is not authoritative.
- Checkout reserves credit and stock together, releases both on failure/expiry, and redeems only after shipping payment confirmation.
- Renewal creates a new membership period and grant; it never rewrites an earlier period.
- Admin adjustment requires a non-empty reason and audit event.
- Recurring renewal and free membership shipping are outside Phase 1.
- `MEMBERSHIP_ENABLED` must disable storefront, admin mutations, and direct Strapi membership operations.
- Existing guest and ordinary one-time checkout behavior must remain unchanged.
- No new membership logic may be added to the oversized Strapi analytics controller.

---

## File Structure

- `jamora-strapi/src/api/membership-plan/`: persisted plan configuration.
- `jamora-strapi/src/api/membership/`: customer membership periods.
- `jamora-strapi/src/api/membership-credit-entry/`: append-only ledger.
- `jamora-strapi/src/api/membership-operations/`: focused admin/customer routes and transaction service.
- `jamora-strapi/src/api/membership-operations/services/membership-domain.cjs`: pure balance and transition rules.
- `jamora-web/src/lib/membership-api.ts`: server-only membership client.
- `jamora-web/src/app/admin/api/membership/*`: owner-protected BFF.
- `jamora-web/src/app/admin/membership/page.tsx`: plan/member operations UI.
- `jamora-web/src/app/api/jamora/membership/*`: customer-session-protected BFF.
- `jamora-web/src/app/account/membership/*`: membership purchase, dashboard, and renewal.
- `jamora-web/src/components/membership-redemption.tsx`: eligible-package redemption selection.

---

### Task 1: Membership Domain and Persistence

**Files:**
- Create: `jamora-strapi/src/api/membership-operations/services/membership-domain.cjs`
- Create: `jamora-strapi/src/api/membership-operations/services/membership-domain.d.cts`
- Create: `jamora-strapi/src/api/membership-operations/services/membership-domain.test.mjs`
- Create: `jamora-strapi/src/api/membership-plan/content-types/membership-plan/schema.json`
- Create: `jamora-strapi/src/api/membership/content-types/membership/schema.json`
- Create: `jamora-strapi/src/api/membership-credit-entry/content-types/membership-credit-entry/schema.json`
- Create standard controller/service files for the three content types, but expose no generated public CRUD routes.
- Modify: `jamora-strapi/src/api/product/content-types/product/schema.json`
- Modify: `jamora-strapi/scripts/package-runtime-cjs.cjs` only if its existing recursive behavior does not already include the new CJS file.

**Interfaces:**
- Produces: `normalisePlan(input)`.
- Produces: `ledgerBalance(entries)`.
- Produces: `requiredCredits(items)`.
- Produces: `assertMembershipCanReserve(membership, balance, credits, now)`.
- Produces UIDs: `api::membership-plan.membership-plan`, `api::membership.membership`, `api::membership-credit-entry.membership-credit-entry`.

- [ ] **Step 1: Write failing pure-domain tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMembershipCanReserve,
  ledgerBalance,
  normalisePlan,
  requiredCredits,
} from "./membership-domain.cjs";

test("accepts configurable 3, 6, and 12 month plans", () => {
  assert.deepEqual(normalisePlan({
    name: "Balance 6", durationMonths: 6, packageCredits: 7,
    priceEurMinor: 12900, priceRonMinor: 64178, eligibleProductSlugs: ["beras-kencur"],
  }), {
    name: "Balance 6", durationMonths: 6, packageCredits: 7,
    priceEurMinor: 12900, priceRonMinor: 64178,
    eligibleProductSlugs: ["beras-kencur"], active: true,
  });
  assert.throws(() => normalisePlan({ durationMonths: 4 }), /durationMonths/);
});

test("derives balance from append-only signed entries", () => {
  assert.equal(ledgerBalance([
    { kind: "grant", credits: 7 }, { kind: "reserve", credits: 2 },
    { kind: "release", credits: 1 }, { kind: "redeem", credits: 1 },
    { kind: "expire", credits: 5 },
  ]), 0);
});

test("calculates product credit cost and rejects insufficient active membership", () => {
  assert.equal(requiredCredits([{ qty: 2, creditCost: 1 }, { qty: 1, creditCost: 2 }]), 4);
  assert.doesNotThrow(() => assertMembershipCanReserve(
    { status: "active", startsAt: "2026-07-01T00:00:00.000Z", endsAt: "2027-01-01T00:00:00.000Z" },
    5, 4, new Date("2026-07-24T00:00:00.000Z"),
  ));
  assert.throws(() => assertMembershipCanReserve(
    { status: "expired", startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-07-01T00:00:00.000Z" },
    5, 1, new Date("2026-07-24T00:00:00.000Z"),
  ), /active/);
});
```

- [ ] **Step 2: Verify red**

Run: `node --test src/api/membership-operations/services/membership-domain.test.mjs`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement minimal domain rules**

Use signed ledger deltas:

```js
const DELTA = {
  grant: 1, release: 1, reverse: 1, admin_adjustment: 1,
  reserve: -1, redeem: 0, expire: -1,
};
```

`redeem` finalizes an existing reservation and therefore has zero additional
balance delta. Every input must use safe non-negative integer credits and
positive integer quantities/costs. `admin_adjustment` may carry a signed
`creditDelta` instead of `credits`.

- [ ] **Step 4: Add exact schemas**

Plan fields:

```json
{
  "name": { "type": "string", "required": true },
  "active": { "type": "boolean", "default": true, "required": true },
  "durationMonths": { "type": "enumeration", "enum": ["3", "6", "12"], "required": true },
  "priceEurMinor": { "type": "integer", "required": true, "min": 1 },
  "priceRonMinor": { "type": "integer", "required": true, "min": 1 },
  "packageCredits": { "type": "integer", "required": true, "min": 1 },
  "eligibleProductSlugs": { "type": "json", "required": true }
}
```

Membership fields:

```json
{
  "membershipNumber": { "type": "string", "required": true, "unique": true },
  "customerDocumentId": { "type": "string", "required": true },
  "planDocumentId": { "type": "string", "required": true },
  "planSnapshot": { "type": "json", "required": true },
  "status": { "type": "enumeration", "enum": ["pending_payment", "active", "expired", "cancelled", "refunded"], "required": true },
  "startsAt": { "type": "datetime" },
  "endsAt": { "type": "datetime" },
  "paymentDocumentId": { "type": "string" },
  "cachedRemainingCredits": { "type": "integer", "default": 0 }
}
```

Ledger fields:

```json
{
  "entryId": { "type": "string", "required": true, "unique": true },
  "idempotencyKey": { "type": "string", "required": true, "unique": true },
  "membershipDocumentId": { "type": "string", "required": true },
  "kind": { "type": "enumeration", "enum": ["grant", "reserve", "release", "redeem", "reverse", "expire", "admin_adjustment"], "required": true },
  "credits": { "type": "integer", "min": 0 },
  "creditDelta": { "type": "integer" },
  "checkoutReference": { "type": "string" },
  "orderDocumentId": { "type": "string" },
  "actor": { "type": "string", "required": true },
  "reason": { "type": "text" },
  "occurredAt": { "type": "datetime", "required": true }
}
```

Add product fields:

```json
"membershipEligible": { "type": "boolean", "default": false },
"creditCost": { "type": "integer", "default": 1, "min": 1 }
```

- [ ] **Step 5: Prevent mutable/public ledger CRUD**

Do not create a generated ledger route. Add lifecycle guards for update/delete
matching the Phase 0 append-only consent/event pattern.

- [ ] **Step 6: Verify and commit**

Run:

```bash
node --test src/api/membership-operations/services/membership-domain.test.mjs
npm run build
```

Expected: domain tests PASS and Strapi build packages all runtime CJS assets.

Commit:

```bash
git add jamora-strapi/src/api/membership-plan jamora-strapi/src/api/membership jamora-strapi/src/api/membership-credit-entry jamora-strapi/src/api/membership-operations/services/membership-domain.* jamora-strapi/src/api/product/content-types/product/schema.json
git commit -m "feat: add membership domain and ledger"
```

### Task 2: Atomic Membership Operations

**Files:**
- Create: `jamora-strapi/src/api/membership-operations/services/membership-operations.ts`
- Create: `jamora-strapi/src/api/membership-operations/services/membership-transaction.cjs`
- Create: `jamora-strapi/src/api/membership-operations/services/membership-transaction.test.mjs`
- Create: `jamora-strapi/src/api/membership-operations/controllers/membership-operations.ts`
- Create: `jamora-strapi/src/api/membership-operations/routes/membership-operations.ts`
- Modify: `jamora-strapi/src/index.ts`

**Interfaces:**
- Produces admin endpoints for plan CRUD, member listing, adjustment, and expiry.
- Produces customer endpoints for plan list, membership purchase preparation, dashboard, reserve, release, redeem, and renewal preparation.
- Produces `reserveCredits`, `releaseCredits`, `redeemCredits`, `expireMembership`, `activateMembership`.

- [ ] **Step 1: Write transaction contract tests**

Tests must prove:

```js
await reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
await reserveCredits({ membershipId: "m1", checkoutReference: "c1", credits: 2, idempotencyKey: "reserve:c1" });
assert.equal(createdEntries.filter((entry) => entry.kind === "reserve").length, 1);

await releaseCredits({ membershipId: "m1", checkoutReference: "c1", idempotencyKey: "release:c1" });
assert.equal(balance(), originalBalance);

await redeemCredits({ membershipId: "m1", checkoutReference: "c2", orderId: "o2", idempotencyKey: "redeem:c2" });
assert.equal(entry("redeem").orderDocumentId, "o2");
```

Also test concurrent insufficient-balance attempts, transaction rollback, expiry
posting one entry, adjustment reason requirement, and renewal generating a new
membership rather than updating the old one.

- [ ] **Step 2: Implement transaction adapter**

Use `strapi.db.transaction` and lock/re-read the membership plus ledger inside
the transaction. Query existing idempotency key first. Create ledger entry,
update cached balance from authoritative ledger total, and commit together.
Return the existing coherent result on retry.

- [ ] **Step 3: Implement feature/auth policies**

Every operation returns `404` unless `MEMBERSHIP_ENABLED === "true"`.
Customer operations require the same signed-session validation used by
`getCurrentCustomer`. Admin operations require the internal admin secret and
owner identity headers. Never authorize using browser-provided customer/admin
IDs.

- [ ] **Step 4: Implement operations**

Required route shapes:

```text
GET    /jamora/membership/plans
GET    /jamora/membership/me
POST   /jamora/membership/purchase
POST   /jamora/membership/reserve
POST   /jamora/membership/release
POST   /jamora/membership/redeem
POST   /jamora/membership/renew
GET    /jamora/admin/membership/plans
POST   /jamora/admin/membership/plans
PATCH  /jamora/admin/membership/plans/:documentId
GET    /jamora/admin/memberships
POST   /jamora/admin/memberships/:documentId/adjust
POST   /jamora/admin/memberships/expire-due
```

Purchase/renew creates `pending_payment`; Phase 1 mock confirmation activates
through an internal idempotent operation and creates the grant. Phase 2 replaces
the mock confirmation with verified payment events without changing activation.

- [ ] **Step 5: Add expiry startup sweep**

On Strapi startup, if membership is enabled, invoke `expireDueMemberships(now)`
once. It must be idempotent and bounded; log count only, not customer PII.

- [ ] **Step 6: Verify and commit**

Run all membership tests plus `npm run build`; restore generated tracked build
artifacts after evidence.

Commit:

```bash
git add jamora-strapi/src/api/membership-operations jamora-strapi/src/index.ts
git commit -m "feat: add atomic membership operations"
```

### Task 3: Admin Membership Management

**Files:**
- Create: `jamora-web/src/lib/membership-api.ts`
- Create: `jamora-web/src/app/admin/api/membership/[...path]/route.ts`
- Create: `jamora-web/src/app/admin/membership/page.tsx`
- Create: `jamora-web/src/components/admin-membership-manager.tsx`
- Modify: `jamora-web/src/components/admin-shell.tsx`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes Strapi admin membership routes.
- Produces owner-only plan/member UI and `MEMBERSHIP_ENABLED`.

- [ ] **Step 1: Add feature configuration**

Add:

```dotenv
MEMBERSHIP_ENABLED=false
```

Pass it to Strapi and storefront. Pages/BFF/Strapi all require the exact string
`true`.

- [ ] **Step 2: Add server-only API**

Expose typed:

```ts
getMembershipPlans()
getMemberships()
createMembershipPlan(input)
updateMembershipPlan(documentId, input)
adjustMembership(documentId, { creditDelta, reason })
expireDueMemberships()
```

Admin BFF gets actor/role from existing admin session; only owner succeeds.

- [ ] **Step 3: Build plan management**

Owner can create/edit active state, duration, EUR/RON prices, credits, and
eligible products. Validate safe integer minor units and non-empty eligibility.
Member table shows account reference, plan snapshot, period, status, ledger
balance, and adjustment history. Adjustment dialog requires signed integer and
reason.

- [ ] **Step 4: Navigation and disabled state**

Add Membership under owner/content management navigation only when enabled.
Direct page access returns `notFound()` when disabled and `403`/redirect for
non-owner.

- [ ] **Step 5: Verify and commit**

Run focused component/helper tests, lint, and build.

Commit:

```bash
git add .env.example docker-compose.yml jamora-web/src/lib/membership-api.ts jamora-web/src/app/admin/api/membership jamora-web/src/app/admin/membership jamora-web/src/components/admin-membership-manager.tsx jamora-web/src/components/admin-shell.tsx
git commit -m "feat: add admin membership management"
```

### Task 4: Customer Membership Dashboard and Purchase

**Files:**
- Create: `jamora-web/src/app/api/jamora/membership/[...path]/route.ts`
- Create: `jamora-web/src/app/account/membership/page.tsx`
- Create: `jamora-web/src/app/account/membership/plans/page.tsx`
- Create: `jamora-web/src/components/membership-dashboard.tsx`
- Create: `jamora-web/src/components/membership-plan-picker.tsx`
- Modify: `jamora-web/src/app/account/page.tsx`

**Interfaces:**
- Produces verified-customer membership purchase, active balance/history, and renewal.

- [ ] **Step 1: Add customer BFF**

Derive customer from signed server session. Never forward browser customer IDs.
Proxy only known membership operations. Return `401` for no session, `404` when
disabled, and safe generic provider errors.

- [ ] **Step 2: Build plan picker**

Show 3/6/12-month plans, EUR reference and RON charge, included credits, eligible
packages, and explicit “Shipping is paid at each redemption checkout.” Purchase
uses the Phase 1 mock payment adapter and redirects to the dashboard only after
idempotent activation succeeds.

- [ ] **Step 3: Build dashboard**

Show current plan, active dates, remaining/reserved/redeemed/expired credits,
ledger history, eligible products, and manual renewal. Pending payment is
visually distinct from active membership. Expired membership cannot redeem.

- [ ] **Step 4: Verify and commit**

Test disabled/no-session states, safe identity derivation, purchase retry, and
dashboard totals. Run lint/build.

Commit:

```bash
git add jamora-web/src/app/api/jamora/membership jamora-web/src/app/account/membership jamora-web/src/app/account/page.tsx jamora-web/src/components/membership-dashboard.tsx jamora-web/src/components/membership-plan-picker.tsx
git commit -m "feat: add customer membership experience"
```

### Task 5: Credit Redemption Checkout

**Files:**
- Create: `jamora-web/src/components/membership-redemption.tsx`
- Create: `jamora-web/src/lib/commerce/membership-checkout.cjs`
- Create: `jamora-web/src/lib/commerce/membership-checkout.d.cts`
- Create: `jamora-web/src/lib/commerce/membership-checkout.test.mjs`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Modify: `jamora-web/src/app/api/jamora/inventory/reserve/route.ts`
- Modify: `jamora-web/src/app/api/jamora/orders/mock-paid/route.ts`
- Modify: `jamora-strapi/src/api/membership-operations/services/membership-operations.ts`
- Modify focused checkout services; do not add logic to the analytics controller.

**Interfaces:**
- Produces one atomic checkout reference linking stock reservation and credit reservation.
- Produces membership order snapshots and ledger redemption.

- [ ] **Step 1: Write checkout rules**

Tests prove:

```js
assert.deepEqual(buildMembershipTotals({
  items: [{ qty: 2, unitPriceMinor: 3000, creditCost: 1 }],
  availableCredits: 2, shippingMinor: 495,
}), {
  merchandiseMinor: 0, coveredMerchandiseMinor: 6000,
  creditsRequired: 2, shippingMinor: 495, totalMinor: 495,
});
```

Reject ineligible product, insufficient credit, expired membership, zero
shipping submitted for membership redemption, mixed ordinary/redemption cart in
Phase 1, and non-safe integers.

- [ ] **Step 2: Reserve stock and credit**

The Next reserve route generates one opaque checkout reference. Strapi reserves
stock first inside the existing inventory boundary, then credits. If credit
reserve fails, release stock. If stock reserve fails, no credit entry is posted.
Repeated request uses idempotency keys and returns the same reservations.

- [ ] **Step 3: Finalize paid shipping**

Mock payment success creates the order with membership/covered-value snapshots,
consumes stock, and changes credit reservation to redemption atomically or with
explicit compensation. Failure releases both. Never charge product merchandise;
shipping remains nonzero and customer-paid.

- [ ] **Step 4: Cart UX**

Only a logged-in active member sees “Use membership credits.” Selected mode
shows eligible items, credit cost, remaining balance, covered merchandise, and
shipping due. Guest/ordinary checkout remains byte-compatible when membership
mode is off.

- [ ] **Step 5: Verify and commit**

Test reserve retry, stock failure, credit failure, payment failure, payment
success, and compensation paths. Run all web/Strapi tests, lint, and builds.

Commit:

```bash
git add jamora-web/src/components/membership-redemption.tsx jamora-web/src/components/cart-view.tsx jamora-web/src/lib/commerce/membership-checkout.* jamora-web/src/app/api/jamora/inventory/reserve/route.ts jamora-web/src/app/api/jamora/orders/mock-paid/route.ts jamora-strapi/src/api/membership-operations
git commit -m "feat: add membership credit redemption checkout"
```

### Task 6: Phase 1 Verification and Documentation

**Files:**
- Modify: `BUSINESS_FLOW.md`
- Modify: `DEPLOYMENT.md`
- Modify: `CORE_FEATURE_PRESENTATION.md`

- [ ] **Step 1: Run complete non-Docker gate**

```bash
cd jamora-web
node --test --test-force-exit src/lib/**/*.test.mjs src/lib/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
node --test --test-force-exit src/api/**/*.test.mjs scripts/package-runtime-cjs.test.mjs
npm run build
```

Expected: zero failed tests, zero lint errors, and both builds exit 0.

- [ ] **Step 2: Run route/service smoke without Docker**

Exercise feature-off 404, owner plan CRUD, member purchase activation,
idempotent grant, dashboard balance, stock+credit reservation, paid shipping
redemption, release on failure, expiry, adjustment audit reason, and manual
renewal using controller/service fixtures.

- [ ] **Step 3: Document deployment**

Document `MEMBERSHIP_ENABLED`, schema additions, Phase 1 mock payment boundary,
customer-paid shipping, expiry behavior, rollback, and exact server deployment
verification commands. State that Docker/local live smoke was waived by the user
and must be performed on the dev server before production promotion.

- [ ] **Step 4: Commit**

```bash
git add BUSINESS_FLOW.md DEPLOYMENT.md CORE_FEATURE_PRESENTATION.md
git commit -m "docs: document membership phase"
```

## Phase 1 Completion Gate

Phase 1 automated implementation is complete when:

- all Task 6 commands pass;
- plan, membership, and append-only ledger schemas build;
- owner can manage plans and adjustments through tested boundaries;
- verified customer purchase/renewal uses idempotent activation/grant;
- redemption reserves/releases/redeems stock and credits coherently;
- membership redemption always charges shipping;
- expiry and renewal preserve immutable history;
- disabling `MEMBERSHIP_ENABLED` restores existing one-time checkout behavior.

Docker validation is intentionally deferred to the dev server per user
instruction and is not a blocker for proceeding to Phase 2.
