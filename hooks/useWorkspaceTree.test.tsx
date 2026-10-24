import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mock } from "bun:test";
import { JSDOM } from "jsdom";
import { act, createElement, StrictMode, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { mkdtemp, mkdir, rm, writeFile, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDirectoryWatchManager as createWatchManager } from "../src/directory-watch";
import { statHostPath } from "../src/host-listing";
import { listHostDirectory } from "../src/host-listing";
import { visibleDirectories } from "../lib/visible-directories";

function createDirectoryWatchManager(
  emit: Parameters<typeof createWatchManager>[0],
  report: Parameters<typeof createWatchManager>[1],
  retain: () => { dispose(): Promise<void> },
  timing?: Parameters<typeof createWatchManager>[2],
) {
  const manager = createWatchManager(emit, report, timing);
  return { ...manager, update: (input: Parameters<typeof manager.update>[0]) => manager.update(input, retain) };
}

const dom = new JSDOM("<body></body>", { url: "http://localhost", pretendToBeVisual: true });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
  Node: dom.window.Node, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement,
  HTMLAnchorElement: dom.window.HTMLAnchorElement, MutationObserver: dom.window.MutationObserver,
  AbortController: dom.window.AbortController, CustomEvent: dom.window.CustomEvent,
});
let connection = "connected";
let freshSdkIdentities = false;
let showSkipped = false;
let rootPath = "";
const calls: { method: string; input: any }[] = [];
const subscribers = new Set<(payload: unknown) => void>();
const errors: unknown[] = [];
let watchManager: ReturnType<typeof createDirectoryWatchManager>;
let overrideList: ((input: any) => Promise<any>) | null = null;
let overrideStat: ((input: any) => Promise<any>) | null = null;
const rpc = { call: async (method: string, input: any) => {
  calls.push({ method, input });
  if (method === "clientLog") return { ok: true };
  if (method === "resolvePaths") return { known: input.paths };
  if (method === "resolveFileAnchors") return { fixes: [] };
  if (method === "syncDirectoryWatch") {
    const reset = await watchManager.update({ ...input, rootPath });
    return { ok: true, reset };
  }
  if (method === "statPath") return overrideStat ? overrideStat(input) : statHostPath(rootPath, input.relativePath);
  if (method === "resolveInRoot") {
    const target = await statHostPath(rootPath, input.path);
    return target ? { ok: true, relativePath: input.path, isDirectory: target.isDirectory, root: null } : { ok: false, message: "missing" };
  }
  if (method === "listDir") return overrideList ? overrideList(input) : listHostDirectory(rootPath, input.relativePath, input.showSkipped);
  throw new Error(`unexpected RPC ${method}`);
} };
mock.module("@get-bb/plugin-sdk/app", () => ({
  useRpc: () => freshSdkIdentities ? { call: rpc.call } : rpc,
  useBbNavigate: () => ({ experimental_openFilePreview: () => true }),
  useSettings: () => ({ values: { showSkipped }, isLoading: false }),
  useRealtimeConnectionState: () => connection,
  useRealtime: (_channel: string, fn: (payload: unknown) => void) => {
    useEffect(() => { subscribers.add(fn); return () => { subscribers.delete(fn); }; }, [fn]);
  },
}));
mock.module("sonner", () => ({ toast: { error: (e: unknown) => errors.push(e) } }));
const { useWorkspaceTree } = await import("./useWorkspaceTree");
let model: ReturnType<typeof useWorkspaceTree>;
let mounted: Root | null = null;
let enabled = true;
let workspace = { rootId: "root-1", rootPath: "", rootName: "Test", hostId: "host-1", environmentId: null };
function App() { model = useWorkspaceTree(workspace, enabled); return createElement("div", null, Object.entries(model.dirs).map(([key, state]) => createElement("p", { key }, state.status === "ready" ? state.entries.map((e) => e.name).join(",") : state.status))); }
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function flush(ms = 20) { await act(async () => { await delay(ms); }); }
async function until(predicate: () => boolean) {
  for (let i = 0; i < 100 && !predicate(); i++) await flush(10);
  assert.ok(predicate(), document.body.textContent ?? "no DOM");
}
function names(directory = "") { const state = model.dirs[directory]; return state?.status === "ready" ? state.entries.map((e) => e.name) : []; }
async function setup(strict = false) {
  rootPath = await mkdtemp(path.join(os.tmpdir(), "file-tree-react-"));
  workspace = { ...workspace, rootId: "root-1", rootPath };
  calls.length = 0; errors.length = 0; enabled = true; connection = "connected"; showSkipped = false; overrideList = null; overrideStat = null;
  watchManager = createDirectoryWatchManager(async (payload) => { for (const fn of subscribers) fn(payload); }, (e) => errors.push(e), () => ({ dispose: async () => {} }), { leaseMs: 90_000, batchMs: 30 });
  const container = document.createElement("main"); document.body.append(container);
  mounted = createRoot(container);
  await act(async () => { mounted!.render(strict ? createElement(StrictMode, null, createElement(App)) : createElement(App)); });
  await flush();
}
async function rerender() { await act(async () => { mounted!.render(createElement(App)); }); await flush(); }
afterEach(async () => {
  if (mounted) await act(async () => { mounted!.unmount(); });
  freshSdkIdentities = false;
  mounted = null; watchManager?.dispose(); document.body.innerHTML = "";
  if (rootPath) await rm(rootPath, { recursive: true, force: true });
});

