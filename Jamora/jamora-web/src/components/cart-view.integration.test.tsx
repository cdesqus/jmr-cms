import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { CartProvider } from "./cart-context";
import { CartView } from "./cart-view";
import { PRODUCTS } from "../lib/products";
import {
  button,
  click,
  flush,
  input,
  installDom,
  mount,
} from "./integration-dom-harness";

installDom();

const membership = {
  documentId: "membership-1",
  membershipNumber: "JM-0001",
  ledgerBalance: 10,
  planSnapshot: {
    name: "Jamu Circle",
    eligibleProductSlugs: [PRODUCTS[0].slug],
  },
};
const assessedAddress = {
  recipient: "Ana",
  phone: "",
  countryCode: "RO",
  subdivisionCode: "B",
  locality: "Bucuresti",
  postalCode: "010101",
  street: "Calea Victoriei",
  building: "10",
  unit: "",
  instructions: "",
};
const quote = {
  quoteId: `shq_${"A".repeat(43)}`,
  carrier: "Mock Courier",
  service: "standard",
  amountMinor: 2_490,
  currency: "RON",
  estimate: { minimumDays: 2, maximumDays: 4 },
  quotedAt: "2099-07-25T10:00:00.000Z",
  expiresAt: "2099-07-25T10:15:00.000Z",
};

function json(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}

async function completeAddress(container: ParentNode) {
  const values: Record<string, string> = {
    "shipping address-level1": "B",
    "shipping address-level2": "Bucuresti",
    "shipping postal-code": "010101",
    "shipping address-line1": "Calea Victoriei",
    "shipping address-line2": "10",
  };
  for (const [autoComplete, value] of Object.entries(values)) {
    const field = container.querySelector<HTMLInputElement>(
      `input[autocomplete="${autoComplete}"]`,
    );
    assert.ok(field);
    await input(field, value);
  }
}

for (const member of [false, true]) {
  for (const shippingEnabled of [false, true]) {
    test(`payments-off ${member ? "member" : "ordinary"} checkout with shipping ${shippingEnabled ? "on" : "off"} uses only synchronous endpoints`, async () => {
      localStorage.clear();
      localStorage.setItem("jamora.cart.v2", JSON.stringify([
        { product: PRODUCTS[0], qty: 1 },
      ]));
      const calls: string[] = [];
      const pushes: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (resource, init) => {
        const url = String(resource);
        calls.push(url);
        if (url.includes("address/assess")) {
          return json({ address: assessedAddress, errors: [], warnings: [] });
        }
        if (url.includes("shipping/quotes")) return json({ quotes: [quote] });
        if (url.includes("/inventory/reserve")) {
          return json({
            reservationToken: "rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
            checkoutReference: "mco_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4",
            expiresAt: "2099-07-25T10:10:00.000Z",
          });
        }
        if (url.includes("/orders/mock-paid")) return json({ order: {} });
        if (url.includes("/membership/checkout-finalize")) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          assert.equal(body.checkoutReference.startsWith("mco_"), true);
          return json({ order: {} });
        }
        return json({ error: `Unexpected endpoint ${url}` }, 500);
      };
      const router = {
        back() {},
        forward() {},
        refresh() {},
        push(href: string) {
          pushes.push(href);
        },
        replace() {},
        prefetch() {},
      };
      const mounted = await mount(
        <AppRouterContext.Provider value={router}>
          <CartProvider>
            <CartView
              paymentsEnabled={false}
              shippingEnabled={shippingEnabled}
              membership={membership}
              signedCustomer={{
                documentId: "customer-1",
                name: "Ana",
                email: "ana@example.com",
              }}
            />
          </CartProvider>
        </AppRouterContext.Provider>,
      );
      try {
        await flush();
        if (member) {
          const membershipToggle = mounted.container.querySelector<HTMLInputElement>(
            'input[type="checkbox"]',
          );
          assert.ok(membershipToggle);
          await click(membershipToggle);
        }
        await click(button(mounted.container, "Continue"));
        await completeAddress(mounted.container);
        await click(button(mounted.container, "Continue"));
        await flush();
        if (shippingEnabled) {
          const radio = mounted.container.querySelector<HTMLInputElement>(
            'input[name="delivery-quote"]',
          );
          assert.ok(radio);
          await click(radio);
        }
        await click(button(mounted.container, "Continue"));
        await click(button(mounted.container, "Continue"));
        await click(button(mounted.container, "Place order"));
        await flush();

        const forbidden = calls.filter((url) =>
          /pending-payment|checkout-order|\/payments\//.test(url));
        assert.deepEqual(forbidden, []);
        assert.equal(
          calls.some((url) =>
            url.includes(
              member
                ? "/membership/checkout-finalize"
                : "/orders/mock-paid",
            )),
          true,
        );
        assert.equal(pushes.length, 1);
        assert.match(pushes[0], /^\/checkout\/success\?order=/);
      } finally {
        await mounted.unmount();
        globalThis.fetch = originalFetch;
      }
    });
  }
}

test("changing the cart clears the parent shipping summary immediately", async () => {
  localStorage.clear();
  localStorage.setItem("jamora.cart.v2", JSON.stringify([
    { product: PRODUCTS[0], qty: 1 },
  ]));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (resource) => {
    const url = String(resource);
    if (url.includes("address/assess")) {
      return json({ address: assessedAddress, errors: [], warnings: [] });
    }
    if (url.includes("shipping/quotes")) return json({ quotes: [quote] });
    return json({});
  };
  const router = {
    back() {},
    forward() {},
    refresh() {},
    push() {},
    replace() {},
    prefetch() {},
  };
  const mounted = await mount(
    <AppRouterContext.Provider value={router}>
      <CartProvider>
        <CartView
          paymentsEnabled={false}
          shippingEnabled
          signedCustomer={{
            documentId: "customer-1",
            name: "Ana",
            email: "ana@example.com",
          }}
        />
      </CartProvider>
    </AppRouterContext.Provider>,
  );
  try {
    await flush();
    await click(button(mounted.container, "Continue"));
    await completeAddress(mounted.container);
    await click(button(mounted.container, "Continue"));
    await flush();
    await click(mounted.container.querySelector<HTMLInputElement>(
      'input[name="delivery-quote"]',
    )!);
    assert.match(mounted.container.textContent ?? "", /RON\s*24\.90/);

    const increase = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase quantity"]',
    );
    assert.ok(increase);
    await click(increase);
    assert.match(mounted.container.textContent ?? "", /Select server quote/);
    assert.doesNotMatch(mounted.container.textContent ?? "", /RON\s*24\.90/);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});
