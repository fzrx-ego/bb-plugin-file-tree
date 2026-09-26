import assert from "node:assert/strict";
import { test } from "node:test";
import type { Workspace } from "../contract";
import { openWorkspaceFile } from "./open-preview";
import { registerSurfaceNavigation, surfaceNavigation } from "./surface-navigation";

test("window tree opens through the current thread surface", () => {
  const calls: unknown[] = [];
  const navigate = {
    experimental_openFilePreview: (options: unknown) => {
      calls.push(options);
      return true;
    },
  } as unknown as Parameters<typeof registerSurfaceNavigation>[1];
  const workspace: Workspace = {
    environmentId: "env-current",
    hostId: "host-current",
    rootPath: "/project",
    rootName: "Project",
    rootId: "root-current",
  };

  const unregister = registerSurfaceNavigation("thread-current", navigate);
  assert.equal(surfaceNavigation("thread-other"), null);
  assert.equal(openWorkspaceFile(surfaceNavigation("thread-current"), workspace, ".claude/handoffs/file.md"), true);
  assert.deepEqual(calls, [{
    target: { kind: "workspace", environmentId: "env-current", path: ".claude/handoffs/file.md" },
    location: null,
  }]);
  unregister();
  assert.equal(surfaceNavigation("thread-current"), null);
});

test("cleanup of an old mount keeps the newer navigator", () => {
  const oldNavigate = {} as Parameters<typeof registerSurfaceNavigation>[1];
  const newNavigate = {} as Parameters<typeof registerSurfaceNavigation>[1];
  const unregisterOld = registerSurfaceNavigation("thread-current", oldNavigate);
  const unregisterNew = registerSurfaceNavigation("thread-current", newNavigate);
  unregisterOld();
  assert.equal(surfaceNavigation("thread-current"), newNavigate);
  unregisterNew();
  assert.equal(surfaceNavigation("thread-current"), null);
});
