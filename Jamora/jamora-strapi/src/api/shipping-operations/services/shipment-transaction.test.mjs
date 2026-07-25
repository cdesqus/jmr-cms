import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryShipmentAdapter,
  createMockShippingProvider,
  createShipmentTransactions,
} from "./shipment-transaction.cjs";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const CAPABILITY_SECRET = "test-label-capability-secret-32-bytes";

function packedOrder(overrides = {}) {
  return {
    documentId: "order-1",
    orderNumber: "JMR-1001",
    status: "processing",
    stripeSessionId: "mock-paid-checkout",
    packedAt: "2026-07-25T11:59:00.000Z",
    packedBy: "Warehouse One",
    items: [{
      productId: "product-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      qty: 1,
    }],
    batchAllocations: [{
      productDocumentId: "product-1",
      slug: "jamu-one",
      sku: "JAMU-1",
      name: "Jamu One",
      batchDocumentId: "batch-1",
      batchNumber: "LOT-1",
      qty: 1,
    }],
    fulfilmentChecklist: [
      {
        productId: "product-1",
        sku: "JAMU-1",
        name: "Jamu One",
        batchDocumentId: "batch-1",
        batchNumber: "LOT-1",
        qty: 1,
        scannedQty: 1,
        checked: true,
      },
    ],
    shippingSnapshot: {
      carrier: "jamora-mock",
      service: "standard",
      quoteId: "quote-1",
    },
    shippingAddress: {
      recipient: "Ana Pop",
      countryCode: "RO",
      locality: "Cluj-Napoca",
      postalCode: "400001",
      street: "Strada Memorandumului",
      building: "21",
    },
    ...overrides,
  };
}

const defaultProducts = [{
  documentId: "product-1",
  slug: "jamu-one",
  sku: "JAMU-1",
  name: "Jamu One",
  publishedAt: "2026-07-01T00:00:00.000Z",
}];

const defaultBatches = [{
  documentId: "batch-1",
  productDocumentId: "product-1",
  slug: "jamu-one",
  sku: "JAMU-1",
  batchNumber: "LOT-1",
}];

function recordingProvider(overrides = {}) {
  const calls = { create: [], cancel: [], label: [] };
  return {
    carrier: "jamora-mock",
    calls,
    async createShipment(order) {
      calls.create.push(structuredClone(order));
      return {
        awb: `AWB-${order.orderNumber}`,
        labelReference: `lbl_${order.documentId}`,
        labelFormats: ["pdf", "zpl"],
        providerSecret: "must-never-persist",
        labelUrl: "https://provider.example/private/permanent-label",
      };
    },
    async cancelShipment(shipment) {
      calls.cancel.push(structuredClone(shipment));
    },
    async downloadLabel(input) {
      calls.label.push(structuredClone(input));
      return input.format === "pdf"
        ? {
            contentType: "application/pdf",
            body: Buffer.from("%PDF-1.4\nmock\n%%EOF", "utf8"),
            providerUrl: "https://provider.example/private/label.pdf",
          }
        : {
            contentType: "application/vnd.zebra-zpl",
            body: Buffer.from("^XA^FO20,20^FDAWB^FS^XZ", "utf8"),
          };
    },
    ...overrides,
  };
}

function service({
  orders = [packedOrder()],
  payments = [],
  products = defaultProducts,
  batches = defaultBatches,
  provider = recordingProvider(),
  adapterOptions = {},
} = {}) {
  const adapter = createMemoryShipmentAdapter({
    orders,
    payments,
    products,
    batches,
    ...adapterOptions,
  });
  return {
    adapter,
    provider,
    transactions: createShipmentTransactions({
      adapter,
      provider,
      capabilitySecret: CAPABILITY_SECRET,
      capabilityTtlSeconds: 30,
    }),
  };
}

test("rejects unpaid, unpacked, and foreign-carrier orders before provider access", async () => {
  for (const order of [
    packedOrder({ status: "pending" }),
    packedOrder({ stripeSessionId: null }),
    packedOrder({ packedAt: null }),
    packedOrder({ fulfilmentChecklist: [{ name: "Jamu One", qty: 1, checked: false }] }),
    packedOrder({ shippingSnapshot: { carrier: "foreign-carrier", service: "standard" } }),
  ]) {
    const provider = recordingProvider();
    const { transactions } = service({ orders: [order], provider });
    await assert.rejects(
      transactions.createShipment({
        orderDocumentId: order.documentId,
        actor: "warehouse@example.test",
        now: NOW,
      }),
      /paid|pack|carrier/i,
    );
    assert.equal(provider.calls.create.length, 0);
  }
});

