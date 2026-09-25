import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listHostDirectory } from "./host-listing";
import { invalidateListings, listDir } from "./listing";
import { registerRoot } from "./roots";

test("host listing shows immediate hidden children, symlinks, and .git when enabled", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bb-file-tree-list-test-"));
  try {
    await mkdir(path.join(rootPath, "Docs"));
    await mkdir(path.join(rootPath, ".claude", "handoffs"), { recursive: true });
    await mkdir(path.join(rootPath, ".git"));
    await symlink(".claude", path.join(rootPath, ".agents"));
    await writeFile(path.join(rootPath, ".claude", "handoffs", "target.md"), "test");

    const plain = await listHostDirectory(rootPath, "", false);
    assert.deepEqual(plain.entries.map((entry) => entry.name), ["Docs"]);

    const shown = await listHostDirectory(rootPath, "", true);
    assert.deepEqual(shown.entries.map((entry) => entry.name), [".agents", ".claude", ".git", "Docs"]);
    assert.equal(shown.entries.find((entry) => entry.name === ".agents")?.kind, "directory");
    assert.equal(shown.entries.some((entry) => entry.name === "handoffs"), false);

    const handoffs = await listHostDirectory(rootPath, ".claude/handoffs", true);
    assert.deepEqual(handoffs.entries.map((entry) => entry.name), ["target.md"]);

    const rootId = registerRoot("test-host", rootPath);
    const seen: string[] = [];
    const callHost = async (input: { hostId: string; rootPath: string; relativePath: string; showSkipped: boolean }) => {
      seen.push(input.hostId);
      return listHostDirectory(input.rootPath, input.relativePath, input.showSkipped);
    };
    const throughServer = await listDir({ rootId, relativePath: "", showSkipped: true }, callHost);
    assert.deepEqual(throughServer.entries, shown.entries);
    await listDir({ rootId, relativePath: "", showSkipped: true }, callHost);
    assert.deepEqual(seen, ["test-host"]);
    invalidateListings(rootId);
    await listDir({ rootId, relativePath: "", showSkipped: true }, callHost);
    assert.deepEqual(seen, ["test-host", "test-host"]);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("host listing rejects a symlink that leaves the workspace", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bb-file-tree-symlink-test-"));
  try {
    await symlink(os.tmpdir(), path.join(rootPath, "outside"));
    await assert.rejects(() => listHostDirectory(rootPath, "outside", true), /path escapes the workspace/);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("an invalidated in-flight listing cannot refill the cache", async () => {
  const rootId = registerRoot("stale-host", "/stale/project");
  let release!: (value: { entries: { name: string; relativePath: string; kind: "file" }[] }) => void;
  const pending = new Promise<{ entries: { name: string; relativePath: string; kind: "file" }[] }>((resolve) => {
    release = resolve;
  });
  const input = { rootId, relativePath: "", showSkipped: true };
  const old = listDir(input, async () => pending);
  invalidateListings(rootId);
  release({ entries: [{ name: "old.md", relativePath: "old.md", kind: "file" }] });
  await old;
  const fresh = await listDir(input, async () => ({ entries: [
    { name: "new.md", relativePath: "new.md", kind: "file" },
  ] }));
  assert.deepEqual(fresh.entries.map((entry) => entry.name), ["new.md"]);
});
