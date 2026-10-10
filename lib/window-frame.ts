/**
 * BB's framed desktop window: a recessed backdrop with a chrome row on top and
 * a lip around the inset content card. BB declares both sizes as CSS custom
 * properties on its `[data-framed]` wrapper, so the rail reads them there and
 * sits on the same backdrop as a card of its own. Without the wrapper (web,
 * compact viewport, older BB) the window is not framed and the rail stays
 * flush with the window edge.
 */
import { useEffect, useState } from "react";

export type WindowFrame = {
  /** CSS length of the chrome row, such as `3rem`. */
  top: string;
  /** CSS length of the lip between the card and the window edge. */
  lip: string;
};

let current: WindowFrame | null = null;
const listeners = new Set<(frame: WindowFrame | null) => void>();

function readFrame(): WindowFrame | null {
  const wrapper = document.querySelector("[data-framed]");
  if (wrapper === null) return null;
  const style = getComputedStyle(wrapper);
  const top = style.getPropertyValue("--bb-window-frame-top").trim();
  const lip = style.getPropertyValue("--bb-window-frame-lip").trim();
  return top === "" || lip === "" ? null : { top, lip };
}

function sameFrame(a: WindowFrame | null, b: WindowFrame | null): boolean {
  return a === b || (a !== null && b !== null && a.top === b.top && a.lip === b.lip);
}

export function getWindowFrame(): WindowFrame | null {
  return current;
}

/** Re-read the wrapper; listeners hear only real changes. */
export function refreshWindowFrame(): void {
  const next = readFrame();
  if (sameFrame(current, next)) return;
  current = next;
  for (const listener of listeners) listener(next);
}

export function subscribeWindowFrame(listener: (frame: WindowFrame | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * BB toggles the wrapper's `data-framed` with the viewport and full screen,
 * so both resize and the attribute are watched. Child-list changes are not:
 * the shell is mounted before plugin overlays, and streaming chat would
 * otherwise force a style read on every token.
 */
export function useWindowFrame(): WindowFrame | null {
  const [frame, setFrame] = useState(() => {
    refreshWindowFrame();
    return getWindowFrame();
  });
  useEffect(() => {
    const unsubscribe = subscribeWindowFrame(setFrame);
    refreshWindowFrame();
    setFrame(getWindowFrame());
    const observer = new MutationObserver(refreshWindowFrame);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-framed"],
    });
    window.addEventListener("resize", refreshWindowFrame);
    return () => {
      unsubscribe();
      observer.disconnect();
      window.removeEventListener("resize", refreshWindowFrame);
    };
  }, []);
  return frame;
}