test("locks packing inventory in the global batch-before-product order", async () => {
  const { adapter, transactions } = service();

  await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });

  assert.deepEqual(adapter.lockLog, ["batches", "products"]);
});

test("packing must exactly bind authoritative order items, batches, products, and scanned quantities", async () => {
  const exact = packedOrder();
  const checklist = exact.fulfilmentChecklist[0];
  const invalidOrders = [
    packedOrder({ fulfilmentChecklist: [{ ...checklist, productId: "product-attacker" }] }),
    packedOrder({ fulfilmentChecklist: [{ ...checklist, sku: "WHOLESALE-SKU" }] }),
    packedOrder({ fulfilmentChecklist: [{ ...checklist, batchDocumentId: "batch-attacker" }] }),
    packedOrder({ fulfilmentChecklist: [{ ...checklist, batchNumber: "WHOLESALE-LOT" }] }),
    packedOrder({ fulfilmentChecklist: [{ ...checklist, qty: 100, scannedQty: 100 }] }),
    packedOrder({ fulfilmentChecklist: [{ ...checklist, scannedQty: 2 }] }),
    packedOrder({ fulfilmentChecklist: [checklist, { ...checklist }] }),
  ];

  for (const order of invalidOrders) {
    const provider = recordingProvider();
    const { transactions } = service({ orders: [order], provider });
    await assert.rejects(
      transactions.createShipment({
        orderDocumentId: order.documentId,
        actor: "warehouse@example.test",
        now: NOW,
      }),
      /packing|packed/i,
    );
    assert.equal(provider.calls.create.length, 0);
  }

  for (const inventory of [
    {
      products: [{ ...defaultProducts[0], sku: "LIVE-OTHER" }],
      batches: defaultBatches,
    },
    {
      products: defaultProducts,
      batches: [{ ...defaultBatches[0], batchNumber: "LIVE-OTHER" }],
    },
  ]) {
    const provider = recordingProvider();
    const { transactions } = service({
      orders: [exact],
      provider,
      ...inventory,
    });
    await assert.rejects(
      transactions.createShipment({
        orderDocumentId: exact.documentId,
        actor: "warehouse@example.test",
        now: NOW,
      }),
      /packing|inventory|product|batch/i,
    );
    assert.equal(provider.calls.create.length, 0);
  }
});

test("requires the referenced payment to be paid and bound to the exact order and money", async () => {
  const paidOrder = packedOrder({
    stripeSessionId: null,
    paymentDocumentId: "payment-1",
    priceSnapshot: {
      charge: { amountMinor: 4200, currency: "RON" },
    },
  });
  const validPayment = {
    documentId: "payment-1",
    status: "paid",
    subjectType: "order",
    subjectId: "order-1",
    orderDocumentId: "order-1",
    amountMinor: 4200,
    currency: "RON",
  };
  for (const payment of [
    { ...validPayment, status: "failed" },
    { ...validPayment, orderDocumentId: "foreign-order", subjectId: "foreign-order" },
    { ...validPayment, amountMinor: 4100 },
    { ...validPayment, currency: "EUR" },
  ]) {
    const provider = recordingProvider();
    const { transactions } = service({
      orders: [paidOrder],
      payments: [payment],
      provider,
    });
    await assert.rejects(
      transactions.createShipment({
        orderDocumentId: paidOrder.documentId,
        actor: "warehouse@example.test",
        now: NOW,
      }),
      /paid order/i,
    );
    assert.equal(provider.calls.create.length, 0);
  }

  const missingCurrency = service({
    orders: [packedOrder({
      stripeSessionId: null,
      paymentDocumentId: "payment-1",
      priceSnapshot: { charge: { amountMinor: 4200 } },
    })],
    payments: [{ ...validPayment, currency: undefined }],
  });
  await assert.rejects(
    missingCurrency.transactions.createShipment({
      orderDocumentId: paidOrder.documentId,
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /paid order/i,
  );

  const valid = service({
    orders: [paidOrder],
    payments: [validPayment],
  });
  const created = await valid.transactions.createShipment({
    orderDocumentId: paidOrder.documentId,
    actor: "warehouse@example.test",
    now: NOW,
  });
  assert.equal(created.idempotent, false);
  assert.equal(valid.adapter.orders.get("order-1").status, "shipped");
});

test("row-locked concurrent creation is idempotent and persists no provider URL or secret", async () => {
  const { adapter, provider, transactions } = service();

  const results = await Promise.all([
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "owner@example.test",
      now: NOW,
    }),
  ]);

  assert.equal(provider.calls.create.length, 1);
  assert.equal(adapter.shipments.size, 1);
  assert.deepEqual(results.map((result) => result.idempotent).sort(), [false, true]);
  assert.equal(results[0].shipment.documentId, results[1].shipment.documentId);
  const persisted = [...adapter.shipments.values()][0];
  assert.equal(persisted.awb, "AWB-JMR-1001");
  assert.equal(persisted.status, "label_created");
  assert.deepEqual(persisted.labelFormats, ["pdf", "zpl"]);
  assert.equal("providerSecret" in persisted, false);
  assert.equal("labelUrl" in persisted, false);
  assert.equal("providerUrl" in persisted, false);
  assert.equal(adapter.orders.get("order-1").status, "shipped");
  assert.equal(adapter.orders.get("order-1").trackingNumber, "AWB-JMR-1001");
  assert.deepEqual(adapter.orders.get("order-1").statusHistory.at(-1), {
    type: "status",
    status: "shipped",
    note: "Shipment AWB-JMR-1001 created.",
    actor: "warehouse@example.test",
    occurredAt: NOW.toISOString(),
  });
});

