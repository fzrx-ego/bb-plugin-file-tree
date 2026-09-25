import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import { hostContract } from "./host-contract";
import type { PathProbe } from "./src/reveal";
import { createBlankMarkdown } from "./src/blank-markdown";
import { deleteFile } from "./src/delete-file";
import { invalidateListings, listDir } from "./src/listing";
import { copyFileToClipboard, revealInFinder } from "./src/os-actions";
import { resolveRoot } from "./src/roots";
import {
  makeSearchRootsGetter,
  resolveInRoot,
  resolveFileAnchors,
  resolveInWorkspace,
  resolvePaths,
  searchFiles,
  searchFilesInRoot,
} from "./src/reveal";
import { listRootChoices, workspaceForProject, workspaceForThread } from "./src/workspace";

export { rpcContract } from "./contract";

export default async function plugin(bb: BbPluginApi): Promise<void> {
  bb.log.info("loaded");
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const probe: PathProbe = (hostId, rootPath, relativePath) =>
    host.call("statPath", { rootPath, relativePath }, { hostId });
  const onThisComputer = async (rootId: string): Promise<boolean> => {
    const root = resolveRoot(rootId);
    if (root === undefined) throw new Error("File tree root expired. Choose the folder again.");
    const config = await bb.sdk.system.config();
    return root.hostId === config.primaryHostId;
  };

  const settings = bb.settings.define({
    openByDefault: {
      type: "boolean",
      label: "Show the pinned file tree when BB opens",
      default: true,
    },
    showSkipped: {
      type: "boolean",
      label: "Show hidden and ignored folders (.claude, node_modules, .git, …)",
      default: false,
    },
    treeRoot: {
      type: "string",
      label: "Root folder for personal threads",
      description:
        "Absolute path or ~/ path used only for BB personal threads. Project threads always show their project workspace.",
      default: "",
    },
    searchRoots: {
      type: "string",
      label: "Folders to search for paths mentioned in chat (one per line)",
      description:
        "Each folder and its immediate subfolders can host a revealed path, so an unregistered folder like ~/Documents/Agent-Harness still resolves.",
      default: "~/Documents",
    },
  });

  const getSearchRoots = makeSearchRootsGetter(async () => {
    const values = await settings.get();
    return typeof values.searchRoots === "string" ? values.searchRoots : undefined;
  });

  const getTreeRoot = async (): Promise<string | undefined> => {
    const values = await settings.get();
    const root = typeof values.treeRoot === "string" ? values.treeRoot.trim() : "";
    return root === "" ? undefined : root;
  };

  bb.rpc.register(rpcContract, {
    listRootChoices: async (input) => ({
      choices: await listRootChoices(bb, input, await getTreeRoot()),
    }),
    resolveInRoot: (input) => resolveInRoot(bb, input, getSearchRoots, probe),
    searchFilesInRoot: (input) => searchFilesInRoot(bb, input, getSearchRoots),
    workspaceForThread: async ({ threadId }) =>
      workspaceForThread(bb, threadId, await getTreeRoot()),
    workspaceForProject: async ({ projectId }) =>
      workspaceForProject(bb, projectId, await getTreeRoot()),
    resolveInWorkspace: async (input) => {
      const result = await resolveInWorkspace(bb, input, getSearchRoots, probe);
      bb.log.info(
        `reveal ${JSON.stringify(input.path)} -> ${
          result.ok ? `${result.relativePath} (root ${result.root?.rootName ?? "thread"})` : result.message
        }`,
      );
      return result;
    },
    clientLog: ({ message }) => {
      bb.log.info(`client: ${message}`);
      return { ok: true };
    },
    resolvePaths: async (input) => {
      const result = await resolvePaths(bb, input, getSearchRoots, probe);
      bb.log.info(
        `resolvePaths: ${input.paths.length} candidates -> ${result.known.length} known`,
      );
      return result;
    },
    searchFiles: async (input) => {
      const result = await searchFiles(bb, input, getSearchRoots);
      bb.log.info(
        `searchFiles ${JSON.stringify(input.query)} -> ${result.hits.length} hits`,
      );
      return result;
    },
    resolveFileAnchors: async (input) => {
      const result = await resolveFileAnchors(bb, input, getSearchRoots, probe);
      for (const fix of result.fixes) {
        bb.log.info(`anchor fix ${JSON.stringify(fix.text)}: ${fix.href} -> ${fix.absolutePath}`);
      }
      return result;
    },
    listDir: (input) => listDir(input, ({ hostId, ...request }) =>
      host.call("listDirectory", request, { hostId })),
    revealInFinder: async (input) => {
      if (!await onThisComputer(input.rootId)) return { ok: false, message: "This file is on another computer." };
      return revealInFinder(input);
    },
    copyFileToClipboard: async (input) => {
      if (!await onThisComputer(input.rootId)) return { ok: false, message: "This file is on another computer." };
      return copyFileToClipboard(input);
    },
    createBlankMarkdown: async (input) => {
      const result = await createBlankMarkdown(bb, input);
      if (result.ok) invalidateListings(input.rootId);
      return result;
    },
    deleteFile: async (input) => {
      const result = await deleteFile(bb, input);
      if (result.ok) invalidateListings(input.rootId);
      return result;
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
