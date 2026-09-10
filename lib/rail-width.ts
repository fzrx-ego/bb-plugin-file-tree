/**
 * The rail's width in pixels. The rail is a fixed overlay the plugin draws
 * itself, so nothing in the host resizes it — the drag handle, the body inset
 * and both rail components read the width from here.
 */
import { useEffect, useState } from "react";

export const RAIL_WIDTH_STORAGE_KEY = "bb-plugin-file-tree:rail-width";
export const RAIL_WIDTH_EVENT = "bb-plugin-file-tree:rail-width";

export const DEFAULT_RAIL_WIDTH_PX = 216;
const MIN_RAIL_WIDTH_PX = 160;
const MAX_RAIL_WIDTH_PX = 720;
/** Leave the chat usable no matter how far the handle is dragged. */
const MIN_REMAINING_PX = 320;

let currentWidthPx: number | null = null;
const listeners = new Set<(px: number) => void>();

export function clampRailWidthPx(px: number): number {
  const viewportCap =
    typeof window === "undefined"
      ? MAX_RAIL_WIDTH_PX
      : window.innerWidth - MIN_REMAINING_PX;
  const max = Math.max(MIN_RAIL_WIDTH_PX, Math.min(MAX_RAIL_WIDTH_PX, viewportCap));
  return Math.round(Math.min(max, Math.max(MIN_RAIL_WIDTH_PX, px)));
}

function readStoredWidthPx(): number {
  try {
    const raw = localStorage.getItem(RAIL_WIDTH_STORAGE_KEY);
    const parsed = raw === null ? Number.NaN : Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  } catch {
    /* private mode */
  }
  return DEFAULT_RAIL_WIDTH_PX;
}

export function getRailWidthPx(): number {
  if (currentWidthPx === null) currentWidthPx = readStoredWidthPx();
  return clampRailWidthPx(currentWidthPx);
}

/** Live drag passes `persist: false`; the write happens once, on release. */
export function setRailWidthPx(px: number, { persist }: { persist: boolean }): void {
  const next = clampRailWidthPx(px);
  currentWidthPx = next;
  if (persist) {
    try {
      localStorage.setItem(RAIL_WIDTH_STORAGE_KEY, String(next));
    } catch {
      /* private mode */
    }
  }
  for (const listener of listeners) listener(next);
  window.dispatchEvent(new CustomEvent(RAIL_WIDTH_EVENT, { detail: next }));
}

export function subscribeRailWidth(listener: (px: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRailWidthPx(): number {
  const [width, setWidth] = useState(getRailWidthPx);
  useEffect(() => {
    setWidth(getRailWidthPx());
    return subscribeRailWidth(setWidth);
  }, []);
  return width;
}
