# Membership Commerce Expansion Design

## Goal

Evolve Jamora from a one-time-purchase demo into a Romania-first commerce
platform that supports prepaid membership credits, customer and affiliate
accounts, guest checkout, assisted addressing, provider-backed fulfilment,
affiliate commissions, detailed behavioral analytics, OpenAI-generated
insights, and lifecycle email.

The work is delivered as seven incremental phases. Each phase must leave a
demonstrable end-to-end flow and a safe disable path.

## Confirmed Business Rules

- A membership is prepaid for 3, 6, or 12 months and renewed manually.
- Each plan has an admin-configurable number of package credits.
- Members redeem credits during checkout and always pay shipping.
- Unused credits expire when the membership period ends.
- Membership requires a verified customer account with email/password login and
  password recovery.
- One-time purchases remain available to guests without creating an account.
- Romania is the first shipping market, but address and provider boundaries must
  support later EU expansion.
- Affiliate attribution uses a 30-day last-click window; a valid affiliate code
  entered at checkout overrides link attribution.
- Affiliate commission becomes approved only after the return/refund window.
- Affiliates are invited by an admin and receive their own account and dashboard.
- Behavioral tracking may connect anonymous and identified activity only with
  the required consent.
- OpenAI explains deterministic, aggregated metrics and never calculates the
  source-of-truth figures.
- Abandoned-cart email is sent after 1 hour and again after 24 hours when the
  customer is eligible and the checkout remains incomplete.
- The launch storefront displays reference prices in EUR and checkout prices in
  RON. RoPay settlement is in RON.

## Architecture

### Ownership

- **Strapi/PostgreSQL** is the source of truth for accounts, membership plans,
  memberships, credit entries, payments, orders, addresses, shipments,
  affiliates, commissions, consent, behavioral events, jobs, and notification
  logs.
- **Next.js storefront** owns guest/customer UX, authentication screens,
  checkout, address assistance, and customer/affiliate dashboards.
- **Next.js Admin** owns plan configuration, payment reconciliation, fulfilment,
  affiliate operations, analytics, AI insight requests, and notification
  monitoring.
- External services are isolated behind provider interfaces rather than called
  directly from domain controllers.

### Provider Interfaces

- `PaymentProvider`: creates a payment request, verifies callbacks, queries
  status, and initiates or records refunds.
- `AddressProvider`: searches address suggestions and resolves a suggestion to
  structured address fields.
- `ShippingProvider`: quotes services, creates/cancels shipments, obtains labels,
  and retrieves tracking events.
- `EmailProvider`: sends a versioned template and returns a delivery reference.
- `InsightProvider`: generates narrative insight from an aggregated metrics
  payload.

The demo retains mock implementations using the same contracts. RoPay and the
carrier remain unconfigured until the customer selects and contracts with a
participating acquiring bank/payment processor and carrier.

### Domain Events and Jobs

Important state changes produce domain events such as:

- `checkout.started`;
- `payment.completed`;
- `membership.activated`;
- `membership.credit_redeemed`;
- `shipment.status_changed`;
- `affiliate.commission_approved`;
- `cart.abandoned`.

Jobs process provider callbacks, membership expiry, credit release, tracking
sync, commission approval, and email delivery. A job has `pending`, `running`,
`succeeded`, `failed`, or `dead` status and an idempotency key.

New domain services must not be added to the existing oversized analytics
controller. Each domain receives a focused service boundary and test surface.

## Phase 0: Commerce Foundation

### Customer and Guest Identity

Create a customer account model containing normalized unique email, password
hash, email verification state, active state, profile fields, and session
version. Password reset uses an expiring, single-use token. Authentication
errors do not reveal whether an email exists.

Guest checkout uses an opaque `anonymousSessionId` and never creates an account
implicitly. A verified account may claim earlier guest orders that used the same
email. Anonymous behavioral history is connected to the customer only when the
applicable consent permits it.

Customer, affiliate, and staff identities have separate authorization
boundaries even if one person uses the same email in multiple roles.

### Consent

Store versioned consent records with purpose, state, source, timestamp, and
policy version. At minimum, distinguish essential processing, behavioral
analytics, and lifecycle/marketing email. Withdrawing optional consent stops new
processing and triggers the applicable anonymization or suppression workflow.

