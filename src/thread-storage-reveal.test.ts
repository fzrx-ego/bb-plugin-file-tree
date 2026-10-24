import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { statHostPath } from "./host-listing";
import { resolveInWorkspace, resolvePaths } from "./reveal";
import { resolveRoot } from "./roots";

async function fixture(run: (f: { bb: BbPluginApi; storage: string; project: string; requests: () => number }) => Promise<void>, noEnvironment = false) {
  const base = await mkdtemp(path.join(os.tmpdir(), "file-tree-storage-"));
  const storage = path.join(base, "thread-storage", "thread-current");
  const project = path.join(base, "project");
  await mkdir(path.join(storage, "workshop"), { recursive: true });
  await mkdir(project);
  let requests = 0;
  const bb = {
    sdk: {
      threads: {
        get: async () => ({ environmentId: noEnvironment ? null : "env-1", projectId: "project-1" }),
        storageLocation: async ({ threadId }: { threadId: string }) => {
          assert.equal(threadId, "thread-current"); requests++;
          return { hostId: "storage-host", storageRootPath: storage };
        },
      },
      environments: { get: async () => ({ id: "env-1", hostId: "project-host", path: project }) },
      projects: { list: async () => [] },
    },
    log: { warn: () => {} },
  } as unknown as BbPluginApi;
  try { await run({ bb, storage, project, requests: () => requests }); }
  finally { await rm(base, { recursive: true, force: true }); }
}
const noSearch = async () => [];

test("all five screenshot links validate in one storage-location request and reveal on the owning host", () => fixture(async ({ bb, storage, project, requests }) => {
  const files = ["transcript.md", "transcript.pdf", "summary.md", "summary.pdf", "workshop-materials.zip"];
  const paths = files.map((file) => path.join(storage, "workshop", file));
  for (const file of paths) await writeFile(file, "document");
  const seen: string[] = [];
  const probe = async (hostId: string, root: string, relative: string) => {
    assert.equal(hostId, root === project ? "project-host" : "storage-host");
    seen.push(root);
    return statHostPath(root, relative);
  };
  const known = await resolvePaths(bb, { threadId: "thread-current", paths }, noSearch, probe);
  assert.deepEqual(known.known, paths);
  assert.equal(requests(), 1);
  for (const file of paths) {
    const reveal = await resolveInWorkspace(bb, { threadId: "thread-current", path: file }, noSearch, probe);
    assert.equal(reveal.ok, true);
    if (reveal.ok) {
      assert.equal(reveal.root?.rootPath, storage);
      assert.equal(reveal.root?.hostId, "storage-host");
      assert.equal(reveal.relativePath, `workshop/${path.basename(file)}`);
      assert.equal(resolveRoot(reveal.root!.rootId)?.rootPath, storage);
    }
  }
}));

test("thread files work before an environment has been assigned", () => fixture(async ({ bb, storage }) => {
  const file = path.join(storage, "workshop", "summary.md");
  await writeFile(file, "summary");
  const probe = (_hostId: string, root: string, relative: string) => statHostPath(root, relative);
  assert.deepEqual((await resolvePaths(bb, { threadId: "thread-current", paths: [file] }, noSearch, probe)).known, [file]);
  assert.equal((await resolveInWorkspace(bb, { threadId: "thread-current", path: file }, noSearch, probe)).ok, true);
}, true));

test("storage lookup refuses missing files, adjacent paths, traversal, and symlink escapes", () => fixture(async ({ bb, storage, project }) => {
  const outside = path.join(path.dirname(storage), "thread-other", "secret.md");
  await mkdir(path.dirname(outside)); await writeFile(outside, "other thread");
  await symlink(path.dirname(outside), path.join(storage, "outside"));
  const paths = [path.join(storage, "missing.md"), outside, `${storage}/../thread-other/secret.md`, path.join(storage, "outside", "secret.md")];
  const seen: string[] = [];
  const probe = (_hostId: string, root: string, relative: string) => { seen.push(root); return statHostPath(root, relative); };
  assert.deepEqual((await resolvePaths(bb, { threadId: "thread-current", paths }, noSearch, probe)).known, []);
  assert.ok(seen.every((root) => root === storage || root === project));
}));

test("ordinary project paths do not request storage metadata", () => fixture(async ({ bb, project, requests }) => {
  await writeFile(path.join(project, "local.md"), "local");
  const probe = (_hostId: string, root: string, relative: string) => statHostPath(root, relative);
  assert.deepEqual((await resolvePaths(bb, { threadId: "thread-current", paths: ["local.md", path.join(project, "local.md")] }, noSearch, probe)).known.length, 2);
  assert.equal(requests(), 0);
}));
