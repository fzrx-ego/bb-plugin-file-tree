import type { useBbNavigate } from "@get-bb/plugin-sdk/app";

type Navigate = ReturnType<typeof useBbNavigate>;

/** BB's window overlay has no file preview panel; its route slot owns that intent. */
const navigators = new Map<string, Navigate>();

function key(threadId: string | null): string {
  return threadId ?? "new-thread";
}

export function registerSurfaceNavigation(threadId: string | null, navigate: Navigate): () => void {
  const scope = key(threadId);
  navigators.set(scope, navigate);
  return () => {
    if (navigators.get(scope) === navigate) navigators.delete(scope);
  };
}

export function surfaceNavigation(threadId: string | null): Navigate | null {
  return navigators.get(key(threadId)) ?? null;
}