### Money and Currency

Money is stored in integer minor units with an ISO currency code. Orders,
memberships, payments, and refunds retain immutable price snapshots.

EUR is the reference/display currency and RON is the RoPay settlement currency.
The checkout snapshot records:

- EUR reference amount;
- RON charged amount;
- exchange rate;
- rate source;
- rate timestamp.

Historical invoices and payments never change when a later exchange rate
changes.

### Structured Address

Use structured fields for recipient, phone, country code, subdivision/county
code, locality, postal code, street, building, unit, instructions, and a
formatted snapshot. Romania is initially the only enabled country, while ISO
country/subdivision fields keep the model EU-ready.

Address assistance may fill fields from a provider suggestion, but customers
can edit or enter an address manually. Provider failure must not erase input.

### Payment State

A shared payment record contains method, provider, currency, amount, status,
provider reference, order or membership reference, and timestamps. The
normalized lifecycle is:

`created -> awaiting_payment -> processing -> paid`

Terminal alternatives are `expired`, `failed`, `cancelled`, and `refunded`;
partial refunds are recorded as immutable refund entries.

Provider callbacks and manual reconciliation are idempotent. A duplicate
confirmation cannot create another order, activate membership twice, consume
stock twice, or create another commission.

## Phase 1: Membership

### Membership Plan

An admin-configurable plan contains:

- name and active state;
- duration of 3, 6, or 12 months;
- EUR reference price and current RON checkout price;
- number of granted package credits;
- eligibility rules or eligible product/package identifiers.

A redeemable product has an integer `creditCost`, defaulting to one.

### Membership and Ledger

A membership stores the customer, immutable plan snapshot, start/end time,
status, and originating payment. The status is `pending_payment`, `active`,
`expired`, `cancelled`, or `refunded`.

Credit is accounted for in an immutable ledger:

- `grant`;
- `reserve`;
- `release`;
- `redeem`;
- `reverse`;
- `expire`;
- `admin_adjustment`.

Each entry records amount, membership, order/checkout reference, actor, reason,
and idempotency key. A cached remaining balance may be stored for performance,
but the ledger is authoritative.

Checkout reserves credits and stock together. Payment failure or expiry releases
both. Successful shipping payment turns the reservation into redemption. The
redeemed merchandise value is zero on the checkout, while VAT presentation and
shipping charges remain explicit.

At membership expiry, an idempotent job posts an `expire` entry for the unused
balance. Renewal creates a new paid membership period and new grant; it does not
rewrite the previous period.

Admin adjustment requires a reason and audit entry.

### Member Experience

The customer dashboard shows plan, active period, remaining/used/expired
credits, eligible packages, ledger history, orders, and a manual renewal action.
Checkout clearly separates credit-covered merchandise from customer-paid
shipping.

## Phase 2: Bank Transfer and RoPay

### Manual Bank Transfer

Manual transfer creates an `awaiting_payment` record with merchant beneficiary
details, IBAN, amount, currency, expiry, and a unique payment reference. Admin
reconciliation records the received amount, bank reference, confirmation time,
and confirming staff identity.

Underpayment or mismatched currency remains unresolved for manual review.
Overpayment does not silently alter the order and requires a recorded resolution.

### RoPay

RoPay is integrated through the acquiring bank or payment processor selected by
the customer. Desktop checkout may display a provider-generated QR; mobile
checkout may use a supported banking-app deep link.

Only a verified provider callback or server-to-server status verification can
mark the payment paid. Browser redirects are advisory and never activate a
membership or finalize an order.

Until credentials and a provider contract exist, a RoPay mock adapter simulates
the same request and signed-callback lifecycle.

Manual bank transfer remains a fallback when RoPay is unavailable.

## Phase 3: Address-Assisted Checkout and Shipping

Checkout uses the steps:

`contact -> address -> delivery -> payment -> review`

The same flow supports guests, ordinary customers, and membership redemption.
Selecting an address suggestion fills street, building, locality, county, postal
code, and country. Manual correction is always available. Incomplete or
inconsistent fields produce a warning rather than treating the provider as an
infallible validator.

Once the address is complete, the shipping adapter returns available services.
The chosen carrier, service, price, currency, and delivery estimate are stored
as an order snapshot.

