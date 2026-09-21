/**
 * Finding a file that is named in chat but not written as a path.
 *
 * Agents write `ru-text-hygiene.mdc` far more often than
 * `Agent-Harness/rules/ru-text-hygiene.mdc`, and a bare name resolves against
 * nothing: it is not under the thread root, and it is not the child of any
 * search root either, so the widening search in `reveal.ts` runs out of
 * spellings. Inside the thread's own environment `bb.sdk.environments.paths`
 * covers this, but that API is scoped to one environment, and most cited files
 * live in another project entirely.
 *
 * So the search roots get a file index of their own: one bounded walk, held
 * briefly, keyed by file name. It answers the only question a bare name can
 * ask — "where is a file called this?" — and it answers it the same way for
 * the icon and for the click.
 *
 * The walk is the expensive part (a Documents tree is tens of thousands of
 * directories). It runs with a small concurrency cap, and a later lookup
 * reuses a directory whose mtime has not changed instead of reading it again.
 * Adding or renaming a file still shows up, because that updates the parent
 * directory's mtime.
 */
import { readdir, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { SKIP_DIR_NAMES } from "../contract";
import type { RevealRoot } from "../contract";
import { mapLimit } from "./pool";

/**
 * A chat burst and a header re-render reuse one index. A file created in
 * Finder shows up in a name search within ten minutes. An exact path still
 * stats immediately and does not wait on this timer.
 */
const INDEX_TTL_MS = 10 * 60 * 1000;
/** Deep enough for `Documents/<project>/<area>/<...>`, not for a whole disk. */
const MAX_DEPTH = 10;
/** A ceiling, not a target: ~50k entries is a normal Documents folder. */
const MAX_FILES = 200_000;
/** A name shared by dozens of files is prose or a build artefact, not a hit. */
const MAX_PER_NAME = 32;
/** Parallel readdirs of a whole frontier stall the disk; a handful do not. */
const WALK_CONCURRENCY = 8;

interface IndexedFile {
  /** Absolute, so a hit can be re-attributed to the most specific root. */
  absolutePath: string;
  /** Lower-cased `/`-separated path, no leading slash. */
  lowerPath: string;
  /** Segment count, so ranking can prefer the shallower path. */
  depth: number;
}

/** What a directory contained last time we read it. Names, not absolute paths. */
interface DirSnap {
  mtimeMs: number;
  fileNames: string[];
  childNames: string[];
}

interface FileIndex {
  at: number;
  byName: Map<string, IndexedFile[]>;
  snaps: Map<string, DirSnap>;
}

export interface NameHit {
  relativePath: string;
  isDirectory: boolean;
  root: RevealRoot;
}

let cached: { key: string; index: FileIndex } | null = null;
/** One walk per burst: parallel candidates share the build, not repeat it. */
let building: { key: string; promise: Promise<FileIndex> } | null = null;

/**
 * `~/Documents` and `~/Documents/Agent-Harness` are both candidate roots, and
 * walking both would index every file twice. Keep the outermost ones only; a
 * hit is attributed back to the deepest root that contains it.
 */
function outermost(roots: readonly RevealRoot[]): RevealRoot[] {
  const sorted = [...roots].sort(
    (a, b) => a.rootPath.length - b.rootPath.length,
  );
  const kept: RevealRoot[] = [];
  for (const root of sorted) {
    const inside = kept.some((other) => isInside(other.rootPath, root.rootPath));
    if (!inside) kept.push(root);
  }
  return kept;
}

function isInside(parent: string, child: string): boolean {
  const base = path.resolve(parent);
  const target = path.resolve(child);
  if (base === target) return true;
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  return target.startsWith(prefix);
}

function describe(absolutePath: string): Pick<IndexedFile, "lowerPath" | "depth"> {
  const segments = absolutePath
    .split(path.sep)
    .filter((segment) => segment !== "");
  return { lowerPath: segments.join("/").toLowerCase(), depth: segments.length };
}

function addFile(byName: Map<string, IndexedFile[]>, absolutePath: string): void {
  const name = path.basename(absolutePath).toLowerCase();
  const existing = byName.get(name);
  const file: IndexedFile = { absolutePath, ...describe(absolutePath) };
  if (existing === undefined) {
    byName.set(name, [file]);
    return;
  }
  if (existing.length >= MAX_PER_NAME) return;
  existing.push(file);
}

interface WalkNode {
  dir: string;
  depth: number;
}

type DirRead =
  | { node: WalkNode; kind: "missing" }
  | { node: WalkNode; kind: "reuse"; snap: DirSnap }
  | { node: WalkNode; kind: "fresh"; mtimeMs: number; entries: Dirent[] };

async function readDir(node: WalkNode, prev: DirSnap | undefined): Promise<DirRead> {
  // Stat first and store that mtime with the names we then read. A file that
  // appears during the read makes the directory newer than the stored mtime,
  // so the next refresh reads it again. Statting afterwards can store the new
  // mtime together with the old names and hide that file until something else
  // changes the directory.
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(node.dir)).mtimeMs;
  } catch {
    return { node, kind: "missing" };
  }
  if (prev !== undefined && prev.mtimeMs === mtimeMs) {
    return { node, kind: "reuse", snap: prev };
  }
  try {
    const entries = await readdir(node.dir, { withFileTypes: true });
    return { node, kind: "fresh", mtimeMs, entries };
  } catch {
    return { node, kind: "missing" };
  }
}

