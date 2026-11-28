import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { z } from "zod";
import type { chatChangesSchema } from "../contract";
import { latestByPath } from "../lib/change-status";
import { cachedRead } from "./cached-read";
import { workspaceForThread } from "./workspace";

type Snapshot = z.infer<typeof chatChangesSchema>;
type Row = Awaited<ReturnType<BbPluginApi["sdk"]["threads"]["timeline"]>>["rows"][number];

export function collectChanges(rows: Row[], threadId: string, changes: Snapshot["changes"]): void {
  for (const row of rows) {
    if (row.kind === "turn" && row.children) {
      collectChanges(row.children, threadId, changes);
    } else if (row.kind === "work" && row.workKind === "file-change" &&
      row.threadId === threadId && row.status === "completed") {
      changes.push({
        path: row.change.path,
        movePath: row.change.movePath ?? null,
        kind: row.change.kind ?? "modified",
        sourceSeqEnd: row.sourceSeqEnd,
        eventId: row.id,
      });
    }
  }
}

export function createChatChangesReader(bb: BbPluginApi, getTreeRoot: () => Promise<string | undefined>) {
  const cache = cachedRead<Snapshot>(10000);
  return async (threadId: string): Promise<Snapshot> => cache(threadId, async () => {
    const options = { threadId, includeNestedRows: "true", summaryOnly: "false", segmentLimit: "100" } as const;
    const [workspace, latest] = await Promise.all([
      getTreeRoot().then((treeRoot) => workspaceForThread(bb, threadId, treeRoot)),
      bb.sdk.threads.timeline(options),
    ]);
    const changes: Snapshot["changes"] = [];
    let page = latest;
    let pages = 1;
    collectChanges(page.rows, threadId, changes);
    while (page.timelinePage.olderCursor && pages < 10) {
      const { anchorId, anchorSeq } = page.timelinePage.olderCursor;
      page = await bb.sdk.threads.timeline({ ...options, beforeAnchorId: anchorId, beforeAnchorSeq: String(anchorSeq) });
      collectChanges(page.rows, threadId, changes);
      pages += 1;
    }
    return {
      workspace: workspace.ok ? workspace.workspace : null,
      changes: latestByPath(changes).sort((a, b) => b.sourceSeqEnd - a.sourceSeqEnd),
      hasOlderRows: Boolean(page.timelinePage.olderCursor || page.timelinePage.hasOlderRows),
    };
  });
}
