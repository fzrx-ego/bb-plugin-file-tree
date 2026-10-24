import assert from "node:assert/strict";
import { appendFile, mkdtemp, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createDirectoryWatchManager as createWatchManager, type DirectoryChange } from "./directory-watch";

function createDirectoryWatchManager(
  emit: Parameters<typeof createWatchManager>[0],
  report: Parameters<typeof createWatchManager>[1],
  retain: () => { dispose(): Promise<void> },
  timing?: Parameters<typeof createWatchManager>[2],
) {
  const manager = createWatchManager(emit, report, timing);
  return { ...manager, update: (input: Parameters<typeof manager.update>[0]) => manager.update(input, retain) };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await delay(10);
  assert.ok(predicate(), "expected filesystem notification");
}
async function fixture(run: (root: string, manager: ReturnType<typeof createDirectoryWatchManager>, events: DirectoryChange[], errors: unknown[], released: () => number) => Promise<void>, leaseMs = 10_000) {
  const root = await mkdtemp(path.join(os.tmpdir(), "file-tree-watch-"));
  const events: DirectoryChange[] = [];
  const errors: unknown[] = [];
  let releases = 0;
  const manager = createDirectoryWatchManager(async (e) => { events.push(e); }, (e) => errors.push(e), () => ({ dispose: async () => { releases++; } }), { leaseMs, batchMs: 30 });
  try { await run(root, manager, events, errors, () => releases); }
  finally { manager.dispose(); await rm(root, { recursive: true, force: true }); }
}
const request = (rootPath: string, relativePaths = [""]) => ({ watchId: "window-1", rootId: "root-1", rootPath, relativePaths });

test("external create, rename, delete, directory replacement, and recreated children notify", () => fixture(async (root, manager, events, errors) => {
  await mkdir(path.join(root, "Docs"));
  await manager.update(request(root, ["", "Docs"]));
  for (const operation of [
    () => writeFile(path.join(root, "Docs", "generated.md"), "document"),
    () => rename(path.join(root, "Docs", "generated.md"), path.join(root, "Docs", "renamed.md")),
    () => rm(path.join(root, "Docs", "renamed.md")),
  ]) {
    events.length = 0;
    await operation();
    await until(() => events.some((e) => e.relativePaths.includes("Docs")));
    await manager.update(request(root, ["", "Docs"]));
  }
  events.length = 0;
  await rm(path.join(root, "Docs"), { recursive: true });
  await until(() => events.some((e) => e.relativePaths.includes("")));
  events.length = 0;
  await mkdir(path.join(root, "Docs"));
  await until(() => events.some((e) => e.relativePaths.includes("")));
  await manager.update(request(root, ["", "Docs"]));
  await delay(50);
  events.length = 0;
  await writeFile(path.join(root, "Docs", "after-recreate.md"), "yes");
  await until(() => events.some((e) => e.relativePaths.includes("Docs")));
  assert.deepEqual(errors, []);
}));

test("idle, content writes, and changes below unwatched directories do not trigger refresh", () => fixture(async (root, manager, events) => {
  await mkdir(path.join(root, "node_modules"));
  await writeFile(path.join(root, "existing.md"), "before");
  await manager.update(request(root));
  await delay(150);
  events.length = 0;
  await appendFile(path.join(root, "existing.md"), "after");
  for (let i = 0; i < 50; i++) await writeFile(path.join(root, "node_modules", `${i}.js`), "dependency");
  await delay(70);
  assert.deepEqual(events, []);
  assert.deepEqual(manager.counts(), { sessions: 1, watches: 1 });
}));

test("creation bursts coalesce and explicit stop releases all watchers and worker lease", () => fixture(async (root, manager, events, errors, released) => {
  await manager.update(request(root));
  await Promise.all(Array.from({ length: 100 }, (_, i) => writeFile(path.join(root, `${i}.md`), "")));
  await until(() => events.length > 0);
  await delay(50);
  assert.ok(events.length <= 2, `burst generated ${events.length} signals`);
  await manager.update(request(root, []));
  const count = events.length;
  await writeFile(path.join(root, "stopped.md"), "");
  await delay(60);
  assert.equal(events.length, count);
  assert.deepEqual(manager.counts(), { sessions: 0, watches: 0 });
  assert.equal(released(), 1);
  assert.deepEqual(errors, []);
}));

test("abandoned sessions expire; renewals retain only requested folders", () => fixture(async (root, manager, _events, _errors, released) => {
  await mkdir(path.join(root, "Docs"));
  await manager.update(request(root, ["", "Docs"]));
  await manager.update(request(root, [""]));
  assert.equal(manager.counts().watches, 1);
  await until(() => manager.counts().sessions === 0);
  assert.equal(released(), 1);
}, 100));

test("path traversal and symlinks outside the trusted root are rejected without resources", () => fixture(async (root, manager) => {
  await symlink(os.tmpdir(), path.join(root, "outside"));
  await assert.rejects(manager.update(request(root, ["../"])), /escapes/);
  await assert.rejects(manager.update(request(root, ["outside"])), /escapes/);
  assert.deepEqual(manager.counts(), { sessions: 0, watches: 0 });
}));

test("queued stop and disposal cannot resurrect an asynchronous watch start", () => fixture(async (root, manager) => {
  const start = manager.update(request(root));
  const stop = manager.update(request(root, []));
  await Promise.all([start, stop]);
  assert.deepEqual(manager.counts(), { sessions: 0, watches: 0 });
  const inFlight = manager.update(request(root));
  manager.dispose();
  await assert.rejects(inFlight, /disposed/);
  assert.deepEqual(manager.counts(), { sessions: 0, watches: 0 });
}));


test("a rejected worker lease rolls back the watch session", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "file-tree-lease-fail-"));
  const manager = createWatchManager(async () => {}, () => {});
  try {
    await assert.rejects(manager.update(request(rootPath), () => { throw new Error("context closed"); }), /context closed/);
    assert.deepEqual(manager.counts(), { sessions: 0, watches: 0 });
  } finally { manager.dispose(); await rm(rootPath, { recursive: true, force: true }); }
});