/**
 * Breadth-first, so when the file budget runs out what is missing is the
 * deepest corner of the tree rather than whole roots listed later.
 *
 * A directory whose mtime matches the previous snap contributes its old names
 * and is not read again. A new or renamed file changes that mtime, so the
 * next refresh reads just that directory.
 */
async function buildIndex(
  roots: readonly RevealRoot[],
  previous: FileIndex | null,
): Promise<FileIndex> {
  const byName = new Map<string, IndexedFile[]>();
  const snaps = new Map<string, DirSnap>();
  const prevSnaps = previous?.snaps ?? new Map<string, DirSnap>();
  let budget = MAX_FILES;

  let frontier: WalkNode[] = outermost(roots).map((root) => ({
    dir: root.rootPath,
    depth: 0,
  }));
  while (frontier.length > 0 && budget > 0) {
    const next: WalkNode[] = [];
    const listings = await mapLimit(frontier, WALK_CONCURRENCY, (node) =>
      readDir(node, prevSnaps.get(node.dir)),
    );
    for (const listing of listings) {
      if (listing.kind === "missing") continue;
      if (listing.kind === "reuse") {
        snaps.set(listing.node.dir, listing.snap);
        for (const name of listing.snap.fileNames) {
          if (budget <= 0) break;
          budget -= 1;
          addFile(byName, path.join(listing.node.dir, name));
        }
        if (listing.node.depth + 1 <= MAX_DEPTH) {
          for (const name of listing.snap.childNames) {
            next.push({
              dir: path.join(listing.node.dir, name),
              depth: listing.node.depth + 1,
            });
          }
        }
        continue;
      }

      const fileNames: string[] = [];
      const childNames: string[] = [];
      // A snap is only useful if it names every child. Stopping at the file
      // budget must not freeze a partial listing under the new mtime, or the
      // files past the cut would never be indexed.
      let complete = true;
      for (const entry of listing.entries) {
        if (entry.isDirectory()) {
          if (SKIP_DIR_NAMES.has(entry.name)) continue;
          if (listing.node.depth + 1 > MAX_DEPTH) continue;
          childNames.push(entry.name);
          next.push({
            dir: path.join(listing.node.dir, entry.name),
            depth: listing.node.depth + 1,
          });
          continue;
        }
        // Symlinks are neither followed nor indexed: a link's target is
        // already indexed under its real name, and following one invites a
        // cycle the budget would have to pay for.
        if (!entry.isFile()) continue;
        if (budget <= 0) {
          complete = false;
          break;
        }
        budget -= 1;
        fileNames.push(entry.name);
        addFile(byName, path.join(listing.node.dir, entry.name));
      }
      if (complete) {
        snaps.set(listing.node.dir, {
          mtimeMs: listing.mtimeMs,
          fileNames,
          childNames,
        });
      }
    }
    frontier = next;
  }
  // Hitting the file ceiling stops the walk before deeper directories are
  // visited. Keep their previous snaps, or the next refresh re-reads the
  // whole tree just because it was large.
  if (budget <= 0) {
    for (const [dir, snap] of prevSnaps) {
      if (!snaps.has(dir)) snaps.set(dir, snap);
    }
  }
  return { at: Date.now(), byName, snaps };
}

