import { useEffect, useRef } from "react";
import { FileTreeBody } from "@/components/FileTreeBody";
import {
  FileTreeSearchBox,
  FileTreeSearchResults,
} from "@/components/FileTreeSearch";
import { useFileSearch } from "@/hooks/useFileSearch";
import { useWorkspaceTree } from "@/hooks/useWorkspaceTree";
import type { Workspace } from "../contract";

export function FileTreePanel({
  root,
  enabled = true,
  refreshCount = 0,
}: {
  root: Workspace | null;
  enabled?: boolean;
  refreshCount?: number;
}) {
  const tree = useWorkspaceTree(root, enabled);
  const reloadRef = useRef(tree.reload);
  reloadRef.current = tree.reload;
  useEffect(() => {
    if (refreshCount > 0) reloadRef.current();
  }, [refreshCount]);
  const search = useFileSearch(tree);
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <FileTreeSearchBox search={search} />
      {/* The results take the tree's place rather than covering it: the rail
          is narrow, and a dropdown there hides the thing being searched. */}
      {search.isActive ? (
        <FileTreeSearchResults search={search} />
      ) : (
        <FileTreeBody tree={tree} />
      )}
    </div>
  );
}