test("idempotent creation repairs shipment state without another provider allocation", async () => {
  const { adapter, provider, transactions } = service();
  const created = await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });
  const order = adapter.orders.get("order-1");
  order.status = "processing";
  order.carrier = null;
  order.trackingNumber = null;

  const replay = await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: new Date("2026-07-25T12:01:00.000Z"),
  });

  assert.equal(replay.idempotent, true);
  assert.equal(replay.shipment.documentId, created.shipment.documentId);
  assert.equal(provider.calls.create.length, 1);
  assert.equal(order.status, "shipped");
  assert.equal(order.carrier, "jamora-mock");
  assert.equal(order.trackingNumber, "AWB-JMR-1001");
  assert.equal(order.statusHistory.length, 1);
});

test("idempotent replay never regresses terminal order states", async () => {
  for (const terminalStatus of ["fulfilled", "refunded", "failed"]) {
    const { adapter, provider, transactions } = service();
    await transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    });
    const order = adapter.orders.get("order-1");
    order.status = terminalStatus;
    order.statusHistory.push({
      type: "status",
      status: terminalStatus,
      note: `Order ${terminalStatus}.`,
      actor: "owner@example.test",
      occurredAt: "2026-07-25T12:30:00.000Z",
    });
    const before = structuredClone(order);

    const replay = await transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: new Date("2026-07-25T13:00:00.000Z"),
    });

    assert.equal(replay.idempotent, true);
    assert.deepEqual(order, before);
    assert.equal(provider.calls.create.length, 1);
  }
});

test("idempotent replay rejects changed shipment bindings and impossible order states", async () => {
  const corruptions = [
    ["provider", "foreign-provider"],
    ["carrier", "foreign-carrier"],
    ["service", "express"],
    ["orderNumber", "JMR-FOREIGN"],
    ["awb", "AWB-FOREIGN"],
    ["labelReference", "bad"],
  ];
  for (const [field, value] of corruptions) {
    const { adapter, provider, transactions } = service();
    await transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    });
    const shipment = [...adapter.shipments.values()][0];
    shipment[field] = value;
    const before = structuredClone(adapter.orders.get("order-1"));

    await assert.rejects(
      transactions.createShipment({
        orderDocumentId: "order-1",
        actor: "warehouse@example.test",
        now: new Date("2026-07-25T13:00:00.000Z"),
      }),
      /binding|shipment/i,
    );
    assert.deepEqual(adapter.orders.get("order-1"), before);
    assert.equal(provider.calls.create.length, 1);
  }

  const impossible = service();
  await impossible.transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });
  const pending = impossible.adapter.orders.get("order-1");
  pending.status = "pending";
  const before = structuredClone(pending);
  await assert.rejects(
    impossible.transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: new Date("2026-07-25T13:00:00.000Z"),
    }),
    /state|status|binding/i,
  );
  assert.deepEqual(pending, before);
});

