import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FileTreeHeaderAction } from "@/components/FileTreeHeaderAction";
import { FileTreePanel } from "@/components/FileTreePanel";
import { NewThreadFileTreeAction } from "@/components/NewThreadFileTreeAction";
import { requestSearchFocus } from "@/lib/search-focus-bus";

export default definePluginApp((app) => {

  app.slots.experimental_threadHeaderAction({
    id: "file-tree-toggle",
    title: "File tree",
    component: ({ threadId, isCompactViewport }) => (
      <FileTreeHeaderAction
        threadId={threadId}
        isCompactViewport={isCompactViewport}
      />
    ),
  });

  app.slots.threadPanelAction({
    id: "file-tree",
    title: "File tree",
    icon: "Folder",
    layout: "flush",
    component: ({ threadId }) => <FileTreePanel threadId={threadId} />,
  });

  app.slots.experimental_newThreadPanelAction({
    id: "file-tree",
    title: "File tree",
    icon: "Folder",
    layout: "flush",
    component: ({ projectId }) => <FileTreePanel threadId={null} projectId={projectId} />,
  });

  app.composer.customize({
    id: "new-thread-file-tree",
    scopes: ["new-thread"],
    actions: [{ id: "open-file-tree", component: NewThreadFileTreeAction }],
  });

  app.slots.commandPaletteAction({
    id: "find-file-in-tree",
    title: "File tree: find a file",
    isAvailable: ({ threadId }) => threadId !== null,
    run: ({ openPanel }) => {
      openPanel({ actionId: "file-tree", title: "File tree" });
      requestSearchFocus();
    },
  });

  app.slots.commandPaletteAction({
    id: "open-file-tree",
    title: "File tree: open in the right panel",
    isAvailable: ({ threadId }) => threadId !== null,
    run: ({ openPanel }) => {
      openPanel({ actionId: "file-tree", title: "File tree" });
    },
  });
});
