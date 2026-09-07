/**
 * One-slot hand-off between the chat content script (which knows the path
 * string) and the mounted tree (which knows the thread and can expand it).
 *
 * The request is kept pending until a subscriber takes it: clicking a path
 * usually *opens* the rail, so the tree mounts after the request is made.
 */
type RevealListener = (rawPath: string) => void;

const listeners = new Set<RevealListener>();
let pending: string | null = null;

export function requestReveal(rawPath: string): void {
  const path = rawPath.trim();
  if (path === "") return;
  if (listeners.size === 0) {
    pending = path;
    return;
  }
  pending = null;
  for (const listener of Array.from(listeners)) listener(path);
}

export function subscribeReveal(listener: RevealListener): () => void {
  listeners.add(listener);
  if (pending !== null) {
    const path = pending;
    pending = null;
    listener(path);
  }
  return () => {
    listeners.delete(listener);
  };
}
