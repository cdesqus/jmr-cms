# Phase 0 Commerce Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared customer identity, consent, money, structured-address, and payment-state foundation required by Jamora Phases 1–6 without breaking guest checkout.

**Architecture:** Add focused Strapi collection types and operations services as the persistence boundary, while Next.js owns signed customer sessions and storefront UX. Pure CommonJS domain modules provide a dependency-free test seam compatible with the repository's existing `node:test` convention; TypeScript declaration files expose the same contracts to application code.

**Tech Stack:** Next.js 16, React 19, TypeScript, Strapi 5, PostgreSQL 16, Node `crypto`/`node:test`, Tailwind CSS 4.

## Global Constraints

- Guest checkout must remain available and must not create an account implicitly.
- Customer, affiliate, and staff sessions must use separate cookie names and authorization boundaries.
- Romania is initially the only enabled shipping country; address fields use ISO country/subdivision codes.
- Store monetary values as integer minor units plus an ISO currency code.
- Store EUR reference, RON charge, exchange rate, source, and timestamp as immutable checkout snapshots.
- Optional analytics and lifecycle/marketing processing requires versioned consent.
- Payment callbacks and reconciliation must be idempotent.
- Do not add new domain logic to `jamora-strapi/src/api/analytics/controllers/analytics.ts`.
- Preserve existing demo orders, mock-paid checkout, tracking, and admin pages.

---

## File Structure

### New Strapi domains

- `jamora-strapi/src/api/customer-account/`: customer persistence only.
- `jamora-strapi/src/api/customer-consent/`: immutable consent decisions.
- `jamora-strapi/src/api/payment/`: normalized payment state and provider references.
- `jamora-strapi/src/api/payment-refund/`: immutable refund records.
- `jamora-strapi/src/api/commerce-event/`: idempotent domain/webhook receipts.
- `jamora-strapi/src/api/customer-auth/`: public account operations controller, routes, and focused auth service.

### New Next.js domain modules

- `jamora-web/src/lib/commerce/money.cjs` and `.d.cts`: money/exchange snapshots.
- `jamora-web/src/lib/commerce/address.cjs` and `.d.cts`: Romanian structured-address validation.
- `jamora-web/src/lib/commerce/consent.cjs` and `.d.cts`: consent parsing and decisions.
- `jamora-web/src/lib/customer-session.ts`: signed customer session cookie.
- `jamora-web/src/lib/customer-api.ts`: server-only Strapi client.

### New storefront routes/components

- `jamora-web/src/app/api/jamora/customer/*`: browser-safe account endpoints.
- `jamora-web/src/app/account/*`: register, verify, login, forgot/reset password, and account home.
- `jamora-web/src/components/customer-auth-form.tsx`: auth form UI.
- `jamora-web/src/components/structured-address-form.tsx`: Romania-first address entry.

---

### Task 1: Pure Commerce Contracts

**Files:**
- Create: `jamora-web/src/lib/commerce/money.cjs`
- Create: `jamora-web/src/lib/commerce/money.d.cts`
- Create: `jamora-web/src/lib/commerce/money.test.mjs`
- Create: `jamora-web/src/lib/commerce/address.cjs`
- Create: `jamora-web/src/lib/commerce/address.d.cts`
- Create: `jamora-web/src/lib/commerce/address.test.mjs`

**Interfaces:**
- Produces: `createMoney(amountMinor, currency)`
- Produces: `createFxSnapshot({ eurMinor, ronMinor, rate, source, capturedAt })`
- Produces: `normaliseRomanianAddress(input)`
- Produces: `validateRomanianAddress(address)`

- [ ] **Step 1: Write failing money tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createFxSnapshot, createMoney } from "./money.cjs";

test("normalises ISO currency and integer minor units", () => {
  assert.deepEqual(createMoney(1299, "ron"), { amountMinor: 1299, currency: "RON" });
});

