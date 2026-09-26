import { useEffect, useRef, useSyncExternalStore } from "react";
import { useBbContext, useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { FileTypeIcon } from "@/components/FileTypeIcon";
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
import { surfaceNavigation } from "@/lib/surface-navigation";
import { getChatTargets, requestAddToChat, subscribeChatTargets, type ChatTarget } from "@/lib/chat-draft-bus";
import type { rpcContract, TreeEntry, Workspace } from "../contract";
import type { useWorkspaceTree } from "@/hooks/useWorkspaceTree";

type TreeModel = ReturnType<typeof useWorkspaceTree>;

function absolutePathOf(workspace: Workspace, relativePath: string): string {
  const root = workspace.rootPath.replace(/\/+$/u, "");
  return relativePath === "" ? root : `${root}/${relativePath}`;
}

/** Folder a new file should land in: the row itself if it is a folder, else its parent. */
function directoryOf(entry: TreeEntry): string {
  if (entry.kind === "directory") return entry.relativePath;
  const slash = entry.relativePath.lastIndexOf("/");
  return slash === -1 ? "" : entry.relativePath.slice(0, slash);
}

function targetLabel(target: ChatTarget, activeThreadId: string | null): string {
  switch (target.scope.kind) {
    case "thread": return target.scope.threadId === activeThreadId
      ? "main thread"
      : `thread ${target.scope.threadId.slice(-6)}`;
    case "side-chat": return `side chat ${target.scope.tabId.slice(-6)}`;
    case "queued-message": return `queued message ${target.scope.queuedMessageId.slice(-6)}`;
    case "new-thread": return "new thread";
  }
}

async function createAndOpenBlankMd(args: {
  rpc: ReturnType<typeof useRpc<typeof rpcContract>>;
  navigate: ReturnType<typeof useBbNavigate>;
  workspace: Workspace;
  directoryRelativePath: string;
  showCreated: (relativePath: string) => Promise<void>;
}): Promise<void> {
  try {
    const result = await args.rpc.call("createBlankMarkdown", {
      rootId: args.workspace.rootId,
      directoryRelativePath: args.directoryRelativePath,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    await args.showCreated(result.relativePath);
    const opened = openWorkspaceFile(
      args.navigate,
      args.workspace,
      result.relativePath,
      (message) => {
        void args.rpc.call("clientLog", { message }).catch(() => undefined);
      },
      "external",
    );
    if (!opened) {
      toast.error("Created the file, but could not open it in an external editor.");
    }
  } catch {
    toast.error("Could not create a blank markdown file.");
  }
}

function TreeRow({
  entry,
  depth,
  workspace,
  tree,
  chatTargets,
  activeThreadId,
}: {
  entry: TreeEntry;
  depth: number;
  workspace: Workspace;
  tree: TreeModel;
  chatTargets: readonly ChatTarget[];
  activeThreadId: string | null;
}) {
  const overlayNavigate = useBbNavigate();
  const { threadId } = useBbContext();
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
    const navigation = surfaceNavigation(threadId);
    const opened = openWorkspaceFile(
      navigation,
      workspace,
      entry.relativePath,
      (message) => {
        void rpc.call("clientLog", { message }).catch(() => undefined);
      },
    );
    if (!opened) toast.error(navigation === null
      ? "Open a thread or New Thread page to preview files."
      : "Could not open the file preview.");
  };

  const openExternal = () => {
    if (!openWorkspaceFile(overlayNavigate, workspace, entry.relativePath, undefined, "external")) {
      toast.error("Could not open the file in an external editor.");
    }
  };

  const addToChat = (targetKey: string) => {
    if (!requestAddToChat(targetKey, absolutePathOf(workspace, entry.relativePath))) {
      toast.error("That chat draft is no longer open.");
    }
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

  const createBlankMd = () => {
    void createAndOpenBlankMd({
      rpc,
      navigate: overlayNavigate,
      workspace,
      directoryRelativePath: directoryOf(entry),
      showCreated: tree.showCreated,
    });
  };

  const deleteThisFile = () => {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    void rpc
      .call("deleteFile", {
        rootId: workspace.rootId,
        relativePath: entry.relativePath,
      })
      .then(async (result) => {
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        await tree.forgetPath(result.relativePath);
      })
      .catch(() => {
        toast.error("Could not delete the file.");
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
            {isDir ? null : (
              <FileTypeIcon name={entry.name} className="size-3" />
            )}
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {chatTargets.map((target) => (
            <ContextMenuItem key={target.key} onSelect={() => addToChat(target.key)}>
              <Icon name="MessageSquarePlus" className="size-4" />
              {chatTargets.length === 1 ? "Add to chat" : `Add to ${targetLabel(target, activeThreadId)}`}
            </ContextMenuItem>
          ))}
          {!isDir ? (
            <ContextMenuItem onSelect={openExternal}>
              <Icon name="FolderOpen" className="size-4" />
              Open in external editor
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onSelect={createBlankMd}>
            <Icon name="FileText" className="size-4" />
            Create blank .md
          </ContextMenuItem>
          {!isDir ? (
            <ContextMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={deleteThisFile}
            >
              <Icon name="Trash2" className="size-4" />
              Delete file
            </ContextMenuItem>
          ) : null}
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
              chatTargets={chatTargets}
              activeThreadId={activeThreadId}
            />
          ))
        : null}
    </div>
  );
}

export function FileTreeBody({ tree }: { tree: TreeModel }) {
  const overlayNavigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const { threadId } = useBbContext();
  const chatTargets = useSyncExternalStore(subscribeChatTargets, getChatTargets, getChatTargets);

  if (tree.settingsLoading) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">Loading…</p>
    );
  }
  const workspace = tree.active;
  if (workspace === null) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">
        Choose a folder above.
      </p>
    );
  }

  const createBlankMdInRoot = () => {
    void createAndOpenBlankMd({
      rpc,
      navigate: overlayNavigate,
      workspace,
      directoryRelativePath: "",
      showCreated: tree.showCreated,
    });
  };

  const root = tree.dirs[""];
  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-1 px-1.5 py-0.5 text-left text-[11px] font-medium text-muted-foreground"
            onClick={() => void tree.reload()}
            title={
              tree.isRerooted
                ? `${workspace.rootPath} — click to return to the pinned folder`
                : workspace.rootPath
            }
          >
            <Icon
              name={tree.isRerooted ? "ArrowTurnBackward" : "FolderGit"}
              className="size-3 shrink-0"
            />
            <span className="min-w-0 truncate">{workspace.rootName}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={createBlankMdInRoot}>
            <Icon name="FileText" className="size-4" />
            Create blank .md
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
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
              chatTargets={chatTargets}
              activeThreadId={threadId}
            />
          ))
        : null}
    </div>
  );
}