test("provider shipment is compensated and database state rolls back when persistence fails", async () => {
  const provider = recordingProvider();
  const { adapter, transactions } = service({
    provider,
    adapterOptions: { failCreateShipment: true },
  });

  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /simulated shipment persistence failure/i,
  );

  assert.equal(provider.calls.create.length, 1);
  assert.deepEqual(provider.calls.cancel, [{
    awb: "AWB-JMR-1001",
    labelReference: "lbl_order-1",
  }]);
  assert.equal(adapter.shipments.size, 0);
  assert.equal(adapter.orders.get("order-1").status, "processing");
  assert.equal(adapter.orders.get("order-1").trackingNumber, undefined);
});

test("failed provider cancellation persists a bounded orphan intent and retries it before allocation", async () => {
  let cancellationAttempt = 0;
  const provider = recordingProvider({
    async cancelShipment(shipment) {
      provider.calls.cancel.push(structuredClone(shipment));
      cancellationAttempt += 1;
      if (cancellationAttempt < 3) {
        throw new Error("provider secret must not escape");
      }
    },
  });
  const { adapter, transactions } = service({
    provider,
    adapterOptions: { failCreateShipment: true },
  });

  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /simulated shipment persistence failure/i,
  );

  assert.equal(adapter.compensations.size, 1);
  const intent = [...adapter.compensations.values()][0];
  assert.deepEqual({
    ...intent,
    compensationKey: undefined,
  }, {
    documentId: "shipment-compensation-1",
    compensationKey: undefined,
    orderDocumentId: "order-1",
    provider: "jamora-mock",
    awb: "AWB-JMR-1001",
    labelReference: "lbl_order-1",
    status: "pending",
    attempts: 1,
    createdAt: NOW.toISOString(),
    lastAttemptAt: NOW.toISOString(),
  });
  assert.match(intent.compensationKey, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(intent).includes("secret"), false);
  assert.equal(JSON.stringify(intent).includes("http"), false);

  adapter.failures.failCreateShipment = false;
  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: new Date("2026-07-25T12:01:00.000Z"),
    }),
    /cleanup|compensation/i,
  );
  assert.equal(provider.calls.create.length, 1);
  assert.equal(intent.status, "pending");
  assert.equal(intent.attempts, 2);

  const created = await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: new Date("2026-07-25T12:02:00.000Z"),
  });
  assert.equal(created.idempotent, false);
  assert.equal(provider.calls.create.length, 2);
  assert.equal(provider.calls.cancel.length, 3);
  assert.equal(intent.status, "resolved");
  assert.equal(intent.attempts, 3);
  assert.equal(intent.resolvedAt, "2026-07-25T12:02:00.000Z");
});

test("every pending orphan for an order is cleaned before a new provider allocation", async () => {
  const provider = recordingProvider();
  const compensations = ["A", "B"].map((suffix, index) => ({
    documentId: `compensation-${suffix}`,
    compensationKey: suffix.repeat(64).toLowerCase(),
    orderDocumentId: "order-1",
    provider: "jamora-mock",
    awb: `AWB-ORPHAN-${suffix}`,
    labelReference: `lbl_orphan_${suffix}`,
    status: "pending",
    attempts: 1,
    createdAt: `2026-07-25T11:0${index}:00.000Z`,
    lastAttemptAt: `2026-07-25T11:0${index}:00.000Z`,
  }));
  const { adapter, transactions } = service({
    provider,
    adapterOptions: { compensations },
  });

  await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });

  assert.deepEqual(
    provider.calls.cancel.map((entry) => entry.awb),
    ["AWB-ORPHAN-A", "AWB-ORPHAN-B"],
  );
  assert.equal(provider.calls.create.length, 1);
  assert.equal(
    [...adapter.compensations.values()].every((intent) =>
      intent.status === "resolved"),
    true,
  );
});

test("compensation persistence failure emits only a bounded safe operational log", async () => {
  const provider = recordingProvider({
    async cancelShipment(shipment) {
      provider.calls.cancel.push(structuredClone(shipment));
      throw new Error("provider secret must not escape");
    },
  });
  const { adapter, transactions } = service({
    provider,
    adapterOptions: {
      failCreateShipment: true,
      failRecordCompensation: true,
    },
  });

  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /simulated shipment persistence failure/i,
  );

  assert.equal(adapter.compensations.size, 0);
  assert.deepEqual(adapter.compensationLogs, [{
    orderDocumentId: "order-1",
    provider: "jamora-mock",
    awb: "AWB-JMR-1001",
  }]);
  assert.equal(JSON.stringify(adapter.compensationLogs).includes("secret"), false);
  assert.equal(JSON.stringify(adapter.compensationLogs).includes("http"), false);
  assert.equal(JSON.stringify(adapter.compensationLogs).includes("labelReference"), false);
});

