/**
 * The rail's open/closed flag. `FileTreeHeaderAction` owns the rail, but the
 * content script that decorates chat paths has to be able to open it, so the
 * key, the event and the writer live here rather than inside the component.
 */
export const RAIL_STORAGE_KEY = "bb-plugin-file-tree:rail-open";
export const RAIL_EVENT = "bb-plugin-file-tree:rail-open";

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
  try {
    localStorage.setItem(RAIL_STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new CustomEvent(RAIL_EVENT, { detail: open }));
}
