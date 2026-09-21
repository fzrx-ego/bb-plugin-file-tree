/**
 * Seti-style file glyphs and colors (VS Code / Cursor default icon theme).
 * Folders have no glyph — only the twistie — matching Cursor's tree.
 */

export const SETI = {
  blue: "#519aba",
  green: "#8dc149",
  orange: "#e37933",
  pink: "#f55385",
  purple: "#a074c4",
  red: "#cc3e44",
  yellow: "#cbcb41",
  ignore: "#41535b",
  white: "#d4d7d6",
  grey: "#6d8086",
} as const;

export type FileGlyph =
  | "default"
  | "markdown"
  | "json"
  | "git"
  | "config"
  | "info"
  | "react"
  | "html"
  | "css"
  | "image"
  | "shell"
  | "text"
  | "npm"
  | "lock"
  | "code";

export type FileTypeIcon = {
  glyph: FileGlyph;
  color: string;
};

type Named = { glyph: FileGlyph; color: string };

const BY_NAME: Record<string, Named> = {
  "readme.md": { glyph: "info", color: SETI.blue },
  readme: { glyph: "info", color: SETI.blue },
  license: { glyph: "text", color: SETI.yellow },
  "license.md": { glyph: "text", color: SETI.yellow },
  "package.json": { glyph: "npm", color: SETI.red },
  "package-lock.json": { glyph: "npm", color: SETI.red },
  "pnpm-lock.yaml": { glyph: "npm", color: SETI.orange },
  "yarn.lock": { glyph: "npm", color: SETI.blue },
  "bun.lock": { glyph: "npm", color: SETI.white },
  "bun.lockb": { glyph: "npm", color: SETI.white },
  "tsconfig.json": { glyph: "json", color: SETI.blue },
  "jsconfig.json": { glyph: "json", color: SETI.yellow },
  "components.json": { glyph: "json", color: SETI.yellow },
  ".gitignore": { glyph: "git", color: SETI.ignore },
  ".gitattributes": { glyph: "git", color: SETI.ignore },
  ".gitmodules": { glyph: "git", color: SETI.ignore },
  ".gitkeep": { glyph: "git", color: SETI.ignore },
  ".cursorignore": { glyph: "git", color: SETI.ignore },
  ".dockerignore": { glyph: "git", color: SETI.ignore },
  ".npmignore": { glyph: "npm", color: SETI.ignore },
  ".env": { glyph: "config", color: SETI.grey },
  ".env.example": { glyph: "config", color: SETI.grey },
  ".env.local": { glyph: "config", color: SETI.grey },
  ".env.development": { glyph: "config", color: SETI.grey },
  ".env.production": { glyph: "config", color: SETI.grey },
  dockerfile: { glyph: "code", color: SETI.blue },
  "docker-compose.yml": { glyph: "code", color: SETI.blue },
  "docker-compose.yaml": { glyph: "code", color: SETI.blue },
  makefile: { glyph: "config", color: SETI.grey },
  gemfile: { glyph: "code", color: SETI.red },
  procfile: { glyph: "config", color: SETI.purple },
  "cargo.toml": { glyph: "config", color: SETI.orange },
  "go.mod": { glyph: "code", color: SETI.blue },
  "go.sum": { glyph: "code", color: SETI.blue },
};

