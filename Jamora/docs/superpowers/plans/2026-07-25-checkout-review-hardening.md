# Checkout Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct all seven independent checkout findings with behavior-level tests and preserve the server-authoritative delivery/payment boundaries.

**Architecture:** Put deterministic feature-matrix, expiry, warning, digest, and single-flight decisions in checkout policy modules that the React wizard consumes. Keep network orchestration in the wizard, but expose typed HTTP status failures and a bounded streaming JSON reader at the BFF. Use ReactDOM with native DOM events in Happy DOM for real component interactions and Node tests for transport/domain boundaries.

**Tech Stack:** Next.js 16, React 19, TypeScript, CommonJS policy modules, Node test runner, Happy DOM, Strapi 5.

## Global Constraints

- Preserve the exact Contact, Address, Delivery, Payment, Review sequence.
- Payments disabled always use the legacy synchronous ordinary/member checkout path, regardless of shipping flags.
- Browser code never owns shipping price or provider identity.
- Address assessment is mandatory before server quote requests.
- Guest capabilities and selected quotes must expire coherently and recover once from authorization expiry.
- BFF JSON bodies are limited to 4,096 UTF-8 bytes before buffering the complete request.
- Combobox focus remains on the input and step transitions are announced and focused.
- Do not run Docker.

---

### Task 1: Policy and Feature Matrix

**Files:**
- Modify: `jamora-web/src/lib/checkout-wizard-policy.cjs`
- Modify: `jamora-web/src/lib/checkout-wizard-policy.d.cts`
- Modify: `jamora-web/src/lib/checkout-wizard-policy.test.mjs`
- Modify: `jamora-web/src/components/cart-view.tsx`

**Interfaces:**
- Consumes: checkout mode, payment/shipping flags, address/items, capability and quote timestamps.
- Produces: `checkoutCompletionMode`, stable input digests, quote-retention decisions, warning labels, and capability/quote expiry decisions.

- [ ] **Step 1: Write failing tests**

Add table-driven tests proving payments-off ordinary/member modes choose `legacy_sync` for both shipping states; unchanged normalized address/items retain a live quote; mutations and either expiry clear it; exact backend warning codes map to friendly copy.

- [ ] **Step 2: Verify RED**

Run `node --test src/lib/checkout-wizard-policy.test.mjs`.
Expected: failures for missing policy exports or incorrect feature/retention results.

- [ ] **Step 3: Implement minimal policy and route selection**

Implement the tested functions and make `CartView.handleCheckout` use the resulting completion mode so a disabled payment feature never calls pending-order or payment endpoints.

- [ ] **Step 4: Verify GREEN**

Run `node --test src/lib/checkout-wizard-policy.test.mjs`.
Expected: all policy tests pass.

### Task 2: Single-Flight Assessment, Quote, and Recovery

**Files:**
- Modify: `jamora-web/src/components/checkout-wizard.tsx`
- Modify: `jamora-web/src/components/address-assist-step.tsx`
- Modify: `jamora-web/src/components/delivery-step.tsx`
- Modify: `jamora-web/src/lib/shipping-api.ts`
- Create: `jamora-web/src/components/checkout-wizard.integration.test.tsx`

**Interfaces:**
- Consumes: typed `ShippingHttpError.status`, reservation `{ token, expiresAt }`, normalized address/items digest.
- Produces: one in-flight operation at a time, disabled navigation/actions while busy, assessment-before-quote, retained live selection, and one fresh-reservation/requote recovery on 401/expiry.

- [ ] **Step 1: Write failing component tests**

Render the wizard and use user events plus deferred fetch responses to prove double Continue creates one reservation, busy disables Continue/Back/retry/quote actions, shipping with address assistance off still assesses before quoting, unchanged back/forward retains selection, and a 401 clears/reissues/requotes once.

- [ ] **Step 2: Verify RED**

