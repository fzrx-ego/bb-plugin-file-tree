import type { useBbNavigate } from "@get-bb/plugin-sdk/app";
import type { Workspace } from "../contract";

type Navigate = ReturnType<typeof useBbNavigate>;

export function openWorkspaceFile(
  navigate: Navigate,
  workspace: Workspace,
  relativePath: string,
): boolean {
  try {
    const opened = navigate.experimental_openFilePreview({
      target: {
        kind: "workspace",
        environmentId: workspace.environmentId,
        path: relativePath,
      },
      location: null,
    });
    if (opened) return true;
    return navigate.experimental_openFilePreview({
      target: {
        kind: "host",
        hostId: workspace.hostId,
        path: `${workspace.rootPath.replace(/\/$/u, "")}/${relativePath}`,
      },
      location: null,
    });
  } catch {
    return false;
  }
}
