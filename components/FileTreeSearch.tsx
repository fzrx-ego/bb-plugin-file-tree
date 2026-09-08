import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { SearchHit } from "../contract";
import type { useFileSearch } from "@/hooks/useFileSearch";

type SearchModel = ReturnType<typeof useFileSearch>;

/** `a/b/c.md` → `a/b`, which is the part the file name does not already say. */
function folderOf(relativePath: string): string {
  const cut = relativePath.lastIndexOf("/");
  return cut === -1 ? "" : relativePath.slice(0, cut);
}

export function FileTreeSearchBox({ search }: { search: SearchModel }) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-sidebar-border px-1.5 py-1">
      <Icon name="Search" className="size-3 shrink-0 text-muted-foreground" />
      <input
        ref={search.inputRef}
        type="text"
        value={search.query}
        onChange={(event) => search.setQuery(event.target.value)}
        onKeyDown={search.onKeyDown}
        placeholder="Find a file or paste a path"
        aria-label="Find a file"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent py-0.5 text-[11px] leading-5 text-sidebar-foreground outline-none placeholder:text-muted-foreground"
      />
      {search.isActive ? (
        <button
          type="button"
          onClick={search.clear}
          aria-label="Clear search"
          className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-muted-foreground hover:bg-state-hover"
        >
          <Icon name="X" className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}

function ResultRow({
  hit,
  isActive,
  onSelect,
  onHover,
}: {
  hit: SearchHit;
  isActive: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);

  // Arrow keys move the selection past the fold, so the keyboard has to drag
  // the list with it.
  useEffect(() => {
    if (!isActive) return;
    rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  const folder = folderOf(hit.relativePath);
  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      title={`${hit.rootName}/${hit.relativePath}`}
      className={cn(
        "flex w-full min-w-0 items-start gap-1 rounded-[3px] px-1.5 py-0.5 text-left",
        "hover:bg-state-hover",
        isActive && "bg-state-active",
      )}
    >
      <Icon name="File" className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] leading-4">{hit.name}</span>
        <span className="block truncate text-[10px] leading-4 text-muted-foreground">
          {folder === "" ? hit.rootName : `${hit.rootName}/${folder}`}
        </span>
      </span>
    </button>
  );
}

export function FileTreeSearchResults({ search }: { search: SearchModel }) {
  if (search.isEmpty) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">
        Nothing matched. Press Enter to try the path as written.
      </p>
    );
  }
  if (search.hits.length === 0) {
    return (
      <p className="px-2 py-3 text-[11px] text-muted-foreground">Searching…</p>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      {search.hits.map((hit, index) => (
        <ResultRow
          key={hit.absolutePath}
          hit={hit}
          isActive={index === search.activeIndex}
          onSelect={() => search.select(hit)}
          onHover={() => search.setActiveIndex(index)}
        />
      ))}
    </div>
  );
}
