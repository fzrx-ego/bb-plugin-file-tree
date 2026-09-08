import type { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { Workspace } from "../contract";

type Navigate = ReturnType<typeof useBbNavigate>;

/**
 * Open a file in bb's shared preview panel.
 *
 * A reveal can re-root the tree onto another project, and that root is not the
 * thread's environment — its `environmentId` is null. A workspace target built
 * from such a root resolves the relative path against the thread's own
 * checkout, where the file does not exist, and bb opens a tab reading "Failed
 * to load file" rather than refusing, so there is nothing left to fall back
 * from. Only a root that really is this thread's environment may use the
 * workspace target; every other root goes to the host by absolute path.
 */
export function openWorkspaceFile(
  navigate: Navigate,
  workspace: Workspace,
  relativePath: string,
  report: (message: string) => void = () => undefined,
): boolean {
  const root = workspace.rootPath.replace(/\/+$/u, "");
  const absolutePath = relativePath === "" ? root : `${root}/${relativePath}`;
  const environmentId = workspace.environmentId;
  try {
    if (environmentId !== null && environmentId !== "") {
      const opened = navigate.experimental_openFilePreview({
        target: { kind: "workspace", environmentId, path: relativePath },
        location: null,
      });
      report(`open workspace ${environmentId} ${relativePath} -> ${opened}`);
      if (opened) return true;
    }
    const opened = navigate.experimental_openFilePreview({
      target: { kind: "host", hostId: workspace.hostId, path: absolutePath },
      location: null,
    });
    report(`open host ${workspace.hostId} ${absolutePath} -> ${opened}`);
    return opened;
  } catch (cause) {
    report(`open threw: ${cause instanceof Error ? cause.message : String(cause)}`);
    return false;
  }
}
