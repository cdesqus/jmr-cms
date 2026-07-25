# Membership Redemption Payment Enforcement Design

## Goal

When `PAYMENTS_ENABLED=true`, membership credit redemption must create a pending
server order and complete only after verified payment settlement. Direct
customer finalize and legacy mock-paid paths must not redeem credits.

## Architecture

The membership checkout service remains the authority for reserved inventory,
credits, customer ownership, shipping, and totals. A new idempotent
`preparePendingOrder` operation locks the checkout, validates its immutable
bindings, creates or returns a pending order from the authoritative checkout
snapshot, and binds the order to the checkout. The cart then creates an
order-purpose payment for that order.

Verified settlement preserves checkout -> order -> payment lock ordering. A
membership-bound order skips ordinary stock-reservation settlement and invokes
membership checkout finalization inside the payment transaction. Any failure
rolls back payment, order, credit redemption, checkout, and inventory state
together.

When payments are disabled, the existing mock-paid adapter remains available
for local/test operation. When enabled, both the customer finalize controller
and the mock-paid BFF return not found.

## Immutable Bindings

The pending order copies and binds:

- checkout reference and document ID;
- authenticated customer document ID;
- membership document ID;
- authoritative item snapshot and quantities;
- authoritative shipping address and delivery metadata;
- subtotal, delivery fee, discount, total, and currency.

An existing bound order is returned only when every binding still matches.
Otherwise preparation or settlement fails closed.

## Customer Experience

Membership checkout under payments-enabled mode uses the same manual/RoPay
selector and payment instruction/status surface as ordinary checkout. The
client never calls finalize. It displays provider instructions and polls until
a terminal status.

The client treats the server-provided `expiresAt` as authoritative. At that
instant, any still-expirable snapshot becomes locally `expired`, action links
are removed, and polling stops even if no later server response arrives.

## Expiry Sweep

Both `awaiting_payment` and `pending_provider` are expirable. The sweep locks
each due payment row, rechecks status and expiry, and writes one deterministic
expiry event. Concurrent or repeated sweeps are idempotent.

## Test Strategy

- direct finalize and mock-paid calls cannot redeem with payments enabled;
- reserving and preparing an order without settlement leaves credits reserved;
- verified settlement finalizes the order and redeems credits exactly once;
- settlement failure rolls back all nested membership and payment mutations;
- pending-provider expiry is row-locked and event-idempotent;
- payment UI locally transitions to expired and stops polling at `expiresAt`.

