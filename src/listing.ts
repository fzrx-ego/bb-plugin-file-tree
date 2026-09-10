import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TreeEntry } from "../contract";
import { shouldSkip, sortEntries } from "./ignore";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { resolveRoot } from "./roots";

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
  return { entries: sortEntries(mapped) };
}
