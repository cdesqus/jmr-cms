# Phase 3 Address-Assisted Checkout and Shipping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Romanian address-assisted checkout wizard, authoritative carrier quotes, private shipment labels, and monotonic tracking for guest, customer, and membership orders.

**Architecture:** Focused Strapi address and shipping operations own provider adapters, quote/shipment snapshots, webhook verification, and tracking state. Next.js exposes strict BFFs and one checkout wizard; provider data is advisory until validated, financial snapshots are server-owned, and existing mock delivery behavior becomes the default adapter.

**Tech Stack:** Next.js 16, React 19, TypeScript, Strapi 5, PostgreSQL 16, Node `node:test`, HMAC-SHA256.

## Global Constraints

- Checkout steps are exactly `contact -> address -> delivery -> payment -> review`.
- Guest, authenticated customer, and membership redemption use the same flow.
- Address suggestions fill street, building, locality, county, postal code, and Romania; every field remains manually editable.
- Provider suggestions are advisory. Incomplete/inconsistent addresses show warnings and cannot be silently treated as validated.
- Shipping quotes and final order snapshots are server-authoritative safe minor units with carrier, service, currency, price, and delivery estimate.
- Membership redemption shipping is always customer-paid.
- Shipment creation is warehouse-only and only after verified payment.
- AWB/tracking number and label references are persisted; provider credentials and unrestricted label URLs never reach a browser.
- Labels are served by owner/warehouse-authorized short-lived download capability and support PDF or ZPL.
- Tracking states normalize to `label_created`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`, `exception`, `returned`.
- Signed webhooks are preferred; bounded polling is fallback. Duplicate/out-of-order updates cannot regress state.
- `ADDRESS_ASSIST_ENABLED` and `SHIPPING_ENABLED` require exact string `true`; disabled features preserve manual structured address and existing order/payment flows.
- Docker is not run locally; live dev-server PostgreSQL/address/shipping webhook smoke blocks production.

---

### Task 1: Romanian Address Domain and Mock Suggestions

**Files:**
- Create: `jamora-strapi/src/api/shipping-operations/services/address-domain.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/address-domain.test.mjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/address-adapter.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/address-adapter.test.mjs`
- Create: `jamora-strapi/src/api/shipping-operations/controllers/shipping-operations.ts`
- Create: `jamora-strapi/src/api/shipping-operations/routes/shipping-operations.ts`

**Interfaces:**
- Produces `normaliseRomanianAddress`, `assessRomanianAddress`, `suggestRomanianAddresses`.
- Produces `POST /jamora/address/suggest` and `POST /jamora/address/assess`.

- [ ] **Step 1: Write failing tests proving six-digit postal codes, county/locality consistency warnings, suggestion normalization, manual override preservation, limits, and malicious query rejection**
- [ ] **Step 2: Run focused tests and require red module-not-found evidence**
- [ ] **Step 3: Implement explicit structured DTO; warnings are separate from required-field errors and provider confidence never becomes validation**
- [ ] **Step 4: Implement deterministic Romania mock dataset/adapter with maximum 8 suggestions and no external secret**
- [ ] **Step 5: Add exact feature gate, JSON/size/rate guard, customer or guest checkout capability, safe DTO projection**
- [ ] **Step 6: Run focused/full Strapi tests and build; commit `feat: add Romanian address assistance`**

### Task 2: Authoritative Shipping Quotes and Snapshots

**Files:**
- Create: `jamora-strapi/src/api/shipping-operations/services/shipping-domain.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/shipping-domain.test.mjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/shipping-adapter.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/shipping-quote.ts`
- Modify: `jamora-strapi/src/api/order/content-types/order/schema.json`
- Modify: `jamora-strapi/src/api/membership-checkout/content-types/membership-checkout/schema.json`

**Interfaces:**
- Produces `quoteShipping`, `selectShippingQuote`, `validateShippingSnapshot`.
- Produces `POST /jamora/shipping/quotes` and `POST /jamora/shipping/select`.

- [ ] **Step 1: Write tests for server-derived item weight/address zones, RON safe-minor prices, estimate ranges, expired quote, forged price/service, and idempotent selection**
- [ ] **Step 2: Implement mock services (`standard`, `express`) with opaque quote ID, immutable address/items digest, 15-minute expiry, and server pricing**
- [ ] **Step 3: Persist selected carrier/service/price/currency/estimate/quote ID/address digest in pending order or membership checkout**
- [ ] **Step 4: Revalidate quote snapshot during payment preparation/settlement; lock subject and reject expired or mismatched quote**
- [ ] **Step 5: Replace fixed membership shipping with selected quote and enable RoPay only for authoritative RON totals; ordinary guest behavior remains coherent**
- [ ] **Step 6: Run payment/membership/shipping tests and build; commit `feat: add authoritative shipping quotes`**

### Task 3: Unified Checkout Wizard

**Files:**
- Create: `jamora-web/src/lib/shipping-api.ts`
- Create: `jamora-web/src/app/api/jamora/shipping/[...path]/route.ts`
- Create: `jamora-web/src/components/checkout-wizard.tsx`
- Create: `jamora-web/src/components/address-assist-step.tsx`
- Create: `jamora-web/src/components/delivery-step.tsx`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Modify: `jamora-web/src/lib/commerce/address.cjs`

**Interfaces:**
- Consumes safe address/quote routes.
- Produces one five-step wizard for ordinary and membership modes.

- [ ] **Step 1: Add policy/reducer tests for exact step ordering, back/forward preservation, guest/customer/member identity, feature-off manual mode, and no browser price authority**
- [ ] **Step 2: Implement strict BFF allowlist with signed customer or reservation capability; never forward browser identity/provider headers**
- [ ] **Step 3: Build contact/address steps with suggestion debounce, keyboard/accessibility behavior, field autofill, visible warnings, and manual edits**
- [ ] **Step 4: Build delivery selection from safe quote DTO and show carrier/service/price/estimate**
- [ ] **Step 5: Integrate existing Phase 2 payment selector/status and final read-only review; reserve/create pending order only from selected server quote**
- [ ] **Step 6: Run web tests, lint, build; commit `feat: add unified delivery checkout`**

### Task 4: Shipment, Private Labels, and Warehouse UI

**Files:**
- Create: `jamora-strapi/src/api/shipment/content-types/shipment/schema.json`
- Create: `jamora-strapi/src/api/shipping-operations/services/shipment-transaction.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/shipment-transaction.test.mjs`
- Modify: `jamora-strapi/src/api/shipping-operations/controllers/shipping-operations.ts`
- Modify: `jamora-strapi/src/api/shipping-operations/routes/shipping-operations.ts`
- Create: `jamora-web/src/app/admin/api/shipping/[...path]/route.ts`
- Modify: `jamora-web/src/components/admin-packing-modal.tsx`

**Interfaces:**
- Produces `createShipment`, `createLabelCapability`, `downloadLabel`.

- [ ] **Step 1: Write tests rejecting unpaid/unpacked/foreign order, duplicate shipment, forged label access, expired/replayed capability, and provider rollback**
- [ ] **Step 2: Implement row-locked idempotent paid-order shipment creation and mock provider AWB/label reference**
- [ ] **Step 3: Persist shipment without provider secret/raw permanent URL; issue single-purpose short-lived signed download capability**
- [ ] **Step 4: Stream allowlisted PDF/ZPL content through authorized backend; never expose filesystem/provider URL**
- [ ] **Step 5: Add owner/warehouse BFF and packing action after checklist completion**
- [ ] **Step 6: Run web/Strapi tests, lint, builds; commit `feat: add private shipment labels`**

### Task 5: Signed Tracking Webhooks and Polling

**Files:**
- Create: `jamora-strapi/src/api/shipment-event/content-types/shipment-event/schema.json`
- Create: `jamora-strapi/src/api/shipping-operations/services/tracking-domain.cjs`
- Create: `jamora-strapi/src/api/shipping-operations/services/tracking-domain.test.mjs`
- Create: `jamora-strapi/src/middlewares/shipping-webhook-guard.cjs`
- Modify: `jamora-strapi/config/middlewares.ts`
- Modify: `jamora-web/src/lib/order-tracking.ts`

**Interfaces:**
- Produces `applyTrackingEvent`, `pollOpenShipments`, public safe tracking projection.

- [ ] **Step 1: Test signed callback, replay, invalid signature, foreign AWB, duplicate/out-of-order states, exception recovery, returned terminal behavior, and polling idempotency**
- [ ] **Step 2: Implement append-only shipment events with unique provider event ID and explicit monotonic transition table**
- [ ] **Step 3: Add pre-body JSON/size/IP guard followed by canonical HMAC verification and authenticated provider-event limiting**
- [ ] **Step 4: Implement bounded owner-triggered/startup polling for nonterminal shipments; webhooks and polling use the same locked transition service**
- [ ] **Step 5: Replace legacy tracking/label fields with safe shipment projection while retaining compatibility reads**
- [ ] **Step 6: Run full tests/build; commit `feat: add verified shipment tracking`**

### Task 6: Phase 3 Verification and Deployment Documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `BUSINESS_FLOW.md`
- Modify: `DEPLOYMENT.md`
- Modify: `CORE_FEATURE_PRESENTATION.md`
- Create: `jamora-strapi/src/api/shipping-operations/phase3-route-service-smoke.test.mjs`

**Interfaces:**
- Verifies Phase 3 public/customer/admin/provider boundaries without Docker.

- [ ] **Step 1: Add secret-free flags/provider mode/webhook/label TTL/poll limit/address configuration**
- [ ] **Step 2: Add behavioral smoke for suggestion/manual warning, quote/select, guest/customer/member pending payment, verified settlement, warehouse shipment/label auth, signed tracking/replay/regression, polling, and feature-off fallback**
- [ ] **Step 3: Run all web tests, lint, build and all Strapi tests/build with zero failures/errors**
- [ ] **Step 4: Document migration, provider adapter contracts, label storage/rotation, webhook canonical HMAC, trusted proxy, polling schedule, rollback flags, and Romanian data/privacy**
- [ ] **Step 5: Document exact dev-server PostgreSQL/address/quote/label/webhook smoke and mark it mandatory before production**
- [ ] **Step 6: Commit `docs: document shipping phase`**

## Phase 3 Completion Gate

- All checkout modes use the five-step wizard and server-owned delivery quote.
- Address suggestions assist but never override manual control or validation warnings.
- Paid, packed orders alone create one shipment; label access is private and expiring.
- Tracking events are verified, append-only, replay-safe, and cannot regress.
- Feature-off mode preserves manual structured address and Phase 2 payment behavior.
- Full non-Docker gates pass; dev-server provider/PostgreSQL smoke remains mandatory.
