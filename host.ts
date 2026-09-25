import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract } from "./host-contract";
import { listHostDirectory, statHostPath } from "./src/host-listing";

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    statPath: ({ rootPath, relativePath }) => statHostPath(rootPath, relativePath),
    listDirectory: ({ rootPath, relativePath, showSkipped }) =>
      listHostDirectory(rootPath, relativePath, showSkipped),
  },
});
