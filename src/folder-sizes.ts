import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { FolderSize, FolderSizes } from "../contract";
import { resolveUnderRoot } from "./paths";

const exec = promisify(execFile);
const refreshMs = 10 * 60_000;
const demandMs = 5_000;
const maxQueue = 512;
const maxCache = 2_048;

type Folder = { rootPath: string; relativePath: string };
type Job = Folder & { demand: Map<string, number> };
type ActiveJob = { key: string; job: Job; controller: AbortController };
type Result = Exclude<FolderSize, { state: "pending" }>;
type WorkerLease = { dispose(): Promise<void> };
type Measure = (folder: Folder, signal: AbortSignal) => Promise<number | null>;

export function createFolderSizes(measure: Measure = measureFolder, now = Date.now) {
  const cache = new Map<string, Result>();
  const queue = new Map<string, Job>();
  let active: ActiveJob | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let lease: WorkerLease | undefined;
  let disposed = false;

  function latestDemand(job: Job): number {
    const stamp = now();
    let latest = stamp;
    for (const [id, expiresAt] of job.demand) {
      if (expiresAt <= stamp) job.demand.delete(id);
      else latest = Math.max(latest, expiresAt);
    }
    return latest - stamp;
  }

  function updateActiveExpiry() {
    clearTimeout(expiryTimer);
    if (!active || active.controller.signal.aborted) return;
    const remaining = latestDemand(active.job);
    if (remaining === 0) active.controller.abort();
    else expiryTimer = setTimeout(updateActiveExpiry, remaining);
  }

  async function drain() {
    while (queue.size && !disposed) {
      const [key, job] = queue.entries().next().value!;
      queue.delete(key);
      if (latestDemand(job) === 0) continue;
      const controller = new AbortController();
      active = { key, job, controller };
      const { signal } = controller;
      updateActiveExpiry();
      try {
        const kib = await measure(job, signal);
        if (!signal.aborted) {
          cache.delete(key);
          cache.set(key, kib === null ? { state: "skipped", checkedAt: now() } : { state: "ready", kib, checkedAt: now(), stale: false });
        }
      } catch {
        if (!signal.aborted) cache.set(key, { state: "unavailable", checkedAt: now() });
      }
      if (cache.size > maxCache) cache.delete(cache.keys().next().value!);
    }
    active = undefined;
    clearTimeout(expiryTimer);
    const held = lease;
    lease = undefined;
    if (held) void held.dispose().catch(() => undefined);
  }

  return {
    request(demandId: string, rootPath: string, paths: readonly string[], retain: () => WorkerLease): FolderSizes {
      const sizes: FolderSizes["sizes"] = Object.create(null);
      if (disposed || process.platform === "win32") return { sizes, pending: 0 };
      const stamp = now();
      let pending = 0;
      for (const relativePath of paths) {
        if (path.isAbsolute(relativePath)) continue;
        try { resolveUnderRoot(rootPath, relativePath); } catch { continue; }
        const key = JSON.stringify([rootPath, relativePath]);
        const old = cache.get(key);
        if (old && stamp - old.checkedAt < refreshMs) {
          sizes[relativePath] = old;
          continue;
        }
        sizes[relativePath] = old?.state === "ready" ? { ...old, stale: true } : { state: "pending" };
        pending += 1;
        if (active?.key === key && !active.controller.signal.aborted) {
          active.job.demand.set(demandId, stamp + demandMs);
        } else {
          const job = queue.get(key) ?? { rootPath, relativePath, demand: new Map<string, number>() };
          job.demand.set(demandId, stamp + demandMs);
          queue.set(key, job);
          if (queue.size > maxQueue) queue.delete(queue.keys().next().value!);
        }
      }
      updateActiveExpiry();
      if (!lease && queue.size) {
        lease = retain();
        void drain();
      }
      return { sizes, pending };
    },
    stop(demandId: string) {
      for (const [key, job] of queue) {
        if (job.demand.delete(demandId) && latestDemand(job) === 0) queue.delete(key);
      }
      if (active?.job.demand.delete(demandId)) updateActiveExpiry();
    },
    dispose() {
      disposed = true;
      queue.clear();
      clearTimeout(expiryTimer);
      active?.controller.abort();
    },
  };
}

export async function measureFolder({ rootPath, relativePath }: Folder, signal: AbortSignal) {
  const lexical = resolveUnderRoot(rootPath, relativePath);
  if (!(await lstat(lexical)).isDirectory()) return null;
  const [root, directory] = await Promise.all([realpath(rootPath), realpath(lexical)]);
  // Avoid following a symlink in any component below the selected root.
  if (directory !== resolveUnderRoot(root, relativePath)) return null;
  signal.throwIfAborted();
  const measurement = exec("/usr/bin/nice", ["-n", "15", "/usr/bin/du", "-skxP", "--", directory], {
    encoding: "utf8",
    timeout: 20_000,
    maxBuffer: 64 * 1024,
  });
  // Wait for the child to close before the queue starts another measurement.
  const abort = () => { measurement.child.kill("SIGKILL"); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const { stdout } = await measurement;
    const match = /^(\d+)\t/u.exec(stdout);
    const kib = match ? Number(match[1]) : NaN;
    if (!Number.isSafeInteger(kib)) throw new Error("Could not read folder size");
    return kib;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
