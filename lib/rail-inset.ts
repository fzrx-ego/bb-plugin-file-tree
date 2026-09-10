import { getRailWidthPx, subscribeRailWidth } from "@/lib/rail-width";

const holders = new Set<string>();

function syncBodyPadding(): void {
  if (holders.size > 0) {
    document.body.style.paddingRight = `${getRailWidthPx()}px`;
    return;
  }
  document.body.style.paddingRight = "";
}

/** The inset follows the handle, so the chat keeps up while the rail is dragged. */
subscribeRailWidth(() => {
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