test("a concurrent request cannot allocate after an orphan is recorded behind its initial check", async () => {
  let releaseFirstCancellation;
  let firstCancellationStarted;
  const cancellationStarted = new Promise((resolve) => {
    firstCancellationStarted = resolve;
  });
  const firstCancellationMayFinish = new Promise((resolve) => {
    releaseFirstCancellation = resolve;
  });
  let cancellationAttempt = 0;
  const provider = recordingProvider({
    async cancelShipment(shipment) {
      provider.calls.cancel.push(structuredClone(shipment));
      cancellationAttempt += 1;
      if (cancellationAttempt === 1) {
        firstCancellationStarted();
        await firstCancellationMayFinish;
      }
      throw new Error("provider cancellation unavailable");
    },
  });
  const { adapter, transactions } = service({
    provider,
    adapterOptions: { failCreateShipment: true },
  });

  const first = transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse-a@example.test",
    now: NOW,
  });
  await cancellationStarted;
  adapter.failures.failCreateShipment = false;
  const concurrent = transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse-b@example.test",
    now: new Date("2026-07-25T12:01:00.000Z"),
  });
  releaseFirstCancellation();

  await assert.rejects(first, /simulated shipment persistence failure/i);
  await assert.rejects(concurrent, /cleanup|compensation/i);
  assert.equal(provider.calls.create.length, 1);
  assert.equal(adapter.shipments.size, 0);
  assert.equal([...adapter.compensations.values()][0].status, "pending");
});

test("allocated provider shipment is compensated when its returned label metadata is rejected", async () => {
  const provider = recordingProvider({
    async createShipment(order) {
      provider.calls.create.push(structuredClone(order));
      return {
        awb: "AWB-ALLOCATED",
        labelReference: "lbl_allocated",
        labelFormats: ["html"],
      };
    },
  });
  const { adapter, transactions } = service({ provider });

  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /label format/i,
  );

  assert.deepEqual(provider.calls.cancel, [{
    awb: "AWB-ALLOCATED",
    labelReference: "lbl_allocated",
  }]);
  assert.equal(adapter.shipments.size, 0);
  assert.equal(adapter.orders.get("order-1").status, "processing");
});

test("partially allocated provider shipment is compensated when validation fails", async () => {
  const provider = recordingProvider({
    async createShipment(order) {
      provider.calls.create.push(structuredClone(order));
      return {
        awb: "AWB-ALLOCATED",
        labelFormats: ["pdf"],
      };
    },
  });
  const { transactions } = service({ provider });

  await assert.rejects(
    transactions.createShipment({
      orderDocumentId: "order-1",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /invalid shipment/i,
  );

  assert.deepEqual(provider.calls.cancel, [{ awb: "AWB-ALLOCATED" }]);
});

test("label capability is shipment-bound, signature-checked, expiring, and single-use", async () => {
  const { transactions } = service({
    orders: [
      packedOrder(),
      packedOrder({ documentId: "order-2", orderNumber: "JMR-1002" }),
    ],
  });
  const first = await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });
  const second = await transactions.createShipment({
    orderDocumentId: "order-2",
    actor: "warehouse@example.test",
    now: NOW,
  });

  const issued = await transactions.createLabelCapability({
    shipmentDocumentId: first.shipment.documentId,
    format: "pdf",
    actor: "warehouse@example.test",
    now: NOW,
  });
  assert.equal(issued.expiresAt, "2026-07-25T12:00:30.000Z");
  assert.equal(issued.capability.includes("order-1"), false);

  await assert.rejects(
    transactions.downloadLabel({
      shipmentDocumentId: first.shipment.documentId,
      capability: `${issued.capability.slice(0, -1)}x`,
      now: new Date("2026-07-25T12:00:01.000Z"),
    }),
    /invalid label capability/i,
  );
  await assert.rejects(
    transactions.downloadLabel({
      shipmentDocumentId: second.shipment.documentId,
      capability: issued.capability,
      now: new Date("2026-07-25T12:00:01.000Z"),
    }),
    /invalid label capability/i,
  );
  await assert.rejects(
    transactions.downloadLabel({
      shipmentDocumentId: first.shipment.documentId,
      capability: issued.capability,
      now: new Date("2026-07-25T12:00:31.000Z"),
    }),
    /expired label capability/i,
  );

  const superseded = await transactions.createLabelCapability({
    shipmentDocumentId: first.shipment.documentId,
    format: "pdf",
    actor: "owner@example.test",
    now: new Date("2026-07-25T12:01:00.000Z"),
  });
  const fresh = await transactions.createLabelCapability({
    shipmentDocumentId: first.shipment.documentId,
    format: "pdf",
    actor: "owner@example.test",
    now: new Date("2026-07-25T12:01:00.000Z"),
  });
  await assert.rejects(
    transactions.downloadLabel({
      shipmentDocumentId: first.shipment.documentId,
      capability: superseded.capability,
      now: new Date("2026-07-25T12:01:01.000Z"),
    }),
    /invalid label capability/i,
  );
  const label = await transactions.downloadLabel({
    shipmentDocumentId: first.shipment.documentId,
    capability: fresh.capability,
    now: new Date("2026-07-25T12:01:01.000Z"),
  });
  assert.equal(label.contentType, "application/pdf");
  assert.equal(label.filename, "JMR-1001-label.pdf");
  assert.match(label.body.toString("utf8"), /^%PDF-/);

  await assert.rejects(
    transactions.downloadLabel({
      shipmentDocumentId: first.shipment.documentId,
      capability: fresh.capability,
      now: new Date("2026-07-25T12:01:02.000Z"),
    }),
    /used label capability/i,
  );
});

