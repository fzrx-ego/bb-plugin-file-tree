import assert from "node:assert/strict";
import { test } from "node:test";
import { chatRevealPath, filePathFromHref } from "./chat-path-buttons";

test("native preview link target works when its visible label is prose", () => {
  assert.equal(
    filePathFromHref("/Users/yuriyegorov/Documents/Telemetron/Docs/Product/Requirements/Единый%20вход/Единый-вход-Разбор-экранов.md"),
    "/Users/yuriyegorov/Documents/Telemetron/Docs/Product/Requirements/Единый вход/Единый-вход-Разбор-экранов.md",
  );
  assert.equal(filePathFromHref("file:///tmp/example%20file.md"), "/tmp/example file.md");
  assert.equal(filePathFromHref("https://example.com/file.md"), null);
  assert.equal(filePathFromHref("../../outside.md"), null);
});

test("a preview link whose href misses the file still gets a tree icon for the repaired path", () => {
  const deadHref = "/Users/yuriyegorov/Documents/Telemetron/Aurency Project/_private/Performance-Review/2026/leadership-discussion-brief.md";
  const realFile = "/Users/yuriyegorov/Documents/Aurency Project/_private/Performance-Review/2026/leadership-discussion-brief.md";
  const text = "Aurency Project/_private/Performance-Review/2026/leadership-discussion-brief.md";
  assert.equal(
    chatRevealPath({ hrefPath: deadHref, textPath: text, fixAbsolutePath: realFile }),
    realFile,
  );
  assert.equal(
    chatRevealPath({ hrefPath: deadHref, textPath: text, fixAbsolutePath: undefined }),
    deadHref,
  );
  assert.equal(
    chatRevealPath({ hrefPath: deadHref, textPath: text, fixAbsolutePath: null }),
    deadHref,
  );
  assert.equal(
    chatRevealPath({ hrefPath: null, textPath: "AGENTS.md", fixAbsolutePath: undefined }),
    "AGENTS.md",
  );
});
