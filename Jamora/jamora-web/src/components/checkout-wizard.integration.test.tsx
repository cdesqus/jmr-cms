import assert from "node:assert/strict";
import test from "node:test";
import React, { act, type ComponentProps } from "react";

import { CheckoutWizard } from "./checkout-wizard";
import {
  button,
  click,
  flush,
  installDom,
  mount,
} from "./integration-dom-harness";

installDom();

const address = {
  recipient: "Ana",
  phone: "",
  countryCode: "RO",
  subdivisionCode: "B",
  locality: "Bucuresti",
  postalCode: "010101",
  street: "Calea Victoriei",
  building: "10",
  unit: "4",
  instructions: "",
};
const quote = {
  quoteId: `shq_${"A".repeat(43)}`,
  carrier: "Mock Courier",
  service: "standard",
  amountMinor: 2_490,
  currency: "RON" as const,
  estimate: { minimumDays: 2, maximumDays: 4 },
  quotedAt: "2099-07-25T10:00:00.000Z",
  expiresAt: "2099-07-25T10:15:00.000Z",
};

function wizard(overrides: Partial<ComponentProps<typeof CheckoutWizard>> = {}) {
  return (
    <CheckoutWizard
      mode="guest"
      initialContact={{ name: "Ana", email: "ana@example.com" }}
      initialAddress={address}
      authenticated={false}
      addressAssistEnabled={false}
      shippingEnabled
      paymentsEnabled
      items={[{ slug: "jamu-energy", qty: 1 }]}
      fallbackShippingLabel="€4.95"
      checkingOut={false}
      checkoutError=""
      onQuoteChange={() => undefined}
      onSubmit={async () => undefined}
      {...overrides}
    />
  );
}

