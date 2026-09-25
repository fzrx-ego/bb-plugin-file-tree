import assert from "node:assert/strict";
import { test } from "node:test";
import { includeRevealedChild, type VisibleReveal } from "./visible-reveal";

test("a revealed file remains visible when the host hides its dotfolder", () => {
  const target: VisibleReveal = {
    rootId: "telemetron",
    relativePath: ".claude/handoffs/edinyi-vhod-screen-catalog-2026-09-25.md",
    isDirectory: false,
  };
  const root = includeRevealedChild(
    [{ name: "Docs", relativePath: "Docs", kind: "directory" }],
    "",
    target,
  );
  assert.deepEqual(root.map((entry) => entry.relativePath), [".claude", "Docs"]);
  assert.equal(root[0]?.kind, "directory");

  const hidden = includeRevealedChild(
    [{ name: "handoffs", relativePath: ".claude/handoffs", kind: "directory" }],
    ".claude",
    target,
  );
  assert.equal(hidden.length, 1);

  const handoffs = includeRevealedChild([], ".claude/handoffs", target);
  assert.deepEqual(handoffs, [{
    name: "edinyi-vhod-screen-catalog-2026-09-25.md",
    relativePath: target.relativePath,
    kind: "file",
  }]);
  assert.equal(includeRevealedChild([], "Docs", target).length, 0);
});
