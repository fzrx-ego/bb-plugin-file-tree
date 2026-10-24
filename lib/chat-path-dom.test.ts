import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { mountChatPathButtons } from "./chat-path-buttons";
import { subscribeReveal } from "./reveal-bus";

// This test runs alone: DOM globals also serve React tests in the full suite.
test("file links with prose labels reveal their href with or without BB's glyph", async () => {
  const dom = new JSDOM('<body><div class="group/message"><a id="plain" href="file:///tmp/thread-storage/transcript.md">Полный транскрипт</a><a id="pdf" href="file:///tmp/thread-storage/transcript.pdf">PDF<span><svg></svg></span></a><a id="web" href="https://example.com/report.md">Web report</a></div></body>', { url: "http://localhost" });
  const globals = ["window", "document", "Node", "Element", "HTMLElement", "HTMLAnchorElement", "MutationObserver", "AbortController", "CustomEvent"];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  const controller = new dom.window.AbortController();
  const reveals: string[] = [];
  const stop = subscribeReveal(({ path }) => reveals.push(path));
  const paths = ["/tmp/thread-storage/transcript.md", "/tmp/thread-storage/transcript.pdf"];
  let validations = 0;
  let nativeClicks = 0;
  document.addEventListener("click", (event) => {
    if ((event.target as Element)?.closest('a[href^="file:"]')) {
      nativeClicks++;
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, { capture: true });
  try {
    mountChatPathButtons(controller.signal as AbortSignal, "dom-thread-links", async (candidates) => {
      validations++; return new Set(candidates.filter((p) => paths.includes(p)));
    }, async () => [], () => {});
    const deadline = Date.now() + 2500;
    while (document.querySelectorAll('button[data-file-tree-reveal]').length !== 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 30));
    assert.equal(document.querySelectorAll('button[data-file-tree-reveal]').length, 2);
    assert.equal(document.querySelector('#web button'), null);
    for (const id of ["plain", "pdf"]) (document.querySelector(`#${id} button`) as HTMLButtonElement).click();
    assert.deepEqual(reveals, paths);
    assert.equal(nativeClicks, 0);
    (document.querySelector("#plain") as HTMLAnchorElement).click();
    assert.equal(nativeClicks, 1);
    const before = validations;
    await new Promise((r) => setTimeout(r, 850));
    assert.equal(validations, before);
    controller.abort();
    assert.equal(document.querySelectorAll('button[data-file-tree-reveal]').length, 0);
  } finally {
    controller.abort(); stop(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});
