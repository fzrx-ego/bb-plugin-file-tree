import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { resolveRealUnderRoot } from "./paths";

export const WATCH_LEASE_MS = 90_000;
export const WATCH_BATCH_MS = 500;
const MAX_WATCHES = 512;
const MAX_SESSIONS = 32;

type Session = {
  rootId: string;
  rootPath: string;
  watchers: Map<string, { absolute: string; watcher: FSWatcher; stamp: string; inode: string }>;
  pending: Set<string>;
  batch?: ReturnType<typeof setTimeout>;
  expiry?: ReturnType<typeof setTimeout>;
};
export type WatchRequest = { watchId: string; rootId: string; rootPath: string; relativePaths: string[] };
export type DirectoryChange = { watchId: string; rootId: string; relativePaths: string[] };

/** Non-recursive OS watches: no project walk or periodic directory listing. */
export function createDirectoryWatchManager(
  emit: (change: DirectoryChange) => Promise<void>,
  reportError: (cause: unknown) => void,
  timing = { leaseMs: WATCH_LEASE_MS, batchMs: WATCH_BATCH_MS },
) {
  const sessions = new Map<string, Session>();
  let lease: { dispose(): Promise<void> } | undefined;
  let disposed = false;
  // Serialise renew/stop so an asynchronous realpath cannot resurrect a stopped session.
  let queue: Promise<unknown> = Promise.resolve();

  const stop = (watchId: string) => {
    const session = sessions.get(watchId);
    if (!session) return;
    sessions.delete(watchId);
    clearTimeout(session.expiry);
    clearTimeout(session.batch);
    for (const { watcher } of session.watchers.values()) watcher.close();
    if (sessions.size === 0 && lease) {
      void lease.dispose().catch(reportError);
      lease = undefined;
    }
  };

  const mark = (watchId: string, relativePath: string) => {
    const session = sessions.get(watchId);
    if (!session) return;
    session.pending.add(relativePath);
    if (session.batch) return;
    // Fixed window also flushes under a continuous stream of file creations.
    session.batch = setTimeout(() => {
      const pending = [...session.pending];
      session.pending.clear();
      void (async () => {
        const relativePaths: string[] = [];
        for (const relativePath of pending) {
          const entry = session.watchers.get(relativePath);
          if (!entry) { relativePaths.push(relativePath); continue; }
          try {
            const info = await stat(entry.absolute);
            const stamp = `${info.ino}:${info.mtimeMs}:${info.ctimeMs}`;
            if (stamp !== entry.stamp) {
              entry.stamp = stamp;
              relativePaths.push(relativePath);
            }
          } catch (cause) {
            if (!(cause instanceof Error && "code" in cause &&
              (cause.code === "ENOENT" || cause.code === "ENOTDIR"))) throw cause;
            entry.watcher.close();
            session.watchers.delete(relativePath);
            relativePaths.push(relativePath);
          }
        }
        if (relativePaths.length && sessions.get(watchId) === session) {
          await emit({ watchId, rootId: session.rootId, relativePaths });
        }
      })().catch(reportError).finally(() => {
        session.batch = undefined;
        if (session.pending.size && sessions.get(watchId) === session) mark(watchId, session.pending.values().next().value!);
      });
    }, timing.batchMs);
  };

  const update = async (input: WatchRequest, retain: () => { dispose(): Promise<void> }) => {
    if (disposed) throw new Error("Directory watches disposed");
    if (input.relativePaths.length === 0) { stop(input.watchId); return false; }
    const previous = sessions.get(input.watchId);
    if (previous && (previous.rootId !== input.rootId || previous.rootPath !== input.rootPath)) {
      throw new Error("A watch session cannot change its root");
    }
    if (!previous && sessions.size >= MAX_SESSIONS) throw new Error("Too many file tree windows");
    const wanted = new Map<string, { absolute: string; stamp: string; inode: string }>();
    for (const relativePath of new Set(input.relativePaths)) {
      try {
        const absolute = await resolveRealUnderRoot(input.rootPath, relativePath);
        const info = await stat(absolute);
        wanted.set(relativePath, { absolute, stamp: `${info.ino}:${info.mtimeMs}:${info.ctimeMs}`, inode: `${info.dev}:${info.ino}` });
      } catch (cause) {
        if (!(cause instanceof Error && "code" in cause &&
          (cause.code === "ENOENT" || cause.code === "ENOTDIR"))) throw cause;
        // The parent remains watched and announces recreation of this directory.
      }
    }
    if (disposed) throw new Error("Directory watches disposed");
    const usedElsewhere = [...sessions.values()].reduce((sum, s) => sum + (s === previous ? 0 : s.watchers.size), 0);
    if (usedElsewhere + wanted.size > MAX_WATCHES) throw new Error("Too many expanded file tree folders");
    const session: Session = previous ?? { rootId: input.rootId, rootPath: input.rootPath, watchers: new Map(), pending: new Set() };
    sessions.set(input.watchId, session);
    try {
      lease ??= retain();
      for (const [relativePath, entry] of session.watchers) {
        if (wanted.get(relativePath)?.absolute !== entry.absolute || wanted.get(relativePath)?.inode !== entry.inode) {
          entry.watcher.close();
          session.watchers.delete(relativePath);
        }
      }
      for (const [relativePath, info] of wanted) {
        if (session.watchers.has(relativePath)) continue;
        const watcher = watch(info.absolute, { recursive: false }, (event, filename) => {
          if (event !== "rename") return; // Content writes do not change tree entries.
          mark(input.watchId, relativePath);
          // Only the changed branch can have been renamed/replaced.
          const changed = filename === null ? relativePath : [relativePath, filename.toString()].filter(Boolean).join("/");
          for (const [child, entry] of session.watchers) {
            if (child !== relativePath && (filename === null || child === changed || child.startsWith(`${changed}/`))) {
              mark(input.watchId, child);
              entry.watcher.close();
              session.watchers.delete(child);
            }
          }
        });
        watcher.on("error", (cause) => {
          watcher.close();
          if (session.watchers.get(relativePath)?.watcher === watcher) session.watchers.delete(relativePath);
          reportError(cause);
          mark(input.watchId, relativePath);
        });
        session.watchers.set(relativePath, { ...info, watcher });
        if (previous) {
          // A previously missing/replaced folder has become watchable again.
          session.pending.add(relativePath);
          void emit({ watchId: input.watchId, rootId: input.rootId, relativePaths: [relativePath] }).catch(reportError);
        }
      }
      clearTimeout(session.expiry);
      session.expiry = setTimeout(() => stop(input.watchId), timing.leaseMs);
    } catch (cause) {
      stop(input.watchId);
      throw cause;
    }
    return previous === undefined;
  };

  return {
    update(input: WatchRequest, retain: () => { dispose(): Promise<void> }): Promise<boolean> {
      const result = queue.then(() => update(input, retain));
      queue = result.catch(() => {}); // Return the original rejection to the RPC caller.
      return result;
    },
    dispose() {
      disposed = true;
      for (const watchId of sessions.keys()) stop(watchId);
    },
    counts: () => ({ sessions: sessions.size, watches: [...sessions.values()].reduce((n, s) => n + s.watchers.size, 0) }),
  };
}