test("label format and provider content type are allowlisted to PDF and ZPL", async () => {
  const { transactions } = service();
  const created = await transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });

  await assert.rejects(
    transactions.createLabelCapability({
      shipmentDocumentId: created.shipment.documentId,
      format: "html",
      actor: "warehouse@example.test",
      now: NOW,
    }),
    /label format/i,
  );

  const zpl = await transactions.createLabelCapability({
    shipmentDocumentId: created.shipment.documentId,
    format: "zpl",
    actor: "warehouse@example.test",
    now: NOW,
  });
  const label = await transactions.downloadLabel({
    shipmentDocumentId: created.shipment.documentId,
    capability: zpl.capability,
    now: new Date("2026-07-25T12:00:01.000Z"),
  });
  assert.equal(label.contentType, "application/vnd.zebra-zpl");
  assert.equal(label.filename, "JMR-1001-label.zpl");
  assert.match(label.body.toString("utf8"), /^\^XA/);

  const badProvider = recordingProvider({
    async downloadLabel() {
      return {
        contentType: "text/html",
        body: Buffer.from("<script>provider secret</script>"),
      };
    },
  });
  const bad = service({ provider: badProvider });
  const badCreated = await bad.transactions.createShipment({
    orderDocumentId: "order-1",
    actor: "warehouse@example.test",
    now: NOW,
  });
  const badCapability = await bad.transactions.createLabelCapability({
    shipmentDocumentId: badCreated.shipment.documentId,
    format: "pdf",
    actor: "warehouse@example.test",
    now: NOW,
  });
  await assert.rejects(
    bad.transactions.downloadLabel({
      shipmentDocumentId: badCreated.shipment.documentId,
      capability: badCapability.capability,
      now: new Date("2026-07-25T12:00:01.000Z"),
    }),
    /content type/i,
  );
});

test("mock provider returns opaque references and private in-process PDF/ZPL bytes", async () => {
  const provider = createMockShippingProvider();
  const created = await provider.createShipment(packedOrder());

  assert.match(created.awb, /^JMR\d{18}$/);
  assert.match(created.labelReference, /^lbl_[A-Za-z0-9_-]{32,}$/);
  assert.deepEqual(created.labelFormats, ["pdf", "zpl"]);
  assert.equal(JSON.stringify(created).includes("http"), false);
  assert.equal(JSON.stringify(created).includes("secret"), false);

  const pdf = await provider.downloadLabel({
    labelReference: created.labelReference,
    awb: created.awb,
    format: "pdf",
  });
  const zpl = await provider.downloadLabel({
    labelReference: created.labelReference,
    awb: created.awb,
    format: "zpl",
  });
  assert.equal(pdf.contentType, "application/pdf");
  assert.match(pdf.body.toString("utf8"), /^%PDF-/);
  assert.match(pdf.body.toString("utf8"), /\bxref\b/);
  assert.match(pdf.body.toString("utf8"), /\/Font\b/);
  assert.equal(zpl.contentType, "application/vnd.zebra-zpl");
  assert.match(zpl.body.toString("utf8"), /^\^XA/);
});
