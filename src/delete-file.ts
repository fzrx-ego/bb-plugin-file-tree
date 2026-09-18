import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { resolveRoot } from "./roots";

export type DeleteFileInput = {
  rootId: string;
  relativePath: string;
};

export type DeleteFileResult =
  | { ok: true; relativePath: string }
  | { ok: false; message: string };

/**
 * Delete one file in the tree. Directories and the workspace root are refused
 * so a context-menu click cannot wipe a folder.
 */
export async function deleteFile(
  bb: BbPluginApi,
  input: DeleteFileInput,
): Promise<DeleteFileResult> {
  if (input.relativePath === "") {
    return { ok: false, message: "The workspace root cannot be deleted." };
  }

  const root = resolveRoot(input.rootId);
  if (root === undefined) {
    return {
      ok: false,
      message: "This file tree panel is out of date — reopen it and try again.",
    };
  }

  let absolute: string;
  try {
    absolute = resolveUnderRoot(root.rootPath, input.relativePath);
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "That path is not in this tree.",
    };
  }

  const slash = input.relativePath.lastIndexOf("/");
  const parentRelative = slash === -1 ? "" : input.relativePath.slice(0, slash);
  const name = slash === -1 ? input.relativePath : input.relativePath.slice(slash + 1);

  let listing;
  try {
    listing = await bb.sdk.hosts.directory({
      hostId: root.hostId,
      path: resolveUnderRoot(root.rootPath, parentRelative),
    });
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Could not list that folder.",
    };
  }

  const entry = listing.entries.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    return { ok: false, message: "That file is not on disk." };
  }
  if (entry.kind !== "file") {
    return { ok: false, message: "Only files can be deleted from this menu." };
  }

  try {
    await bb.sdk.files.remove({
      hostId: root.hostId,
      path: absolute,
      rootPath: root.rootPath,
      recursive: false,
    });
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Could not delete the file.",
    };
  }

  return { ok: true, relativePath: toRelativePath(root.rootPath, absolute) };
}
