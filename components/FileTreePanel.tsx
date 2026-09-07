import { FileTreeBody } from "@/components/FileTreeBody";
import { useWorkspaceTree } from "@/hooks/useWorkspaceTree";

export function FileTreePanel({ threadId }: { threadId: string | null }) {
  const tree = useWorkspaceTree(threadId);
  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <FileTreeBody tree={tree} />
    </div>
  );
}
