import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { SKIP_DIR_NAMES } from "../contract";
import type {
  AnchorFix,
  RevealResult,
  RevealRoot,
  SearchHit,
  Workspace,
} from "../contract";
import { findByName, searchByQuery } from "./name-index";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { registerRoot } from "./roots";
import { workspaceForThread } from "./workspace";

/**
 * One rule decides everything: a string resolves if it names something
 * reachable inside this thread's workspace, and it resolves to the closest
 * thing the tree can actually show.
 *
 * The order below is a widening search, not a list of special cases:
 *   1. the path itself,
 *   2. the same path with the workspace folder's own name stripped off the
 *      front — agents write `Agent-Harness/skills` for a tree rooted at
 *      `Agent-Harness`,
 *   3. its nearest existing ancestor, so a glob (`rules/*.mdc`) or a file that
 *      does not exist yet still lands in the right folder,
 *   4. a fuzzy search by file name, which is the only way a bare
 *      `AGENTS-base.md` can be placed at all.
 *
 * The one thing that genuinely cannot resolve is a path outside the workspace
 * root, because the tree is rooted there and has nothing to show.
 */
export interface Resolved {
  relativePath: string;
  isDirectory: boolean;
  /** False when the search had to fall back to an ancestor or a name match. */
  exact: boolean;
}

/** A file name worth searching for; bare prose words are not. */
function hasFileExtension(text: string): boolean {
  return /\.[\p{L}\p{N}]{1,12}$/u.test(text);
}

function expandHome(text: string): string {
  if (text === "~") return homedir();
  if (text.startsWith("~/")) return path.join(homedir(), text.slice(2));
  return text;
}

/**
 * The raw string as a path relative to the workspace root, or null when it
 * points outside it.
 */
function toWorkspaceRelative(rootPath: string, raw: string): string | null {
  const trimmed = expandHome(raw.trim()).replace(/\/+$/u, "");
  if (trimmed === "") return null;
  if (!path.isAbsolute(trimmed)) return trimmed.split(path.sep).join("/");
  try {
    return toRelativePath(rootPath, trimmed);
  } catch {
    return null;
  }
}

/**
 * The tree hides `.git`, `node_modules` and friends, so a path inside one is
 * something it will never draw. Offering a reveal there promises a jump that
 * cannot happen.
 */
function isHidden(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some((segment) => SKIP_DIR_NAMES.has(segment));
}

async function statUnderRoot(
  rootPath: string,
  relativePath: string,
): Promise<Resolved | null> {
  // "" is the root itself, which is a perfectly good reveal target: `~/Documents`
  // names a real folder even though nothing follows it.
  if (isHidden(relativePath)) return null;
  try {
    const info = await stat(resolveUnderRoot(rootPath, relativePath));
    return { relativePath, isDirectory: info.isDirectory(), exact: true };
  } catch {
    return null;
  }
}

/** The path as written, and with the workspace folder's name stripped. */
function spellings(rootPath: string, relativePath: string): string[] {
  const leading = `${path.basename(rootPath)}/`;
  return relativePath.startsWith(leading)
    ? [relativePath, relativePath.slice(leading.length)]
    : [relativePath];
}

async function nearestAncestor(
  rootPath: string,
  relativePath: string,
): Promise<Resolved | null> {
  const parts = relativePath.split("/").filter((part) => part.length > 0);
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const prefix = parts.slice(0, end).join("/");
    const found = await statUnderRoot(rootPath, prefix);
    if (found !== null) return { ...found, exact: false };
  }
  return null;
}

