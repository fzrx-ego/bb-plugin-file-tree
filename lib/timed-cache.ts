/**
 * Verdicts that survive a React remount.
 *
 * The chat scanner used to keep "this path exists" only inside the effect.
 * A new `rpc` or `navigate` identity aborted that effect and asked the server
 * about the whole thread again, which is what rebuilt the Documents index.
 * The cache is keyed by thread, because the same string can name a file in
 * one workspace and nothing in another.
 */
export const PATH_CACHE_TTL_MS = 10 * 60 * 1000;

interface Stamp<T> {
  value: T;
  at: number;
}

export function createTimedCache<T>(ttlMs: number) {
  const scopes = new Map<string, Map<string, Stamp<T>>>();

  return {
    recall(scope: string, now = Date.now()): Map<string, T> {
      const stored = scopes.get(scope);
      const fresh = new Map<string, T>();
      if (stored === undefined) return fresh;
      for (const [key, stamp] of stored) {
        if (now - stamp.at >= ttlMs) {
          stored.delete(key);
          continue;
        }
        fresh.set(key, stamp.value);
      }
      if (stored.size === 0) scopes.delete(scope);
      return fresh;
    },
    remember(scope: string, key: string, value: T, now = Date.now()): void {
      let stored = scopes.get(scope);
      if (stored === undefined) {
        stored = new Map();
        scopes.set(scope, stored);
      }
      stored.set(key, { value, at: now });
    },
  };
}
