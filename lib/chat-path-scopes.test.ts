import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { chatScopeFromHeader, mountChatPathButtons } from "./chat-path-buttons";
import { subscribeReveal } from "./reveal-bus";

test("folder links and shorthand icons stay with their own thread across remounts", async () => {
  const folder = "/Users/test/Documents/Aurency Project/Docs/Operations/AI-Adoption/External-Talks";
  const dom = new JSDOM(`<body><nav><code>AI-Adoption</code></nav>
    <section id="first"><header><span id="marker-first"></span></header><div data-thread-window><div class="group/message"><a id="folder" href="${encodeURI(folder)}">Папка материалов</a><code id="short">AI-Adoption/External-Talks</code></div></div></section>
    <section id="second"><header><span id="marker-second"></span></header><div data-thread-window><div class="group/message"><a id="file" href="file:///tmp/Varco-Aurency-TMS-API-Reply.md">Черновик</a></div></div></section></body>`, { url: "http://localhost" });
  const globals = ["window", "document", "Node", "Element", "HTMLElement", "HTMLAnchorElement", "MutationObserver", "AbortController", "CustomEvent"];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  const first = new dom.window.AbortController();
  const second = new dom.window.AbortController();
  const reveals: { path: string; threadId: string }[] = [];
  const stop = subscribeReveal((request) => reveals.push(request));
  const validations = new Map<string, string[]>();
  try {
    for (const [id, signal] of [["first", first.signal], ["second", second.signal]] as const) {
      const scope = chatScopeFromHeader(document.getElementById(`marker-${id}`)!);
      assert.equal(scope, document.getElementById(id));
      mountChatPathButtons(signal as AbortSignal, id, async (paths) => {
        validations.set(id, paths);
        return new Set(paths);
      }, async (anchors) => anchors.filter((a) => a.href === folder).map((a) => ({ ...a, absolutePath: folder, hostId: "host", isDirectory: true })), () => assert.fail("a directory must reveal, not open a file preview"), undefined, scope);
    }
    const deadline = Date.now() + 3000;
    while ((document.querySelectorAll("button[data-file-tree-reveal]").length !== 3 || !document.querySelector("#folder[data-file-tree-fixed]")) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(document.querySelectorAll("button[data-file-tree-reveal]").length, 3);
    assert.equal(document.querySelector("nav button"), null);
    assert.deepEqual(validations.get("first"), [folder, "AI-Adoption/External-Talks"]);
    assert.deepEqual(validations.get("second"), ["/tmp/Varco-Aurency-TMS-API-Reply.md"]);
    (document.querySelector("#folder") as HTMLAnchorElement).click();
    assert.deepEqual(reveals.pop(), { path: folder, threadId: "first" });
    first.abort();
    assert.equal(document.querySelectorAll("#first button[data-file-tree-reveal]").length, 0);
    const remaining = document.querySelector("#file button") as HTMLButtonElement;
    assert.ok(remaining);
    remaining.click();
    assert.deepEqual(reveals.pop(), { path: "/tmp/Varco-Aurency-TMS-API-Reply.md", threadId: "second" });
    second.abort();
    assert.equal(document.querySelectorAll("button[data-file-tree-reveal]").length, 0);
  } finally {
    first.abort(); second.abort(); stop(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});
