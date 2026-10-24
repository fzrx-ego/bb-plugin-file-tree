import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { toggleRailOpen } from "@/lib/rail-state";

/** BB's title-bar buttons: 28px, `rounded-md`, 4px apart. */
const BUTTON_PX = 28;
const GAP_PX = 4;

/** Reserve the tree button's width in BB's native trailing controls. */
const TITLE_BAR_RULE = `[data-testid="app-window-title-bar"]{padding-right:calc(0.75rem + ${BUTTON_PX + GAP_PX}px)!important}`;

export function TitleBarFileTreeToggle({ open }: { open: boolean }) {
  const portalScopeProps = usePortalScopeProps();

  useLayoutEffect(() => {
    const style = document.createElement("style");
    style.dataset.bbPluginFileTree = "title-bar";
    // Current BB shares this spacing between inline panel controls and the
    // split workspace's corner toggle. The open tree already provides room
    // through its body inset; only a closed tree needs another button slot.
    const edgeGap = getComputedStyle(document.documentElement)
      .getPropertyValue("--bb-title-bar-trailing-edge-gap").trim();
    style.textContent = TITLE_BAR_RULE + (!open && edgeGap !== ""
      ? `[data-framed]{--bb-title-bar-trailing-edge-gap:calc(${edgeGap} + ${BUTTON_PX + GAP_PX}px)}`
      : "");
    document.head.append(style);
    return () => style.remove();
  }, [open]);

  return createPortal(
    <div
      {...portalScopeProps}
      // Above the title bar (BB z-index 44), below BB's shared overlays (50).
      className="fixed z-[45] flex items-center [app-region:no-drag] [-webkit-app-region:no-drag]"
      style={{
        right: "calc(var(--bb-title-bar-trailing-edge-gap, 0.75rem) + 1px)",
        top: `calc((var(--bb-window-title-bar-height) - ${BUTTON_PX}px) / 2)`,
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 rounded-md p-0"
        aria-label={open ? "Hide file tree" : "Show file tree"}
        aria-pressed={open}
        onClick={toggleRailOpen}
      >
        <Icon name="FolderTree" className="size-4" />
      </Button>
    </div>,
    document.body,
  );
}
