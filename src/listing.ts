import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { TreeEntry } from "../contract";
import { shouldSkip, sortEntries } from "./ignore";
import { resolveUnderRoot, toRelativePath } from "./paths";

export async function listDir(
  bb: BbPluginApi,
  input: {
    hostId: string;
    rootPath: string;
    relativePath: string;
    showSkipped: boolean;
  },
): Promise<{ entries: TreeEntry[] }> {
  const absolute = resolveUnderRoot(input.rootPath, input.relativePath);
  const listing = await bb.sdk.hosts.directory({
    hostId: input.hostId,
    path: absolute,
  });
  const mapped: TreeEntry[] = [];
  for (const entry of listing.entries) {
    let relativePath: string;
    try {
      relativePath = toRelativePath(input.rootPath, entry.path);
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
