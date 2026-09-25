import assert from "node:assert/strict";
import { test } from "node:test";
import { filePathFromHref } from "./chat-path-buttons";

test("native preview link target works when its visible label is prose", () => {
  assert.equal(
    filePathFromHref("/Users/yuriyegorov/Documents/Telemetron/Docs/Product/Requirements/Единый%20вход/Единый-вход-Разбор-экранов.md"),
    "/Users/yuriyegorov/Documents/Telemetron/Docs/Product/Requirements/Единый вход/Единый-вход-Разбор-экранов.md",
  );
  assert.equal(filePathFromHref("file:///tmp/example%20file.md"), "/tmp/example file.md");
  assert.equal(filePathFromHref("https://example.com/file.md"), null);
  assert.equal(filePathFromHref("../../outside.md"), null);
});
