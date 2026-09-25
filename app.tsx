import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FileTreeHeaderAction } from "@/components/FileTreeHeaderAction";
import { GlobalFileTreeRail } from "@/components/GlobalFileTreeRail";
import { NewThreadFileTreeAction } from "@/components/NewThreadFileTreeAction";
import { ChatDraftBridge } from "@/components/ChatDraftBridge";
import { requestSearchFocus } from "@/lib/search-focus-bus";
import { toggleRailOpen, writeStoredOpen } from "@/lib/rail-state";

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "global-file-tree", component: GlobalFileTreeRail });

  app.slots.experimental_threadHeaderAction({
    id: "file-tree-toggle",
    title: "File tree",
    component: ({ threadId }) => <FileTreeHeaderAction threadId={threadId} />,
  });

  app.slots.sidebarFooterAction({
    id: "file-tree-toggle",
    title: "File tree",
    icon: "FolderTree",
    run: toggleRailOpen,
  });

  app.composer.customize({
    id: "new-thread-file-tree",
    scopes: ["new-thread"],
    actions: [{ id: "open-file-tree", component: NewThreadFileTreeAction }],
  });

  app.composer.customize({
    id: "file-tree-chat-draft",
    scopes: ["thread", "queued-message", "side-chat", "new-thread"],
    banners: [{ id: "bridge", chrome: "bare", component: ChatDraftBridge }],
  });

  app.slots.commandPaletteAction({
    id: "find-file-in-tree",
    title: "File tree: find a file",
    run: () => {
      writeStoredOpen(true);
      requestSearchFocus();
    },
  });

  app.slots.commandPaletteAction({
    id: "open-file-tree",
    title: "File tree: show pinned folder",
    run: () => {
      writeStoredOpen(true);
    },
  });
});
