import type { PluginComposerScope } from "@get-bb/plugin-sdk/app";

export interface ChatTarget {
  key: string;
  scope: PluginComposerScope;
}

interface Entry extends ChatTarget {
  addPath(path: string): void;
}

export function composerScopeKey(scope: PluginComposerScope): string {
  switch (scope.kind) {
    case "thread": return `thread:${scope.threadId}`;
    case "queued-message": return `queued-message:${scope.threadId}:${scope.queuedMessageId}`;
    case "side-chat": return `side-chat:${scope.projectId}:${scope.parentThreadId}:${scope.tabId}:${scope.childThreadId ?? ""}`;
    case "new-thread": return `new-thread:${scope.projectId ?? ""}`;
  }
}

const entries = new Map<string, Entry[]>();
const subscribers = new Set<() => void>();
let snapshot: readonly ChatTarget[] = [];

function publish(): void {
  snapshot = [...entries.values()].flatMap((stack) => {
    const entry = stack[stack.length - 1];
    return entry === undefined ? [] : [{ key: entry.key, scope: entry.scope }];
  });
  for (const subscriber of subscribers) subscriber();
}

export function getChatTargets(): readonly ChatTarget[] { return snapshot; }

export function subscribeChatTargets(subscriber: () => void): () => void {
  subscribers.add(subscriber);
  return () => { subscribers.delete(subscriber); };
}

/** Only a bridge mounted inside a real composer can register a writable target. */
export function registerChatTarget(scope: PluginComposerScope, addPath: (path: string) => void): () => void {
  const key = composerScopeKey(scope);
  const entry = { key, scope, addPath };
  const stack = entries.get(key) ?? [];
  stack.push(entry);
  entries.set(key, stack);
  publish();
  return () => {
    const current = entries.get(key);
    if (current === undefined) return;
    const index = current.indexOf(entry);
    if (index === -1) return;
    current.splice(index, 1);
    if (current.length === 0) entries.delete(key);
    publish();
  };
}

export function requestAddToChat(key: string, path: string): boolean {
  const stack = entries.get(key);
  const entry = stack?.[stack.length - 1];
  if (entry === undefined) return false;
  entry.addPath(path);
  return true;
}
