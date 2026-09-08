import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useComposerView } from "@get-bb/plugin-sdk/app";
import { FileTreePanel } from "@/components/FileTreePanel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { acquireRailInset, syncRailInset } from "@/lib/rail-inset";

export function NewThreadFileTreeAction() {
  const { scope } = useComposerView();
  const projectId = scope.kind === "new-thread" ? scope.projectId : null;
  const portalScopeProps = usePortalScopeProps();
  const insetHolderId = useRef("file-tree:new-thread").current;
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) {
      syncRailInset();
      return;
    }
    return acquireRailInset(insetHolderId);
  }, [insetHolderId, open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Show file tree"
        disabled={projectId === null}
        onClick={() => setOpen(true)}
      >
        <Icon name="FolderTree" className="size-4" />
      </Button>
      {open
        ? createPortal(
            <aside
              {...portalScopeProps}
              className="fixed bottom-0 right-0 top-0 z-40 flex w-[13.5rem] flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
              aria-label="Project file tree"
            >
              <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-sidebar-border pl-3 pr-1">
                <span className="truncate text-sm font-medium text-muted-foreground">Files</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 p-0"
                  aria-label="Hide file tree"
                  onClick={() => setOpen(false)}
                >
                  <Icon name="FolderTree" className="size-4" />
                </Button>
              </div>
              <FileTreePanel threadId={null} projectId={projectId} />
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
