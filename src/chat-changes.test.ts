import { expect, test } from "bun:test";
import { collectChanges } from "./chat-changes";
import { absoluteChatPath, latestByPath } from "../lib/change-status";

test("reads only completed typed file changes in the selected chat and retains the latest event", () => {
  const fileChange = (threadId: string, status: string, sourceSeqEnd: number) => ({
    kind: "work", workKind: "file-change", status, threadId, sourceSeqEnd,
    id: `event-${sourceSeqEnd}`, change: { path: "example.ts", movePath: null, kind: "modified" },
  });
  const rows = [
    { kind: "turn", children: [fileChange("thr_example", "completed", 1), fileChange("thr_other", "completed", 4)] },
    fileChange("thr_example", "pending", 5),
    fileChange("thr_example", "completed", 3),
    { kind: "work", workKind: "tool", toolArgs: fileChange("thr_example", "completed", 8) },
  ] as unknown as Parameters<typeof collectChanges>[0];
  const changes: Parameters<typeof collectChanges>[2] = [];
  collectChanges(rows, "thr_example", changes);
  expect(changes.map(change => change.sourceSeqEnd)).toEqual([1, 3]);
  expect(latestByPath(changes).map(change => change.eventId)).toEqual(["event-3"]);
});

test("uses the actual workspace for relative paths and rejects relative escapes", () => {
  expect(absoluteChatPath({ rootPath: "/project" }, { path: "file", movePath: "src/new" })).toBe("/project/src/new");
  expect(absoluteChatPath({ rootPath: "/project" }, { path: "../outside" })).toBeNull();
  expect(absoluteChatPath({ rootPath: "/" }, { path: "file" })).toBe("/file");
});