Run `npx tsx --test src/components/checkout-wizard.integration.test.tsx`.
Expected: duplicate calls, missing assessment, lost selection, and missing recovery assertions fail.

- [ ] **Step 3: Implement minimal orchestration**

Use refs for single-flight promise/state, store capability expiry, assess whenever shipping is enabled, retain live quote for the same digest, and recover a guest capability once on typed 401/expiry. Disable every wizard action while the operation is busy.

- [ ] **Step 4: Verify GREEN**

Run the component integration test and the checkout policy test.
Expected: all pass.

### Task 3: Bounded Streaming BFF

**Files:**
- Create: `jamora-web/src/lib/bounded-json-request.ts`
- Create: `jamora-web/src/lib/bounded-json-request.integration.ts`
- Modify: `jamora-web/src/app/api/jamora/shipping/[...path]/route.ts`

**Interfaces:**
- Consumes: a `Request` and maximum UTF-8 byte size.
- Produces: parsed object, typed 400/413 failures, early Content-Length rejection, and stream cancellation after a chunk crosses 4,096 bytes.

- [ ] **Step 1: Write failing transport tests**

Test an oversized declared Content-Length whose stream is never read, a chunked stream that crosses 4,096 bytes and is cancelled, a multibyte boundary, malformed JSON, and a valid object.

- [ ] **Step 2: Verify RED**

Run `npx tsx --test src/lib/bounded-json-request.integration.ts`.
Expected: module-not-found or unbounded behavior failure.

- [ ] **Step 3: Implement and wire the streaming reader**

Read with `request.body.getReader()`, accumulate only within the bound, cancel on overflow, decode with fatal UTF-8 handling, parse once, and reject arrays/primitives.

- [ ] **Step 4: Verify GREEN**

Run the bounded-reader and shipping-policy tests.
Expected: all pass.

### Task 4: Accessible Interaction Pattern

**Files:**
- Modify: `jamora-web/src/components/address-assist-step.tsx`
- Modify: `jamora-web/src/components/checkout-wizard.tsx`
- Create: `jamora-web/src/components/address-assist-step.integration.test.tsx`

**Interfaces:**
- Consumes: advisory suggestion results and step changes.
- Produces: input-owned combobox focus with non-tabbable options, `aria-activedescendant`, suppressed post-selection search, focused step heading, and polite transition announcement.

- [ ] **Step 1: Write failing component tests**

Render address assistance and assert options are not tabbable controls, arrow/Enter chooses the active option while input focus is retained, selection does not schedule another search, and wizard transitions focus the new step heading while updating the live announcement.

- [ ] **Step 2: Verify RED**

Run `npx tsx --test src/components/address-assist-step.integration.test.tsx`.
Expected: nested option button, repeated fetch, or focus/announcement assertion failures.

- [ ] **Step 3: Implement the ARIA pattern**

Move click/pointer handlers to `li[role=option]`, keep input focus and active descendant, track a committed query to suppress the selection effect, and focus a `tabIndex=-1` step heading after reducer transitions.

- [ ] **Step 4: Verify GREEN**

Run both component integration suites.
Expected: all pass.

### Task 5: Verification, Report, and Commit

**Files:**
- Modify: `phase3-task3-report.md`

**Interfaces:**
- Consumes: all implementation and verification evidence.
- Produces: appended review-fix record and one clean commit.

- [ ] **Step 1: Run complete verification**

Run web Node tests, component tests, lint, and build; run full Strapi tests and build; run `git diff --check`.
Expected: all tests/builds pass and lint has no errors.

- [ ] **Step 2: Restore generated output**

Restore tracked Strapi `dist` and updater state, dry-run `git clean` on `jamora-strapi/dist`, then remove only generated untracked build output.

- [ ] **Step 3: Append the report**

Document all seven fixes, component/transport coverage, final counts, review outcome, and no-Docker compliance in `phase3-task3-report.md`.

- [ ] **Step 4: Commit**

Stage only task files and commit the complete review-fix pass with a descriptive message.
