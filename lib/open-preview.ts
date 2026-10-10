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
  navigate: Navigate | null,
  workspace: Workspace,
  relativePath: string,
  report: (message: string) => void = () => undefined,
  via: "preview" | "external" = "preview",
): boolean {
  if (navigate === null) {
    report("open unavailable: this BB surface has no file preview navigation");
    return false;
  }
  const root = workspace.rootPath.replace(/\/+$/u, "");
  const absolutePath = relativePath === "" ? root : `${root}/${relativePath}`;
  const environmentId = workspace.environmentId;
  try {
    if (environmentId !== null && environmentId !== "") {
      const workspaceTarget = {
        target: { kind: "workspace" as const, environmentId, path: relativePath },
        location: null,
      };
      const opened =
        via === "external"
          ? navigate.experimental_openFileExternally(workspaceTarget)
          : navigate.experimental_openFilePreview(workspaceTarget);
      report(`open ${via} workspace ${environmentId} ${relativePath} -> ${opened}`);
      if (opened) return true;
    }
    const hostTarget = {
      target: { kind: "host" as const, hostId: workspace.hostId, path: absolutePath },
      location: null,
    };
    const opened =
      via === "external"
        ? navigate.experimental_openFileExternally(hostTarget)
        : navigate.experimental_openFilePreview(hostTarget);
    report(`open ${via} host ${workspace.hostId} ${absolutePath} -> ${opened}`);
    return opened;
  } catch (cause) {
    report(`open threw: ${cause instanceof Error ? cause.message : String(cause)}`);
    return false;
  }
}

/**
 * Toast text for a preview bb refused. The New Thread page has no thread yet,
 * and bb opens a host path in its preview only inside a thread, so a file of a
 * pinned project outside the compose environment cannot open there.
 */
export function previewFailureMessage(
  navigate: Navigate | null,
  threadId: string | null,
): string {
  if (navigate === null) return "Open a thread or New Thread page to preview files.";
  if (threadId === null) {
    return "On the New Thread page bb previews only files of the thread environment. Open a thread to preview this file.";
  }
  return "Could not open the file preview.";
}

const PREVIEW_ONCE_KEY = "md-editor:preview-once";
const PREVIEW_ONCE_EVENT = "md-editor:preview-once";

/** Files Markdown PRO (md-editor) opens in its editor by default. */
export function isMarkdownFile(name: string): boolean {
  return /\.(md|mdx|markdown)$/iu.test(name);
}

/**
 * Open a file in bb's standard preview even when Markdown PRO would take it.
 * Markdown PRO has no per-open opener choice in the SDK, so the request goes
 * through a one-shot flag it reads: a localStorage record for a tab that is
 * about to mount, and a window event for a tab that is already open. The flag
 * lists the relative and absolute spelling of the path because the opener
 * receives whichever one the target used.
 */
export function openStandardPreview(
  navigate: Navigate | null,
  workspace: Workspace,
  relativePath: string,
  report: (message: string) => void = () => undefined,
): boolean {
  const root = workspace.rootPath.replace(/\/+$/u, "");
  const paths = [relativePath, `${root}/${relativePath}`];
  try {
    globalThis.localStorage?.setItem(PREVIEW_ONCE_KEY, JSON.stringify({ paths, ts: Date.now() }));
  } catch {
    // Storage unavailable: the file opens in the default viewer.
  }
  const opened = openWorkspaceFile(navigate, workspace, relativePath, report);
  window.dispatchEvent(new CustomEvent(PREVIEW_ONCE_EVENT, { detail: { paths } }));
  return opened;
}
