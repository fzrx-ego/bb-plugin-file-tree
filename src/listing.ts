import type { TreeEntry } from "../contract";
import { resolveUnderRoot } from "./paths";
import { resolveRoot } from "./roots";

/** Short cache avoids repeated host calls while the panel remounts. */
const LIST_TTL_MS = 8_000;
const MAX_CACHED_DIRECTORIES = 500;
const listCache = new Map<string, { at: number; entries: TreeEntry[] }>();
let generation = 0;

export type HostDirectoryCall = (input: {
  hostId: string;
  rootPath: string;
  relativePath: string;
  showSkipped: boolean;
}) => Promise<{ entries: TreeEntry[] }>;

export function invalidateListings(rootId?: string): void {
  generation += 1;
  if (rootId === undefined) {
    listCache.clear();
    return;
  }
  const prefix = `${rootId}\n`;
  for (const key of listCache.keys()) {
    if (key.startsWith(prefix)) listCache.delete(key);
  }
}

export async function listDir(
  input: { rootId: string; relativePath: string; showSkipped: boolean },
  callHost: HostDirectoryCall,
): Promise<{ entries: TreeEntry[] }> {
  const root = resolveRoot(input.rootId);
  if (root === undefined) {
    throw new Error("This file tree panel is out of date — reopen it and try again.");
  }
  resolveUnderRoot(root.rootPath, input.relativePath);
  const cacheKey = `${input.rootId}\n${input.relativePath}\n${input.showSkipped}`;
  const cached = listCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < LIST_TTL_MS) {
    listCache.delete(cacheKey);
    listCache.set(cacheKey, cached);
    return { entries: cached.entries };
  }
  listCache.delete(cacheKey);
  const requestGeneration = generation;
  const result = await callHost({ ...root, relativePath: input.relativePath, showSkipped: input.showSkipped });
  if (requestGeneration === generation) {
    listCache.set(cacheKey, { at: Date.now(), entries: result.entries });
    while (listCache.size > MAX_CACHED_DIRECTORIES) {
      const oldest = listCache.keys().next().value;
      if (oldest === undefined) break;
      listCache.delete(oldest);
    }
  }
  return result;
}
