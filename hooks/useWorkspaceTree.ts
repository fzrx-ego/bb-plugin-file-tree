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

/**
 * BB attaches the environment to a freshly provisioned thread after the panel
 * has already mounted, so the first lookup answers `no_environment` and the
 * panel would keep that answer for the life of the mount — there is no root row
 * to click for a reload while it is showing. Poll until the environment lands.
 * Every other failure is a real one and is left alone.
 */
const PROVISION_RETRY_MS = 1500;
const PROVISION_RETRY_LIMIT = 40;

/** Where a reveal landed, so the caller can open the file it just selected. */
export interface Revealed {
  workspace: Workspace;
  relativePath: string;
  isDirectory: boolean;
}

type DirState =
  | { status: "loading" }
  | { status: "ready"; entries: TreeEntry[] }
  | { status: "error"; message: string };

export function useWorkspaceTree(threadId: string | null, projectId: string | null = null) {
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
  const [provisionRetries, setProvisionRetries] = useState(0);

  // Returns what it stored as well, so a caller that needs the root right now
  // does not have to wait for the next render to read it back out of state.
  const loadWorkspace = useCallback(async (): Promise<WorkspaceResult> => {
    setRerooted(null);
    const store = (result: WorkspaceResult): WorkspaceResult => {
      setWorkspace(result);
      return result;
    };
    if (threadId === null) {
      if (projectId === null) return store({ ok: false, reason: "no_thread" });
      try {
        return store(await rpc.call("workspaceForProject", { projectId }));
      } catch {
        return store({ ok: false, reason: "no_checkout" });
      }
    }
    try {
      return store(await rpc.call("workspaceForThread", { threadId }));
    } catch {
      return store({ ok: false, reason: "no_checkout" });
    }
  }, [projectId, rpc, threadId]);

  const loadDir = useCallback(
    async (ws: Workspace, relativePath: string) => {
      setDirs((prev) => ({ ...prev, [relativePath]: { status: "loading" } }));
      try {
        const { entries } = await rpc.call("listDir", {
          rootId: ws.rootId,
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

  // A new thread starts the retry budget over; the previous one's is spent.
  useEffect(() => {
    setProvisionRetries(0);
  }, [projectId, threadId]);

  /** The root actually on screen: a reveal may have moved it to another project. */
  const active: Workspace | null =
    rerooted ?? (workspace?.ok === true ? workspace.workspace : null);
  // `reveal` is memoised on the rpc handle, so it reads the root on screen
  // through a ref rather than closing over a stale one.
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (workspace === null || workspace.ok) return;
    if (workspace.reason !== "no_environment") return;
    // A reveal put another project on screen; re-asking would take it away.
    if (rerooted !== null) return;
    if (provisionRetries >= PROVISION_RETRY_LIMIT) return;
    const timer = window.setTimeout(() => {
      setProvisionRetries((count) => count + 1);
      void loadWorkspace();
    }, PROVISION_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace, provisionRetries, rerooted, workspace]);

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
    async (rawPath: string, options?: { quiet?: boolean }): Promise<Revealed | null> => {
      if (threadId === null) return null;
      let resolved;
      try {
        resolved = await rpc.call("resolveInWorkspace", { threadId, path: rawPath });
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
        return null;
      }
      if (!resolved.ok) {
        toast.error(resolved.message);
        return null;
      }
      // Landing in another project replaces the root, so the previously
      // expanded folders describe a tree that is no longer on screen.
      let landedIn = activeRef.current;
      if (resolved.root !== null) {
        const root = resolved.root;
        landedIn = {
          environmentId: null,
          hostId: root.hostId,
          rootPath: root.rootPath,
          rootName: root.rootName,
          rootId: root.rootId,
        };
        setRerooted(landedIn);
        if (options?.quiet !== true) toast.message(`Showing ${root.rootName}`);
      } else {
        setRerooted(null);
        // The server just resolved the path inside this thread's own workspace,
        // so a cached "no workspace" from a mount that raced provisioning is
        // stale. Without this the expansion below lands in a tree that is never
        // rendered and the click looks dead.
        if (landedIn === null) {
          const refreshed = await loadWorkspace();
          if (refreshed.ok) landedIn = refreshed.workspace;
        }
      }
      const chain = ancestorChain(resolved.relativePath);
      const toExpand = resolved.isDirectory ? chain : chain.slice(0, -1);
      setExpanded((prev) =>
        resolved.root === null
          ? new Set([...prev, ...toExpand])
          : new Set(toExpand),
      );
      setSelected(resolved.relativePath);
      if (landedIn === null) return null;
      return {
        workspace: landedIn,
        relativePath: resolved.relativePath,
        isDirectory: resolved.isDirectory,
      };
    },
    [loadWorkspace, rpc, threadId],
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

  /**
   * Expand every folder on the way to a newly created file, refresh that
   * folder's listing, and select the file so it is visible in the tree.
   */
  const showCreated = useCallback(
    async (relativePath: string) => {
      const ws = activeRef.current;
      if (ws === null) return;
      const chain = ancestorChain(relativePath);
      const folders = chain.slice(0, -1);
      setExpanded((prev) => new Set([...prev, ...folders]));
      const parent = folders[folders.length - 1] ?? "";
      await loadDir(ws, parent);
      setSelected(relativePath);
    },
    [loadDir],
  );

  /** Reload the parent folder after a file is deleted, and drop the selection. */
  const forgetPath = useCallback(
    async (relativePath: string) => {
      const ws = activeRef.current;
      if (ws === null) return;
      const slash = relativePath.lastIndexOf("/");
      const parent = slash === -1 ? "" : relativePath.slice(0, slash);
      await loadDir(ws, parent);
      setSelected((current) => (current === relativePath ? null : current));
    },
    [loadDir],
  );

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
    reveal,
    toggleDir,
    showCreated,
    forgetPath,
    reload: loadWorkspace,
  };
}
