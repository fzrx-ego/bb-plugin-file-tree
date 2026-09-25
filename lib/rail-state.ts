/**
 * The rail's open/closed flag is shared by controls mounted in different BB
 * surfaces. The rail initializes it after settings load.
 */
export const RAIL_STORAGE_KEY = "bb-plugin-file-tree:rail-open";
export const RAIL_EVENT = "bb-plugin-file-tree:rail-open";
let currentOpen: boolean | null = null;

export function readStoredOpen(fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(RAIL_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* private mode */
  }
  return fallback;
}

export function writeStoredOpen(open: boolean): void {
  currentOpen = open;
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(RAIL_EVENT, { detail: open }));
}

export function initializeRailOpen(fallback: boolean): boolean {
  const open = readStoredOpen(fallback);
  currentOpen = open;
  window.dispatchEvent(new CustomEvent(RAIL_EVENT, { detail: open }));
  return open;
}

export function toggleRailOpen(): void {
  // A click before settings load still means "show the tree".
  writeStoredOpen(currentOpen === null ? true : !currentOpen);
}
