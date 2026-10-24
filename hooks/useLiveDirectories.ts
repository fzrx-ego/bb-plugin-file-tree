import { useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { directoryChangeSchema, type rpcContract } from "../contract";

/** Lease renewal does no listing. Hidden windows hold no watches after cleanup. */
export function useLiveDirectories(
  rootId: string,
  paths: string[],
  enabled: boolean,
  onChange: (relativePaths: string[]) => void,
) {
  const rpc = useRpc<typeof rpcContract>();
  const connection = useRealtimeConnectionState();
  const [visible, setVisible] = useState(() => document.visibilityState !== "hidden");
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const currentWatch = useRef<{ id: string; sync: () => void } | null>(null);
  const pathsKey = JSON.stringify(paths);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useRealtime("directoriesChanged", (payload) => {
    const change = directoryChangeSchema.safeParse(payload);
    if (!change.success || change.data.watchId !== currentWatch.current?.id || change.data.rootId !== rootId) return;
    // Re-arm any directory whose inode was replaced, then refresh affected rows.
    currentWatch.current.sync();
    onChangeRef.current(change.data.relativePaths);
  });

  useEffect(() => {
    if (!enabled || !visible || !rootId || connection !== "connected") return;
    const relativePaths: string[] = JSON.parse(pathsKey);
    if (relativePaths.length === 0) return;
    const watchId = crypto.randomUUID();
    let stopped = false;
    let pending = false;
    let again = false;
    let reportedError = false;
    let refreshRequested = false;
    const sync = async (refresh = false) => {
      if (stopped) return;
      refreshRequested ||= refresh;
      if (pending) { again = true; return; }
      pending = true;
      try {
        const result = await rpcRef.current.call("syncDirectoryWatch", { watchId, rootId, relativePaths });
        reportedError = false;
        if (!stopped && (refreshRequested || result.reset)) {
          refreshRequested = false;
          onChangeRef.current(relativePaths);
        }
      } catch (cause) {
        if (!stopped && !reportedError) {
          reportedError = true;
          toast.error(`File tree auto-refresh: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      } finally {
        pending = false;
        if (stopped) {
          // An in-flight start can finish after React cleanup; stop it afterwards.
          void rpcRef.current.call("syncDirectoryWatch", { watchId, rootId, relativePaths: [] }).catch(console.error);
        } else if (again) {
          again = false;
          void sync();
        }
      }
    };
    currentWatch.current = { id: watchId, sync: () => { void sync(); } };
    void sync(true); // Catch changes between the first listing and watch installation.
    const renewal = setInterval(() => { void sync(); }, 30_000);
    const focus = () => { void sync(true); };
    window.addEventListener("focus", focus);
    return () => {
      stopped = true;
      if (currentWatch.current?.id === watchId) currentWatch.current = null;
      clearInterval(renewal);
      window.removeEventListener("focus", focus);
      if (!pending) void rpcRef.current.call("syncDirectoryWatch", { watchId, rootId, relativePaths: [] }).catch(console.error);
    };
  }, [connection, enabled, pathsKey, rootId, visible]);
}
