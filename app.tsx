import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { FileTreeHeaderAction } from "@/components/FileTreeHeaderAction";
import { FileTreePanel } from "@/components/FileTreePanel";

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
    component: () => <FileTreePanel threadId={null} />,
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
