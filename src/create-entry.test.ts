import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { createHostEntry, entryNameProblem } from "./create-entry.ts";

let rootPath = "";
beforeEach(async () => { rootPath = await mkdtemp(path.join(os.tmpdir(), "create-entry-")); });
afterEach(async () => { await rm(rootPath, { recursive: true, force: true }); });

test("creates an empty file and a folder in the root and in a subfolder", async () => {
  await mkdir(path.join(rootPath, "docs"));
  assert.deepEqual(
    await createHostEntry({ rootPath, directoryRelativePath: "", name: "a.txt", kind: "file" }),
    { ok: true, relativePath: "a.txt" },
  );
  assert.equal(await readFile(path.join(rootPath, "a.txt"), "utf8"), "");
  assert.deepEqual(
    await createHostEntry({ rootPath, directoryRelativePath: "docs", name: "Папка", kind: "directory" }),
    { ok: true, relativePath: "docs/Папка" },
  );
  assert.equal((await stat(path.join(rootPath, "docs", "Папка"))).isDirectory(), true);
});

test("never overwrites what is already there", async () => {
  await writeFile(path.join(rootPath, "keep.md"), "content");
  const result = await createHostEntry({ rootPath, directoryRelativePath: "", name: "keep.md", kind: "file" });
  assert.equal(result.ok, false);
  assert.equal(await readFile(path.join(rootPath, "keep.md"), "utf8"), "content");
  const folder = await createHostEntry({ rootPath, directoryRelativePath: "", name: "keep.md", kind: "directory" });
  assert.equal(folder.ok, false);
});

test("trims the name and rejects names that leave the folder", async () => {
  assert.deepEqual(
    await createHostEntry({ rootPath, directoryRelativePath: "", name: "  b.md ", kind: "file" }),
    { ok: true, relativePath: "b.md" },
  );
  for (const name of ["", "  ", ".", "..", "../out", "a/b", "a\\b", "a\0b", "x".repeat(256)]) {
    const result = await createHostEntry({ rootPath, directoryRelativePath: "", name, kind: "file" });
    assert.equal(result.ok, false, JSON.stringify(name.slice(0, 8)));
  }
  assert.equal(entryNameProblem("Отчёт за май.md"), null);
});

test("refuses a folder outside the root, including through a symlink", async () => {
  const outside = await mkdtemp(path.join(os.tmpdir(), "create-entry-out-"));
  try {
    await symlink(outside, path.join(rootPath, "link"));
    for (const directoryRelativePath of ["../", "link", "missing"]) {
      const result = await createHostEntry({ rootPath, directoryRelativePath, name: "x", kind: "file" });
      assert.equal(result.ok, false, directoryRelativePath);
    }
    await assert.rejects(stat(path.join(outside, "x")));
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
