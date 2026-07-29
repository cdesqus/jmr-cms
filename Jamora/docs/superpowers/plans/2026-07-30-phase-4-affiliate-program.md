# Phase 4 Affiliate Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add affiliate links/codes that attribute ordinary orders and membership purchases/renewals, then create affiliate commissions after verified payment settlement.

**Architecture:** Strapi remains the source of truth. A focused affiliate domain module validates codes, creates immutable attribution/commission snapshots, and is called from payment settlement. Next.js exposes a small admin UI plus referral-cookie capture on the storefront.

**Tech Stack:** Strapi v5 content-types/services/controllers, Next.js 16 app router, Node test runner, TypeScript/React.

## Global Constraints

- `AFFILIATES_ENABLED` must be the exact string `true` before public/admin affiliate features are visible.
- Commission is created only after payment reaches verified `paid` settlement.
- Shipping is excluded from commission.
- Affiliate code attribution overrides referral-cookie attribution.
- Affiliate snapshots are immutable on order/payment/commission records.

---

### Task 1: Affiliate domain and schemas

**Files:**
- Create: `jamora-strapi/src/api/affiliate/content-types/affiliate/schema.json`
- Create: `jamora-strapi/src/api/affiliate-commission/content-types/affiliate-commission/schema.json`
- Create: `jamora-strapi/src/api/affiliate-operations/services/affiliate-domain.cjs`
- Test: `jamora-strapi/src/api/affiliate-operations/services/affiliate-domain.test.mjs`

**Interfaces:**
- Produces: `normaliseAffiliateCode(value)`, `affiliateAttributionSnapshot(affiliate, source)`, `commissionForPaidPayment(payment, attribution, options)`.

- [ ] Write failing tests proving code normalization, attribution snapshot, and commission calculation for order and membership payments.
- [ ] Implement schemas and domain functions.
- [ ] Run `node --test src/api/affiliate-operations/services/affiliate-domain.test.mjs`.

### Task 2: Strapi affiliate operations

**Files:**
- Create: `jamora-strapi/src/api/affiliate-operations/routes/affiliate-operations.ts`
- Create: `jamora-strapi/src/api/affiliate-operations/controllers/affiliate-operations.ts`
- Create: `jamora-strapi/src/api/affiliate-operations/services/affiliate-operations.ts`
- Modify: `jamora-strapi/src/api/payment-operations/services/payment-operations.ts`

**Interfaces:**
- Consumes: domain functions from Task 1.
- Produces: admin CRUD/list methods and `createCommissionForPayment(payment, context)`.

- [ ] Write service tests for creating affiliates, validating public code, and idempotent commission creation.
- [ ] Implement operations service and routes.
- [ ] Wire payment settlement to call `createCommissionForPayment` after subject settlement succeeds.

### Task 3: Next.js BFF and admin UI

**Files:**
- Modify: `jamora-web/src/lib/admin-api.ts`
- Create: `jamora-web/src/app/admin/affiliates/page.tsx`
- Create: `jamora-web/src/components/admin-affiliates-manager.tsx`
- Create: `jamora-web/src/app/admin/api/affiliates/route.ts`
- Modify: `jamora-web/src/components/admin-shell.tsx`

**Interfaces:**
- Consumes: Strapi `/api/jamora/admin/affiliates`.
- Produces: owner-visible `/admin/affiliates`.

- [ ] Add affiliate admin fetch types.
- [ ] Add owner nav item.
- [ ] Implement create/list UI with commission totals and referral link copy.

### Task 4: Storefront attribution capture

**Files:**
- Create: `jamora-web/src/components/affiliate-tracker.tsx`
- Modify: `jamora-web/src/components/app-chrome.tsx`
- Modify checkout/payment request code to send `affiliateCode` when present.

**Interfaces:**
- Produces: `jamora_affiliate` cookie/localStorage value.

- [ ] Capture `?ref=CODE` for 30 days when `AFFILIATES_ENABLED=true`.
- [ ] Forward code into order/payment preparation bodies.

### Task 5: Verification and deployment handoff

- [ ] Run Strapi focused affiliate tests.
- [ ] Run web tests/build.
- [ ] Commit and push.