async function getIndex(roots: readonly RevealRoot[]): Promise<FileIndex> {
  const key = outermost(roots)
    .map((root) => root.rootPath)
    .join("\n");
  if (cached !== null && cached.key === key && Date.now() - cached.index.at < INDEX_TTL_MS) {
    return cached.index;
  }
  if (building !== null && building.key === key) return building.promise;
  const previous = cached !== null && cached.key === key ? cached.index : null;
  const promise = buildIndex(roots, previous).then(
    (index) => {
      cached = { key, index };
      building = null;
      return index;
    },
    (error: unknown) => {
      building = null;
      throw error;
    },
  );
  building = { key, promise };
  return promise;
}

/** A name worth searching for; a bare prose word is not one. */
function hasFileExtension(text: string): boolean {
  return /\.[\p{L}\p{N}]{1,12}$/u.test(text);
}

/**
 * The written path as segments, or null when it is not the kind of string
 * this index can answer for.
 *
 * Absolute paths are excluded on purpose: an absolute path either exists —
 * and `reveal.ts` has already found it — or names a place that is simply not
 * there, and answering it with a same-named file somewhere else would send
 * the tree where the message never pointed.
 */
function wantedSegments(raw: string): string[] | null {
  const trimmed = raw.trim().replace(/\/+$/u, "");
  if (trimmed === "" || trimmed.startsWith("/") || trimmed.startsWith("~")) {
    return null;
  }
  const segments = trimmed.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === "..")) return null;
  const last = segments[segments.length - 1];
  // Only a file name can be looked up this way. `rules` or `skills` is a real
  // folder in one project and an English word in the next sentence, and the
  // index cannot tell them apart — those still resolve by position only.
  if (last === undefined || !hasFileExtension(last)) return null;
  return segments.map((segment) => segment.toLowerCase());
}

function endsWithSegments(file: IndexedFile, wanted: string[]): boolean {
  if (wanted.length > file.depth) return false;
  const suffix = wanted.join("/");
  return file.lowerPath === suffix || file.lowerPath.endsWith(`/${suffix}`);
}

/** The deepest candidate root containing the hit, so the tree re-roots close to it. */
function attribute(
  roots: readonly RevealRoot[],
  absolutePath: string,
): RevealRoot | null {
  let best: RevealRoot | null = null;
  for (const root of roots) {
    if (!isInside(root.rootPath, absolutePath)) continue;
    if (best === null || root.rootPath.length > best.rootPath.length) best = root;
  }
  return best;
}

/**
 * The one hit a click will open. Several files can share a name, so the order
 * is fixed rather than "whichever the walk saw first": the shallowest path
 * wins, then the shortest, then alphabetical — the same answer every time,
 * and the one closest to the top of a project rather than inside its build
 * output.
 */
function pick(matches: readonly IndexedFile[]): IndexedFile | null {
  let best: IndexedFile | null = null;
  for (const match of matches) {
    if (best === null) {
      best = match;
      continue;
    }
    if (match.depth !== best.depth) {
      if (match.depth < best.depth) best = match;
      continue;
    }
    if (match.absolutePath.length !== best.absolutePath.length) {
      if (match.absolutePath.length < best.absolutePath.length) best = match;
      continue;
    }
    if (match.absolutePath < best.absolutePath) best = match;
  }
  return best;
}

export async function findByName(
  roots: readonly RevealRoot[],
  raw: string,
): Promise<NameHit | null> {
  const wanted = wantedSegments(raw);
  if (wanted === null || roots.length === 0) return null;
  let index: FileIndex;
  try {
    index = await getIndex(roots);
  } catch {
    return null;
  }
  const name = wanted[wanted.length - 1];
  if (name === undefined) return null;
  const candidates = index.byName.get(name);
  if (candidates === undefined) return null;
  const matches =
    wanted.length === 1
      ? candidates
      : candidates.filter((file) => endsWithSegments(file, wanted));
  const hit = pick(matches);
  if (hit === null) return null;
  const root = attribute(roots, hit.absolutePath);
  if (root === null) return null;
  const relativePath = path
    .relative(root.rootPath, hit.absolutePath)
    .split(path.sep)
    .join("/");
  if (relativePath === "" || relativePath.startsWith("..")) return null;
  return { relativePath, isDirectory: false, root };
}

