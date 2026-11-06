import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRealUnderRoot } from "./paths";

export type CreateEntryResult =
  | { ok: true; relativePath: string }
  | { ok: false; message: string };

const MAX_NAME_BYTES = 255;

export function entryNameProblem(name: string): string | null {
  if (name === "") return "Enter a name.";
  if (name === "." || name === "..") return "That name is not allowed.";
  if (/[/\\\0]/u.test(name)) return "A name cannot contain / or \\.";
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) return "That name is too long.";
  return null;
}

/** Create an empty file or folder directly in a folder on the tree, never over an existing one. */
export async function createHostEntry(input: {
  rootPath: string;
  directoryRelativePath: string;
  name: string;
  kind: "file" | "directory";
}): Promise<CreateEntryResult> {
  const name = input.name.trim();
  const problem = entryNameProblem(name);
  if (problem !== null) return { ok: false, message: problem };

  let directory: string;
  try {
    directory = await resolveRealUnderRoot(input.rootPath, input.directoryRelativePath);
  } catch {
    return { ok: false, message: "That folder is no longer in this tree." };
  }

  const absolute = path.join(directory, name);
  try {
    if (input.kind === "directory") await mkdir(absolute);
    else await writeFile(absolute, "", { flag: "wx" });
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "EEXIST") {
      return { ok: false, message: `“${name}” already exists.` };
    }
    return { ok: false, message: cause instanceof Error ? cause.message : "Could not create it." };
  }
  const prefix = input.directoryRelativePath;
  return { ok: true, relativePath: prefix === "" ? name : `${prefix}/${name}` };
}