test("captures an immutable EUR to RON checkout snapshot", () => {
  assert.deepEqual(createFxSnapshot({
    eurMinor: 2000,
    ronMinor: 9950,
    rate: "4.975000",
    source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  }), {
    reference: { amountMinor: 2000, currency: "EUR" },
    charge: { amountMinor: 9950, currency: "RON" },
    rate: "4.975000",
    source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  });
});

test("rejects fractional minor units and non-positive rates", () => {
  assert.throws(() => createMoney(1.2, "EUR"), /integer/);
  assert.throws(() => createFxSnapshot({
    eurMinor: 100, ronMinor: 0, rate: "0", source: "admin",
    capturedAt: "2026-07-24T10:00:00.000Z",
  }), /positive/);
});
```

- [ ] **Step 2: Run money tests and verify failure**

Run: `node --test src/lib/commerce/money.test.mjs` from `jamora-web`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the money contract**

```js
function createMoney(amountMinor, currency) {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new TypeError("amountMinor must be a non-negative integer");
  }
  const normalisedCurrency = String(currency).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalisedCurrency)) throw new TypeError("currency must be ISO-4217");
  return Object.freeze({ amountMinor, currency: normalisedCurrency });
}

function createFxSnapshot({ eurMinor, ronMinor, rate, source, capturedAt }) {
  if (!(Number(rate) > 0)) throw new TypeError("rate must be positive");
  if (!source?.trim()) throw new TypeError("source is required");
  if (Number.isNaN(Date.parse(capturedAt))) throw new TypeError("capturedAt must be ISO datetime");
  return Object.freeze({
    reference: createMoney(eurMinor, "EUR"),
    charge: createMoney(ronMinor, "RON"),
    rate: String(rate),
    source: source.trim(),
    capturedAt: new Date(capturedAt).toISOString(),
  });
}

module.exports = { createMoney, createFxSnapshot };
```

Add declarations:

```ts
export type Money = Readonly<{ amountMinor: number; currency: string }>;
export type FxSnapshot = Readonly<{
  reference: Money;
  charge: Money;
  rate: string;
  source: string;
  capturedAt: string;
}>;
export function createMoney(amountMinor: number, currency: string): Money;
export function createFxSnapshot(input: {
  eurMinor: number; ronMinor: number; rate: string; source: string; capturedAt: string;
}): FxSnapshot;
```

- [ ] **Step 4: Add failing structured-address tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normaliseRomanianAddress, validateRomanianAddress } from "./address.cjs";

test("normalises a Romania address without losing apartment details", () => {
  assert.deepEqual(normaliseRomanianAddress({
    recipient: " Ana Popescu ", phone: " +40 712 345 678 ",
    countryCode: "ro", subdivisionCode: "B", locality: " București ",
    postalCode: "010011", street: "Calea Victoriei", building: "10", unit: "Ap. 4",
  }), {
    recipient: "Ana Popescu", phone: "+40 712 345 678", countryCode: "RO",
    subdivisionCode: "B", locality: "București", postalCode: "010011",
    street: "Calea Victoriei", building: "10", unit: "Ap. 4", instructions: "",
  });
});

test("requires Romania launch fields and a six-digit postal code", () => {
  assert.deepEqual(validateRomanianAddress(normaliseRomanianAddress({
    recipient: "Ana", countryCode: "RO", locality: "Cluj", postalCode: "400001",
    street: "Strada Memorandumului", building: "1",
  })), []);
  assert.deepEqual(validateRomanianAddress(normaliseRomanianAddress({
    recipient: "", countryCode: "DE", locality: "", postalCode: "ABC", street: "", building: "",
  })), ["recipient", "countryCode", "locality", "postalCode", "street", "building"]);
});
```

- [ ] **Step 5: Implement and verify the address contract**

