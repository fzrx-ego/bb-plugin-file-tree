import { realpath } from "node:fs/promises";
import path from "node:path";

export function assertSafeRelative(relativePath: string): void {
  if (relativePath.includes("\0")) {
    throw new Error("path contains a null byte");
  }
  const parts = relativePath.split(/[\\/]/u).filter((part) => part.length > 0);
  if (parts.some((part) => part === "..")) {
    throw new Error("path escapes the workspace");
  }
}

export function resolveUnderRoot(rootPath: string, relativePath: string): string {
  assertSafeRelative(relativePath);
  const root = path.resolve(rootPath);
  const joined = relativePath === "" ? root : path.resolve(root, relativePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (joined !== root && !joined.startsWith(prefix)) {
    throw new Error("path escapes the workspace");
  }
  return joined;
}

/**
 * `resolveUnderRoot`, but confined against the real filesystem rather than
 * the literal string: a symlink inside the root that points outside it (say,
 * a folder named `link` whose target is `/etc`) passes the lexical prefix
 * check but resolves elsewhere once anything actually opens it. Used only by
 * local, single-machine operations (Reveal in Finder, Copy File) — they run
 * on this process's own filesystem regardless of which host the workspace
 * belongs to, so a local realpath is always the right one to check against.
 */
export async function resolveRealUnderRoot(
  rootPath: string,
  relativePath: string,
): Promise<string> {
  const lexical = resolveUnderRoot(rootPath, relativePath);
  const [realRoot, realTarget] = await Promise.all([
    realpath(path.resolve(rootPath)),
    realpath(lexical),
  ]);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`;
  if (realTarget !== realRoot && !realTarget.startsWith(prefix)) {
    throw new Error("path escapes the workspace");
  }
  return realTarget;
}

export function toRelativePath(rootPath: string, absolutePath: string): string {
  const rel = path.relative(path.resolve(rootPath), absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path escapes the workspace");
  }
  return rel.split(path.sep).join("/");
}
