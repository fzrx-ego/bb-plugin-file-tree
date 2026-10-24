import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, hostSignals } from "./host-contract";
import { listHostDirectory, statHostPath } from "./src/host-listing";

import { createDirectoryWatchManager } from "./src/directory-watch";

let manager: ReturnType<typeof createDirectoryWatchManager> | undefined;
export default experimental_defineHostEntry({
  experimental_signals: hostSignals,
  dispose: () => { manager?.dispose(); manager = undefined; },
  contract: hostContract,
  handlers: {
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
