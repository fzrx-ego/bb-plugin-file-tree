import { FileTreeBody } from "@/components/FileTreeBody";
import {
  FileTreeSearchBox,
  FileTreeSearchResults,
} from "@/components/FileTreeSearch";
import { useFileSearch } from "@/hooks/useFileSearch";
import { useWorkspaceTree } from "@/hooks/useWorkspaceTree";

export function FileTreePanel({
  threadId,
  projectId = null,
}: {
  threadId: string | null;
  projectId?: string | null;
}) {
  const tree = useWorkspaceTree(threadId, projectId);
  const search = useFileSearch(threadId, tree);
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