async function searchByName(
  bb: BbPluginApi,
  workspace: Workspace,
  relativePath: string,
): Promise<Resolved | null> {
  const name = path.basename(relativePath);
  if (name === "" || !hasFileExtension(name)) return null;
  if (workspace.environmentId === null) return null;
  let response;
  try {
    response = await bb.sdk.environments.paths({
      environmentId: workspace.environmentId,
      query: name,
      includeFiles: "true",
      includeDirectories: "true",
      limit: "10",
    });
  } catch {
    return null;
  }
  // Only an exact name match is safe to act on; a fuzzy near-miss would send
  // the tree somewhere the message never mentioned.
  const hit = response.paths.find(
    (entry) =>
      entry.name === name && !isHidden(entry.path.split(path.sep).join("/")),
  );
  if (hit === undefined) return null;
  return {
    relativePath: hit.path.split(path.sep).join("/"),
    isDirectory: hit.kind === "directory",
    exact: false,
  };
}

export async function resolveOne(
  bb: BbPluginApi,
  workspace: Workspace,
  raw: string,
): Promise<Resolved | null> {
  const relativePath = toWorkspaceRelative(workspace.rootPath, raw);
  if (relativePath === null) return null;

  const root = workspace.rootPath;
  for (const spelling of spellings(root, relativePath)) {
    const exact = await statUnderRoot(root, spelling);
    if (exact !== null) return exact;
  }
  for (const spelling of spellings(root, relativePath)) {
    const ancestor = await nearestAncestor(root, spelling);
    if (ancestor !== null) return ancestor;
  }
  return searchByName(bb, workspace, relativePath);
}

export async function resolveInWorkspace(
  bb: BbPluginApi,
  input: { threadId: string; path: string },
  getSearchRoots: SearchRootsGetter,
): Promise<RevealResult> {
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) {
    return { ok: false, message: `No workspace for this thread (${result.reason})` };
  }
  const workspace = result.workspace;

  const resolved = await resolveOne(bb, workspace, input.path);
  if (resolved !== null) {
    return {
      ok: true,
      relativePath: resolved.relativePath,
      isDirectory: resolved.isDirectory,
      root: null,
    };
  }

  // Agents cite paths from anywhere, and most of them are outside whichever
  // workspace the thread happens to run in. Re-root the tree instead of
  // refusing to show a path the user can see is real.
  const elsewhere = await findOutsideWorkspace(
    bb,
    workspace.rootPath,
    workspace.hostId,
    input.path,
    getSearchRoots,
  );
  if (elsewhere !== null) {
    return {
      ok: true,
      relativePath: elsewhere.relativePath,
      isDirectory: elsewhere.isDirectory,
      root: elsewhere.root,
    };
  }
  return { ok: false, message: `Not found in any project: ${input.path}` };
}

/**
 * Find a file by what the user typed into the tree's search box.
 *
 * The tree's own root is searched alongside the configured roots — a thread
 * checkout is the first place a typed name is likely to live, and
 * `candidateRoots` deliberately leaves it out because its job is finding
 * what is *not* here.
 *
 * A hit is handed back as an absolute path, so selecting one goes through
 * exactly the same reveal a path clicked in chat does, re-rooting included.
 */
export async function searchFiles(
  bb: BbPluginApi,
  input: { threadId: string; query: string; limit: number },
  getSearchRoots: SearchRootsGetter,
): Promise<{ hits: SearchHit[] }> {
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) return { hits: [] };
  const workspace = result.workspace;

  const here: RevealRoot = {
    hostId: workspace.hostId,
    rootPath: workspace.rootPath,
    rootName: workspace.rootName,
    rootId: workspace.rootId,
  };
  const roots = [
    here,
    ...(await candidateRoots(
      bb,
      workspace.rootPath,
      workspace.hostId,
      getSearchRoots,
    )),
  ];

  const found = await searchByQuery(roots, input.query, input.limit);
  return {
    hits: found
      .filter((hit) => !isHidden(hit.relativePath))
      .map((hit) => ({
        name: hit.name,
        relativePath: hit.relativePath,
        absolutePath: hit.absolutePath,
        rootName: hit.root.rootName,
      })),
  };
}

