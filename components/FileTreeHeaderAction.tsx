import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSettings, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ChatPathBridge } from "@/components/ChatPathBridge";
import { FileTreePanel } from "@/components/FileTreePanel";
import { RailResizeHandle } from "@/components/RailResizeHandle";
import { acquireRailInset, syncRailInset } from "@/lib/rail-inset";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { RAIL_EVENT, readStoredOpen, writeStoredOpen } from "@/lib/rail-state";
import { useRailWidthPx } from "@/lib/rail-width";

/** Host renders plugin actions left of the workspace button; pane toggles live in a sibling. */
function findPaneActionsHost(from: HTMLElement): HTMLElement | null {
  const workflow = from.closest("[data-thread-header-workflow-actions]");
  if (!(workflow instanceof HTMLElement)) return null;
  const sibling = workflow.nextElementSibling;
  if (
    sibling instanceof HTMLElement &&
    sibling.hasAttribute("data-thread-header-pane-actions")
  ) {
    return sibling;
  }
  const nested = workflow.parentElement?.querySelector(
    "[data-thread-header-pane-actions]",
  );
  return nested instanceof HTMLElement ? nested : null;
}

export function FileTreeHeaderAction({
  threadId,
  isCompactViewport,
}: {
  threadId: string;
  isCompactViewport: boolean;
}) {
  const { values, isLoading } = useSettings();
  const railWidthPx = useRailWidthPx();
  const navigate = useBbNavigate();
  const portalScopeProps = usePortalScopeProps();
  const slotRef = useRef<HTMLSpanElement>(null);
  const insetHolderId = useRef(`file-tree-rail:${threadId}:${Math.random().toString(36).slice(2)}`).current;
  const defaultOpen = values?.openByDefault !== false;
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [paneActionsEl, setPaneActionsEl] = useState<HTMLElement | null>(null);
  const [headerPlaced, setHeaderPlaced] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setOpen(isCompactViewport ? false : readStoredOpen(defaultOpen));
    setReady(true);
  }, [defaultOpen, isCompactViewport, isLoading]);

  useEffect(() => {
    const onRailEvent = (event: Event) => {
      if (isCompactViewport) return;
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpen(next);
    };
    window.addEventListener(RAIL_EVENT, onRailEvent);
    return () => window.removeEventListener(RAIL_EVENT, onRailEvent);
  }, [isCompactViewport]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      writeStoredOpen(next);
      return next;
    });
  };

  const railOpen = ready && open && !isCompactViewport;

  useLayoutEffect(() => {
    if (!railOpen) {
      syncRailInset();
      return;
    }
    return acquireRailInset(insetHolderId);
  }, [insetHolderId, railOpen]);

  useLayoutEffect(() => {
    if (railOpen || isCompactViewport) {
      setPaneActionsEl(null);
      setHeaderPlaced(true);
      return;
    }
    const slot = slotRef.current;
    setPaneActionsEl(slot ? findPaneActionsHost(slot) : null);
    setHeaderPlaced(true);
  }, [isCompactViewport, railOpen, ready]);

  const showTreeButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label="Show file tree"
      aria-pressed={false}
      onClick={() => {
        if (isCompactViewport) {
          navigate.openThreadPanel({ actionId: "file-tree", title: "File tree" });
          return;
        }
        toggle();
      }}
    >
      <Icon name="FolderTree" className="size-4" />
    </Button>
  );

  return (
    <>
      {/* Rendered here because the host guarantees this slot a thread. */}
      <ChatPathBridge threadId={threadId} />
      <span ref={slotRef} className="sr-only" aria-hidden="true" />
      {railOpen || !headerPlaced
        ? null
        : paneActionsEl
          ? createPortal(
              <span {...portalScopeProps} className="inline-flex">
                {showTreeButton}
              </span>,
              paneActionsEl,
            )
          : showTreeButton}
      {railOpen
        ? createPortal(
            <aside
              {...portalScopeProps}
              className="fixed bottom-0 right-0 top-0 z-40 flex flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground"
              style={{ width: `${railWidthPx}px` }}
              aria-label="Workspace file tree"
            >
              <RailResizeHandle />
              <div className="flex h-[48px] shrink-0 items-center justify-between border-b border-sidebar-border pl-3 pr-1">
                <span className="truncate text-sm font-medium text-muted-foreground">
                  Files
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 p-0"
                  aria-label="Hide file tree"
                  onClick={toggle}
                >
                  <Icon name="FolderTree" className="size-4" />
                </Button>
              </div>
              <FileTreePanel threadId={threadId} />
            </aside>,
            document.body,
          )
        : null}
    </>
  );
}
