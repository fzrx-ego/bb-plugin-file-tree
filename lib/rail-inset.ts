import { getRailWidthPx, subscribeRailWidth } from "@/lib/rail-width";
import { getWindowFrame, subscribeWindowFrame } from "@/lib/window-frame";

const holders = new Set<string>();

/** In a framed window the rail card keeps BB's lip to the window edge. */
function syncBodyPadding(): void {
  if (holders.size > 0) {
    const frame = getWindowFrame();
    const width = `${getRailWidthPx()}px`;
    document.body.style.paddingRight = frame === null ? width : `calc(${width} + ${frame.lip})`;
    return;
  }
  document.body.style.paddingRight = "";
}

/** The inset follows the handle, so the chat keeps up while the rail is dragged. */
subscribeRailWidth(() => {
  syncBodyPadding();
});

subscribeWindowFrame(() => {
  syncBodyPadding();
});

/** Reserve space for the overlay. Call from layout effects; always release on cleanup. */
export function acquireRailInset(holderId: string): () => void {
  holders.add(holderId);
  syncBodyPadding();
  return () => {
    holders.delete(holderId);
    syncBodyPadding();
  };
}

export function syncRailInset(): void {
  syncBodyPadding();
}