After payment, warehouse staff create the shipment. The provider returns an AWB
or tracking number and a label reference/short-lived URL in PDF or ZPL format.
Provider credentials and unrestricted label URLs never reach the browser.

Provider tracking states normalize to:

- `label_created`;
- `picked_up`;
- `in_transit`;
- `out_for_delivery`;
- `delivered`;
- `exception`;
- `returned`.

Signed webhooks are preferred, with a polling job as fallback. Duplicate or
out-of-order updates cannot move a shipment backward. The existing demo label
and tracking behavior become the mock provider.

## Phase 4: Affiliate Program

### Accounts and Attribution

Admin invites affiliates; self-registration is outside this program. An
affiliate account can access only its own campaign, performance, commission, and
payout data.

Links use opaque referral tokens. A valid click creates a first-party
attribution record/cookie for 30 days when consent permits. The latest valid
click wins. A valid affiliate promotion code entered at checkout overrides link
attribution.

The order stores an immutable attribution snapshot containing affiliate,
campaign, link/code, landing page, and attribution timestamp.

### Commission

Customer discount and affiliate commission rate are independent configuration.
Commission uses eligible merchandise net of discount and excludes VAT and
shipping.

Commission states are:

`pending -> approved -> paid`

`reversed` is available for cancellation, refund, chargeback, fraud, or invalid
self-referral. Payment creates a pending commission. An idempotent job approves
it only after the configured return/refund window. Partial refund reverses the
proportional amount.

Admin records payout reference, amount, date, notes, and actor. Automated payout
transfer is outside this phase.

### Affiliate Experience

The dashboard shows clicks, conversion rate, masked attributed orders,
pending/approved/paid balances, and payout history. It must not expose customer
addresses, full email addresses, or unrelated order data.

## Phase 5: Behavioral Analytics and OpenAI Insight

### Event Collection

The initial event taxonomy includes:

- `product.viewed`;
- `cart.item_added`;
- `cart.item_removed`;
- `checkout.started`;
- `checkout.address_completed`;
- `checkout.payment_started`;
- `payment.completed`;
- `membership.purchased`;
- `membership.credit_redeemed`.

An event records timestamp, event version, product/order/campaign references
when relevant, anonymous session or customer reference, source/UTM, device class,
and consent state. Optional analytics events are not collected before consent.

Raw event retention is limited and configurable. Aggregates may be retained
longer. Consent withdrawal and verified privacy requests support deletion or
anonymization without corrupting financial/order records that have a separate
legal retention basis.

### Deterministic Dashboard

Date filters and period comparisons support:

- top products by units and revenue;
- views, cart additions, checkout starts, and purchases per product;
- step conversion and drop-off rates;
- cart and checkout abandonment;
- affiliate/campaign acquisition and conversion;
- repeat purchase and cohorts;
- membership purchase, redemption, and unused-credit expiry.

All figures are produced by application queries or aggregate tables, never by an
LLM.

### OpenAI Insight

An admin explicitly requests insight for the current aggregate dataset. The
payload contains metrics, deltas, period, and a minimum-sample indicator. It
must not contain customer name, email, postal address, raw IP, or individual
browsing timeline.

The response must distinguish observed facts from hypotheses, cite the analyzed
period, and use only figures present in the input. Save model, prompt version,
dataset fingerprint, request time, token/cost metadata when available, and the
result for audit.

If OpenAI is unavailable, the deterministic dashboard remains fully functional.

## Phase 6: Lifecycle Email

A cart becomes eligible for abandoned-cart email only after the system has a
valid email and the required lifecycle/marketing consent.

- Reminder one is scheduled after 1 hour without qualifying activity.
- Reminder two is scheduled after 24 hours if checkout is still incomplete.
- New cart activity may reschedule the first reminder.
- Payment completion, an empty cart, unsubscribe, consent withdrawal, or the
  second successful send cancels remaining jobs.
- No automatic discount is attached.
- Recovery links use an opaque, expiring token rather than exposing a cart ID.

The notification log stores customer/guest reference, template and version,
schedule, status, provider ID, attempts, failure reason, and timestamps.
Transient failures retry with a bounded backoff. Hard bounce and unsubscribe add
the address to a suppression list. An idempotency key prevents duplicate sends.

