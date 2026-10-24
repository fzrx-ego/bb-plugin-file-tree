import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import hostEntry from "../host";
import type { ExperimentalHostRpcContext } from "@get-bb/plugin-sdk/host";
import type { hostSignals } from "../host-contract";

// Mirror the real BB worker: retain is legal only while its request is active.
test("host watch start/stop/reopen retains through the current RPC context", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "file-tree-host-context-"));
  let retained = 0;
  let released = 0;
  const request = { watchId: "d154e1e4-dd84-4b3f-8178-df70a2b996f8", rootId: "root", rootPath, relativePaths: [""] };
  const call = async (relativePaths: string[]) => {
    let active = true;
    const context = {
      signal: new AbortController().signal,
      lifecycle: { signal: new AbortController().signal },
      experimental_paths: { dataDir: rootPath, tempDir: rootPath },
      experimental_emitSignal: async () => {},
      experimental_retainWorker: () => {
        if (!active) throw new Error("host call context is no longer active");
        retained++;
        return { dispose: async () => { released++; } };
      },
    } as unknown as ExperimentalHostRpcContext<typeof hostSignals>;
    try { return await hostEntry.handlers.syncDirectoryWatch({ ...request, relativePaths }, context); }
    finally { active = false; }
  };
  try {
    assert.equal((await call([""])).reset, true);
    await call([]);
    assert.equal((await call([""])).reset, true);
    await call([]);
    assert.equal(retained, 2);
    assert.equal(released, 2);
  } finally { await hostEntry.dispose?.(); await rm(rootPath, { recursive: true, force: true }); }
});
