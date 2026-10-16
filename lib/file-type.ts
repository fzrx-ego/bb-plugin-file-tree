/**
 * File icons from VS Code's Seti theme, resolved the way VS Code resolves
 * them: theme file names, then theme extensions (longest first), then the
 * file name and extensions of the file's language. A few files VS Code leaves
 * on the default icon keep the Seti glyph this plugin gave them before.
 * Folders have no glyph — only the twistie — matching Cursor's tree.
 */
import {
  SETI_DEFAULT_ICON,
  SETI_FILE_EXTENSIONS,
  SETI_FILE_NAMES,
  SETI_ICONS,
  SETI_LANGUAGE_FILE_EXTENSIONS,
  SETI_LANGUAGE_FILE_NAMES,
} from "./seti-icons.generated";

export type FileTypeIcon = {
  /** Seti theme icon id, such as `_julia`. */
  id: string;
  /** Character to draw in the Seti font. */
  glyph: string;
  color: string;
  lightColor: string;
};

const PLUGIN_FILE_NAMES: Record<string, string> = {
  "bun.lockb": "_npm",
  ".cursorignore": "_git",
  "go.mod": "_go",
  "go.sum": "_go",
};

const PLUGIN_FILE_EXTENSIONS: Record<string, string> = {
  bmp: "_image",
  ini: "_config",
  json5: "_json",
  lock: "_lock",
  mdx: "_markdown",
  tsv: "_csv",
};

function fileName(pathOrName: string): string {
  const cut = Math.max(pathOrName.lastIndexOf("/"), pathOrName.lastIndexOf("\\"));
  return cut === -1 ? pathOrName : pathOrName.slice(cut + 1);
}

/** `a.test.ts` → `test.ts`, `ts`; `.gitignore` → `gitignore`. */
function extensionsOf(name: string): string[] {
  const extensions: string[] = [];
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) {
    if (dot < name.length - 1) extensions.push(name.slice(dot + 1));
  }
  return extensions;
}

function iconId(name: string): string {
  const extensions = extensionsOf(name);
  const byExtension = (table: Record<string, string>) =>
    extensions.map((ext) => table[ext]).find((id) => id !== undefined);
  return SETI_FILE_NAMES[name]
    ?? PLUGIN_FILE_NAMES[name]
    ?? byExtension(SETI_FILE_EXTENSIONS)
    ?? SETI_LANGUAGE_FILE_NAMES[name]
    ?? byExtension(SETI_LANGUAGE_FILE_EXTENSIONS)
    ?? byExtension(PLUGIN_FILE_EXTENSIONS)
    ?? (name.startsWith(".env") ? "_config" : undefined)
    ?? (name.startsWith(".git") ? "_git" : undefined)
    ?? SETI_DEFAULT_ICON;
}

/** Icon for a file name or relative path. Directories are not handled here. */
export function fileTypeIcon(pathOrName: string): FileTypeIcon {
  const id = iconId(fileName(pathOrName).toLowerCase());
  const [glyph, color, lightColor] = SETI_ICONS[id] ?? SETI_ICONS[SETI_DEFAULT_ICON]!;
  return { id, glyph, color, lightColor };
}
