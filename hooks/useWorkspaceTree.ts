import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { subscribeReveal } from "@/lib/reveal-bus";
import { includeRevealedChild, type VisibleReveal } from "@/lib/visible-reveal";
import { useLiveDirectories } from "./useLiveDirectories";
import { visibleDirectories } from "@/lib/visible-directories";
import type { rpcContract, TreeEntry, Workspace } from "../contract";

function ancestorChain(relativePath: string): string[] {
  const chain = [""];
  let accumulated = "";
  for (const part of relativePath.split("/").filter(Boolean)) {
    accumulated = accumulated === "" ? part : `${accumulated}/${part}`;
    chain.push(accumulated);
  }
  return chain;
}

export interface Revealed {
  workspace: Workspace;
  relativePath: string;
  isDirectory: boolean;
}

type DirState =
  | { status: "loading" }
  | { status: "ready"; entries: TreeEntry[] }
  | { status: "error"; message: string };

/** Tree state belongs to the pinned navigator root, not the current route. */
export function useWorkspaceTree(root: Workspace | null, enabled = true) {
  const rpc = useRpc<typeof rpcContract>();
  const { values, isLoading: settingsLoading } = useSettings();
  const showSkipped = values?.showSkipped === true;
  const [rerooted, setRerooted] = useState<Workspace | null>(null);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([""]));
  const [selected, setSelected] = useState<string | null>(null);
  const [visibleReveal, setVisibleReveal] = useState<VisibleReveal | null>(null);

  const pinnedKey = root === null ? "" : `${root.hostId}\n${root.rootPath}`;
  useEffect(() => {
    setRerooted(null);
    setExpanded(new Set([""]));
    setSelected(null);
    setVisibleReveal(null);
  }, [pinnedKey]);

  const active = rerooted ?? root;
  const activeRef = useRef(active);
  activeRef.current = active;
  const activeRootId = active?.rootId ?? "";
  const stateKey = `${activeRootId}\n${showSkipped}`;
  const stateKeyRef = useRef(stateKey);
  const stateEpoch = useRef(0);
  if (stateKeyRef.current !== stateKey) stateEpoch.current += 1;
  stateKeyRef.current = stateKey;
  const inFlight = useRef(new Map<string, { epoch: number; dirty: boolean; promise: Promise<void> }>());
  const revealRef = useRef(visibleReveal);
  revealRef.current = visibleReveal;
  const revealValidation = useRef<{
    target: VisibleReveal; epoch: number; dirty: boolean; promise: Promise<void>;
  } | null>(null);
  useEffect(() => () => { stateEpoch.current += 1; }, []);
  const visibleDirs = useMemo(() => {
    if (visibleReveal === null || visibleReveal.rootId !== activeRootId) return dirs;
    const next: Record<string, DirState> = {};
    for (const [parentPath, state] of Object.entries(dirs)) {
      next[parentPath] = state.status === "ready"
        ? { ...state, entries: includeRevealedChild(state.entries, parentPath, visibleReveal) }
        : state;
    }
    return next;
  }, [activeRootId, dirs, visibleReveal]);

  const loadDir = useCallback(
    (workspace: Workspace, relativePath: string, background = false): Promise<void> => {
      const scope = `${workspace.rootId}\n${showSkipped}`;
      if (stateKeyRef.current !== scope) return Promise.resolve();
      const epoch = stateEpoch.current;
      const loadKey = `${scope}\n${relativePath}`;
      const pending = inFlight.current.get(loadKey);
      if (pending?.epoch === epoch) {
        pending.dirty = true;
        return pending.promise;
      }
      const request = { epoch, dirty: false, promise: Promise.resolve() };
      const isCurrent = () => stateKeyRef.current === scope && stateEpoch.current === epoch;
      inFlight.current.set(loadKey, request);
      request.promise = (async () => {
        let keepEntries = background;
        do {
          request.dirty = false;
          setDirs((prev) => keepEntries && prev[relativePath]?.status === "ready"
            ? prev : { ...prev, [relativePath]: { status: "loading" } });
          keepEntries = true;
          try {
            const { entries } = await rpc.call("listDir", {
              rootId: workspace.rootId, relativePath, showSkipped, fresh: true,
            });
            if (!isCurrent()) return;
            // Publish progress even if another filesystem event arrived during the call.
            setDirs((prev) => ({ ...prev, [relativePath]: { status: "ready", entries } }));
          } catch (cause) {
            if (!isCurrent()) return;
            setDirs((prev) => ({
              ...prev,
              [relativePath]: { status: "error", message: cause instanceof Error ? cause.message : String(cause) },
            }));
          }
        } while (request.dirty && isCurrent());
      })().finally(() => {
        if (inFlight.current.get(loadKey) === request) inFlight.current.delete(loadKey);
      });
      return request.promise;
    },
    [rpc, showSkipped],
  );

  useEffect(() => {
    dirsRef.current = {};
    setDirs({});
  }, [activeRootId, showSkipped]);

  useEffect(() => {
    if (active === null) return;
    for (const path of visibleDirectories(expanded)) {
      const current = dirsRef.current[path];
      if (current?.status === "ready" || current?.status === "loading") continue;
      void loadDir(active, path);
    }
  }, [activeRootId, expanded, loadDir, showSkipped]);

  const reveal = useCallback(
    async (
      rawPath: string,
      options?: { threadId?: string },
    ): Promise<Revealed | null> => {
      const current = activeRef.current;
      if (current === null) return null;
      let resolved;
      try {
        resolved = options?.threadId === undefined
          ? await rpc.call("resolveInRoot", { rootId: current.rootId, path: rawPath })
          : await rpc.call("resolveInWorkspace", { threadId: options.threadId, path: rawPath });
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
        return null;
      }
      if (!resolved.ok) {
        toast.error(resolved.message);
        return null;
      }

      let landedIn: Workspace;
      if (resolved.root !== null) {
        landedIn = { ...resolved.root, environmentId: null };
      } else if (options?.threadId !== undefined) {
        try {
          const threadRoot = await rpc.call("workspaceForThread", { threadId: options.threadId });
          if (!threadRoot.ok) {
            toast.error("The thread workspace is unavailable.");
            return null;
          }
          landedIn = threadRoot.workspace;
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : String(cause));
          return null;
        }
      } else {
        landedIn = current;
      }

      const isPinned = root !== null && landedIn.hostId === root.hostId && landedIn.rootPath === root.rootPath;
      setRerooted(isPinned ? null : landedIn);
      setVisibleReveal({
        rootId: landedIn.rootId,
        relativePath: resolved.relativePath,
        isDirectory: resolved.isDirectory,
      });
      const chain = ancestorChain(resolved.relativePath);
      const toExpand = resolved.isDirectory ? chain : chain.slice(0, -1);
      setExpanded((prev) =>
        landedIn.rootId === current.rootId ? new Set([...prev, ...toExpand]) : new Set(toExpand),
      );
      setSelected(resolved.relativePath);
      return { workspace: landedIn, relativePath: resolved.relativePath, isDirectory: resolved.isDirectory };
    },
    [root, rpc],
  );

  useEffect(() => subscribeReveal(({ path, threadId }) => {
    void reveal(path, { threadId });
  }), [reveal]);

  const toggleDir = useCallback((relativePath: string) => {
    const current = activeRef.current;
    if (!expanded.has(relativePath) && current !== null) void loadDir(current, relativePath);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, [expanded, loadDir]);

  const revalidateReveal = useCallback((paths: string[]): Promise<void> => {
    const target = revealRef.current;
    if (!target || target.rootId !== activeRef.current?.rootId || !paths.some((parent) =>
      parent === "" || target.relativePath === parent || target.relativePath.startsWith(`${parent}/`))) return Promise.resolve();
    const epoch = stateEpoch.current;
    const pending = revealValidation.current;
    if (pending?.target === target && pending.epoch === epoch) {
      pending.dirty = true;
      return pending.promise;
    }
    const request = { target, epoch, dirty: false, promise: Promise.resolve() };
    const isCurrent = () => revealRef.current === target && stateEpoch.current === epoch;
    revealValidation.current = request;
    request.promise = (async () => {
      do {
        request.dirty = false;
        try {
          const result = await rpc.call("statPath", { rootId: target.rootId, relativePath: target.relativePath });
          if (!isCurrent()) return;
          if (result === null) {
            revealRef.current = null;
            setVisibleReveal((current) => current === target ? null : current);
            setSelected((current) => current === target.relativePath ? null : current);
            return;
          }
        } catch (cause) {
          if (!isCurrent()) return;
          toast.error(`File tree reveal: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      } while (request.dirty && isCurrent());
    })().finally(() => {
      if (revealValidation.current === request) revealValidation.current = null;
    });
    return request.promise;
  }, [rpc]);

  useLiveDirectories(activeRootId, visibleDirectories(expanded), enabled, (paths) => {
    void revalidateReveal(paths);
    const current = activeRef.current;
    if (current === null) return;
    const visible = new Set(visibleDirectories(expanded));
    for (const path of paths) {
      if (visible.has(path)) void loadDir(current, path, true);
    }
  });

  const showCreated = useCallback(async (relativePath: string) => {
    const workspace = activeRef.current;
    if (workspace === null) return;
    const chain = ancestorChain(relativePath);
    const folders = chain.slice(0, -1);
    setExpanded((prev) => new Set([...prev, ...folders]));
    await loadDir(workspace, folders[folders.length - 1] ?? "");
    setSelected(relativePath);
  }, [loadDir]);

  const forgetPath = useCallback(async (relativePath: string) => {
    const workspace = activeRef.current;
    if (workspace === null) return;
    setVisibleReveal((current) =>
      current?.rootId === workspace.rootId && current.relativePath === relativePath ? null : current,
    );
    const slash = relativePath.lastIndexOf("/");
    await loadDir(workspace, slash === -1 ? "" : relativePath.slice(0, slash));
    setSelected((current) => current === relativePath ? null : current);
  }, [loadDir]);

  const reload = useCallback(() => {
    setVisibleReveal(null);
    if (rerooted !== null) {
      setRerooted(null);
      setExpanded(new Set([""]));
      setSelected(null);
      return;
    }
    const current = activeRef.current;
    if (current === null) return;
    for (const path of visibleDirectories(expanded)) void loadDir(current, path);
  }, [expanded, loadDir, rerooted]);

  return {
    settingsLoading,
    active,
    isRerooted: rerooted !== null,
    dirs: visibleDirs,
    expanded,
    selected,
    setSelected,
    reveal,
    toggleDir,
    showCreated,
    forgetPath,
    reload,
  };
}