test("a document created by chat appears in an already open tree; rename and delete propagate", async () => {
  await setup();
  await writeFile(path.join(rootPath, "generated.md"), "generated by active chat");
  await until(() => names().includes("generated.md"));
  await rename(path.join(rootPath, "generated.md"), path.join(rootPath, "renamed.md"));
  await until(() => names().includes("renamed.md") && !names().includes("generated.md"));
  await rm(path.join(rootPath, "renamed.md"));
  await until(() => !names().includes("renamed.md"));
  assert.deepEqual(errors, []);
});

test("reopening a cached collapsed folder fetches changes; collapsed descendants hold no watches", async () => {
  await setup(); await mkdir(path.join(rootPath, "Docs", "deep"), { recursive: true });
  await until(() => names().includes("Docs"));
  await act(async () => { model.toggleDir("Docs"); }); await flush();
  await act(async () => { model.toggleDir("Docs/deep"); }); await flush();
  await act(async () => { model.toggleDir("Docs"); }); await flush();
  assert.deepEqual(visibleDirectories(model.expanded), [""]);
  assert.equal(watchManager.counts().watches, 1);
  await writeFile(path.join(rootPath, "Docs", "new.md"), "");
  await act(async () => { model.toggleDir("Docs"); });
  await until(() => names("Docs").includes("new.md"));
});

test("hiding the panel releases watches; showing it reconciles files created while hidden", async () => {
  await setup();
  enabled = false; await rerender();
  assert.equal(watchManager.counts().watches, 0);
  const requestCount = calls.filter((c) => c.method === "listDir").length;
  await writeFile(path.join(rootPath, "hidden.md"), ""); await flush(60);
  assert.equal(calls.filter((c) => c.method === "listDir").length, requestCount);
  enabled = true; await rerender();
  await until(() => names().includes("hidden.md"));
});

test("document visibility and realtime reconnect reconcile missed events", async () => {
  await setup();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); }); await flush();
  assert.equal(watchManager.counts().watches, 0);
  await writeFile(path.join(rootPath, "missed.md"), "");
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); });
  await until(() => names().includes("missed.md"));
  connection = "reconnecting"; await rerender();
  await writeFile(path.join(rootPath, "reconnect.md"), "");
  connection = "connected"; await rerender();
  await until(() => names().includes("reconnect.md"));
});

test("late response from a different root cannot replace current tree entries", async () => {
  await setup(); enabled = false; await rerender();
  let release!: (value: any) => void;
  overrideList = async () => new Promise((r) => { release = r; });
  await act(async () => { model.reload(); });
  overrideList = null;
  workspace = { ...workspace, rootId: "root-2", rootPath: rootPath + "/other" };
  await writeFile(path.join(rootPath, "current.md"), "");
  await rerender();
  await until(() => names().includes("current.md"));
  await act(async () => { release({ entries: [{ name: "stale.md", relativePath: "stale.md", kind: "file" }] }); });
  assert.ok(names().includes("current.md")); assert.ok(!names().includes("stale.md"));
});


test("a deleted and recreated expanded folder resumes automatic updates", async () => {
  await setup(); await mkdir(path.join(rootPath, "Docs"));
  await until(() => names().includes("Docs"));
  await act(async () => { model.toggleDir("Docs"); }); await flush();
  await rm(path.join(rootPath, "Docs"), { recursive: true });
  await until(() => !names().includes("Docs"));
  await mkdir(path.join(rootPath, "Docs"));
  await until(() => names().includes("Docs"));
  await writeFile(path.join(rootPath, "Docs", "recreated.md"), "");
  await until(() => names("Docs").includes("recreated.md"));
});


test("lease renewal after a worker restart reconciles files created while no watches existed", async () => {
  const originalSetInterval = globalThis.setInterval;
  let renew: (() => void) | undefined;
  globalThis.setInterval = ((callback: () => void, ms: number, ...args: unknown[]) => {
    if (ms === 30_000) renew = callback;
    return originalSetInterval(callback, ms, ...args);
  }) as typeof setInterval;
  try {
    await setup();
    watchManager.dispose();
    watchManager = createDirectoryWatchManager(async (payload) => { for (const fn of subscribers) fn(payload); }, (e) => errors.push(e), () => ({ dispose: async () => {} }));
    await writeFile(path.join(rootPath, "during-restart.md"), "");
    await act(async () => { renew!(); });
    await until(() => names().includes("during-restart.md"));
    assert.equal(watchManager.counts().sessions, 1);
  } finally { globalThis.setInterval = originalSetInterval; }
});


