export const FOLDER_COLORS: Record<string, string> = {
  red: "#ef4444", orange: "#f97316", yellow: "#eab308",
  green: "#22c55e", teal: "#14b8a6", blue: "#3b82f6",
  purple: "#8b5cf6", pink: "#ec4899",
};

export interface FolderColorRule { folder: string; color: string }

/** One exact folder name or root-relative path per line. Empty means no colors. */
export function parseFolderColors(value: string): FolderColorRule[] {
  return value.split(/\r?\n/u).flatMap((line, index) => {
    if (line.trim() === "") return [];
    const separator = line.lastIndexOf("=");
    const folder = line.slice(0, separator).trim().replace(/\\/gu, "/").replace(/\/+$/u, "");
    const name = line.slice(separator + 1).trim().toLowerCase();
    const color = Object.hasOwn(FOLDER_COLORS, name) ? FOLDER_COLORS[name] : name;
    if (separator < 1 || !folder || !/^(?:#[0-9a-f]{6})$/u.test(color)) {
      throw new Error(`Line ${index + 1}: use Folder = blue (red, orange, yellow, green, teal, blue, purple, pink or #RRGGBB).`);
    }
    return [{ folder: folder.toLowerCase(), color }];
  });
}

/** A specific path wins over a name rule; later rules win ties. */
export function folderColorFor(relativePath: string, rules: readonly FolderColorRule[]): string | undefined {
  const path = relativePath.toLowerCase();
  const name = path.slice(path.lastIndexOf("/") + 1);
  const reversed = [...rules].reverse();
  return (reversed.find((rule) => rule.folder.includes("/") && rule.folder === path)
    ?? reversed.find((rule) => !rule.folder.includes("/") && rule.folder === name))?.color;
}
