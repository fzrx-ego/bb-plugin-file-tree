import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { TreeEntry } from "../contract";
import { shouldSkip, sortEntries } from "./ignore";
import { resolveRealUnderRoot } from "./paths";

export async function statHostPath(
  rootPath: string,
  relativePath: string,
): Promise<{ isDirectory: boolean } | null> {
  try {
    const absolute = await resolveRealUnderRoot(rootPath, relativePath);
    return { isDirectory: (await stat(absolute)).isDirectory() };
  } catch (cause) {
    if (cause instanceof Error && (cause.message === "path escapes the workspace" ||
      "code" in cause && (cause.code === "ENOENT" || cause.code === "ENOTDIR"))) return null;
    throw cause;
  }
}

/** List only immediate children on the target host, including dotfiles when requested. */
export async function listHostDirectory(
  rootPath: string,
  relativePath: string,
  showSkipped: boolean,
): Promise<{ entries: TreeEntry[] }> {
  const absolute = await resolveRealUnderRoot(rootPath, relativePath);
  const dirents = await readdir(absolute, { withFileTypes: true });
  const entries: TreeEntry[] = [];
  for (const dirent of dirents) {
    if (!showSkipped && dirent.name.startsWith(".")) continue;
    let kind: TreeEntry["kind"];
    if (dirent.isDirectory()) kind = "directory";
    else if (dirent.isFile()) kind = "file";
    else if (dirent.isSymbolicLink()) {
      try {
        kind = (await stat(path.join(absolute, dirent.name))).isDirectory() ? "directory" : "file";
      } catch {
        continue; // A broken link has no file or directory target.
      }
    } else continue;
    const childPath = relativePath === "" ? dirent.name : `${relativePath}/${dirent.name}`;
    const entry = { name: dirent.name, relativePath: childPath, kind };
    if (!shouldSkip(entry, showSkipped)) entries.push(entry);
  }
  return { entries: sortEntries(entries) };
}
