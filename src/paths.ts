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

export function toRelativePath(rootPath: string, absolutePath: string): string {
  const rel = path.relative(path.resolve(rootPath), absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path escapes the workspace");
  }
  return rel.split(path.sep).join("/");
}
