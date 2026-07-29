import assert from "node:assert/strict";
import test from "node:test";

import { suggestRomanianAddresses } from "./services/address-adapter.cjs";
import { assessRomanianAddress } from "./services/address-domain.cjs";
import {
  quoteShipping,
  selectShippingQuote,
} from "./services/shipping-domain.cjs";
import {
  createMemoryShipmentAdapter,
  createMockShippingProvider,
  createShipmentTransactions,
} from "./services/shipment-transaction.cjs";
import {
  createMemoryTrackingAdapter,
  createTrackingDomain,
} from "./services/tracking-domain.cjs";
import webhookGuard from "../../middlewares/shipping-webhook-guard.cjs";
import {
  createMemoryPaymentAdapter,
  createPaymentTransactions,
} from "../payment-operations/services/payment-transaction.cjs";
import shippingController, {
  createShippingOperationsController,
} from "./controllers/shipping-operations.ts";

const NOW = new Date("2026-07-29T08:00:00.000Z");
const QUOTE_SECRET = "phase3-smoke-shipping-quote-secret-32-bytes";
const LABEL_SECRET = "phase3-smoke-label-capability-secret-32-bytes";
const WEBHOOK_SECRET = "phase3-smoke-webhook-secret-at-least-32-bytes";

const address = {
  recipient: "Ana Pop",
  phone: "+40 700 000 000",
  countryCode: "RO",
  subdivisionCode: "CJ",
  locality: "Cluj-Napoca",
  postalCode: "400001",
  street: "Strada Memorandumului",
  building: "21",
  unit: "4",
  instructions: "Call on arrival",
};
const products = [{
  documentId: "product-1",
  slug: "jamu-one",
  sku: "JAMU-1",
  name: "Jamu One",
  netWeight: "90 g",
  publishedAt: "2026-07-01T00:00:00.000Z",
}];
const items = [{ slug: "jamu-one", qty: 1 }];

