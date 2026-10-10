import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { ChatPathBridge } from "@/components/ChatPathBridge";
import { RAIL_EVENT, readStoredOpen, toggleRailOpen } from "@/lib/rail-state";
import { useWindowFrame } from "@/lib/window-frame";

/** In BB's framed window the toggle sits in the title bar instead. */
export function FileTreeHeaderAction({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(() => readStoredOpen(true));
  const frame = useWindowFrame();
  const compact = useIsCompactViewport();
  const titleBarHasToggle = frame !== null && !compact;
  useEffect(() => {
    const onRailEvent = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpen(next);
    };
    window.addEventListener(RAIL_EVENT, onRailEvent);
    return () => window.removeEventListener(RAIL_EVENT, onRailEvent);
  }, []);

  return (
    <>
      <ChatPathBridge threadId={threadId} />
      {titleBarHasToggle ? null : (
        <Button type="button" variant="ghost" size="icon" className="size-7"
          aria-label={open ? "Hide file tree" : "Show file tree"}
          aria-pressed={open}
          onClick={toggleRailOpen}>
          <Icon name="FolderTree" className="size-4" />
        </Button>
      )}
    </>
  );
}