/* ---------------------------------------------------------------------- *
 * Typing a name instead of clicking one
 * ---------------------------------------------------------------------- */

/** A long result list is scrolling, not finding; the ranking decides the top. */
const MAX_CANDIDATES = 2000;

export interface IndexSearchHit {
  name: string;
  relativePath: string;
  absolutePath: string;
  root: RevealRoot;
}

interface Scored {
  file: IndexedFile;
  /** Lower is a better kind of match; ties break on depth, then length. */
  tier: number;
}

/**
 * What the user typed, reduced to what the index can be asked about.
 *
 * A pasted absolute path still works here: only its trailing segments are
 * matched, so `/Users/me/Documents/x/y.md` finds the same file as `x/y.md`
 * without the caller having to know which root it lives under.
 */
function normaliseQuery(raw: string): { needle: string; hasSlash: boolean } | null {
  const trimmed = raw.trim().replace(/^["'`]|["'`]$/gu, "");
  if (trimmed === "") return null;
  const cleaned = trimmed
    .replace(/\\/gu, "/")
    .replace(/^~\//u, "")
    .replace(/^\.\//u, "")
    .replace(/\/+$/u, "")
    .replace(/^\/+/u, "");
  if (cleaned === "") return null;
  return { needle: cleaned.toLowerCase(), hasSlash: cleaned.includes("/") };
}

function scoreByPath(file: IndexedFile, needle: string): number | null {
  const filePath = file.lowerPath;
  if (filePath.endsWith(`/${needle}`) || filePath === needle) return 0;
  return filePath.includes(needle) ? 1 : null;
}

function scoreByName(name: string, needle: string): number | null {
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  return name.includes(needle) ? 2 : null;
}

/**
 * Same order as `pick`, one tier ahead of it: kind of match first, then the
 * shallowest path, then the shortest, then alphabetical. Two runs of the same
 * query give the same list.
 */
function compare(a: Scored, b: Scored): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.file.depth !== b.file.depth) {
    return a.file.depth - b.file.depth;
  }
  if (a.file.absolutePath.length !== b.file.absolutePath.length) {
    return a.file.absolutePath.length - b.file.absolutePath.length;
  }
  return a.file.absolutePath < b.file.absolutePath ? -1 : 1;
}

export async function searchByQuery(
  roots: readonly RevealRoot[],
  rawQuery: string,
  limit: number,
): Promise<IndexSearchHit[]> {
  const query = normaliseQuery(rawQuery);
  if (query === null || roots.length === 0) return [];
  let index: FileIndex;
  try {
    index = await getIndex(roots);
  } catch {
    return [];
  }

  const scored: Scored[] = [];
  // A query with a separator is about position, so it has to see every file;
  // a bare word is about the name, and the index is already keyed by name.
  if (query.hasSlash) {
    outer: for (const files of index.byName.values()) {
      for (const file of files) {
        const tier = scoreByPath(file, query.needle);
        if (tier === null) continue;
        scored.push({ file, tier });
        if (scored.length >= MAX_CANDIDATES) break outer;
      }
    }
  } else {
    outer: for (const [name, files] of index.byName) {
      const tier = scoreByName(name, query.needle);
      if (tier === null) continue;
      for (const file of files) {
        scored.push({ file, tier });
        if (scored.length >= MAX_CANDIDATES) break outer;
      }
    }
  }

  scored.sort(compare);

  const hits: IndexSearchHit[] = [];
  const seen = new Set<string>();
  for (const { file } of scored) {
    if (hits.length >= limit) break;
    if (seen.has(file.absolutePath)) continue;
    seen.add(file.absolutePath);
    const root = attribute(roots, file.absolutePath);
    if (root === null) continue;
    const relativePath = path
      .relative(root.rootPath, file.absolutePath)
      .split(path.sep)
      .join("/");
    if (relativePath === "" || relativePath.startsWith("..")) continue;
    hits.push({
      name: path.basename(file.absolutePath),
      relativePath,
      absolutePath: file.absolutePath,
      root,
    });
  }
  return hits;
}
