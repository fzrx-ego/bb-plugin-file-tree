import { useEffect, useRef } from "react";
import { useBbNavigate, useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";
import { openWorkspaceFile } from "@/lib/open-preview";
import type { rpcContract, TreeEntry, Workspace } from "../contract";
import type { useWorkspaceTree } from "@/hooks/useWorkspaceTree";

type TreeModel = ReturnType<typeof useWorkspaceTree>;

function absolutePathOf(workspace: Workspace, relativePath: string): string {
  const root = workspace.rootPath.replace(/\/+$/u, "");
  return relativePath === "" ? root : `${root}/${relativePath}`;
}

function reasonText(reason: "no_thread" | "no_environment" | "no_checkout"): string {
  switch (reason) {
    case "no_thread":
      return "Open a thread to see its workspace.";
    case "no_environment":
      return "This thread has no workspace.";
    case "no_checkout":
      return "The workspace folder is not on disk yet.";
  }
}

function TreeRow({
  entry,
  depth,
  workspace,
  tree,
}: {
  entry: TreeEntry;
  depth: number;
  workspace: Workspace;
  tree: TreeModel;
}) {
  const navigate = useBbNavigate();
  const composer = useComposer();
  const rpc = useRpc<typeof rpcContract>();
  const isDir = entry.kind === "directory";
  const isOpen = isDir && tree.expanded.has(entry.relativePath);
  const isSelected = tree.selected === entry.relativePath;
  const childState = isOpen ? tree.dirs[entry.relativePath] : undefined;
  const rowRef = useRef<HTMLButtonElement>(null);

  // A reveal can land far below the fold, so bring the row into view once it
  // becomes the selected one.
  useEffect(() => {
    if (!isSelected) return;
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);

  const onActivate = () => {
    tree.setSelected(entry.relativePath);
    if (isDir) {
      tree.toggleDir(entry.relativePath);
      return;
    }
    const opened = openWorkspaceFile(
      navigate,
      workspace,
      entry.relativePath,
      (message) => {
        void rpc.call("clientLog", { message }).catch(() => undefined);
      },
    );
    if (!opened) {
      toast.error("Could not open the default preview for this file.");
    }
  };

  /** Append to the draft rather than replacing it, so several picks stack. */
  const addToChat = () => {
    composer.updateText((current) =>
      current.trimEnd() === ""
        ? entry.relativePath
        : `${current.trimEnd()} ${entry.relativePath}`,
    );
    composer.focus();
  };

  const osPath = {
    rootId: workspace.rootId,
    relativePath: entry.relativePath,
  };

  const openInFinder = () => {
    void rpc
      .call("revealInFinder", osPath)
      .then((result) => {
        if (!result.ok) toast.error(result.message);
      })
      .catch(() => {
        toast.error("Could not open in Finder.");
      });
  };

  const copyFile = () => {
    void rpc
      .call("copyFileToClipboard", osPath)
      .then((result) => {
        if (result.ok) toast.success("File copied");
        else toast.error(result.message);
      })
      .catch(() => {
        toast.error("Could not copy the file.");
      });
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            ref={rowRef}
            type="button"
            onClick={onActivate}
            title={entry.relativePath}
            className={cn(
              "flex w-full min-w-0 items-center gap-0.5 rounded-[3px] py-px pr-1 text-left text-[11px] leading-5",
              "hover:bg-state-hover",
              isSelected && "bg-state-active font-medium",
            )}
            style={{ paddingLeft: 4 + depth * 10 }}
          >
            <span className="flex size-3 shrink-0 items-center justify-center text-muted-foreground">
              {isDir ? (
                <Icon
                  name={isOpen ? "ChevronDown" : "ChevronRight"}
                  className="size-2.5"
                />
              ) : null}
            </span>
            <Icon
              name={isDir ? "Folder" : "File"}
              className="size-3 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={addToChat}>
            <Icon name="MessageSquarePlus" className="size-4" />
            Add to chat
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={openInFinder}>
            <Icon name="FolderOpen" className="size-4" />
            Open in Finder
          </ContextMenuItem>
          <ContextMenuItem onSelect={copyFile}>
            <Icon name="FileAttachment" className="size-4" />
            Copy File
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              void copyText(entry.relativePath, "Relative path copied");
            }}
          >
            <Icon name="Copy" className="size-4" />
            Copy Relative Path
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void copyText(
                absolutePathOf(workspace, entry.relativePath),
                "Path copied",
              );
            }}
          >
            <Icon name="Copy" className="size-4" />
            Copy Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isOpen && childState?.status === "loading" ? (
        <p
          className="py-0.5 pr-1 text-[11px] text-muted-foreground"
          style={{ paddingLeft: 20 + (depth + 1) * 10 }}
        >
          …
        </p>
      ) : null}
      {isOpen && childState?.status === "error" ? (
        <p
          className="py-0.5 pr-1 text-[11px] text-destructive"
          style={{ paddingLeft: 20 + (depth + 1) * 10 }}
        >
          {childState.message}
        </p>
      ) : null}
      {isOpen && childState?.status === "ready"
        ? childState.entries.map((child) => (
            <TreeRow
              key={child.relativePath}
              entry={child}
              depth={depth + 1}
              workspace={workspace}
              tree={tree}
            />
          ))
        : null}
    </div>
  );
}

export function FileTreeBody({ tree }: { tree: TreeModel }) {
  if (tree.settingsLoading || tree.workspace === null) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">Loading…</p>
    );
  }
  const workspace = tree.active;
  if (workspace === null) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">
        {tree.workspace.ok ? "Loading…" : reasonText(tree.workspace.reason)}
      </p>
    );
  }
  const root = tree.dirs[""];
  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground"
        onClick={() => void tree.reload()}
        title={
          tree.isRerooted
            ? `${workspace.rootPath} — click to go back to this thread's workspace`
            : workspace.rootPath
        }
      >
        <Icon
          name={tree.isRerooted ? "ArrowTurnBackward" : "FolderGit"}
          className="size-3 shrink-0"
        />
        <span className="min-w-0 truncate">{workspace.rootName}</span>
      </button>
      {root?.status === "error" ? (
        <p className="px-2 text-[11px] text-destructive">{root.message}</p>
      ) : null}
      {root?.status === "ready"
        ? root.entries.map((entry) => (
            <TreeRow
              key={entry.relativePath}
              entry={entry}
              depth={0}
              workspace={workspace}
              tree={tree}
            />
          ))
        : null}
    </div>
  );
}
