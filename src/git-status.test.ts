import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitSnapshot, parseStatus } from "./git-status";

test("parses staged renames and shell-safe literal filenames relative to the chosen folder", () => {
  const data = ["## main", "R  src/new name.ts", "src/old name.ts", "?? src/file\nname.ts", " M elsewhere.ts", ""].join("\0");
  expect(parseStatus(data, "src/")).toEqual({
    branch: "main",
    entries: [
      { relativePath: "new name.ts", index: "R", worktree: " ", originalPath: "old name.ts" },
      { relativePath: "file\nname.ts", index: "?", worktree: "?", originalPath: null },
    ],
  });
});

test("reads the selected subfolder and leaves Git index and sibling status untouched", async () => {
  const root = mkdtempSync(join(tmpdir(), "bb-file-tree-git-"));
  try {
    const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "-q", "-b", "main");
    const subfolder = join(root, "source");
    mkdirSync(subfolder);
    writeFileSync(join(subfolder, "file.ts"), "line one\n");
    writeFileSync(join(root, "outside"), "outside\n");
    git("add", "source/file.ts");
    writeFileSync(join(subfolder, "file.ts"), "line two\n");
    const before = git("status", "--porcelain=v1", "-z");
    const snapshot = await gitSnapshot(subfolder);
    expect(snapshot.entries).toEqual([{ relativePath: "file.ts", index: "A", worktree: "M", originalPath: null }]);
    expect(snapshot.branch).toContain("main");
    expect(snapshot.stashes).toEqual([]);
    expect(git("status", "--porcelain=v1", "-z")).toBe(before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
