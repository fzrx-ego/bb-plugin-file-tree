import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TreeEntry } from "../contract";
import { shouldSkip, sortEntries } from "./ignore";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { resolveRoot } from "./roots";

/**
 * Expanding the same folder while a chat burst remounts the panel should not
 * list it again. Create and delete drop the cache for that root; anything
 * changed outside the plugin shows up once this expires.
 */
const LIST_TTL_MS = 8_000;
const listCache = new Map<string, { at: number; entries: TreeEntry[] }>();

export function invalidateListings(rootId?: string): void {
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
  bb: BbPluginApi,
  input: {
    rootId: string;
    relativePath: string;
    showSkipped: boolean;
  },
): Promise<{ entries: TreeEntry[] }> {
  const root = resolveRoot(input.rootId);
  if (root === undefined) {
    throw new Error("This file tree panel is out of date — reopen it and try again.");
  }
  const cacheKey = `${input.rootId}\n${input.relativePath}\n${input.showSkipped}`;
  const cached = listCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < LIST_TTL_MS) {
    return { entries: cached.entries };
  }
  const absolute = resolveUnderRoot(root.rootPath, input.relativePath);
  const listing = await bb.sdk.hosts.directory({
    hostId: root.hostId,
    path: absolute,
  });
  const mapped: TreeEntry[] = [];
  for (const entry of listing.entries) {
    let relativePath: string;
    try {
      relativePath = toRelativePath(root.rootPath, entry.path);
    } catch {
      continue;
    }
    const next: TreeEntry = {
      name: entry.name,
      relativePath,
      kind: entry.kind,
    };
    if (shouldSkip(next, input.showSkipped)) continue;
    mapped.push(next);
  }
  const entries = sortEntries(mapped);
  listCache.set(cacheKey, { at: Date.now(), entries });
  return { entries };
}
