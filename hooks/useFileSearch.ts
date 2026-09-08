import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useBbNavigate, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { openWorkspaceFile } from "@/lib/open-preview";
import { subscribeSearchFocus } from "@/lib/search-focus-bus";
import type { rpcContract, SearchHit } from "../contract";
import type { useWorkspaceTree } from "@/hooks/useWorkspaceTree";

/** One letter matches half the disk; two is where a list starts to mean something. */
const MIN_QUERY_LENGTH = 2;
/** Long enough to skip the middle of a pasted path, short enough to feel typed. */
const DEBOUNCE_MS = 140;
const LIMIT = 20;

type TreeModel = ReturnType<typeof useWorkspaceTree>;

/**
 * Type a file name or paste a path, land on the file.
 *
 * Picking a result does not open the file by a path of its own: it hands the
 * absolute path back to the tree's reveal, the same one a path clicked in
 * chat goes through. So a hit in another project re-roots the tree exactly as
 * it already does, and there is one answer to "where did this open from".
 */
export function useFileSearch(threadId: string | null, tree: TreeModel) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Answers can arrive out of order; only the newest query owns the list. */
  const requestId = useRef(0);

  const trimmed = query.trim();
  const isActive = trimmed !== "";

  useEffect(() => {
    if (threadId === null || trimmed.length < MIN_QUERY_LENGTH) {
      setHits([]);
      setIsSearching(false);
      return;
    }
    const id = (requestId.current += 1);
    setIsSearching(true);
    const timer = setTimeout(() => {
      void rpc
        .call("searchFiles", { threadId, query: trimmed, limit: LIMIT })
        .then((result) => {
          if (requestId.current !== id) return;
          setHits(result.hits);
          setActiveIndex(0);
          setIsSearching(false);
        })
        .catch(() => {
          if (requestId.current !== id) return;
          setHits([]);
          setIsSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rpc, threadId, trimmed]);

  const clear = useCallback(() => {
    requestId.current += 1;
    setQuery("");
    setHits([]);
    setActiveIndex(0);
    setIsSearching(false);
  }, []);

  const focus = useCallback(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    // The palette opens the panel; the input it means is the one that mounts.
    return subscribeSearchFocus(() => {
      // A frame later, so the focus lands after the panel's own layout pass.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    });
  }, []);

  /** Show it in the tree, then open it in the preview — both, as one action. */
  const go = useCallback(
    async (rawPath: string) => {
      const landed = await tree.reveal(rawPath, { quiet: true });
      if (landed === null) return;
      clear();
      if (landed.isDirectory) return;
      const opened = openWorkspaceFile(
        navigate,
        landed.workspace,
        landed.relativePath,
      );
      if (!opened) toast.error("Could not open the default preview for this file.");
    },
    [clear, navigate, tree],
  );

  const select = useCallback(
    (hit: SearchHit) => {
      void go(hit.absolutePath);
    },
    [go],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (trimmed === "") inputRef.current?.blur();
        else clear();
        return;
      }
      if (event.key === "ArrowDown" && hits.length > 0) {
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % hits.length);
        return;
      }
      if (event.key === "ArrowUp" && hits.length > 0) {
        event.preventDefault();
        setActiveIndex((prev) => (prev - 1 + hits.length) % hits.length);
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const hit = hits[activeIndex];
      // Nothing in the list is not nothing to do: a pasted path that the
      // index does not carry — a folder, or a file under an ignored one —
      // still resolves through the widening search reveal already runs.
      if (hit !== undefined) select(hit);
      else if (trimmed !== "") void go(trimmed);
    },
    [activeIndex, clear, go, hits, select, trimmed],
  );

  return {
    query,
    setQuery,
    hits,
    isSearching,
    isActive,
    activeIndex,
    setActiveIndex,
    inputRef,
    clear,
    focus,
    select,
    onKeyDown,
    /** Nothing found, and nothing still in flight. */
    isEmpty:
      isActive &&
      !isSearching &&
      hits.length === 0 &&
      trimmed.length >= MIN_QUERY_LENGTH,
  };
}
