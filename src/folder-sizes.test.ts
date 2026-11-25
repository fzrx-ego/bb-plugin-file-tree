import { test, expect } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFolderSizes, measureFolder } from "./folder-sizes";
import { folderSizeLabel } from "../lib/folder-size-format";

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test("a bounded queue measures one folder at a time, saves the result and drops old demand", async () => {
  let stamp = 20;
  const measurements: string[] = [];
  let done: (value: number) => void = () => {};
  let releases = 0;
  const sizes = createFolderSizes(({ relativePath }) => new Promise(resolve => {
    measurements.push(relativePath);
    done = resolve;
  }), () => stamp);
  const retain = () => ({ dispose: async () => { releases += 1; } });
  try {
    expect(sizes.request("window-a", "/test", ["alpha", "beta", "../outside"], retain).pending).toBe(2);
    expect(measurements).toEqual(["alpha"]);
    stamp += 6000;
    done(1024);
    await flush();
    expect(measurements).toEqual(["alpha"]);
    expect(releases).toBe(1);
    const cached = sizes.request("window-a", "/test", ["alpha"], retain).sizes.alpha;
    expect(cached).toEqual({ state: "ready", kib: 1024, checkedAt: stamp, stale: false });
    expect(folderSizeLabel(cached)?.text).toBe("1 МБ");
  } finally {
    sizes.dispose();
  }
});

test("stopping one window keeps shared work and drops folders only that window requested", async () => {
  const measurements: { relativePath: string; signal: AbortSignal }[] = [];
  let finish: (value: number) => void = () => {};
  const sizes = createFolderSizes(({ relativePath }, signal) => new Promise(resolve => {
    measurements.push({ relativePath, signal });
    finish = resolve;
  }));
  const retain = () => ({ dispose: async () => {} });
  try {
    sizes.request("window-a", "/test", ["shared", "only-a"], retain);
    sizes.request("window-b", "/test", ["shared", "only-b"], retain);
    sizes.stop("window-a");
    expect(measurements[0].signal.aborted).toBe(false);
    finish(12);
    await flush();
    expect(measurements.map(({ relativePath }) => relativePath)).toEqual(["shared", "only-b"]);
    sizes.stop("window-b");
    expect(measurements[1].signal.aborted).toBe(true);
    sizes.request("window-b-reopened", "/test", ["only-b"], retain);
    expect(measurements).toHaveLength(2);
    finish(50);
    await flush();
    expect(measurements.map(({ relativePath }) => relativePath)).toEqual(["shared", "only-b", "only-b"]);
    expect(measurements[2].signal.aborted).toBe(false);
    expect(sizes.request("window-b-reopened", "/test", ["only-b"], retain).sizes["only-b"])
      .toEqual({ state: "pending" });
  } finally {
    sizes.dispose();
    finish(0);
  }
});

test("work expires when a disconnected window cannot send stop", async () => {
  const measured: string[] = [];
  let released = 0;
  const sizes = createFolderSizes(({ relativePath }, signal) => new Promise(resolve => {
    measured.push(relativePath);
    signal.addEventListener("abort", () => resolve(null), { once: true });
  }));
  try {
    sizes.request("closed-window", "/test", ["active", "queued"], () => ({ dispose: async () => { released += 1; } }));
    await new Promise<void>(resolve => setTimeout(resolve, 5100));
    expect(measured).toEqual(["active"]);
    expect(released).toBe(1);
  } finally {
    sizes.dispose();
  }
}, { timeout: 8000 });

test("reads the disk usage of a real subdirectory and skips symlinks in the path", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "bb-folder-size-")));
  const signal = new AbortController().signal;
  try {
    await mkdir(path.join(root, "target", "nested"), { recursive: true });
    await writeFile(path.join(root, "target", "data"), Buffer.alloc(256 * 1024, 33));
    await symlink(path.join(root, "target"), path.join(root, "link"), "dir");
    expect(await measureFolder({ rootPath: root, relativePath: "target" }, signal)).toBeGreaterThanOrEqual(256);
    expect(await measureFolder({ rootPath: root, relativePath: "link" }, signal)).toBeNull();
    expect(await measureFolder({ rootPath: root, relativePath: "link/nested" }, signal)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
