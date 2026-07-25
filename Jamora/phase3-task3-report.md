# Phase 3 Task 3 — Unified Delivery Checkout

## Delivery

The unified Contact → Address → Delivery → Payment → Review checkout is implemented for guest, signed-customer, and membership modes. Shipping remains server-authoritative: the browser submits normalized address and item identity, receives safe quote DTOs, and carries only the selected immutable quote into checkout.

The original implementation was committed as `e9958f1` (`feat: add unified delivery checkout`).

## Independent review hardening

All seven independent findings were reproduced and corrected with regression coverage:

1. Payments disabled now always select legacy synchronous completion for ordinary and membership checkout, with shipping either on or off. The actual `CartView` matrix proves only mock-paid or membership-finalize endpoints are used and pending-order/payment endpoints are never called.
2. Wizard navigation and submission use an immediate single-flight guard. Continue, Back, address inputs, delivery choices, retry, payment selection, and submission are disabled while an operation is active.
3. A selected quote is retained only while the normalized address/item digest is unchanged and both quote and guest capability remain live. Cart or membership-mode mutation also clears the parent shipping summary.
4. Shipping always runs address assessment before quoting, even when suggestions are disabled. Backend warning strings map to customer-friendly messages.
5. Guest capability expiry is stored and enforced. A 401 during either assessment or quote restarts one atomic assess → quote transaction exactly once with one fresh reservation; a quote cannot outlive its capability.
6. The shipping BFF reads request streams incrementally, rejects oversized declared lengths before reading, cancels chunked bodies immediately above 4,096 UTF-8 bytes, and rejects malformed or non-object JSON.
7. The address combobox uses input-owned focus and non-tabbable `role=option` elements, suppresses post-selection searching, and removes options while disabled. Step transitions focus a `tabIndex=-1` heading and announce the new step through a polite live region.

The follow-up independent review reported no Critical findings. Its Important findings (atomic quote-stage recovery, genuine DOM coverage, and the actual CartView endpoint matrix) and Minor stale-summary finding were all resolved before handoff.

## TDD and behavior coverage

- Policy tests cover the payment/shipping feature matrix, digest retention, expiry, single-flight, and exact warning messages.
- ReactDOM + Happy DOM tests exercise native clicks, disabled controls, `document.activeElement`, live announcements, combobox keyboard interaction, reservation deduplication, assess-before-quote ordering, unchanged quote retention, both 401 stages, expiry/retry, the four-case CartView endpoint matrix, and parent quote invalidation.
- Transport tests cover early Content-Length rejection, chunked-stream cancellation, multi-byte boundaries, malformed JSON, and object-only parsing.
- Strapi tests cover payments-off authoritative shipping, assessment feature gating, and shipping controller behavior.
- RED was observed for the original policy/controller gaps, quote-stage recovery, and stale parent quote behavior before the corresponding fixes were applied.

## Final verification

- `jamora-web`: `npm test` — 103 Node tests and 16 DOM/transport integration tests passed.
- `jamora-web`: `npm run lint` — 0 errors; two pre-existing `<img>` optimization warnings.
- `jamora-web`: `npm run build` — passed.
- `jamora-strapi`: `node --test` — 286 tests passed.
- `jamora-strapi`: `npm run build` — passed; 49 runtime CJS assets packaged and 96 compiled JS files validated.
- `git diff --check` — passed.
- Docker was not run.

Generated Strapi build output and updater state were restored/removed after verification.
