import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleDirectories } from "./visible-directories";

test("collapsed ancestors exclude expanded descendants from watching and refresh", () => {
  assert.deepEqual(visibleDirectories(new Set(["", "Docs", "Docs/deep", "closed/child"])), ["", "Docs", "Docs/deep"]);
  assert.deepEqual(visibleDirectories(new Set(["Docs", "Docs/deep"])), []);
});
