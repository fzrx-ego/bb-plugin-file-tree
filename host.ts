import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, hostSignals } from "./host-contract";
import { listHostDirectory, statHostPath } from "./src/host-listing";

import { createDirectoryWatchManager } from "./src/directory-watch";
import { gitSnapshot } from "./src/git-status";
import { createFolderSizes } from "./src/folder-sizes";

let folderSizes: ReturnType<typeof createFolderSizes> | undefined;
let manager: ReturnType<typeof createDirectoryWatchManager> | undefined;
export default experimental_defineHostEntry({
  experimental_signals: hostSignals,
  dispose: () => {
    manager?.dispose();
    manager = undefined;
    folderSizes?.dispose();
    folderSizes = undefined;
  },
  contract: hostContract,
  handlers: {
    folderSizes: ({ rootPath, demandId, paths }, context) => {
      folderSizes ??= createFolderSizes();
      return folderSizes.request(demandId, rootPath, paths, () => context.experimental_retainWorker());
    },
    stopFolderSizes: ({ demandId }) => {
      folderSizes?.stop(demandId);
      return { ok: true as const };
    },
    gitSnapshot: ({ rootPath }) => gitSnapshot(rootPath),
    syncDirectoryWatch: async (input, context) => {
      manager ??= createDirectoryWatchManager(
        (change) => context.experimental_emitSignal("directoriesChanged", change),
        (cause) => console.error("File tree watch:", cause),
      );
      const reset = await manager.update(input, () => context.experimental_retainWorker());
      return { ok: true as const, reset };
    },
    statPath: ({ rootPath, relativePath }) => statHostPath(rootPath, relativePath),
    listDirectory: ({ rootPath, relativePath, showSkipped }) =>
      listHostDirectory(rootPath, relativePath, showSkipped),
  },
});
