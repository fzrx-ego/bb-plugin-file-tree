import type { TreeEntry } from "../contract";

export interface VisibleReveal {
  rootId: string;
  relativePath: string;
  isDirectory: boolean;
}

/**
 * BB's host directory listing omits dotfolders, even when the file can be
 * resolved directly. Add only the verified reveal chain to its visible rows.
 */
export function includeRevealedChild(
  entries: TreeEntry[],
  parentPath: string,
  target: VisibleReveal,
): TreeEntry[] {
  const remaining = parentPath === ""
    ? target.relativePath
    : target.relativePath.startsWith(`${parentPath}/`)
      ? target.relativePath.slice(parentPath.length + 1)
      : "";
  if (remaining === "") return entries;

  const name = remaining.split("/")[0];
  const relativePath = parentPath === "" ? name : `${parentPath}/${name}`;
  if (entries.some((entry) => entry.relativePath === relativePath)) return entries;

  const kind: TreeEntry["kind"] =
    relativePath === target.relativePath && !target.isDirectory ? "file" : "directory";
  return [...entries, { name, relativePath, kind }].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  });
}