```js
const FIELDS = ["recipient", "phone", "subdivisionCode", "locality", "postalCode", "street", "building", "unit", "instructions"];

function normaliseRomanianAddress(input = {}) {
  const result = { countryCode: String(input.countryCode || "RO").trim().toUpperCase() };
  for (const field of FIELDS) result[field] = String(input[field] || "").trim();
  return {
    recipient: result.recipient, phone: result.phone, countryCode: result.countryCode,
    subdivisionCode: result.subdivisionCode, locality: result.locality,
    postalCode: result.postalCode, street: result.street, building: result.building,
    unit: result.unit, instructions: result.instructions,
  };
}

function validateRomanianAddress(address) {
  const errors = [];
  for (const field of ["recipient", "locality", "street", "building"]) {
    if (!address[field]) errors.push(field);
  }
  if (address.countryCode !== "RO") errors.push("countryCode");
  if (!/^\d{6}$/.test(address.postalCode)) errors.push("postalCode");
  return errors;
}

module.exports = { normaliseRomanianAddress, validateRomanianAddress };
```

Add matching TypeScript declarations for `StructuredAddress`, both functions,
then run:

`node --test src/lib/commerce/money.test.mjs src/lib/commerce/address.test.mjs`

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add jamora-web/src/lib/commerce
git commit -m "feat: add commerce money and address contracts"
```

### Task 2: Versioned Consent Contract and UI

**Files:**
- Create: `jamora-web/src/lib/commerce/consent.cjs`
- Create: `jamora-web/src/lib/commerce/consent.d.cts`
- Create: `jamora-web/src/lib/commerce/consent.test.mjs`
- Modify: `jamora-web/src/components/cookie-consent.tsx`

**Interfaces:**
- Produces: `CONSENT_VERSION = "2026-07-24"`
- Produces: `parseConsent(raw)`
- Produces: `allowsPurpose(consent, purpose)`
- Produces browser event: `jamora:consent-changed`

- [ ] **Step 1: Write the failing consent test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { allowsPurpose, parseConsent } from "./consent.cjs";

test("rejects stale or malformed optional consent", () => {
  assert.equal(parseConsent('{"version":"old","analytics":true}'), null);
  assert.equal(parseConsent("bad-json"), null);
});

test("allows only explicit optional purposes", () => {
  const consent = parseConsent(JSON.stringify({
    version: "2026-07-24", necessary: true, analytics: true,
    lifecycleEmail: false, decidedAt: "2026-07-24T10:00:00.000Z",
  }));
  assert.equal(allowsPurpose(consent, "necessary"), true);
  assert.equal(allowsPurpose(consent, "analytics"), true);
  assert.equal(allowsPurpose(consent, "lifecycleEmail"), false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test src/lib/commerce/consent.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the consent contract**

```js
const CONSENT_VERSION = "2026-07-24";
function parseConsent(raw) {
  try {
    const value = JSON.parse(raw);
    if (value.version !== CONSENT_VERSION || value.necessary !== true) return null;
    if (Number.isNaN(Date.parse(value.decidedAt))) return null;
    return {
      version: CONSENT_VERSION, necessary: true,
      analytics: value.analytics === true,
      lifecycleEmail: value.lifecycleEmail === true,
      decidedAt: new Date(value.decidedAt).toISOString(),
    };
  } catch { return null; }
}
function allowsPurpose(consent, purpose) {
  return purpose === "necessary" || consent?.[purpose] === true;
}
module.exports = { CONSENT_VERSION, parseConsent, allowsPurpose };
```

Add matching declarations and run the test; expected: 2 tests PASS.

- [ ] **Step 4: Migrate the consent component**

Change the storage key to `jamora.consent.2026-07-24`, replace `marketing` with
`lifecycleEmail`, persist `version` and ISO `decidedAt`, and dispatch:

```ts
window.dispatchEvent(new CustomEvent("jamora:consent-changed", { detail: consent }));
```

The label must read `Lifecycle email` and explain that it enables opted-in cart
reminders and offers. Keep `necessary` permanently enabled.

- [ ] **Step 5: Verify**

Run from `jamora-web`:

```bash
node --test src/lib/commerce/consent.test.mjs
npm run lint
npm run build
```

Expected: tests PASS; lint and build exit 0.

- [ ] **Step 6: Commit**

```bash
git add jamora-web/src/lib/commerce/consent.* jamora-web/src/components/cookie-consent.tsx
git commit -m "feat: add versioned customer consent"
```

### Task 3: Strapi Foundation Schemas

**Files:**
- Create: `jamora-strapi/src/api/customer-account/content-types/customer-account/schema.json`
- Create: `jamora-strapi/src/api/customer-account/{controllers,routes,services}/customer-account.ts`
- Create: `jamora-strapi/src/api/customer-consent/content-types/customer-consent/schema.json`
- Create: `jamora-strapi/src/api/customer-consent/{controllers,routes,services}/customer-consent.ts`
- Create: `jamora-strapi/src/api/payment/content-types/payment/schema.json`
- Create: `jamora-strapi/src/api/payment/{controllers,routes,services}/payment.ts`
- Create: `jamora-strapi/src/api/payment-refund/content-types/payment-refund/schema.json`
- Create: `jamora-strapi/src/api/payment-refund/{controllers,routes,services}/payment-refund.ts`
- Create: `jamora-strapi/src/api/commerce-event/content-types/commerce-event/schema.json`
- Create: `jamora-strapi/src/api/commerce-event/{controllers,routes,services}/commerce-event.ts`
- Modify: `jamora-strapi/src/api/order/content-types/order/schema.json`

**Interfaces:**
- Produces Strapi UIDs: `api::customer-account.customer-account`,
  `api::customer-consent.customer-consent`, `api::payment.payment`,
  `api::payment-refund.payment-refund`, `api::commerce-event.commerce-event`.

- [ ] **Step 1: Add customer-account schema**

Use these exact attributes:

```json
{
  "email": { "type": "email", "required": true, "unique": true },
  "passwordHash": { "type": "text", "required": true, "private": true },
  "name": { "type": "string", "required": true },
  "emailVerifiedAt": { "type": "datetime" },
  "active": { "type": "boolean", "default": true, "required": true },
  "sessionVersion": { "type": "integer", "default": 0, "min": 0, "required": true },
  "verificationTokenHash": { "type": "string", "private": true },
  "verificationExpiresAt": { "type": "datetime", "private": true },
  "resetTokenHash": { "type": "string", "private": true },
  "resetExpiresAt": { "type": "datetime", "private": true }
}
```

Wrap it in the same collection-type structure used by the existing order schema.
Add standard generated controller/route/service factories.

- [ ] **Step 2: Add immutable consent and event schemas**

`customer-consent` attributes:

```json
{
  "customerDocumentId": { "type": "string" },
  "anonymousSessionId": { "type": "string" },
  "purpose": { "type": "enumeration", "enum": ["necessary", "analytics", "lifecycle_email"], "required": true },
  "granted": { "type": "boolean", "required": true },
  "policyVersion": { "type": "string", "required": true },
  "source": { "type": "string", "required": true },
  "decidedAt": { "type": "datetime", "required": true }
}
```

`commerce-event` attributes:

```json
{
  "eventId": { "type": "string", "required": true, "unique": true },
  "eventType": { "type": "string", "required": true },
  "aggregateType": { "type": "string", "required": true },
  "aggregateId": { "type": "string", "required": true },
  "payload": { "type": "json" },
  "occurredAt": { "type": "datetime", "required": true },
  "processedAt": { "type": "datetime" }
}
```

- [ ] **Step 3: Add payment and refund schemas**

Payment attributes:

```json
{
  "paymentNumber": { "type": "string", "required": true, "unique": true },
  "idempotencyKey": { "type": "string", "required": true, "unique": true },
  "subjectType": { "type": "enumeration", "enum": ["order", "membership"], "required": true },
  "subjectId": { "type": "string", "required": true },
  "method": { "type": "enumeration", "enum": ["mock", "bank_transfer", "ropay"], "required": true },
  "provider": { "type": "string", "required": true },
  "status": { "type": "enumeration", "enum": ["created", "awaiting_payment", "processing", "paid", "expired", "failed", "cancelled", "refunded"], "required": true },
  "amountMinor": { "type": "integer", "required": true, "min": 0 },
  "currency": { "type": "string", "required": true },
  "providerReference": { "type": "string" },
  "priceSnapshot": { "type": "json", "required": true },
  "paidAt": { "type": "datetime" },
  "expiresAt": { "type": "datetime" }
}
```

Refund attributes:

```json
{
  "refundNumber": { "type": "string", "required": true, "unique": true },
  "paymentDocumentId": { "type": "string", "required": true },
  "idempotencyKey": { "type": "string", "required": true, "unique": true },
  "amountMinor": { "type": "integer", "required": true, "min": 1 },
  "currency": { "type": "string", "required": true },
  "reason": { "type": "text", "required": true },
  "providerReference": { "type": "string" },
  "refundedAt": { "type": "datetime", "required": true }
}
```

- [ ] **Step 4: Extend orders additively**

Add:

```json
"customerDocumentId": { "type": "string" },
"anonymousSessionId": { "type": "string" },
"shippingAddress": { "type": "json" },
"priceSnapshot": { "type": "json" },
"paymentDocumentId": { "type": "string" }
```

Do not remove `email`, `shippingAddressText`, existing EUR cent fields, or
`stripeSessionId`.

- [ ] **Step 5: Build Strapi**

Run from `jamora-strapi`: `npm run build`

Expected: Strapi admin build exits 0 and generated content-type typing completes
without invalid schema errors.

- [ ] **Step 6: Commit**

```bash
git add jamora-strapi/src/api/customer-account jamora-strapi/src/api/customer-consent jamora-strapi/src/api/payment jamora-strapi/src/api/payment-refund jamora-strapi/src/api/commerce-event jamora-strapi/src/api/order/content-types/order/schema.json
git commit -m "feat: add commerce foundation schemas"
```

### Task 4: Customer Authentication Domain

**Files:**
- Create: `jamora-strapi/src/api/customer-auth/services/customer-credentials.cjs`
- Create: `jamora-strapi/src/api/customer-auth/services/customer-credentials.d.cts`
- Create: `jamora-strapi/src/api/customer-auth/services/customer-credentials.test.mjs`
- Create: `jamora-strapi/src/api/customer-auth/services/customer-auth.ts`
- Create: `jamora-strapi/src/api/customer-auth/controllers/customer-auth.ts`
- Create: `jamora-strapi/src/api/customer-auth/routes/customer-auth.ts`

**Interfaces:**
- Produces: `hashPassword(password)`, `verifyPassword(password, stored)`,
  `issueOpaqueToken()`, `hashOpaqueToken(token)`.
- Produces endpoints: register, verify-email, login, forgot-password,
  reset-password, and session lookup.

- [ ] **Step 1: Write credential tests**

Test that a 10-character minimum is enforced, password hashes use random salts,
correct passwords verify, incorrect passwords fail, and token hashes are stable
without storing the raw token.

```js
assert.notEqual(await hashPassword("correct horse"), await hashPassword("correct horse"));
assert.equal(await verifyPassword("correct horse", await hashPassword("correct horse")), true);
assert.equal(await verifyPassword("wrong password", await hashPassword("correct horse")), false);
const token = issueOpaqueToken();
assert.equal(hashOpaqueToken(token), hashOpaqueToken(token));
assert.notEqual(token, hashOpaqueToken(token));
```

- [ ] **Step 2: Verify failure**

Run: `node --test src/api/customer-auth/services/customer-credentials.test.mjs`
from `jamora-strapi`.

Expected: FAIL with module not found.

- [ ] **Step 3: Implement credentials**

Use Node `crypto.scrypt`, a 16-byte random salt, 64-byte derived key,
`timingSafeEqual`, 32-byte base64url opaque tokens, and SHA-256 token hashes.
Store passwords as `scrypt$<salt-base64url>$<hash-base64url>`. Reject passwords
shorter than 10 characters.

- [ ] **Step 4: Implement auth service operations**

Exact service methods:

```ts
register(input: { name: string; email: string; password: string }): Promise<SafeCustomer & { verificationToken: string }>
verifyEmail(token: string): Promise<SafeCustomer>
authenticate(email: string, password: string): Promise<SafeCustomer & { sessionVersion: number }>
requestPasswordReset(email: string): Promise<{ accepted: true; resetToken?: string }>
resetPassword(token: string, password: string): Promise<SafeCustomer>
findActiveSessionCustomer(documentId: string, sessionVersion: number): Promise<SafeCustomer | null>
```

Normalize email with `trim().toLowerCase()`. Verification and reset tokens expire
after 24 hours and 1 hour respectively. Clear token hashes after successful use.
Reset increments `sessionVersion`. Never return `passwordHash` or token hashes.
For the demo, return raw email/reset tokens only when
`NODE_ENV !== "production"`; production returns only `{ accepted: true }` until
Phase 6 supplies the email provider.

- [ ] **Step 5: Add public routes**

Routes:

```text
POST /jamora/customer/register
POST /jamora/customer/verify-email
POST /jamora/customer/login
POST /jamora/customer/forgot-password
POST /jamora/customer/reset-password
POST /jamora/customer/session
```

Controllers validate input, return `409` for duplicate registration, `401` with
`Invalid email or password.` for authentication failure, `400` for invalid or
expired tokens, and safe customer JSON on success. The session lookup route
requires `x-jamora-storefront-secret` matching
`JAMORA_STOREFRONT_API_SECRET`; the other account routes remain public.

- [ ] **Step 6: Verify and commit**

Run:

```bash
node --test src/api/customer-auth/services/customer-credentials.test.mjs
npm run build
```

Expected: tests PASS and build exits 0.

```bash
git add jamora-strapi/src/api/customer-auth
git commit -m "feat: add customer authentication domain"
```

### Task 5: Signed Customer Sessions and Next API Boundary

**Files:**
- Create: `jamora-web/src/lib/customer-session.ts`
- Create: `jamora-web/src/lib/customer-api.ts`
- Create: `jamora-web/src/app/api/jamora/customer/register/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/verify-email/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/login/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/logout/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/forgot-password/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/reset-password/route.ts`
- Create: `jamora-web/src/app/api/jamora/customer/session/route.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces cookie: `jamora_customer_session`.
- Produces: `createCustomerSession`, `readCustomerSession`,
  `setCustomerSessionCookie`, `clearCustomerSessionCookie`.

