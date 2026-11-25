import { useEffect, useMemo, useRef, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { FolderSizes, folderSizesContract } from "../contract";
import type { useWorkspaceTree } from "./useWorkspaceTree";

type Tree = ReturnType<typeof useWorkspaceTree>;
const EMPTY: FolderSizes["sizes"] = {};

export function visibleFolderPaths(dirs: Tree["dirs"], expanded: ReadonlySet<string>): string[] {
  const folders: string[] = [];
  const parents = [""];
  for (let i = 0; i < parents.length && folders.length < 256; i += 1) {
    const directory = dirs[parents[i]];
    if (directory?.status !== "ready") continue;
    for (const entry of directory.entries) {
      if (entry.kind !== "directory") continue;
      folders.push(entry.relativePath);
      if (folders.length === 256) break;
      if (expanded.has(entry.relativePath)) parents.push(entry.relativePath);
    }
  }
  return folders;
}

export function useFolderSizes(tree: Tree, enabled: boolean): FolderSizes["sizes"] {
  const rpc = useRpc<typeof folderSizesContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const rootId = tree.active?.rootId;
  const pathsKey = useMemo(
    () => enabled ? visibleFolderPaths(tree.dirs, tree.expanded).join("\0") : "",
    [enabled, tree.dirs, tree.expanded],
  );
  const identity = JSON.stringify([rootId, pathsKey]);
  const [snapshot, setSnapshot] = useState({ identity: "", sizes: EMPTY });

  useEffect(() => {
    if (!enabled || !rootId || !pathsKey) return;
    const paths = pathsKey.split("\0");
    let stop: (() => void) | undefined;

    function pause() {
      stop?.();
      stop = undefined;
    }

    const syncVisibility = () => {
      if (document.visibilityState === "hidden") {
        pause();
        return;
      }
      if (stop) return;
      const demand = { rootId, demandId: crypto.randomUUID() };
      let stopped = false;
      let busy = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const release = () => {
        void rpcRef.current.call("stopFolderSizes", demand).catch(() => {
          // If the window or host disconnects, demand expires on the host.
        });
      };
      stop = () => {
        stopped = true;
        clearTimeout(timer);
        if (!busy) release();
      };
      const refresh = async () => {
        if (stopped) return;
        busy = true;
        let pending = 0;
        try {
          const response = await rpcRef.current.call("folderSizes", { ...demand, paths });
          if (!stopped) setSnapshot({ identity, sizes: response.sizes });
          pending = response.pending;
        } catch {
          // The root or host can disappear while the tree navigates.
        } finally {
          busy = false;
          // Send stop after an in-flight request so it cannot recreate demand.
          if (stopped) release();
          else timer = setTimeout(refresh, pending ? 1500 : 60_000);
        }
      };
      void refresh();
    };

    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", pause);
    window.addEventListener("pageshow", syncVisibility);
    syncVisibility();
    return () => {
      pause();
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("pageshow", syncVisibility);
    };
  }, [enabled, identity, pathsKey, rootId]);

  return enabled && snapshot.identity === identity ? snapshot.sizes : EMPTY;
}