function json(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

function heading(container: ParentNode, name: string) {
  return Array.from(container.querySelectorAll("h1,h2,h3,h4,h5,h6")).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
}

function quoteRadio(container: ParentNode) {
  return container.querySelector<HTMLInputElement>(
    'input[type="radio"][name="delivery-quote"]',
  );
}

test("reservation is single-flight and native focus/live state move to Address", async () => {
  const originalFetch = globalThis.fetch;
  let reservationCalls = 0;
  let resolveReservation!: (response: Response) => void;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/inventory/reserve")) {
      reservationCalls += 1;
      return new Promise<Response>((resolve) => {
        resolveReservation = resolve;
      });
    }
    throw new Error(`Unexpected fetch ${String(input)}`);
  };
  const mounted = await mount(wizard());
  try {
    const continueButton = button(mounted.container, "Continue");
    await act(async () => {
      continueButton.click();
      continueButton.click();
      await Promise.resolve();
    });
    assert.equal(reservationCalls, 1);
    assert.equal(continueButton.disabled, true);

    resolveReservation(json({
      reservationToken: "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
      expiresAt: "2099-07-25T10:10:00.000Z",
    }));
    await flush();
    const addressHeading = heading(mounted.container, "Address");
    assert.ok(addressHeading instanceof HTMLElement);
    assert.equal(document.activeElement, addressHeading);
    assert.equal(
      mounted.container.querySelector('[role="status"][aria-label="Checkout step"]')
        ?.textContent,
      "Address step, 2 of 5.",
    );
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("shipping assesses before quoting, disables navigation, retains the quote, and shows friendly warnings", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  let resolveFirstAssessment!: (response: Response) => void;
  let assessments = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("address/assess")) {
      assessments += 1;
      if (assessments === 1) {
        return new Promise<Response>((resolve) => {
          resolveFirstAssessment = resolve;
        });
      }
      return json({
        address,
        errors: [],
        warnings: ["postalCode does not match subdivisionCode"],
      });
    }
    if (url.includes("shipping/quotes")) return json({ quotes: [quote] });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const mounted = await mount(
    wizard({ authenticated: true, mode: "customer" }),
  );
  try {
    await click(button(mounted.container, "Continue"));
    assert.ok(heading(mounted.container, "Address"));
    const continueButton = button(mounted.container, "Continue");
    await click(continueButton);
    assert.deepEqual(calls, ["/api/jamora/shipping/address/assess"]);
    assert.equal(button(mounted.container, "Back").disabled, true);

    resolveFirstAssessment(json({
      address,
      errors: [],
      warnings: ["postalCode does not match subdivisionCode"],
    }));
    await flush();
    assert.deepEqual(calls.map((url) => url.split("/shipping/")[1]), [
      "address/assess",
      "shipping/quotes",
    ]);
    const radio = quoteRadio(mounted.container);
    assert.ok(radio);
    await click(radio);
    await click(button(mounted.container, "Back"));
    await click(button(mounted.container, "Continue"));
    await flush();
    assert.equal(quoteRadio(mounted.container)?.checked, true);
    assert.equal(
      calls.filter((url) => url.includes("shipping/quotes")).length,
      1,
    );
    assert.match(
      mounted.container.textContent ?? "",
      /The postal code and county do not appear to match\./,
    );
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("assessment-stage 401 reserves once more, reassesses, and requotes", async () => {
  const originalFetch = globalThis.fetch;
  let reservations = 0;
  let assessments = 0;
  let quotes = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/inventory/reserve")) {
      reservations += 1;
      return json({
        reservationToken: reservations === 1
          ? "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4"
          : "rsv_75b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
        expiresAt: "2099-07-25T10:10:00.000Z",
      });
    }
    if (url.includes("address/assess")) {
      assessments += 1;
      return assessments === 1
        ? json({ error: "Valid guest reservation required." }, 401)
        : json({ address, errors: [], warnings: [] });
    }
    if (url.includes("shipping/quotes")) {
      quotes += 1;
      return json({ quotes: [quote] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const mounted = await mount(wizard());
  try {
    await click(button(mounted.container, "Continue"));
    await click(button(mounted.container, "Continue"));
    await flush();
    assert.ok(quoteRadio(mounted.container));
    assert.equal(reservations, 2);
    assert.equal(assessments, 2);
    assert.equal(quotes, 1);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("quote-stage 401 restarts the full transaction once with one fresh reservation", async () => {
  const originalFetch = globalThis.fetch;
  let reservations = 0;
  let assessments = 0;
  let quotes = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/inventory/reserve")) {
      reservations += 1;
      return json({
        reservationToken: reservations === 1
          ? "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4"
          : "rsv_75b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
        expiresAt: "2099-07-25T10:10:00.000Z",
      });
    }
    if (url.includes("address/assess")) {
      assessments += 1;
      return json({ address, errors: [], warnings: [] });
    }
    if (url.includes("shipping/quotes")) {
      quotes += 1;
      return quotes === 1
        ? json({ error: "Valid guest reservation required." }, 401)
        : json({ quotes: [quote] });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };
  const mounted = await mount(wizard());
  try {
    await click(button(mounted.container, "Continue"));
    await click(button(mounted.container, "Continue"));
    await flush();
    assert.ok(quoteRadio(mounted.container));
    assert.equal(reservations, 2);
    assert.equal(assessments, 2);
    assert.equal(quotes, 2);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("a quote cannot outlive its reservation and retry uses a fresh assess→quote transaction", async () => {
  const originalFetch = globalThis.fetch;
  let reservations = 0;
  let assessments = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/inventory/reserve")) {
      reservations += 1;
      return json({
        reservationToken: reservations === 1
          ? "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4"
          : "rsv_75b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
        expiresAt: reservations === 1
          ? new Date(Date.now() + 300).toISOString()
          : "2099-07-25T10:10:00.000Z",
      });
    }
    if (url.includes("address/assess")) {
      assessments += 1;
      return json({ address, errors: [], warnings: [] });
    }
    if (url.includes("shipping/quotes")) return json({ quotes: [quote] });
    throw new Error(`Unexpected fetch ${url}`);
  };
  const mounted = await mount(wizard());
  try {
    await click(button(mounted.container, "Continue"));
    await click(button(mounted.container, "Continue"));
    await click(quoteRadio(mounted.container)!);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    assert.equal(quoteRadio(mounted.container), null);
    await click(button(mounted.container, "Try again"));
    await flush();
    assert.ok(quoteRadio(mounted.container));
    assert.equal(reservations, 2);
    assert.equal(assessments, 2);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});
