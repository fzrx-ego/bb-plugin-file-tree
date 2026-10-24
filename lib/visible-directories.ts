/** Expanded descendants of a collapsed folder have no rows on screen. */
export function visibleDirectories(expanded: ReadonlySet<string>): string[] {
  return [...expanded].filter((entry) => {
    if (entry === "") return true;
    if (!expanded.has("")) return false;
    let slash = entry.indexOf("/");
    while (slash !== -1) {
      if (!expanded.has(entry.slice(0, slash))) return false;
      slash = entry.indexOf("/", slash + 1);
    }
    return true;
  }).sort();
}