/** The subset of `paths` that resolves to something in the workspace. */
export async function resolvePaths(
  bb: BbPluginApi,
  input: { threadId: string; paths: readonly string[] },
  getSearchRoots: SearchRootsGetter,
): Promise<{ known: string[] }> {
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) return { known: [] };

  // Whatever the icon promises, the click must deliver — so this asks exactly
  // the same question the click will, including the other projects.
  const checks = input.paths.map(async (raw) => {
    const here = await resolveOne(bb, result.workspace, raw);
    if (here !== null) return raw;
    const elsewhere = await findOutsideWorkspace(
      bb,
      result.workspace.rootPath,
      result.workspace.hostId,
      raw,
      getSearchRoots,
    );
    return elsewhere === null ? null : raw;
  });
  const settled = await Promise.all(checks);
  return { known: settled.filter((value): value is string => value !== null) };
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function absoluteUnder(rootPath: string, relativePath: string): string | null {
  try {
    return resolveUnderRoot(rootPath, relativePath);
  } catch {
    return null;
  }
}

/**
 * Repair chat links that bb aimed at nothing.
 *
 * bb turns a path written in a message into a link relative to the thread's
 * workspace root, without asking whether anything is there. A thread running
 * in an empty personal workspace therefore links `AGENTS-base.md` to
 * `<workspace>/AGENTS-base.md`, and clicking it opens a preview of a file that
 * has never existed.
 *
 * A link whose target is really on disk is left alone — bb is right about it,
 * and taking the click over would only risk breaking a working one. Only the
 * dead ones are answered, with the file the same text names, found by the same
 * search a reveal uses.
 */
export async function resolveFileAnchors(
  bb: BbPluginApi,
  input: {
    threadId: string;
    anchors: readonly { text: string; href: string }[];
  },
  getSearchRoots: SearchRootsGetter,
): Promise<{ fixes: AnchorFix[] }> {
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) return { fixes: [] };
  const workspace = result.workspace;

  const checks = input.anchors.map(async (anchor): Promise<AnchorFix | null> => {
    if (await pathExists(anchor.href)) return null;

    const here = await resolveOne(bb, workspace, anchor.text);
    if (here !== null) {
      const absolutePath = absoluteUnder(workspace.rootPath, here.relativePath);
      if (absolutePath === null || absolutePath === anchor.href) return null;
      return {
        text: anchor.text,
        href: anchor.href,
        absolutePath,
        hostId: workspace.hostId,
        isDirectory: here.isDirectory,
      };
    }

    const elsewhere = await findOutsideWorkspace(
      bb,
      workspace.rootPath,
      workspace.hostId,
      anchor.text,
      getSearchRoots,
    );
    if (elsewhere === null) return null;
    const absolutePath = absoluteUnder(
      elsewhere.root.rootPath,
      elsewhere.relativePath,
    );
    if (absolutePath === null) return null;
    return {
      text: anchor.text,
      href: anchor.href,
      absolutePath,
      hostId: elsewhere.root.hostId,
      isDirectory: elsewhere.isDirectory,
    };
  });
  const settled = await Promise.all(checks);
  return {
    fixes: settled.filter((fix): fix is AnchorFix => fix !== null),
  };
}

/**
 * Where to look when the path is not in the thread's own workspace.
 *
 * Registered projects are not enough: plenty of the folders an agent talks
 * about are never registered with bb at all (`Agent-Harness` is one), and a
 * search limited to the project list silently misses every one of them. So
 * each configured search root also contributes its immediate subdirectories
 * as candidate roots — `~/Documents` yields `~/Documents/Agent-Harness`,
 * which is the root `packs/gws` is actually relative to.
 */
/**
 * Building the root list means a project query and a readdir, and a batch
 * asks about dozens of candidates at once — so hold it briefly rather than
 * rebuilding it per path.
 */
const ROOTS_TTL_MS = 30_000;
const rootsCache = new Map<string, { at: number; roots: RevealRoot[] }>();

