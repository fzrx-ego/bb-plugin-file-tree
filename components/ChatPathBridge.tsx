import { useEffect } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { mountChatPathButtons } from "@/lib/chat-path-buttons";
import type { rpcContract } from "../contract";

/**
 * Drives the chat path scanner, which needs RPC and a thread.
 *
 * `threadId` arrives as a prop from the thread header action rather than from
 * the URL or a context hook. Parsing `/threads/<id>` out of `location` was a
 * guess about the desktop app's routing, and when it did not match the
 * scanner never started at all.
 *
 * Remounting per thread also drops the cache of resolved paths — another
 * thread can mean another workspace, where the same string may not exist.
 */
export function ChatPathBridge({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();

  useEffect(() => {
    const controller = new AbortController();
    mountChatPathButtons(
      controller.signal,
      async (paths) => {
        const { known } = await rpc.call("resolvePaths", { threadId, paths });
        return new Set(known);
      },
      async (anchors) => {
        const { fixes } = await rpc.call("resolveFileAnchors", {
          threadId,
          anchors,
        });
        return fixes;
      },
      (fix) => {
        // The file is named from another project as often as from this one, so
        // it is addressed by host and absolute path rather than by workspace.
        navigate.experimental_openFilePreview({
          target: { kind: "host", hostId: fix.hostId, path: fix.absolutePath },
          location: null,
        });
      },
      (message) => {
        void rpc.call("clientLog", { message }).catch(() => undefined);
      },
    );
    return () => controller.abort();
  }, [navigate, rpc, threadId]);

  return null;
}
