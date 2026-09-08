/**
 * "Find a file" from the command palette has to reach an input that does not
 * exist yet: the action opens the panel, and the panel mounts after. Same
 * one-slot hand-off as `reveal-bus`, for the same reason.
 */
type FocusListener = () => void;

const listeners = new Set<FocusListener>();
let pending = false;

export function requestSearchFocus(): void {
  if (listeners.size === 0) {
    pending = true;
    return;
  }
  pending = false;
  for (const listener of Array.from(listeners)) listener();
}

export function subscribeSearchFocus(listener: FocusListener): () => void {
  listeners.add(listener);
  if (pending) {
    pending = false;
    listener();
  }
  return () => {
    listeners.delete(listener);
  };
}
