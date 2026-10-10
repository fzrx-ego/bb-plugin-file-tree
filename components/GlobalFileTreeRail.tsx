import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBbContext, useRpc, useSettings } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { FileTreePanel } from "@/components/FileTreePanel";
import { RailResizeHandle } from "@/components/RailResizeHandle";
import { acquireRailInset, syncRailInset } from "@/lib/rail-inset";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { RAIL_EVENT, initializeRailOpen, writeStoredOpen } from "@/lib/rail-state";
import { useRailWidthPx } from "@/lib/rail-width";
import { cn } from "@/lib/utils";
import { useWindowFrame } from "@/lib/window-frame";
import type { RootChoice, rpcContract } from "../contract";

const ROOT_STORAGE_KEY = "bb-plugin-file-tree:pinned-root";

function readPinnedRoot(): string | null {
  try {
    const value = localStorage.getItem(ROOT_STORAGE_KEY);
    return value !== null && /^(?:thread|source|personal):[\w-]{1,128}$/u.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function writePinnedRoot(id: string): void {
  try {
    localStorage.setItem(ROOT_STORAGE_KEY, id);
  } catch {
    // The choice still lasts for this window when storage is unavailable.
  }
}

/** Mounted once per BB window. Navigation never owns or unmounts the tree. */
export function GlobalFileTreeRail() {
  const rpc = useRpc<typeof rpcContract>();
  const { threadId, projectId } = useBbContext();
  const { values, isLoading: settingsLoading } = useSettings();
  const compact = useIsCompactViewport();
  const railWidthPx = useRailWidthPx();
  const frame = useWindowFrame();
  const portalScopeProps = usePortalScopeProps();
  const insetHolderId = useRef(`file-tree:window:${Math.random().toString(36).slice(2)}`).current;
  const initialized = useRef(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(readPinnedRoot);
  const [choices, setChoices] = useState<RootChoice[]>([]);
  const [loadingRoots, setLoadingRoots] = useState(true);
  const [rootError, setRootError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (settingsLoading || initialized.current) return;
    initialized.current = true;
    if (compact) writeStoredOpen(false);
    setOpen(compact ? false : initializeRailOpen(values?.openByDefault !== false));
    setReady(true);
  }, [compact, settingsLoading, values?.openByDefault]);

  useEffect(() => {
    const onRailEvent = (event: Event) => {
      const next = (event as CustomEvent<boolean>).detail;
      if (typeof next === "boolean") setOpen(next);
    };
    window.addEventListener(RAIL_EVENT, onRailEvent);
    return () => window.removeEventListener(RAIL_EVENT, onRailEvent);
  }, []);

  const pinnedThreadId = selectedId?.startsWith("thread:") ? selectedId.slice(7) : null;
  useEffect(() => {
    let cancelled = false;
    setLoadingRoots(true);
    void rpc.call("listRootChoices", { currentThreadId: threadId, pinnedThreadId })
      .then(({ choices: next }) => {
        if (cancelled) return;
        setChoices(next);
        setRootError(null);
        if (selectedId === null) {
          const preferred = next.find((choice) => choice.id === `personal:${projectId}`)
            ?? next.find((choice) => choice.id === `thread:${threadId}`)
            ?? next.find((choice) => choice.projectId !== null && choice.projectId === projectId)
            ?? next[0];
          if (preferred !== undefined) {
            setSelectedId(preferred.id);
            writePinnedRoot(preferred.id);
          }
        }
      })
      .catch((cause) => {
        if (!cancelled) setRootError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoadingRoots(false);
      });
    return () => { cancelled = true; };
  }, [rpc, threadId, projectId, pinnedThreadId, selectedId, refreshCount, values?.treeRoot]);

  const chosen = choices.find((choice) => choice.id === selectedId);
  const railOpen = ready && open;
  useLayoutEffect(() => {
    if (!railOpen || compact) {
      syncRailInset();
      return;
    }
    return acquireRailInset(insetHolderId);
  }, [compact, insetHolderId, railOpen]);

  if (!ready) return null;
  // In BB's framed window the rail is a card on the window backdrop, like the
  // content card beside it, and leaves the chrome row to BB's own controls.
  const framed = frame !== null && !compact;
  return createPortal(
    <aside
      {...portalScopeProps}
      className="fixed bottom-0 right-0 top-0 z-40 flex-col text-sidebar-foreground"
      style={{
        display: railOpen ? "flex" : "none",
        width: compact ? "100vw" : framed ? `calc(${railWidthPx}px + ${frame.lip})` : `${railWidthPx}px`,
        ...(framed
          ? {
            paddingTop: frame.top,
            paddingRight: frame.lip,
            paddingBottom: frame.lip,
            backgroundColor: "var(--sidebar)",
            backgroundImage: "linear-gradient(var(--surface-recessed), var(--surface-recessed))",
          }
          : {}),
      }}
      aria-label="File tree"
    >
      {compact ? null : <RailResizeHandle />}
      <div
        className={cn(
          "relative flex min-h-0 flex-1 flex-col bg-sidebar",
          framed ? "overflow-clip rounded-xl border" : "border-l border-sidebar-border",
        )}
        style={framed ? { borderColor: "var(--border-seam)" } : undefined}
      >
        <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-sidebar-border pl-1.5 pr-1.5">
          <div className="relative flex min-w-0 flex-1">
            <select
              aria-label="File tree folder"
              title="Pinned folder — changing threads does not change this tree"
              value={selectedId ?? ""}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedId(id);
                writePinnedRoot(id);
              }}
              className="h-7 min-w-0 max-w-full cursor-default appearance-none truncate rounded-md bg-transparent pl-2 pr-6 text-sm font-medium text-sidebar-foreground outline-none [field-sizing:content] hover:bg-state-hover focus-visible:ring-1 focus-visible:ring-ring"
            >
              {selectedId === null || chosen === undefined ? <option value={selectedId ?? ""}>Choose a folder</option> : null}
              {choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
            <Icon name="ChevronDown" className="pointer-events-none absolute right-1.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 p-0 text-muted-foreground"
            aria-label="Refresh folder list"
            onClick={() => setRefreshCount((count) => count + 1)}>
            <Icon name="RotateCcw" className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0 p-0 text-muted-foreground"
            aria-label="Hide file tree" onClick={() => writeStoredOpen(false)}>
            <Icon name="X" className="size-3.5" />
          </Button>
        </div>
        {rootError !== null ? <p className="px-2 py-2 text-[11px] text-destructive">{rootError}</p> : null}
        {loadingRoots && choices.length === 0 ? <p className="px-2 py-2 text-[11px] text-muted-foreground">Loading folders…</p> : null}
        <FileTreePanel root={chosen?.workspace ?? null} />
      </div>
    </aside>,
    document.body,
  );
}