async function candidateRoots(
  bb: BbPluginApi,
  currentRoot: string,
  fallbackHostId: string,
  getSearchRoots: SearchRootsGetter,
): Promise<RevealRoot[]> {
  const cached = rootsCache.get(currentRoot);
  if (cached !== undefined && Date.now() - cached.at < ROOTS_TTL_MS) {
    return cached.roots;
  }
  const roots: RevealRoot[] = [];
  const seen = new Set<string>([currentRoot]);
  const add = (rootPath: string, rootName: string, hostId: string): void => {
    if (rootPath === "" || seen.has(rootPath)) return;
    seen.add(rootPath);
    roots.push({ hostId, rootPath, rootName, rootId: registerRoot(hostId, rootPath) });
  };

  try {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    for (const project of projects) {
      for (const source of project.sources) {
        add(source.path, project.name, source.hostId);
      }
    }
  } catch {
    /* project list is a bonus, not a requirement */
  }

  for (const configured of await getSearchRoots()) {
    add(configured, path.basename(configured), fallbackHostId);
    let entries;
    try {
      entries = await readdir(configured, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      add(path.join(configured, entry.name), entry.name, fallbackHostId);
    }
  }
  rootsCache.set(currentRoot, { at: Date.now(), roots });
  return roots;
}

/** Supplied by the server, which owns the settings handle. */
export type SearchRootsGetter = () => Promise<string[]>;

function normaliseRoots(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => expandHome(line.trim()))
    .filter((line) => line !== "");
}

export function makeSearchRootsGetter(
  read: () => Promise<string | undefined>,
): SearchRootsGetter {
  return async () => {
    try {
      const configured = await read();
      if (typeof configured === "string" && configured.trim() !== "") {
        return normaliseRoots(configured);
      }
    } catch {
      /* fall back to the default */
    }
    return normaliseRoots("~/Documents");
  };
}

/**
 * The same widening search across every candidate root, plus one step the
 * thread's own workspace gets for free from `bb.sdk.environments.paths`: a
 * lookup by file name. Agents name `ru-text-hygiene.mdc` without a folder far
 * more often than they spell the path out, and no amount of re-rooting can
 * place a bare name by position alone.
 *
 * The name step sits between the exact matches and the ancestor guesses,
 * because an existing file with that exact name is a better answer than the
 * nearest folder some prefix happens to share. It only ever matches a full
 * file name (and, for `rules/ru-text-hygiene.mdc`, a whole trailing run of
 * segments), never a fuzzy near-miss.
 */
async function findOutsideWorkspace(
  bb: BbPluginApi,
  currentRoot: string,
  fallbackHostId: string,
  raw: string,
  getSearchRoots: SearchRootsGetter,
): Promise<{ relativePath: string; isDirectory: boolean; root: RevealRoot } | null> {
  const roots = await candidateRoots(bb, currentRoot, fallbackHostId, getSearchRoots);

  // Exact matches everywhere before any nearest-ancestor guess, so a real hit
  // in a later root always beats an approximate one in an earlier root.
  for (const root of roots) {
    const relativePath = toWorkspaceRelative(root.rootPath, raw);
    if (relativePath === null) continue;
    for (const spelling of spellings(root.rootPath, relativePath)) {
      const exact = await statUnderRoot(root.rootPath, spelling);
      if (exact !== null) {
        return {
          relativePath: exact.relativePath,
          isDirectory: exact.isDirectory,
          root,
        };
      }
    }
  }
  const named = await findByName(roots, raw);
  if (named !== null) return named;

  for (const root of roots) {
    const relativePath = toWorkspaceRelative(root.rootPath, raw);
    if (relativePath === null) continue;
    for (const spelling of spellings(root.rootPath, relativePath)) {
      const ancestor = await nearestAncestor(root.rootPath, spelling);
      if (ancestor !== null) {
        return {
          relativePath: ancestor.relativePath,
          isDirectory: ancestor.isDirectory,
          root,
        };
      }
    }
  }
  return null;
}
