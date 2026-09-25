import assert from "node:assert/strict";
import { test } from "node:test";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveInWorkspace, resolvePaths, type PathProbe } from "./reveal";

test("chat reveal resolves on the source host when two hosts use the same root path", async () => {
  const rootPath = "/shared/project";
  const bb = {
    sdk: {
      system: { config: async () => ({ primaryHostId: "host-a" }) },
      threads: { get: async () => ({ environmentId: "env-a", projectId: "project-a" }) },
      environments: {
        get: async () => ({ id: "env-a", hostId: "host-a", path: rootPath }),
        paths: async () => ({ paths: [{ name: "foo.md", path: "Notes/foo.md", kind: "file" }] }),
      },
      projects: { list: async () => [
        { id: "project-a", kind: "standard", name: "A", sources: [{ id: "source-a", hostId: "host-a", path: rootPath, isDefault: true }] },
        { id: "project-b", kind: "standard", name: "B", sources: [{ id: "source-b", hostId: "host-b", path: rootPath, isDefault: true }] },
      ] },
    },
    log: { warn: () => undefined },
  } as unknown as BbPluginApi;
  const probe: PathProbe = async (hostId, _rootPath, relativePath) => {
    if (hostId === "host-a" && relativePath === "throws.md") throw new Error("host path unavailable");
    if (hostId === "host-b" && relativePath === "throws.md") return { isDirectory: false };
    if (hostId === "host-b" && relativePath === ".claude/handoffs/target.md") return { isDirectory: false };
    if (hostId === "host-a" && relativePath === ".claude") return { isDirectory: true };
    if (relativePath === "Docs") return { isDirectory: true };
    return null;
  };
  const searchRoots = async () => [];

  const revealed = await resolveInWorkspace(bb, {
    threadId: "thread-a",
    path: ".claude/handoffs/target.md",
  }, searchRoots, probe);
  assert.equal(revealed.ok, true);
  if (revealed.ok) {
    assert.equal(revealed.root?.hostId, "host-b");
    assert.equal(revealed.relativePath, ".claude/handoffs/target.md");
  }

  const known = await resolvePaths(bb, {
    threadId: "thread-a",
    paths: ["throws.md", ".claude/handoffs/target.md", "Docs/missing.md", "Docs/foo.md"],
  }, searchRoots, probe);
  assert.deepEqual(known.known, ["throws.md", ".claude/handoffs/target.md"]);

  const recovered = await resolveInWorkspace(bb, { threadId: "thread-a", path: "throws.md" }, searchRoots, probe);
  assert.equal(recovered.ok, true);
  if (recovered.ok) assert.equal(recovered.root?.hostId, "host-b");
});