test("continuous changes with a slow listing show intermediate progress with one request in flight", async () => {
  await setup();
  let concurrent = 0;
  let peak = 0;
  let version = 0;
  overrideList = async () => {
    concurrent++; peak = Math.max(peak, concurrent);
    const snapshot = ++version;
    await delay(110);
    concurrent--;
    return { entries: [{ name: `v${snapshot}.md`, relativePath: `v${snapshot}.md`, kind: "file" }] };
  };
  const watchId = calls.findLast((c) => c.method === "syncDirectoryWatch" && c.input.relativePaths.length)?.input.watchId;
  const observations: string[] = [];
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      for (const fn of subscribers) fn({ watchId, rootId: workspace.rootId, relativePaths: [""] });
      await delay(60);
    });
    observations.push(names().join(","));
  }
  assert.equal(peak, 1);
  assert.ok(new Set(observations.filter(Boolean)).size >= 2, `no intermediate progress: ${observations}`);
  await until(() => concurrent === 0);
  assert.deepEqual(errors, []);
});

test("external rename and delete remove the old chat reveal without hiding existing hidden targets", async () => {
  await setup();
  await writeFile(path.join(rootPath, "revealed.md"), "");
  await until(() => names().includes("revealed.md"));
  await act(async () => { await model.reveal("revealed.md"); });
  await rename(path.join(rootPath, "revealed.md"), path.join(rootPath, "renamed.md"));
  await until(() => !names().includes("revealed.md") && names().includes("renamed.md"));
  await act(async () => { await model.reveal("renamed.md"); });
  await rm(path.join(rootPath, "renamed.md"));
  await until(() => !names().includes("renamed.md"));
  await mkdir(path.join(rootPath, ".hidden"));
  await writeFile(path.join(rootPath, ".hidden", "existing.md"), "");
  await act(async () => { await model.reveal(".hidden/existing.md"); });
  await until(() => names(".hidden").includes("existing.md"));
  await writeFile(path.join(rootPath, "another.md"), "");
  await until(() => names().includes("another.md"));
  assert.ok(names().includes(".hidden"));
  assert.ok(names(".hidden").includes("existing.md"));
  await rm(path.join(rootPath, ".hidden", "existing.md"));
  await until(() => !names(".hidden").includes("existing.md"));
  assert.deepEqual(errors, []);
});


test("React StrictMode effect cleanup cannot strand the initial directory in loading", async () => {
  await setup(true);
  await until(() => model.dirs[""]?.status === "ready");
  await writeFile(path.join(rootPath, "strict-mode.md"), "");
  await until(() => names().includes("strict-mode.md"));
});


test("continuous changes with slow stat remove the deleted reveal before events stop and keep one probe in flight", async () => {
  await setup();
  await writeFile(path.join(rootPath, "slow-reveal.md"), "");
  await until(() => names().includes("slow-reveal.md"));
  await act(async () => { await model.reveal("slow-reveal.md"); });
  let concurrent = 0; let peak = 0;
  overrideStat = async (input) => {
    concurrent++; peak = Math.max(peak, concurrent);
    const result = await statHostPath(rootPath, input.relativePath);
    await delay(110);
    concurrent--;
    return result;
  };
  await rm(path.join(rootPath, "slow-reveal.md"));
  const watchId = calls.findLast((c) => c.method === "syncDirectoryWatch" && c.input.relativePaths.length)?.input.watchId;
  const observations: boolean[] = [];
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      for (const fn of subscribers) fn({ watchId, rootId: workspace.rootId, relativePaths: [""] });
      await delay(60);
    });
    observations.push(names().includes("slow-reveal.md"));
  }
  assert.equal(peak, 1);
  assert.ok(observations.slice(0, -1).some((visible) => !visible), `deleted reveal persisted: ${observations}`);
  await until(() => concurrent === 0);
  assert.ok(!names().includes("slow-reveal.md"));
  assert.deepEqual(errors, []);
});


test("chat reveal buttons survive header rerenders with new SDK handle identities", async () => {
  await setup();
  const { ChatPathBridge } = await import("../components/ChatPathBridge");
  const { subscribeReveal } = await import("../lib/reveal-bus");
  const message = document.createElement("div"); message.className = "group/message";
  const anchor = document.createElement("a"); anchor.href = "file:///tmp/bridge-summary.md"; anchor.textContent = "Executive summary";
  message.append(anchor); document.body.append(message);
  freshSdkIdentities = true;
  await act(async () => { mounted!.render(createElement(ChatPathBridge, { threadId: "bridge-rerender-thread" })); });
  await until(() => anchor.querySelector("button[data-file-tree-reveal]") !== null);
  const original = anchor.querySelector("button") as HTMLButtonElement;
  const reveals: string[] = []; const stop = subscribeReveal(({ path }) => reveals.push(path));
  try {
    original.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true }));
    await act(async () => { mounted!.render(createElement(ChatPathBridge, { threadId: "bridge-rerender-thread" })); });
    assert.equal(original.isConnected, true, "rerender removed the pressed button");
    assert.equal(anchor.querySelector("button"), original);
    original.dispatchEvent(new dom.window.MouseEvent("pointerup", { bubbles: true }));
    original.click();
    assert.deepEqual(reveals, ["/tmp/bridge-summary.md"]);
    assert.equal(calls.filter((c) => c.method === "resolvePaths").length, 1);
  } finally { stop(); }
});
