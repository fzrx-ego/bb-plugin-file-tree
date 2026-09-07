const RAIL_WIDTH = "13.5rem";
const holders = new Set<string>();

function syncBodyPadding(): void {
  if (holders.size > 0) {
    document.body.style.paddingRight = RAIL_WIDTH;
    return;
  }
  document.body.style.paddingRight = "";
}

/** Reserve space for the overlay. Call from layout effects; always release on cleanup. */
export function acquireRailInset(holderId: string): () => void {
  holders.add(holderId);
  syncBodyPadding();
  return () => {
    holders.delete(holderId);
    syncBodyPadding();
  };
}

export { RAIL_WIDTH };

export function syncRailInset(): void {
  syncBodyPadding();
}