- [ ] **Step 1: Implement the signed session**

Payload:

```ts
type CustomerSession = {
  sub: string;
  email: string;
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
};
```

Encode payload as base64url JSON and sign
`HMAC-SHA256(payload, CUSTOMER_SESSION_TOKEN)`. Compare signatures using
`timingSafeEqual`. Reject malformed, tampered, and expired values. Cookie options:
`httpOnly`, `sameSite: "lax"`, `secure` in production, `path: "/"`, and 30-day
`maxAge`.

- [ ] **Step 2: Implement the server-only Strapi client**

Expose:

```ts
customerRequest<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }>
getCurrentCustomer(): Promise<SafeCustomer | null>
```

`getCurrentCustomer` reads the signed cookie and calls the private session
operation to confirm account active state and matching `sessionVersion`.

- [ ] **Step 3: Add browser-safe route handlers**

Register proxies the body. Login proxies credentials, then signs only the safe
customer document ID/email/session version returned by Strapi. Session returns
the verified safe customer. Logout clears the cookie. Never forward raw Strapi
errors or private fields.

- [ ] **Step 4: Add secrets**

Add to `.env.example`:

```dotenv
CUSTOMER_SESSION_TOKEN=change_me_customer_session_token
JAMORA_STOREFRONT_API_SECRET=change_me_storefront_to_strapi_secret
CUSTOMER_ACCOUNTS_ENABLED=false
STRUCTURED_CHECKOUT_ENABLED=false
```

