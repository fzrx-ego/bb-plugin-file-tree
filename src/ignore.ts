import { SKIP_DIR_NAMES, SKIP_FILE_NAMES, type TreeEntry } from "../contract";

export function shouldSkip(entry: TreeEntry, showSkipped: boolean): boolean {
  if (showSkipped) return false;
  if (entry.kind === "directory") return SKIP_DIR_NAMES.has(entry.name);
  return SKIP_FILE_NAMES.has(entry.name);
}

export function sortEntries(entries: readonly TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
