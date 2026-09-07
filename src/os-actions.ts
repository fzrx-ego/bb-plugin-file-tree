import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveUnderRoot } from "./paths";

const execFileAsync = promisify(execFile);

export type OsActionResult = { ok: true } | { ok: false; message: string };

export interface WorkspacePathInput {
  rootPath: string;
  relativePath: string;
}

async function resolveExisting(input: WorkspacePathInput): Promise<string> {
  const absolute = resolveUnderRoot(input.rootPath, input.relativePath);
  await access(absolute);
  return absolute;
}

function fail(cause: unknown, fallback: string): OsActionResult {
  const message = cause instanceof Error ? cause.message : fallback;
  return { ok: false, message };
}

/**
 * Reveal the item in the desktop file manager (Finder / Explorer / Files).
 * `open -R` selects the file in its parent folder rather than opening it.
 */
export async function revealInFinder(
  input: WorkspacePathInput,
): Promise<OsActionResult> {
  let absolute: string;
  try {
    absolute = await resolveExisting(input);
  } catch (cause) {
    return fail(cause, "That path is not on disk.");
  }

  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", ["-R", absolute]);
      return { ok: true };
    }
    if (process.platform === "win32") {
      await execFileAsync("explorer", [`/select,${absolute}`]);
      return { ok: true };
    }
    await execFileAsync("xdg-open", [absolute]);
    return { ok: true };
  } catch (cause) {
    return fail(cause, "Could not open in Finder.");
  }
}

const COPY_FILE_APPLESCRIPT = `
on run argv
  set the clipboard to (POSIX file (item 1 of argv))
end run
`;

/**
 * Put the file (or folder) itself on the system clipboard so Finder paste
 * creates a copy, not a path string.
 */
export async function copyFileToClipboard(
  input: WorkspacePathInput,
): Promise<OsActionResult> {
  let absolute: string;
  try {
    absolute = await resolveExisting(input);
  } catch (cause) {
    return fail(cause, "That path is not on disk.");
  }

  try {
    if (process.platform === "darwin") {
      await execFileAsync("osascript", ["-e", COPY_FILE_APPLESCRIPT, absolute]);
      return { ok: true };
    }
    if (process.platform === "win32") {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        "Set-Clipboard",
        "-Path",
        absolute,
      ]);
      return { ok: true };
    }
    return {
      ok: false,
      message: "Copying a file to the clipboard is only supported on macOS and Windows.",
    };
  } catch (cause) {
    return fail(cause, "Could not copy the file.");
  }
}