Pass `JAMORA_STOREFRONT_API_SECRET` to both Strapi and the storefront. Pass
`CUSTOMER_SESSION_TOKEN` only to the storefront, with a development fallback
distinct from `ADMIN_SESSION_TOKEN`. Pass both feature flags to the storefront.
`customerRequest` adds the shared secret only for the server-side session lookup.
Customer account pages and handlers return `404` when
`CUSTOMER_ACCOUNTS_ENABLED !== "true"`.

- [ ] **Step 5: Verify and commit**

Run from `jamora-web`:

```bash
npm run lint
npm run build
```

Expected: exit 0.

```bash
git add .env.example docker-compose.yml jamora-web/src/lib/customer-* jamora-web/src/app/api/jamora/customer
git commit -m "feat: add customer session API boundary"
```

### Task 6: Customer Account UX

**Files:**
- Create: `jamora-web/src/components/customer-auth-form.tsx`
- Create: `jamora-web/src/app/account/login/page.tsx`
- Create: `jamora-web/src/app/account/register/page.tsx`
- Create: `jamora-web/src/app/account/verify/page.tsx`
- Create: `jamora-web/src/app/account/forgot-password/page.tsx`
- Create: `jamora-web/src/app/account/reset-password/page.tsx`
- Create: `jamora-web/src/app/account/page.tsx`
- Modify: `jamora-web/src/components/site-header.tsx`

