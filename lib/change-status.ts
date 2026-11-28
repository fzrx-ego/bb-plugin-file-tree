export const gitLabels: Record<string,string> = {" ":"Без изменений", M:"Изменён", A:"Добавлен", D:"Удалён", R:"Переименован", C:"Скопирован", T:"Изменён тип", U:"Конфликт", "?":"Не отслеживается", "!":"Игнорируется"};
export const conflicts: Record<string,string> = {DD:"Удалён с обеих сторон", AU:"Добавлен нами", UD:"Удалён другой стороной", UA:"Добавлен другой стороной", DU:"Удалён нами", AA:"Добавлен с обеих сторон", UU:"Изменён с обеих сторон"};
export function gitDescription(index: string, worktree: string) {
  return conflicts[index+worktree] ?? (index+worktree === "??" ? "Новый, не в Git" : index+worktree === "!!" ? "Игнорируется Git" : `Staged: ${gitLabels[index] ?? index}; рабочая папка: ${gitLabels[worktree] ?? worktree}`);
}
export function relativeChatPath(rootPath:string, raw:string):string|null {
  const root = rootPath.replace(/\/+$/, "");
  if (!raw.startsWith("/")) return raw.startsWith("../") || raw.split("/").includes("..") ? null : raw.replace(/^\.\//, "");
  return raw.startsWith(root + "/") ? raw.slice(root.length + 1) : null;
}

export function normalizeAbsolute(raw:string):string|null {
  if(!raw.startsWith("/"))return null;
  const parts:string[]=[];
  for(const part of raw.split("/")) {
    if(!part || part===".")continue;
    if(part==="..") {if(!parts.length)return null;parts.pop();} else parts.push(part);
  }
  return "/"+parts.join("/");
}
export function absoluteChatPath(workspace:{rootPath:string}|null, change:{path:string;movePath?:string|null}) {
  const raw=change.movePath ?? change.path;
  if(raw.startsWith("/"))return normalizeAbsolute(raw);
  if(!workspace)return null;
  const root=normalizeAbsolute(workspace.rootPath);
  const resolved=normalizeAbsolute(`${root}/${raw}`);
  return root && resolved && (resolved===root || resolved.startsWith(root === "/" ? root : root + "/")) ? resolved : null;
}
export function latestByPath<T extends {path:string;sourceSeqEnd:number}>(changes:T[]):T[] {
  const latest=new Map<string,T>();
  for(const change of changes) {
    const previous=latest.get(change.path);
    if(!previous || change.sourceSeqEnd>previous.sourceSeqEnd)latest.set(change.path,change);
  }
  return [...latest.values()];
}
export function findGitEntry(entries:{relativePath:string;index:string;worktree:string;originalPath:string|null}[], relativePath:string) {
  return entries.find(e=>e.relativePath===relativePath || e.relativePath.replace(/\/$/, "")===relativePath)
    ?? entries.find(e=>e.index==="!" && e.relativePath.endsWith("/") && relativePath.startsWith(e.relativePath));
}