const BY_EXT: Record<string, Named> = {
  md: { glyph: "markdown", color: SETI.blue },
  mdx: { glyph: "markdown", color: SETI.blue },
  markdown: { glyph: "markdown", color: SETI.blue },
  json: { glyph: "json", color: SETI.yellow },
  jsonc: { glyph: "json", color: SETI.yellow },
  json5: { glyph: "json", color: SETI.yellow },
  webmanifest: { glyph: "json", color: SETI.yellow },
  ts: { glyph: "code", color: SETI.blue },
  mts: { glyph: "code", color: SETI.blue },
  cts: { glyph: "code", color: SETI.blue },
  tsx: { glyph: "react", color: SETI.blue },
  js: { glyph: "code", color: SETI.yellow },
  mjs: { glyph: "code", color: SETI.yellow },
  cjs: { glyph: "code", color: SETI.yellow },
  jsx: { glyph: "react", color: SETI.yellow },
  vue: { glyph: "code", color: SETI.green },
  svelte: { glyph: "code", color: SETI.orange },
  css: { glyph: "css", color: SETI.blue },
  scss: { glyph: "css", color: SETI.pink },
  sass: { glyph: "css", color: SETI.pink },
  less: { glyph: "css", color: SETI.blue },
  html: { glyph: "html", color: SETI.orange },
  htm: { glyph: "html", color: SETI.orange },
  py: { glyph: "code", color: SETI.blue },
  pyi: { glyph: "code", color: SETI.blue },
  go: { glyph: "code", color: SETI.blue },
  rs: { glyph: "code", color: SETI.orange },
  java: { glyph: "code", color: SETI.red },
  kt: { glyph: "code", color: SETI.orange },
  kts: { glyph: "code", color: SETI.orange },
  c: { glyph: "code", color: SETI.blue },
  h: { glyph: "code", color: SETI.purple },
  cc: { glyph: "code", color: SETI.blue },
  cpp: { glyph: "code", color: SETI.blue },
  hpp: { glyph: "code", color: SETI.purple },
  cs: { glyph: "code", color: SETI.blue },
  swift: { glyph: "code", color: SETI.orange },
  rb: { glyph: "code", color: SETI.red },
  php: { glyph: "code", color: SETI.purple },
  lua: { glyph: "code", color: SETI.blue },
  r: { glyph: "code", color: SETI.blue },
  dart: { glyph: "code", color: SETI.blue },
  scala: { glyph: "code", color: SETI.red },
  sh: { glyph: "shell", color: SETI.green },
  bash: { glyph: "shell", color: SETI.green },
  zsh: { glyph: "shell", color: SETI.green },
  fish: { glyph: "shell", color: SETI.green },
  ps1: { glyph: "shell", color: SETI.blue },
  bat: { glyph: "shell", color: SETI.blue },
  cmd: { glyph: "shell", color: SETI.blue },
  yml: { glyph: "text", color: SETI.purple },
  yaml: { glyph: "text", color: SETI.purple },
  toml: { glyph: "config", color: SETI.grey },
  ini: { glyph: "config", color: SETI.grey },
  cfg: { glyph: "config", color: SETI.grey },
  conf: { glyph: "config", color: SETI.grey },
  properties: { glyph: "config", color: SETI.grey },
  editorconfig: { glyph: "config", color: SETI.grey },
  xml: { glyph: "html", color: SETI.orange },
  svg: { glyph: "image", color: SETI.purple },
  png: { glyph: "image", color: SETI.purple },
  jpg: { glyph: "image", color: SETI.purple },
  jpeg: { glyph: "image", color: SETI.purple },
  gif: { glyph: "image", color: SETI.purple },
  webp: { glyph: "image", color: SETI.purple },
  ico: { glyph: "image", color: SETI.purple },
  bmp: { glyph: "image", color: SETI.purple },
  txt: { glyph: "text", color: SETI.grey },
  log: { glyph: "text", color: SETI.grey },
  csv: { glyph: "text", color: SETI.green },
  tsv: { glyph: "text", color: SETI.green },
  sql: { glyph: "code", color: SETI.pink },
  graphql: { glyph: "code", color: SETI.pink },
  gql: { glyph: "code", color: SETI.pink },
  proto: { glyph: "code", color: SETI.blue },
  prisma: { glyph: "code", color: SETI.blue },
  tf: { glyph: "code", color: SETI.purple },
  lock: { glyph: "lock", color: SETI.grey },
  zip: { glyph: "default", color: SETI.grey },
  gz: { glyph: "default", color: SETI.grey },
  tgz: { glyph: "default", color: SETI.grey },
  tar: { glyph: "default", color: SETI.grey },
  pdf: { glyph: "text", color: SETI.red },
  wasm: { glyph: "code", color: SETI.purple },
  wgsl: { glyph: "code", color: SETI.blue },
};

function fileName(pathOrName: string): string {
  const cut = Math.max(pathOrName.lastIndexOf("/"), pathOrName.lastIndexOf("\\"));
  return cut === -1 ? pathOrName : pathOrName.slice(cut + 1);
}

function extensionOf(name: string): string | null {
  if (name.startsWith(".") && !name.slice(1).includes(".")) return null;
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1);
}

/** Icon for a file name or relative path. Directories are not handled here. */
export function fileTypeIcon(pathOrName: string): FileTypeIcon {
  const name = fileName(pathOrName);
  const lower = name.toLowerCase();
  const named = BY_NAME[lower];
  if (named !== undefined) return named;
  if (lower.startsWith(".env")) return { glyph: "config", color: SETI.grey };
  if (lower.startsWith(".git")) return { glyph: "git", color: SETI.ignore };
  const ext = extensionOf(lower);
  if (ext !== null) {
    const byExt = BY_EXT[ext];
    if (byExt !== undefined) return byExt;
  }
  if (lower.endsWith(".d.ts")) return { glyph: "code", color: SETI.blue };
  return { glyph: "default", color: SETI.grey };
}
