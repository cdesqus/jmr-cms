import { Window } from "happy-dom";

const browser = new Window({ url: "http://localhost/" });
const exposed = {
  self: browser,
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  Node: browser.Node,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  KeyboardEvent: browser.KeyboardEvent,
  CustomEvent: browser.CustomEvent,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  localStorage: browser.localStorage,
};

for (const [name, value] of Object.entries(exposed)) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

export { browser };