**Interfaces:**
- Consumes: `/api/jamora/customer/*`.
- Produces: verified customer registration/login/recovery/account navigation.

- [ ] **Step 1: Build the shared auth form**

Support modes `login`, `register`, `forgot-password`, and `reset-password`.
Disable while submitting, keep non-password values on errors, never echo a
password, use `autocomplete` attributes, and render server messages in an
`aria-live="polite"` region.

- [ ] **Step 2: Add account routes**

Registration collects name, email, password, and password confirmation. Login
redirects to `/account`. Verify/reset pages read their token from awaited Next
16 `searchParams`. The account page calls `getCurrentCustomer()` server-side and
redirects anonymous users to `/account/login`.

- [ ] **Step 3: Add header navigation**

Render `Account` linking to `/account`; do not make customer session lookup block
the public header. The account page supplies login/logout state.

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm run lint
npm run build
```

Manually verify registration, verification, login, logout, forgot/reset, and
session revocation after reset.

```bash
git add jamora-web/src/components/customer-auth-form.tsx jamora-web/src/components/site-header.tsx jamora-web/src/app/account
git commit -m "feat: add customer account experience"
```

### Task 7: Structured Checkout Migration

**Files:**
- Create: `jamora-web/src/components/structured-address-form.tsx`
- Modify: `jamora-web/src/components/cart-view.tsx`
- Modify: `jamora-web/src/app/api/jamora/orders/mock-paid/route.ts`
- Modify: `jamora-strapi/src/api/analytics/controllers/analytics.ts`

**Interfaces:**
- Consumes: `normaliseRomanianAddress`, `validateRomanianAddress`,
  `createFxSnapshot`.
- Produces an additive checkout payload with `anonymousSessionId`,
  `shippingAddress`, and `priceSnapshot`.

- [ ] **Step 1: Add structured address form**

Fields: recipient, phone, country (locked to Romania), county, locality, postal
code, street, building, unit, and instructions. Use browser autocomplete hints.
Expose:

```ts
type StructuredAddressFormProps = {
  value: StructuredAddress;
  onChange(value: StructuredAddress): void;
  errors: string[];
};
```

No provider autocomplete is added until Phase 3; this task establishes the
provider-ready manual fallback.

- [ ] **Step 2: Migrate cart state additively**

Replace the single textarea in `CartView` with the structured component. Keep
name/email for guest checkout, generate/persist an opaque
`jamora.anonymous-session.v1` UUID, and submit:

```ts
{
  anonymousSessionId,
  customer: { name, email, address: formattedAddress },
  shippingAddress,
  priceSnapshot,
  // existing reservationToken, items, subtotalCents, shippingCents,
  // discountCents and promotionCode remain
}
```

Do not auto-create or require an account. Ordinary guest checkout retains its
current free-shipping threshold in Phase 0; membership redemption will always
charge shipping when Phase 1 adds that checkout mode. When
`STRUCTURED_CHECKOUT_ENABLED !== "true"`, render and submit the existing address
textarea so deployment can disable the migration without losing checkout.

- [ ] **Step 3: Preserve new order fields in Strapi**

In the existing mock-paid controller, normalize and validate the address,
preserve `shippingAddressText`, and also write `shippingAddress`,
`anonymousSessionId`, and `priceSnapshot`. Existing clients without the new
fields continue to work through the old text address path.

- [ ] **Step 4: Verify guest regression and commit**

Run:

```bash
cd jamora-web
node --test src/lib/commerce/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
npm run build
```

Manually verify a guest can reserve stock and place a mock-paid order without
registering; admin order detail and tracking still display the formatted address.

```bash
git add jamora-web/src/components/structured-address-form.tsx jamora-web/src/components/cart-view.tsx jamora-web/src/app/api/jamora/orders/mock-paid/route.ts jamora-strapi/src/api/analytics/controllers/analytics.ts
git commit -m "feat: add structured Romania guest checkout"
```

### Task 8: Phase 0 Integration and Documentation

**Files:**
- Modify: `BUSINESS_FLOW.md`
- Modify: `DEPLOYMENT.md`
- Modify: `CORE_FEATURE_PRESENTATION.md`

**Interfaces:**
- Consumes every Phase 0 interface.
- Produces verified deployment and demo instructions.

- [ ] **Step 1: Run the complete verification**

```bash
cd jamora-web
node --test src/lib/commerce/*.test.mjs
npm run lint
npm run build
cd ../jamora-strapi
node --test src/api/customer-auth/services/customer-credentials.test.mjs
npm run build
```

Expected: all tests PASS; both builds and lint exit 0.

- [ ] **Step 2: Run the Phase 0 smoke scenario**

Start the stack and verify in order:

1. Existing admin login still works.
2. Existing products load.
3. Guest checkout creates an order with structured Romanian address and no
   customer account.
4. Registration returns a demo verification link/token outside production.
5. Verified customer can log in and log out.
6. Password reset invalidates the earlier customer session.
7. Rejecting optional consent does not create optional consent/event records.
8. Existing tracking reveals a guest order only when the request carries its
   valid order-bound capability; order/tracking number alone stays fail-closed.

- [ ] **Step 3: Update documentation**

Document the new customer secret, account routes, consent categories, structured
Romanian address, EUR/RON snapshot, additive order fields, and the fact that
payment remains mock until Phase 2.

- [ ] **Step 4: Commit**

```bash
git add BUSINESS_FLOW.md DEPLOYMENT.md CORE_FEATURE_PRESENTATION.md
git commit -m "docs: document commerce foundation"
```

## Phase 0 Completion Gate

Phase 0 is complete only when:

- all commands in Task 8 pass;
- guest checkout remains functional without account creation;
- customer verification/login/reset works;
- optional consent is versioned and defaults off;
- orders persist structured Romania address and immutable EUR/RON snapshot;
- new payment/event schemas build successfully;
- customer accounts and structured checkout can be disabled independently;
- no new business logic was added to the large analytics controller except the
  minimal compatibility mapping required by Task 7.

After this gate, write and review the separate Phase 1 membership implementation
plan against `docs/superpowers/specs/2026-07-24-membership-commerce-expansion-design.md`.
