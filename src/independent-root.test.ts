import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveInRoot, searchFilesInRoot } from "./reveal";
import { listRootChoices } from "./workspace";

test("pinned project root lists and searches its files while another thread is active", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "file-tree-root-"));
  const first = path.join(base, "first");
  const pinned = path.join(base, "pinned");
  try {
    await mkdir(first);
    await mkdir(pinned);
    await writeFile(path.join(first, "other.md"), "other");
    await writeFile(path.join(first, "picked.md"), "other picked");
    await writeFile(path.join(pinned, "picked.md"), "picked");
    const projects = [
      { id: "project-first", kind: "standard", name: "First", sources: [{ id: "source-first", hostId: "host-1", path: first, isDefault: true }] },
      { id: "project-pinned", kind: "standard", name: "Pinned", sources: [{ id: "source-pinned", hostId: "host-1", path: pinned, isDefault: true }] },
    ];
    const bb = {
      sdk: {
        projects: { list: async () => projects },
        threads: { get: async () => ({ environmentId: "env-first", projectId: "project-first" }) },
        environments: { get: async () => ({ id: "env-first", hostId: "host-1", path: first }) },
      },
      log: { warn: () => undefined },
    } as unknown as BbPluginApi;

    const choices = await listRootChoices(bb, { currentThreadId: "thread-first", pinnedThreadId: null });
    const root = choices.find((choice) => choice.id === "source:source-pinned")?.workspace;
    assert.ok(root);
    assert.equal(root.rootPath, pinned);

    const search = await searchFilesInRoot(bb, { rootId: root.rootId, query: "picked", limit: 10 }, async () => []);
    assert.equal(search.hits[0]?.absolutePath, path.join(pinned, "picked.md"));

    const local = await resolveInRoot(bb, { rootId: root.rootId, path: "picked.md" }, async () => []);
    assert.equal(local.ok, true);
    if (local.ok) assert.equal(local.root, null);

    const elsewhere = await resolveInRoot(bb, { rootId: root.rootId, path: path.join(first, "other.md") }, async () => []);
    assert.equal(elsewhere.ok, true);
    if (elsewhere.ok) assert.equal(elsewhere.root?.rootPath, first);

    const absoluteDuplicate = await resolveInRoot(bb, { rootId: root.rootId, path: path.join(first, "picked.md") }, async () => []);
    assert.equal(absoluteDuplicate.ok, true);
    if (absoluteDuplicate.ok) assert.equal(absoluteDuplicate.root?.rootPath, first);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("personal configured folder and actual thread workspace stay separate choices", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "file-tree-personal-"));
  try {
    const workspacePath = path.join(base, "thread-workspace");
    const configuredPath = path.join(base, "documents");
    await mkdir(workspacePath);
    await mkdir(configuredPath);
    const bb = {
      sdk: {
        projects: { list: async () => [
          { id: "proj_personal", kind: "personal", name: "Personal", sources: [] },
          { id: "project-standard", kind: "standard", name: "Standard", sources: [{ id: "source-standard", hostId: "host-1", path: base, isDefault: true }] },
        ] },
        threads: { get: async () => ({ environmentId: "env-personal", projectId: "proj_personal" }) },
        environments: { get: async () => ({ id: "env-personal", hostId: "host-1", path: workspacePath }) },
      },
      log: { warn: () => undefined },
    } as unknown as BbPluginApi;
    const choices = await listRootChoices(bb, { currentThreadId: "thread-personal", pinnedThreadId: null }, configuredPath);
    assert.equal(choices.find((choice) => choice.id === "thread:thread-personal")?.workspace.rootPath, workspacePath);
    assert.equal(choices.find((choice) => choice.id === "personal:proj_personal")?.workspace.rootPath, configuredPath);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
