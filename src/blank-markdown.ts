import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { resolveRoot } from "./roots";
import { nextUntitledMarkdownName } from "./untitled-name";

export { nextUntitledMarkdownName } from "./untitled-name";

export type CreateBlankMarkdownInput = {
  rootId: string;
  /** Folder to create in. Empty string is the tree root. */
  directoryRelativePath: string;
};

export type CreateBlankMarkdownResult =
  | { ok: true; relativePath: string }
  | { ok: false; message: string };

/**
 * Create an empty markdown file in a folder already on the tree, without
 * overwriting anything that is already there.
 */
export async function createBlankMarkdown(
  bb: BbPluginApi,
  input: CreateBlankMarkdownInput,
): Promise<CreateBlankMarkdownResult> {
  const root = resolveRoot(input.rootId);
  if (root === undefined) {
    return {
      ok: false,
      message: "This file tree panel is out of date — reopen it and try again.",
    };
  }

  let directoryAbsolute: string;
  try {
    directoryAbsolute = resolveUnderRoot(root.rootPath, input.directoryRelativePath);
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "That folder is not in this tree.",
    };
  }

  let listing;
  try {
    listing = await bb.sdk.hosts.directory({
      hostId: root.hostId,
      path: directoryAbsolute,
    });
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? cause.message : "Could not list that folder.",
    };
  }

  const existing = listing.entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => entry.name);

  for (let attempt = 0; attempt < 20; attempt++) {
    const name = nextUntitledMarkdownName(existing);
    const relativePath =
      input.directoryRelativePath === ""
        ? name
        : `${input.directoryRelativePath}/${name}`;
    let absolute: string;
    try {
      absolute = resolveUnderRoot(root.rootPath, relativePath);
    } catch (cause) {
      return {
        ok: false,
        message: cause instanceof Error ? cause.message : "That path is not in this tree.",
      };
    }

    try {
      const result = await bb.sdk.files.write({
        hostId: root.hostId,
        path: absolute,
        rootPath: root.rootPath,
        content: "",
        contentEncoding: "utf8",
        expectedSha256: null,
      });
      if (result.outcome === "conflict") {
        existing.push(name);
        continue;
      }
      return { ok: true, relativePath: toRelativePath(root.rootPath, absolute) };
    } catch (cause) {
      return {
        ok: false,
        message: cause instanceof Error ? cause.message : "Could not create the file.",
      };
    }
  }

  return { ok: false, message: "Could not pick a free untitled.md name in this folder." };
}