Admin can inspect delivery status and disable a reminder rule.

## Reliability and Security

- Verify every external webhook with the provider's signature or secret.
- Persist webhook receipts and idempotency keys.
- Use database transactions for payment confirmation, credit/stock reservation,
  order finalization, and commission creation where supported; otherwise define
  explicit compensating actions.
- Enforce unique constraints for payment references, credit operations,
  commissions, and notification sends.
- Apply password hashing, email verification, single-use reset tokens, session
  revocation, rate limiting, and authorization checks to customer and affiliate
  accounts.
- Audit account, payment, address, consent, affiliate, commission, and AI
  operations without storing passwords, provider secrets, or unnecessary PII.
- Do not write sensitive customer data to application logs.

Provider degradation behaves as follows:

- address provider unavailable: allow manual address entry;
- shipping provider unavailable: preserve checkout and allow retry before
  shipment selection/finalization;
- RoPay unavailable: offer manual bank transfer;
- email provider unavailable: retry and expose the failed job to admin;
- OpenAI unavailable: keep deterministic analytics available.

## Feature Flags and Migration

Use independent flags for:

- customer accounts;
- membership;
- live payments;
- live shipping;
- affiliate portal;
- optional analytics;
- AI insight;
- lifecycle email.

Schema changes are additive. Existing demo orders, tracking pages, and mock-paid
flows remain readable during migration. Each phase includes seed/demo fixtures
and a documented disable path.

## Testing

### Unit

- money and exchange-rate snapshots;
- password/token/session behavior;
- credit grant, reservation, release, redemption, reversal, and expiry;
- attribution precedence and 30-day expiry;
- commission, return-window approval, and partial refund;
- event aggregation and consent filtering;
- abandoned-cart scheduling/cancellation and idempotency.

### Contract and Integration

- provider adapter contracts;
- duplicate and out-of-order provider callbacks;
- manual transfer reconciliation;
- atomic credit and stock reservation/release;
- payment finalization and duplicate prevention;
- tracking normalization;
- job retry/dead-letter behavior;
- AI payload PII exclusion.

### End to End

- guest one-time purchase without account creation;
- account verification and password recovery;
- membership purchase and credit redemption with paid shipping;
- membership expiry and manual renewal;
- manual transfer and simulated signed RoPay callback;
- address assistance with manual fallback;
- shipment label creation and tracking;
- affiliate link/code conversion and dashboard;
- product funnel analytics and OpenAI insight;
- abandoned-cart sends and payment cancellation.

Build, lint, unit, integration, and relevant end-to-end verification run for both
Next.js and Strapi at each phase.

## Delivery Order

1. **Phase 0 — Commerce foundation**
2. **Phase 1 — Membership**
3. **Phase 2 — Manual transfer and RoPay**
4. **Phase 3 — Address-assisted checkout and shipping**
5. **Phase 4 — Affiliate program**
6. **Phase 5 — Behavioral analytics and OpenAI insight**
7. **Phase 6 — Lifecycle email**

Each phase is complete only when its migrations, domain services, provider mock
or live adapter, admin UI, storefront/account flow, tests, fixtures, and disable
path are present.

## Out of Scope

- recurring/automatic membership renewal;
- free shipping as a membership benefit;
- affiliate self-registration;
- automated affiliate payout transfer;
- selecting or contracting a specific address, bank/payment, carrier, or email
  provider on the customer's behalf;
- using AI as the source of truth for metrics or automated business actions;
- non-Romanian live shipping rollout in this program.

## Success Criteria

1. Guests can complete one-time checkout without creating an account.
2. Verified customers can buy prepaid membership, see an auditable credit
   balance, redeem eligible packages, and pay shipping.
3. Manual transfer and RoPay-compatible flows cannot activate value twice.
4. Romanian checkout captures a structured, assisted address and produces a
   provider-neutral shipment/label/tracking record.
5. Affiliate link/code attribution, delayed commission approval, refund
   reversal, and payout history are auditable.
6. Admin can compare product funnels and abandonment by period and request an
   OpenAI explanation without disclosing direct personal data.
7. Eligible abandoned carts receive at most the configured 1-hour and 24-hour
   emails, and completion/withdrawal reliably suppresses later sends.
8. Existing demo data and flows remain readable throughout incremental rollout.
