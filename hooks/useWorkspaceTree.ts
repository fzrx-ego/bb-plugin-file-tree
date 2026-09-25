import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { subscribeReveal } from "@/lib/reveal-bus";
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
export function useWorkspaceTree(root: Workspace | null) {
  const rpc = useRpc<typeof rpcContract>();
  const { values, isLoading: settingsLoading } = useSettings();
  const showSkipped = values?.showSkipped === true;
  const [rerooted, setRerooted] = useState<Workspace | null>(null);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([""]));
  const [selected, setSelected] = useState<string | null>(null);

  const pinnedKey = root === null ? "" : `${root.hostId}\n${root.rootPath}`;
  useEffect(() => {
    setRerooted(null);
    setExpanded(new Set([""]));
    setSelected(null);
  }, [pinnedKey]);

  const active = rerooted ?? root;
  const activeRef = useRef(active);
  activeRef.current = active;
  const activeRootId = active?.rootId ?? "";

  const loadDir = useCallback(
    async (workspace: Workspace, relativePath: string) => {
      setDirs((prev) => ({ ...prev, [relativePath]: { status: "loading" } }));
      try {
        const { entries } = await rpc.call("listDir", {
          rootId: workspace.rootId,
          relativePath,
          showSkipped,
        });
        if (activeRef.current?.rootId !== workspace.rootId) return;
        setDirs((prev) => ({ ...prev, [relativePath]: { status: "ready", entries } }));
      } catch (cause) {
        if (activeRef.current?.rootId !== workspace.rootId) return;
        setDirs((prev) => ({
          ...prev,
          [relativePath]: {
            status: "error",
            message: cause instanceof Error ? cause.message : String(cause),
          },
        }));
      }
    },
    [rpc, showSkipped],
  );

  useEffect(() => {
    dirsRef.current = {};
    setDirs({});
  }, [activeRootId, showSkipped]);

  useEffect(() => {
    if (active === null) return;
    for (const path of expanded) {
      const current = dirsRef.current[path];
      if (current?.status === "ready" || current?.status === "loading") continue;
      void loadDir(active, path);
    }
  }, [activeRootId, expanded, loadDir, showSkipped]);

  const reveal = useCallback(
    async (
      rawPath: string,
      options?: { quiet?: boolean; threadId?: string },
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
      if (!isPinned && options?.quiet !== true) toast.message(`Showing ${landedIn.rootName}`);
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
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);

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
    const slash = relativePath.lastIndexOf("/");
    await loadDir(workspace, slash === -1 ? "" : relativePath.slice(0, slash));
    setSelected((current) => current === relativePath ? null : current);
  }, [loadDir]);

  const reload = useCallback(() => {
    if (rerooted !== null) {
      setRerooted(null);
      setExpanded(new Set([""]));
      setSelected(null);
      return;
    }
    const current = activeRef.current;
    if (current === null) return;
    for (const path of expanded) void loadDir(current, path);
  }, [expanded, loadDir, rerooted]);

  return {
    settingsLoading,
    active,
    isRerooted: rerooted !== null,
    dirs,
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
