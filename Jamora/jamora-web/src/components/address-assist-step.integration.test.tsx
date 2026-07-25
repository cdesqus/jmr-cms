import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";

import { AddressAssistStep } from "./address-assist-step";
import {
  click,
  input,
  installDom,
  mount,
} from "./integration-dom-harness";

installDom();

const suggestion = {
  countryCode: "RO",
  subdivisionCode: "B",
  locality: "Bucuresti",
  postalCode: "010101",
  street: "Calea Victoriei",
  building: "10",
};

test("combobox uses input-owned focus, keyboard selection, and stays closed after selection", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [suggestion] }),
    } as Response;
  };
  let selectedStreet = "";
  const mounted = await mount(
    <AddressAssistStep
      value={{
        recipient: "Ana",
        phone: "",
        countryCode: "RO",
        subdivisionCode: "",
        locality: "",
        postalCode: "",
        street: "",
        building: "",
        unit: "4",
        instructions: "",
      }}
      onChange={(value) => {
        selectedStreet = value.street;
      }}
      errors={[]}
      warnings={[]}
      enabled
      reservationCapability="rsv_65b799b2-4fa0-4cab-9ef8-a82ffd7557c4"
    />,
  );
  try {
    const combobox = mounted.container.querySelector('[role="combobox"]');
    assert.ok(combobox instanceof HTMLInputElement);
    combobox.focus();
    await input(combobox, "Calea");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    const option = mounted.container.querySelector('[role="option"]');
    assert.ok(option instanceof HTMLElement);
    assert.equal(option.querySelectorAll("button").length, 0);
    assert.equal(option.tabIndex, -1);
    assert.equal(combobox.getAttribute("aria-activedescendant"), option.id);
    assert.equal(document.activeElement, combobox);

    await act(async () => {
      combobox.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
      }));
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    assert.equal(selectedStreet, "Calea Victoriei");
    assert.equal(fetchCalls, 1);
    assert.equal(mounted.container.querySelector('[role="listbox"]'), null);
    assert.equal(document.activeElement, combobox);
  } finally {
    await mounted.unmount();
    globalThis.fetch = originalFetch;
  }
});

test("disabled address assist rejects native input and option activation", async () => {
  let changes = 0;
  const mounted = await mount(
    <AddressAssistStep
      value={{
        recipient: "Ana",
        phone: "",
        countryCode: "RO",
        subdivisionCode: "",
        locality: "",
        postalCode: "",
        street: "",
        building: "",
        unit: "",
        instructions: "",
      }}
      onChange={() => {
        changes += 1;
      }}
      errors={[]}
      warnings={[]}
      enabled
      disabled
    />,
  );
  try {
    const combobox = mounted.container.querySelector('[role="combobox"]');
    assert.ok(combobox instanceof HTMLInputElement);
    assert.equal(combobox.disabled, true);
    assert.equal(mounted.container.querySelector('[role="option"]'), null);
    await click(combobox);
    assert.equal(document.activeElement, document.body);
    assert.equal(changes, 0);
  } finally {
    await mounted.unmount();
  }
});
