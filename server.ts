import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { rpcContract } from "./contract";
import { listDir } from "./src/listing";
import { copyFileToClipboard, revealInFinder } from "./src/os-actions";
import {
  makeSearchRootsGetter,
  resolveInWorkspace,
  resolvePaths,
} from "./src/reveal";
import { workspaceForThread } from "./src/workspace";

export { rpcContract } from "./contract";

export default async function plugin(bb: BbPluginApi): Promise<void> {
  bb.log.info("loaded");

  const settings = bb.settings.define({
    openByDefault: {
      type: "boolean",
      label: "Show the file tree on the right when a thread opens",
      default: true,
    },
    showSkipped: {
      type: "boolean",
      label: "Show ignored folders (node_modules, .git, dist, …)",
      default: false,
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

  bb.rpc.register(rpcContract, {
    workspaceForThread: ({ threadId }) => workspaceForThread(bb, threadId),
    resolveInWorkspace: async (input) => {
      const result = await resolveInWorkspace(bb, input, getSearchRoots);
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
      const result = await resolvePaths(bb, input, getSearchRoots);
      bb.log.info(
        `resolvePaths: ${input.paths.length} candidates -> ${result.known.length} known`,
      );
      return result;
    },
    listDir: (input) => listDir(bb, input),
    revealInFinder: (input) => revealInFinder(input),
    copyFileToClipboard: (input) => copyFileToClipboard(input),
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
