import { randomUUID } from "node:crypto";

/**
 * Server-side registry mapping an opaque id to a {hostId, rootPath} pair the
 * plugin itself resolved (a thread's workspace, a configured search root, a
 * registered project). `listDir`, `revealInFinder` and `copyFileToClipboard`
 * take only this id from the client and look the pair up here, rather than
 * trusting a client-supplied hostId/rootPath — a caller that reaches the RPC
 * directly, bypassing the tree UI, can otherwise point those calls at any
 * path on any paired host.
 */
interface RootRecord {
  hostId: string;
  rootPath: string;
}

/** Bounded so a long session cannot grow this without limit; oldest first out. */
const MAX_ROOTS = 500;
const recordById = new Map<string, RootRecord>();
const idByKey = new Map<string, string>();

function keyOf(hostId: string, rootPath: string): string {
  return `${hostId} ${rootPath}`;
}

export function registerRoot(hostId: string, rootPath: string): string {
  const key = keyOf(hostId, rootPath);
  const existing = idByKey.get(key);
  if (existing !== undefined) return existing;

  if (recordById.size >= MAX_ROOTS) {
    const oldestId = recordById.keys().next().value;
    if (oldestId !== undefined) {
      const oldest = recordById.get(oldestId);
      recordById.delete(oldestId);
      if (oldest !== undefined) idByKey.delete(keyOf(oldest.hostId, oldest.rootPath));
    }
  }

  const id = randomUUID();
  recordById.set(id, { hostId, rootPath });
  idByKey.set(key, id);
  return id;
}

export function resolveRoot(rootId: string): RootRecord | undefined {
  return recordById.get(rootId);
}
