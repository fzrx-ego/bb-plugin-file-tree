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
import { mapLimit } from "./pool";
import { resolveUnderRoot, toRelativePath } from "./paths";
import { registerRoot, resolveRoot } from "./roots";
import { workspaceForThread } from "./workspace";

const localHostIds = new WeakMap<BbPluginApi, Promise<string | null>>();

/** The name index reads this server's filesystem; never attribute it to a different host. */
async function localIndexRoots(bb: BbPluginApi, roots: RevealRoot[]): Promise<RevealRoot[]> {
  let known = localHostIds.get(bb);
  if (known === undefined) {
    known = bb.sdk.system.config().then(
      ({ primaryHostId }) => primaryHostId,
      (cause: unknown) => {
        localHostIds.delete(bb);
        throw cause;
      },
    );
    localHostIds.set(bb, known);
  }
  const primaryHostId = await known;
  return roots.filter((root) => root.hostId === primaryHostId);
}

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
  ancestor: boolean;
}

export type PathProbe = (
  hostId: string,
  rootPath: string,
  relativePath: string,
) => Promise<{ isDirectory: boolean } | null>;

/** Share in-flight checks within a request and keep one inaccessible root from hiding other projects. */
function resilientProbe(bb: BbPluginApi, probe: PathProbe): PathProbe {
  const checks = new Map<string, ReturnType<PathProbe>>();
  const warned = new Set<string>();
  return (hostId, rootPath, relativePath) => {
    const key = `${hostId}\n${rootPath}\n${relativePath}`;
    let check = checks.get(key);
    if (check === undefined) {
      check = probe(hostId, rootPath, relativePath).catch((cause: unknown) => {
        const rootKey = `${hostId}\n${rootPath}`;
        if (!warned.has(rootKey)) {
          warned.add(rootKey);
          bb.log.warn(`Cannot check files in ${rootPath} on ${hostId}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
        return null;
      });
      checks.set(key, check);
    }
    return check;
  };
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

/** Search excludes common build folders; an explicit path may still reveal them. */
function isHidden(relativePath: string): boolean {
  return relativePath
    .split("/")
    .some((segment) => SKIP_DIR_NAMES.has(segment));
}

async function statUnderRoot(
  probe: PathProbe,
  hostId: string,
  rootPath: string,
  relativePath: string,
): Promise<Resolved | null> {
  // "" is the root itself, which is a perfectly good reveal target: `~/Documents`
  // names a real folder even though nothing follows it.
  const info = await probe(hostId, rootPath, relativePath);
  return info === null ? null : { relativePath, isDirectory: info.isDirectory, exact: true, ancestor: false };
}

/** The path as written, and with the workspace folder's name stripped. */
function spellings(rootPath: string, relativePath: string): string[] {
  const leading = `${path.basename(rootPath)}/`;
  return relativePath.startsWith(leading)
    ? [relativePath, relativePath.slice(leading.length)]
    : [relativePath];
}

async function nearestAncestor(
  probe: PathProbe,
  hostId: string,
  rootPath: string,
  relativePath: string,
): Promise<Resolved | null> {
  const parts = relativePath.split("/").filter((part) => part.length > 0);
  for (let end = parts.length - 1; end > 0; end -= 1) {
    const prefix = parts.slice(0, end).join("/");
    const found = await statUnderRoot(probe, hostId, rootPath, prefix);
    if (found !== null) return { ...found, exact: false, ancestor: true };
  }
  return null;
}

async function searchByName(
  bb: BbPluginApi,
  workspace: Workspace,
  relativePath: string,
): Promise<Resolved | null> {
  if (relativePath.includes("/")) return null;
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
    ancestor: false,
  };
}

export async function resolveOne(
  bb: BbPluginApi,
  workspace: Workspace,
  raw: string,
  probe: PathProbe,
): Promise<Resolved | null> {
  const relativePath = toWorkspaceRelative(workspace.rootPath, raw);
  if (relativePath === null) return null;

  const root = workspace.rootPath;
  for (const spelling of spellings(root, relativePath)) {
    const exact = await statUnderRoot(probe, workspace.hostId, root, spelling);
    if (exact !== null) return exact;
  }
  for (const spelling of spellings(root, relativePath)) {
    const ancestor = await nearestAncestor(probe, workspace.hostId, root, spelling);
    if (ancestor !== null) return ancestor;
  }
  return searchByName(bb, workspace, relativePath);
}

export async function resolveInWorkspace(
  bb: BbPluginApi,
  input: { threadId: string; path: string },
  getSearchRoots: SearchRootsGetter,
  probe: PathProbe,
): Promise<RevealResult> {
  probe = resilientProbe(bb, probe);
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) {
    return { ok: false, message: `No workspace for this thread (${result.reason})` };
  }
  const workspace = result.workspace;

  const resolved = await resolveOne(bb, workspace, input.path, probe);
  if (resolved !== null && !resolved.ancestor) {
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
    probe,
  );
  if (elsewhere !== null && !elsewhere.ancestor) {
    return {
      ok: true,
      relativePath: elsewhere.relativePath,
      isDirectory: elsewhere.isDirectory,
      root: elsewhere.root,
    };
  }
  if (resolved !== null) {
    return { ok: true, relativePath: resolved.relativePath, isDirectory: resolved.isDirectory, root: null };
  }
  if (elsewhere !== null) {
    return { ok: true, relativePath: elsewhere.relativePath, isDirectory: elsewhere.isDirectory, root: elsewhere.root };
  }
  return { ok: false, message: `Not found in any project: ${input.path}` };
}

/** Resolve a file against the pinned navigator root, independent of the route. */
export async function resolveInRoot(
  bb: BbPluginApi,
  input: { rootId: string; path: string },
  getSearchRoots: SearchRootsGetter,
  probe: PathProbe,
): Promise<RevealResult> {
  probe = resilientProbe(bb, probe);
  const root = resolveRoot(input.rootId);
  if (root === undefined) throw new Error("File tree root expired. Choose the folder again.");
  const workspace: Workspace = {
    environmentId: null,
    hostId: root.hostId,
    rootPath: root.rootPath,
    rootName: path.basename(root.rootPath) || root.rootPath,
    rootId: input.rootId,
  };
  const here = await resolveOne(bb, workspace, input.path, probe);
  if (here !== null && !here.ancestor) {
    return { ok: true, relativePath: here.relativePath, isDirectory: here.isDirectory, root: null };
  }
  // An absolute path names one specific folder; check it before fuzzy name matches.
  if (path.isAbsolute(expandHome(input.path))) {
    const exactElsewhere = await findOutsideWorkspace(bb, root.rootPath, root.hostId, input.path, getSearchRoots, probe);
    if (exactElsewhere !== null && !exactElsewhere.ancestor) {
      return { ok: true, relativePath: exactElsewhere.relativePath, isDirectory: exactElsewhere.isDirectory, root: exactElsewhere.root };
    }
  }
  const roots = [
    { hostId: root.hostId, rootPath: root.rootPath, rootName: workspace.rootName, rootId: input.rootId },
    ...(await candidateRoots(bb, root.rootPath, root.hostId, getSearchRoots)),
  ];
  const named = input.path.includes("/") ? null : await findByName(await localIndexRoots(bb, roots), input.path);
  if (named !== null) {
    const verified = await probe(named.root.hostId, named.root.rootPath, named.relativePath);
    if (verified !== null) {
      return { ok: true, relativePath: named.relativePath, isDirectory: verified.isDirectory, root: named.root };
    }
  }
  const elsewhere = await findOutsideWorkspace(bb, root.rootPath, root.hostId, input.path, getSearchRoots, probe);
  if (elsewhere !== null && !elsewhere.ancestor) {
    return { ok: true, relativePath: elsewhere.relativePath, isDirectory: elsewhere.isDirectory, root: elsewhere.root };
  }
  if (here !== null) {
    return { ok: true, relativePath: here.relativePath, isDirectory: here.isDirectory, root: null };
  }
  if (elsewhere !== null) {
    return { ok: true, relativePath: elsewhere.relativePath, isDirectory: elsewhere.isDirectory, root: elsewhere.root };
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

  const found = await searchByQuery(await localIndexRoots(bb, roots), input.query, input.limit);
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

export async function searchFilesInRoot(
  bb: BbPluginApi,
  input: { rootId: string; query: string; limit: number },
  getSearchRoots: SearchRootsGetter,
): Promise<{ hits: SearchHit[] }> {
  const root = resolveRoot(input.rootId);
  if (root === undefined) throw new Error("File tree root expired. Choose the folder again.");
  const here: RevealRoot = {
    hostId: root.hostId,
    rootPath: root.rootPath,
    rootName: path.basename(root.rootPath) || root.rootPath,
    rootId: input.rootId,
  };
  const roots = [here, ...(await candidateRoots(bb, root.rootPath, root.hostId, getSearchRoots))];
  // The indexed search ranks matching names globally. A pinned explorer should
  // put its own files first when the same name exists in several projects.
  const found = await searchByQuery(await localIndexRoots(bb, roots), input.query, 2000);
  found.sort((a, b) =>
    Number(b.root.rootId === input.rootId) - Number(a.root.rootId === input.rootId),
  );
  return {
    hits: found.filter((hit) => !isHidden(hit.relativePath)).slice(0, input.limit).map((hit) => ({
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
  probe: PathProbe,
): Promise<{ known: string[] }> {
  probe = resilientProbe(bb, probe);
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) return { known: [] };

  // Whatever the icon promises, the click must deliver — so this asks exactly
  // the same question the click will, including the other projects.
  // A message can name dozens of paths; running every lookup at once is a
  // stat storm. A few at a time still answers the whole batch.
  const settled = await mapLimit(input.paths, 4, async (raw) => {
    try {
      const here = await resolveOne(bb, result.workspace, raw, probe);
      if (here !== null && !here.ancestor) return raw;
      const elsewhere = await findOutsideWorkspace(
        bb,
        result.workspace.rootPath,
        result.workspace.hostId,
        raw,
        getSearchRoots,
        probe,
      );
      return elsewhere !== null && !elsewhere.ancestor ? raw : null;
    } catch (cause) {
      bb.log.warn(`Could not verify a chat path: ${cause instanceof Error ? cause.message : String(cause)}`);
      return null;
    }
  });
  return { known: settled.filter((value): value is string => value !== null) };
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
  probe: PathProbe,
): Promise<{ fixes: AnchorFix[] }> {
  probe = resilientProbe(bb, probe);
  const result = await workspaceForThread(bb, input.threadId);
  if (!result.ok) return { fixes: [] };
  const workspace = result.workspace;

  const checks = await mapLimit(input.anchors, 4, async (anchor): Promise<AnchorFix | null> => {
    const existing = await bb.sdk.hosts.pathsExist({
      hostId: workspace.hostId,
      paths: [anchor.href],
    });
    if (existing.existence[anchor.href] === true) return null;

    const here = await resolveOne(bb, workspace, anchor.text, probe);
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
      probe,
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
  const settled = checks;
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
  const cacheKey = `${fallbackHostId}\n${currentRoot}`;
  const cached = rootsCache.get(cacheKey);
  if (cached !== undefined && Date.now() - cached.at < ROOTS_TTL_MS) {
    return cached.roots;
  }
  const roots: RevealRoot[] = [];
  const seen = new Set<string>([`${fallbackHostId}\n${currentRoot}`]);
  const add = (rootPath: string, rootName: string, hostId: string): void => {
    const key = `${hostId}\n${rootPath}`;
    if (rootPath === "" || seen.has(key)) return;
    seen.add(key);
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
      entries = (await bb.sdk.hosts.directory({ hostId: fallbackHostId, path: configured })).entries;
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.kind !== "directory" || entry.name.startsWith(".")) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      add(path.join(configured, entry.name), entry.name, fallbackHostId);
    }
  }
  rootsCache.set(cacheKey, { at: Date.now(), roots });
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
  probe: PathProbe,
): Promise<{ relativePath: string; isDirectory: boolean; root: RevealRoot; ancestor: boolean } | null> {
  const roots = await candidateRoots(bb, currentRoot, fallbackHostId, getSearchRoots);

  // Exact matches everywhere before any nearest-ancestor guess, so a real hit
  // in a later root always beats an approximate one in an earlier root.
  for (const root of roots) {
    const relativePath = toWorkspaceRelative(root.rootPath, raw);
    if (relativePath === null) continue;
    for (const spelling of spellings(root.rootPath, relativePath)) {
      const exact = await statUnderRoot(probe, root.hostId, root.rootPath, spelling);
      if (exact !== null) {
        return {
          relativePath: exact.relativePath,
          isDirectory: exact.isDirectory,
          root,
          ancestor: false,
        };
      }
    }
  }
  const named = raw.includes("/") ? null : await findByName(await localIndexRoots(bb, roots), raw);
  if (named !== null) {
    const verified = await probe(named.root.hostId, named.root.rootPath, named.relativePath);
    if (verified !== null) return { ...named, isDirectory: verified.isDirectory, ancestor: false };
  }

  for (const root of roots) {
    const relativePath = toWorkspaceRelative(root.rootPath, raw);
    if (relativePath === null) continue;
    for (const spelling of spellings(root.rootPath, relativePath)) {
      const ancestor = await nearestAncestor(probe, root.hostId, root.rootPath, spelling);
      if (ancestor !== null) {
        return {
          relativePath: ancestor.relativePath,
          isDirectory: ancestor.isDirectory,
          root,
          ancestor: true,
        };
      }
    }
  }
  return null;
}
