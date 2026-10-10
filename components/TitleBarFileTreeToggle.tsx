import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { toggleRailOpen } from "@/lib/rail-state";

/** BB's title-bar buttons: 28px, `rounded-md`, 4px apart, nudged 2px down. */
const BUTTON_PX = 28;
const GAP_PX = 4;

/**
 * BB's framed title bar is `[data-testid="app-window-title-bar"]`: a fixed
 * row with BB's right-panel toggle pushed to its right padding. Widening that
 * padding by one button moves BB's toggle left and frees the corner for the
 * tree toggle, so the two read as one group with the tree outermost, above
 * the tree card. The rule lives in a style element only while this button is
 * mounted.
 */
const TITLE_BAR_RULE = `[data-testid="app-window-title-bar"]{padding-right:calc(0.75rem + ${BUTTON_PX + GAP_PX}px)!important}`;

export function TitleBarFileTreeToggle({ open }: { open: boolean }) {
  const portalScopeProps = usePortalScopeProps();

  useLayoutEffect(() => {
    const style = document.createElement("style");
    style.dataset.bbPluginFileTree = "title-bar";
    style.textContent = TITLE_BAR_RULE;
    document.head.append(style);
    return () => style.remove();
  }, []);

  return createPortal(
    <div
      {...portalScopeProps}
      // Above the title bar (BB z-index 44), below BB's shared overlays (50).
      className="fixed z-[45] flex items-center [app-region:no-drag] [-webkit-app-region:no-drag]"
      style={{
        right: "0.75rem",
        top: `calc((var(--bb-app-chrome-row-height) - ${BUTTON_PX}px) / 2)`,
        transform: "translateY(2px)",
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
