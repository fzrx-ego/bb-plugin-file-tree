import assert from "node:assert/strict";
import { test } from "node:test";
import { nextUntitledMarkdownName } from "./untitled-name.ts";

test("first file is untitled.md", () => {
  assert.equal(nextUntitledMarkdownName([]), "untitled.md");
});

test("skips names already in the folder, case-insensitively", () => {
  assert.equal(nextUntitledMarkdownName(["README.md", "Untitled.md"]), "untitled-2.md");
  assert.equal(
    nextUntitledMarkdownName(["untitled.md", "untitled-2.md", "untitled-4.md"]),
    "untitled-3.md",
  );
});
