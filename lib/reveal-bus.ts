/**
 * One-slot hand-off between the chat content script (which knows the path
 * string) and the mounted tree (which knows the thread and can expand it).
 *
 * The request is kept pending until a subscriber takes it: clicking a path
 * usually *opens* the rail, so the tree mounts after the request is made.
 */
export interface RevealRequest { path: string; threadId: string }
type RevealListener = (request: RevealRequest) => void;

const listeners = new Set<RevealListener>();
let pending: RevealRequest | null = null;

export function requestReveal(rawPath: string, threadId: string): void {
  const path = rawPath.trim();
  if (path === "") return;
  const request = { path, threadId };
  if (listeners.size === 0) {
    pending = request;
    return;
  }
  pending = null;
  for (const listener of Array.from(listeners)) listener(request);
}

export function subscribeReveal(listener: RevealListener): () => void {
  listeners.add(listener);
  if (pending !== null) {
    const request = pending;
    pending = null;
    listener(request);
  }
  return () => {
    listeners.delete(listener);
  };
}
