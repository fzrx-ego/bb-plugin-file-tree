import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { z } from "zod";
import type { gitEntrySchema, gitSnapshotSchema } from "../contract";
import { cachedRead } from "./cached-read";

type GitSnapshot = z.infer<typeof gitSnapshotSchema>;
type GitEntry = z.infer<typeof gitEntrySchema>;
const exec = promisify(execFile);

async function readGit(rootPath: string, args: string[], operation: string): Promise<string> {
  try {
    const result = await exec("git", ["-c", "core.fsmonitor=false", "-C", rootPath, ...args], {
      encoding: "utf8",
      timeout: 8000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" },
    });
    return result.stdout;
  } catch (cause) {
    const error = cause as NodeJS.ErrnoException & { killed?: boolean; stderr?: string };
    if (error.stderr?.includes("not a git repository")) throw new Error("Эта папка находится вне репозитория Git.");
    const detail = error.killed ? "истекло время ожидания" : error.code ?? "неизвестная ошибка";
    throw new Error(`git ${operation}: ${detail}`);
  }
}

export function parseStatus(raw: string, prefix: string): Pick<GitSnapshot, "branch" | "entries"> {
  const rows = raw.split("\0");
  const header = rows.shift();
  if (!header?.startsWith("## ")) throw new Error("Git вернул снимок без заголовка ветки.");
  const entries: GitEntry[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === "") continue;
    if (!/^[ MADRCUT?!]{2} /.test(row) || row.length < 4) {
      throw new Error("Не удалось разобрать снимок Git.");
    }
    const [index, worktree] = row.slice(0, 2);
    const name = row.slice(3);
    const renamed = /[RC]/.test(index + worktree);
    const original = renamed ? rows[++i] : null;
    if (renamed && !original) throw new Error("В снимке Git потерян исходный путь.");
    if (!name.startsWith(prefix)) continue;
    entries.push({
      relativePath: name.slice(prefix.length),
      index,
      worktree,
      originalPath: original?.startsWith(prefix) ? original.slice(prefix.length) : null,
    });
  }
  return { branch: header.slice(3), entries };
}

const cache = cachedRead<GitSnapshot>(15000);
export function gitSnapshot(rootPath: string): Promise<GitSnapshot> {
  return cache(rootPath, async () => {
    // Porcelain reports repo-relative paths even when Git runs in a subfolder.
    const [prefix, raw] = await Promise.all([
      readGit(rootPath, ["rev-parse", "--show-prefix"], "rev-parse"),
      readGit(rootPath, ["status", "--porcelain=v1", "-z", "--branch", "--untracked-files=all", "--", "."], "status"),
    ]);
    const status = parseStatus(raw, prefix.replace(/\r?\n$/, ""));
    const checkedAt = Date.now();
    const result = await readGit(rootPath, ["stash", "list", "--format=%gd %s"], "stash list").then(
      (output) => ({ stashes: output.trimEnd().split("\n").filter(Boolean), stashError: null }),
      (error: unknown) => ({ stashes: [], stashError: error instanceof Error ? error.message : String(error) }),
    );
    return { ...status, ...result, checkedAt };
  });
}
