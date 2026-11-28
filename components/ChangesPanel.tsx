import { useState } from "react";
import type { Workspace } from "../contract";
import { useChanges } from "@/hooks/useChanges";
import type { useWorkspaceTree } from "@/hooks/useWorkspaceTree";
import { absoluteChatPath, findGitEntry, gitDescription, relativeChatPath } from "@/lib/change-status";

type Props = {
  tree: ReturnType<typeof useWorkspaceTree>;
  workspace: Workspace;
  threadId: string | null;
  enabled: boolean;
};
const pageSize = 100;

export function ChangesPanel({ tree, workspace, threadId, enabled }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"chat" | "git">("chat");
  const [limit, setLimit] = useState(pageSize);
  const { git, chat, gitError, chatError } = useChanges(workspace, threadId, open && enabled);
  const showChat = tab === "chat" && threadId !== null;
  const count = showChat ? chat?.changes.length ?? 0 : git?.entries.length ?? 0;

  return <section className="border-b px-1.5 py-1 text-xs">
    <button type="button" className="w-full rounded px-1 py-1 text-left hover:bg-state-hover"
      onClick={() => setOpen(!open)} aria-expanded={open}>
      {open ? "▾" : "▸"} Изменения чата · Git
    </button>
    {open && <div className="max-h-80 overflow-auto">
      <div className="flex flex-wrap gap-2 px-1 py-1">
        {threadId && <button type="button" aria-pressed={showChat} className={showChat ? "font-semibold underline" : ""}
          onClick={() => { setTab("chat"); setLimit(pageSize); }}>Этот чат</button>}
        <button type="button" aria-pressed={!showChat} className={!showChat ? "font-semibold underline" : ""}
          onClick={() => { setTab("git"); setLimit(pageSize); }}>Git этой папки</button>
      </div>
      {(showChat ? chatError : gitError) && <p role="status" className="break-words px-1 text-destructive">{showChat ? chatError : gitError}</p>}
      {showChat ? chat ? <>
        <p className="px-1 text-muted-foreground">
          Из событий BB. Правки через shell могут отсутствовать.
          {chat.hasOlderRows ? " В истории есть более ранние события." : ""}
        </p>
        {chat.changes.length === 0 && <p className="px-1 pt-1">В доступных событиях BB правок нет.</p>}
        {chat.changes.slice(0, limit).map(change => {
          const absolute = absoluteChatPath(chat.workspace, change);
          const relative = absolute && chat.workspace?.hostId === workspace.hostId
            ? relativeChatPath(workspace.rootPath, absolute) : null;
          const entry = relative === null ? undefined : findGitEntry(git?.entries ?? [], relative);
          return <button type="button" key={change.eventId} disabled={!absolute}
            className="my-1 block w-full break-all rounded border-l-2 border-blue-400 px-1 py-0.5 text-left hover:bg-state-hover disabled:opacity-60"
            onClick={() => { if (absolute && threadId) void tree.reveal(absolute, { threadId }); }}>
            <span className="block">{change.path}{change.movePath ? ` → ${change.movePath}` : ""}</span>
            <span className="block text-[10px] text-muted-foreground">
              {gitDescriptionForChange(change.kind)}{entry ? ` · ${gitDescription(entry.index, entry.worktree)}` : ""}
            </span>
          </button>;
        })}
      </> : !chatError && <p className="px-1">Загрузка событий чата…</p> : git ? <>
        <p className="break-all px-1 text-muted-foreground" title={new Date(git.checkedAt).toLocaleString()}>
          {git.branch} · {workspace.rootName}
        </p>
        {git.entries.length === 0 && <p className="px-1 pt-1">В снимке Git папка чистая.</p>}
        {git.entries.slice(0, limit).map(entry => <button type="button" key={entry.relativePath}
          className="my-1 block w-full break-all rounded px-1 py-0.5 text-left hover:bg-state-hover"
          onClick={() => void tree.reveal(`${workspace.rootPath.replace(/\/$/, "")}/${entry.relativePath}`)}>
          <span className="block">{entry.originalPath ? `${entry.originalPath} → ` : ""}{entry.relativePath}</span>
          <span className="block text-[10px] text-muted-foreground">{gitDescription(entry.index, entry.worktree)}</span>
        </button>)}
        <p className="px-1 pt-1 font-medium">Stash репозитория</p>
        {git.stashError ? <p className="px-1 text-destructive">{git.stashError}</p> : git.stashes.length
          ? <ul className="break-all px-1">{git.stashes.map(stash => <li key={stash}>{stash}</li>)}</ul>
          : <p className="px-1 text-muted-foreground">Пусто</p>}
      </> : !gitError && <p className="px-1">Загрузка Git-статуса…</p>}
      {count > limit && <button type="button" className="px-1 py-1 underline" onClick={() => setLimit(limit + pageSize)}>
        Показать ещё ({count - limit})
      </button>}
    </div>}
  </section>;
}

function gitDescriptionForChange(kind: string): string {
  const labels: Record<string, string> = {
    added: "Добавлен", deleted: "Удалён", modified: "Изменён", moved: "Перемещён",
    create: "Добавлен", delete: "Удалён", modify: "Изменён", move: "Перемещён",
  };
  return labels[kind] ?? kind;
}
