const MAX_UNTITLED = 10_000;

/** First free `untitled.md` / `untitled-2.md` / … in a folder listing. */
export function nextUntitledMarkdownName(existingNames: Iterable<string>): string {
  const taken = new Set(
    [...existingNames].map((name) => name.toLowerCase()),
  );
  if (!taken.has("untitled.md")) return "untitled.md";
  for (let n = 2; n < MAX_UNTITLED; n++) {
    const name = `untitled-${n}.md`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  throw new Error("Could not pick a free untitled.md name in this folder.");
}