function environment(values, work) {
  const saved = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(work)
    .finally(() => {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

function context({ body = {}, headers = {} } = {}) {
  const safeHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  return {
    request: {
      body,
      is: (value) => value === "application/json",
    },
    get: (name) => safeHeaders[name.toLowerCase()] ?? "",
    set() {},
  };
}

test("address assistance preserves manual edits/warnings and quote selection is server-owned", () => {
  const suggested = suggestRomanianAddresses("Memorandumului")[0];
  assert.deepEqual(suggested, {
    countryCode: "RO",
    subdivisionCode: "CJ",
    locality: "Cluj-Napoca",
    postalCode: "400001",
    street: "Strada Memorandumului",
    building: "21",
  });
  const manual = assessRomanianAddress({
    ...address,
    locality: "Bucuresti",
    street: "Manual override",
  });
  assert.equal(manual.address.street, "Manual override");
  assert.deepEqual(manual.errors, []);
  assert.deepEqual(manual.warnings, [
    "locality does not match subdivisionCode",
  ]);

  const quotes = quoteShipping({ address, items, products }, {
    secret: QUOTE_SECRET,
    now: NOW,
  });
  assert.deepEqual(quotes.map(({ service, currency }) => ({
    service,
    currency,
  })), [
    { service: "standard", currency: "RON" },
    { service: "express", currency: "RON" },
  ]);
  const selection = selectShippingQuote({
    selection: quotes[0],
    address,
    items,
    products,
  }, {
    secret: QUOTE_SECRET,
    now: new Date("2026-07-29T08:01:00.000Z"),
  });
  assert.equal(selection.snapshot.amountMinor, quotes[0].amountMinor);
  assert.throws(
    () => selectShippingQuote({
      selection: { ...quotes[0], amountMinor: 1 },
      address,
      items,
      products,
    }, {
      secret: QUOTE_SECRET,
      now: new Date("2026-07-29T08:01:00.000Z"),
    }),
    /shipping quote is invalid/i,
  );
});

test("guest, customer, and membership subjects remain pending until verified settlement", async () => {
  const settlements = [];
  const adapter = createMemoryPaymentAdapter({
    resolvePaymentSubject: async (input) => ({
      ...input,
      ownerDocumentId:
        input.customerDocumentId ??
        `guest:${input.guestCheckoutCapability}`,
    }),
    settleSubject: async (payment) => {
      settlements.push(payment.subjectId);
    },
  });
  const payments = createPaymentTransactions(adapter, {
    env: { PAYMENTS_ENABLED: "true" },
    beneficiary: {
      name: "Jamora SRL",
      iban: "RO49AAAA1B31007593840000",
      bank: "Banca Jamora",
    },
  });
  const subjects = [
    {
      subjectId: "order-guest",
      subjectType: "order",
      purpose: "order",
      guestCheckoutCapability: "rsv_guest",
    },
    {
      subjectId: "order-customer",
      subjectType: "order",
      purpose: "order",
      customerDocumentId: "customer-1",
    },
    {
      subjectId: "membership-order-1",
      subjectType: "order",
      purpose: "order",
      customerDocumentId: "customer-1",
      membershipDocumentId: "membership-1",
    },
  ];
  const created = [];
  for (const [index, subject] of subjects.entries()) {
    const payment = await payments.prepareBankTransfer({
      idempotencyKey: `phase3:${subject.subjectId}`,
      ...subject,
      orderDocumentId: subject.subjectId,
      amountMinor: 2_490,
      currency: "RON",
      priceSnapshot: {
        charge: { amountMinor: 2_490, currency: "RON" },
        shipping: { amountMinor: 2_490, currency: "RON" },
      },
      now: NOW,
    });
    assert.equal(payment.status, "awaiting_payment");
    created.push(payment);
    await payments.recordBankReceipt({
      paymentDocumentId: payment.documentId,
      amountMinor: 2_490,
      currency: "RON",
      receivedAt: new Date(NOW.getTime() + index + 1),
      actor: "owner@example.test",
      providerEventId: `phase3:receipt:${index}`,
    });
  }
  assert.deepEqual(settlements, subjects.map(({ subjectId }) => subjectId));
  assert.equal(
    created.every((payment) =>
      adapter.payments.get(payment.documentId).status === "paid"),
    true,
  );
});

test("paid packed warehouse shipment uses private single-use label authorization", async () => {
  const order = {
    documentId: "order-1",
    orderNumber: "JMR-PHASE3-1",
    status: "processing",
    stripeSessionId: "mock-paid-checkout",
    packedAt: "2026-07-29T07:59:00.000Z",
    packedBy: "warehouse@example.test",
    items: [{
      productId: "product-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      qty: 1,
    }],
    batchAllocations: [{
      productDocumentId: "product-1",
      batchDocumentId: "batch-1",
      batchNumber: "LOT-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      qty: 1,
    }],
    fulfilmentChecklist: [{
      productId: "product-1",
      batchDocumentId: "batch-1",
      batchNumber: "LOT-1",
      sku: "JAMU-1",
      name: "Jamu One",
      qty: 1,
      scannedQty: 1,
      checked: true,
    }],
    shippingSnapshot: {
      carrier: "jamora-mock",
      service: "standard",
      quoteId: "phase3-quote",
    },
    shippingAddress: address,
  };
  const provider = createMockShippingProvider();
  const adapter = createMemoryShipmentAdapter({
    orders: [order],
    products,
    batches: [{
      documentId: "batch-1",
      productDocumentId: "product-1",
      batchNumber: "LOT-1",
      slug: "jamu-one",
      sku: "JAMU-1",
    }],
  });
  const shipments = createShipmentTransactions({
    adapter,
    provider,
    capabilitySecret: LABEL_SECRET,
    capabilityTtlSeconds: 30,
  });
  const created = await shipments.createShipment({
    orderDocumentId: order.documentId,
    actor: "warehouse@example.test",
    now: NOW,
  });
  assert.equal(created.shipment.status, "label_created");
  assert.equal(JSON.stringify(created).includes("labelReference"), false);

  const issued = await shipments.createLabelCapability({
    shipmentDocumentId: created.shipment.documentId,
    format: "pdf",
    actor: "warehouse@example.test",
    now: NOW,
  });
  await assert.rejects(
    shipments.downloadLabel({
      shipmentDocumentId: created.shipment.documentId,
      capability: `${issued.capability.slice(0, -1)}x`,
      now: new Date("2026-07-29T08:00:01.000Z"),
    }),
    /invalid label capability/i,
  );
  const label = await shipments.downloadLabel({
    shipmentDocumentId: created.shipment.documentId,
    capability: issued.capability,
    now: new Date("2026-07-29T08:00:01.000Z"),
  });
  assert.equal(label.contentType, "application/pdf");
  await assert.rejects(
    shipments.downloadLabel({
      shipmentDocumentId: created.shipment.documentId,
      capability: issued.capability,
      now: new Date("2026-07-29T08:00:02.000Z"),
    }),
    /used label capability/i,
  );
});

test("signed tracking is replay-safe, monotonic, and shares its path with bounded polling", async () => {
  const awb = "JMR000000000000000001";
  const adapter = createMemoryTrackingAdapter({
    shipments: [{
      documentId: "shipment-1",
      orderDocumentId: "order-1",
      orderNumber: "JMR-PHASE3-1",
      provider: "jamora-mock",
      carrier: "jamora-mock",
      service: "standard",
      awb,
      status: "label_created",
      trackingProgressStatus: "label_created",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    }],
  });
  const domain = createTrackingDomain({
    adapter,
    provider: {
      async pollTracking(shipment) {
        return {
          providerEventId: "phase3:poll:1",
          provider: "jamora-mock",
          awb: shipment.awb,
          status: "out_for_delivery",
          occurredAt: "2026-07-29T08:03:00.000Z",
        };
      },
    },
  });
  const payload = {
    providerEventId: "phase3:webhook:1",
    provider: "jamora-mock",
    awb,
    status: "in_transit",
    occurredAt: "2026-07-29T08:01:00.000Z",
  };
  const timestamp = String(Math.floor(NOW.getTime() / 1_000));
  const signature = webhookGuard.signTrackingWebhook({
    payload,
    timestamp,
    secret: WEBHOOK_SECRET,
  });
  const verified = webhookGuard.verifyTrackingWebhook({
    payload,
    providerHeader: "jamora-mock",
    timestamp,
    signature,
    secret: WEBHOOK_SECRET,
    now: NOW,
  });
  assert.equal((await domain.applyTrackingEvent({
    event: verified,
    source: "webhook",
    receivedAt: new Date("2026-07-29T08:01:01.000Z"),
  })).applied, true);
  assert.equal((await domain.applyTrackingEvent({
    event: verified,
    source: "webhook",
    receivedAt: new Date("2026-07-29T08:01:02.000Z"),
  })).idempotent, true);
  const regression = await domain.applyTrackingEvent({
    event: {
      providerEventId: "phase3:webhook:regression",
      provider: "jamora-mock",
      awb,
      status: "picked_up",
      occurredAt: "2026-07-29T08:02:00.000Z",
    },
    source: "webhook",
    receivedAt: new Date("2026-07-29T08:02:01.000Z"),
  });
  assert.equal(regression.outcome, "ignored_out_of_order");
  assert.deepEqual(await domain.pollOpenShipments({
    limit: 1,
    now: new Date("2026-07-29T08:03:01.000Z"),
  }), {
    attempted: 1,
    applied: 1,
    replayed: 0,
    ignored: 0,
    failed: 0,
  });
  assert.equal(adapter.shipments.get("shipment-1").status, "out_for_delivery");
});

test("feature-off controller keeps manual structured address usable and hides provider surfaces", async () => {
  const manual = assessRomanianAddress(address);
  assert.deepEqual(manual.errors, []);
  let providerCalls = 0;
  const controller = createShippingOperationsController({
    shipmentTransactions: () => {
      providerCalls += 1;
      return {};
    },
    trackingDomain: () => {
      providerCalls += 1;
      return {};
    },
  });
  await environment({
    ADDRESS_ASSIST_ENABLED: "false",
    SHIPPING_ENABLED: "false",
  }, async () => {
    for (const handler of [
      shippingController.suggestAddress,
      controller.quoteShipping,
      controller.createShipment,
      controller.trackingWebhook,
    ]) {
      const ctx = context();
      ctx.params = { orderDocumentId: "order-1" };
      await handler(ctx);
      assert.equal(ctx.status, 404);
      assert.deepEqual(ctx.body, { error: "Not found." });
    }
  });
  assert.equal(providerCalls, 0);
});
