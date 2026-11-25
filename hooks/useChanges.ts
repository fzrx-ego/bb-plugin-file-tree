import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { z } from "zod";
import type { changesContract, Workspace, gitSnapshotSchema, chatChangesSchema } from "../contract";
type Snapshot<T> = { identity: string | null; value: T | null; error: string };

/** Keep same-context success while refreshing; an obsolete lifecycle cannot publish. */
function useChangesSource<T>(identity: string | null, enabled: boolean, read: () => Promise<T>) {
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({identity: null, value: null, error: ""});
  useEffect(() => {
    if (!identity || !enabled) return;
    let alive = true;
    let running = false;
    let generation = 0;
    let visible = document.visibilityState !== "hidden";
    let timer: ReturnType<typeof setInterval> | undefined;
    const refresh = async () => {
      if (!alive || !visible || running) return;
      running = true;
      const requestGeneration = generation;
      const current = () => alive && visible && generation === requestGeneration;
      try {
        const value = await read();
        if (current()) setSnapshot(previous => current() ? {identity, value, error: ""} : previous);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (current()) setSnapshot(previous => {
          if (!current()) return previous;
          const value = previous.identity === identity ? previous.value : null;
          return {identity, value, error: value === null ? message : `${message}. Показан предыдущий успешный снимок.`};
        });
      } finally {
        if (current()) running = false;
      }
    };
    const start = () => {
      void refresh();
      timer = setInterval(() => {void refresh();}, 15000);
    };
    const onVisibility = () => {
      const next = document.visibilityState !== "hidden";
      if (visible === next) return;
      visible = next;
      generation++;
      running = false;
      clearInterval(timer);
      timer = undefined;
      if (visible) start();
    };
    if (visible) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      generation++;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [identity, enabled, read]);
  // Cleanup happens after render: avoid even one frame of another root/thread.
  return snapshot.identity === identity ? snapshot : {identity, value: null, error: ""};
}

export function useChanges(workspace: Workspace, threadId: string | null, enabled: boolean) {
  const rpc = useRpc<typeof changesContract>();
  const rootId = workspace.rootId;
  const readGit = useCallback(() => rpc.call("gitSnapshot", { rootId }), [rpc, rootId]);
  const readChat = useCallback(() => rpc.call("chatChanges", {threadId: threadId!}), [rpc, threadId]);
  const git = useChangesSource<z.infer<typeof gitSnapshotSchema>>(rootId, enabled, readGit);
  const chat = useChangesSource<z.infer<typeof chatChangesSchema>>(threadId, enabled, readChat);
  return {git: git.value, chat: chat.value, gitError: git.error, chatError: chat.error};
}
