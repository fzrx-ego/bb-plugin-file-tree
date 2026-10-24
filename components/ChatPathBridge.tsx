import { useEffect, useRef } from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { mountChatPathButtons } from "@/lib/chat-path-buttons";
import { registerSurfaceNavigation } from "@/lib/surface-navigation";
import type { rpcContract } from "../contract";

/**
 * Drives the chat path scanner, which needs RPC and a thread.
 *
 * `threadId` arrives as a prop from the thread header action rather than from
 * the URL or a context hook. Parsing `/threads/<id>` out of `location` was a
 * guess about the desktop app's routing, and when it did not match the
 * scanner never started at all.
 *
 * The scanner lives for this thread's mount. SDK handle identity changes must
 * not remove a DOM button between pointerdown and click.
 */
export function ChatPathBridge({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();

  const runtime = useRef({ rpc, navigate });
  runtime.current = { rpc, navigate };

  useEffect(() => registerSurfaceNavigation(threadId, navigate), [navigate, threadId]);

  useEffect(() => {
    const controller = new AbortController();
    mountChatPathButtons(
      controller.signal,
      threadId,
      async (paths) => {
        const { known } = await runtime.current.rpc.call("resolvePaths", { threadId, paths });
        return new Set(known);
      },
      async (anchors) => {
        const { fixes } = await runtime.current.rpc.call("resolveFileAnchors", {
          threadId,
          anchors,
        });
        return fixes;
      },
      (fix) => {
        // The file is named from another project as often as from this one, so
        // it is addressed by host and absolute path rather than by workspace.
        runtime.current.navigate.experimental_openFilePreview({
          target: { kind: "host", hostId: fix.hostId, path: fix.absolutePath },
          location: null,
        });
      },
      (message) => {
        void runtime.current.rpc.call("clientLog", { message }).catch(() => undefined);
      },
    );
    return () => {
      controller.abort();
    };
  }, [threadId]);

  return null;
}
