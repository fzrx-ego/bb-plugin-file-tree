import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { subscribeReveal } from "@/lib/reveal-bus";
import type { rpcContract, TreeEntry, Workspace, WorkspaceResult } from "../contract";

/** `a/b/c` → `["", "a", "a/b", "a/b/c"]` — every folder that must be open. */
function ancestorChain(relativePath: string): string[] {
  const chain = [""];
  let accumulated = "";
  for (const part of relativePath.split("/").filter((p) => p.length > 0)) {
    accumulated = accumulated === "" ? part : `${accumulated}/${part}`;
    chain.push(accumulated);
  }
  return chain;
}

type DirState =
  | { status: "loading" }
  | { status: "ready"; entries: TreeEntry[] }
  | { status: "error"; message: string };

export function useWorkspaceTree(threadId: string | null) {
  const rpc = useRpc<typeof rpcContract>();
  const { values, isLoading: settingsLoading } = useSettings();
  const showSkipped = values?.showSkipped === true;

  const [workspace, setWorkspace] = useState<WorkspaceResult | null>(null);
  /** Set when a reveal landed in another project; cleared on reload. */
  const [rerooted, setRerooted] = useState<Workspace | null>(null);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set([""]));
  const [selected, setSelected] = useState<string | null>(null);

  const loadWorkspace = useCallback(async () => {
    setRerooted(null);
    if (threadId === null) {
      setWorkspace({ ok: false, reason: "no_thread" });
      return;
    }
    try {
      const result = await rpc.call("workspaceForThread", { threadId });
      setWorkspace(result);
    } catch {
      setWorkspace({ ok: false, reason: "no_checkout" });
    }
  }, [rpc, threadId]);

  const loadDir = useCallback(
    async (ws: Workspace, relativePath: string) => {
      setDirs((prev) => ({ ...prev, [relativePath]: { status: "loading" } }));
      try {
        const { entries } = await rpc.call("listDir", {
          hostId: ws.hostId,
          rootPath: ws.rootPath,
          relativePath,
          showSkipped,
        });
        setDirs((prev) => ({
          ...prev,
          [relativePath]: { status: "ready", entries },
        }));
      } catch (cause) {
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
    void loadWorkspace();
  }, [loadWorkspace]);

  /** The root actually on screen: a reveal may have moved it to another project. */
  const active: Workspace | null =
    rerooted ?? (workspace?.ok === true ? workspace.workspace : null);

  const rootKey = active?.rootPath ?? "";
  useEffect(() => {
    dirsRef.current = {};
    setDirs({});
  }, [showSkipped, rootKey]);

  useEffect(() => {
    if (active === null) return;
    for (const path of expanded) {
      const current = dirsRef.current[path];
      if (current?.status === "ready" || current?.status === "loading") continue;
      void loadDir(active, path);
    }
  }, [active, expanded, loadDir, showSkipped]);

  /**
   * Expand the tree down to a path written in a chat message. The chain stops
   * short of a file, so revealing one opens its folder and selects it without
   * trying to expand the file itself.
   */
  const reveal = useCallback(
    async (rawPath: string) => {
      if (threadId === null) return;
      let resolved;
      try {
        resolved = await rpc.call("resolveInWorkspace", { threadId, path: rawPath });
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (!resolved.ok) {
        toast.error(resolved.message);
        return;
      }
      // Landing in another project replaces the root, so the previously
      // expanded folders describe a tree that is no longer on screen.
      if (resolved.root !== null) {
        const root = resolved.root;
        setRerooted({
          environmentId: "",
          hostId: root.hostId,
          rootPath: root.rootPath,
          rootName: root.rootName,
        });
        toast.message(`Showing ${root.rootName}`);
      } else {
        setRerooted(null);
      }
      const chain = ancestorChain(resolved.relativePath);
      const toExpand = resolved.isDirectory ? chain : chain.slice(0, -1);
      setExpanded((prev) =>
        resolved.root === null
          ? new Set([...prev, ...toExpand])
          : new Set(toExpand),
      );
      setSelected(resolved.relativePath);
    },
    [rpc, threadId],
  );

  useEffect(() => {
    return subscribeReveal((rawPath) => {
      void reveal(rawPath);
    });
  }, [reveal]);

  const toggleDir = useCallback((relativePath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }, []);

  return {
    settingsLoading,
    workspace,
    /** The root on screen, which a reveal may have moved off the thread's own. */
    active,
    isRerooted: rerooted !== null,
    dirs,
    expanded,
    selected,
    setSelected,
    toggleDir,
    reload: loadWorkspace,
  };
}
