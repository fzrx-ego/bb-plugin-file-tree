import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { statHostPath } from "./host-listing";
import { resolveFileAnchors, resolveInWorkspace, resolvePaths } from "./reveal";
import { registerRoot, resolveRoot } from "./roots";

test("screenshot folder shorthands and shared storage links validate and reveal the same target", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "file-tree-chat-dirs-"));
  const workspace = path.join(base, "Agent-Harness");
  const project = path.join(base, "Aurency Project");
  const storage = path.join(base, "thread-storage");
  const talks = path.join(project, "Docs/Operations/AI-Adoption/External-Talks");
  const file = path.join(storage, "varco-api-review/Varco-Aurency-TMS-API-Reply.md");
  try {
    await mkdir(workspace);
    await mkdir(talks, { recursive: true });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "draft");
    const bb = {
      sdk: {
        system: { config: async () => ({ primaryHostId: "host-local" }) },
        threads: {
          get: async () => ({ environmentId: "env", projectId: "harness" }),
          storageLocation: async () => ({ hostId: "host-local", storageRootPath: path.join(storage, "thread-current") }),
        },
        environments: { get: async () => ({ id: "env", hostId: "host-local", path: workspace }) },
        projects: { list: async () => [{ id: "aurency", sources: [{ hostId: "host-local", path: project }], name: "Aurency" }] },
        hosts: {
          directory: async () => ({ entries: [] }),
          pathsExist: async ({ paths }: { paths: string[] }) => ({ existence: Object.fromEntries(paths.map((p) => [p, p === talks || p === file])) }),
        },
      },
      log: { warn: () => {} },
    } as unknown as BbPluginApi;
    const roots = async () => [base, storage];
    const probe = (hostId: string, root: string, relative: string) => {
      assert.equal(hostId, "host-local");
      return statHostPath(root, relative);
    };
    const paths = ["AI-Adoption/External-Talks", "AI-Adoption", file];
    assert.deepEqual((await resolvePaths(bb, { threadId: "thread-current", paths }, roots, probe)).known, paths);
    for (const [raw, target, directory] of [
      [paths[0]!, talks, true],
      [paths[1]!, path.dirname(talks), true],
      [file, file, false],
    ] as const) {
      const reveal = await resolveInWorkspace(bb, { threadId: "thread-current", path: raw }, roots, probe);
      assert.equal(reveal.ok, true);
      if (reveal.ok) {
        assert.equal(path.join(reveal.root?.rootPath ?? workspace, reveal.relativePath), target);
        assert.equal(reveal.isDirectory, directory);
      }
    }
    const absent = ["ordinary", "missing/folder", `${storage}/missing.md`, `${base}-other/report.md`];
    assert.deepEqual((await resolvePaths(bb, { threadId: "thread-current", paths: absent }, roots, probe)).known, []);
    const fixed = await resolveFileAnchors(bb, { threadId: "thread-current", anchors: [
      { text: "Папка материалов", href: talks }, { text: "Черновик", href: file },
    ] }, roots, probe);
    assert.deepEqual(fixed.fixes, [{ text: "Папка материалов", href: talks, absolutePath: talks, hostId: "host-local", isDirectory: true }]);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("searching a large storage folder keeps the pinned tree root valid", async () => {
  const pinned = registerRoot("host-large", "/pinned-tree");
  const bb = {
    sdk: {
      system: { config: async () => ({ primaryHostId: "host-large" }) },
      threads: { get: async () => ({ environmentId: "env", projectId: "project" }) },
      environments: { get: async () => ({ id: "env", hostId: "host-large", path: "/workspace" }) },
      projects: { list: async () => [] },
      hosts: { directory: async () => ({ entries: Array.from({ length: 600 }, (_, n) => ({ name: `thread-${n}`, kind: "directory" })) }) },
    },
    log: { warn: () => {} },
  } as unknown as BbPluginApi;
  await resolvePaths(bb, { threadId: "thread-large", paths: ["missing"] }, async () => ["/storage"], async () => null);
  assert.deepEqual(resolveRoot(pinned), { hostId: "host-large", rootPath: "/pinned-tree" });
});
