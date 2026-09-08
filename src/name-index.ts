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
 */
import { readdir } from "node:fs/promises";
import path from "node:path";
import { SKIP_DIR_NAMES } from "../contract";
import type { RevealRoot } from "../contract";

/** A live tree changes under the index, but a chat sweep is a burst. */
const INDEX_TTL_MS = 60_000;
/** Deep enough for `Documents/<project>/<area>/<...>`, not for a whole disk. */
const MAX_DEPTH = 10;
/** A ceiling, not a target: ~50k entries is a normal Documents folder. */
const MAX_FILES = 200_000;
/** A name shared by dozens of files is prose or a build artefact, not a hit. */
const MAX_PER_NAME = 32;

interface IndexedFile {
  /** Absolute, so a hit can be re-attributed to the most specific root. */
  absolutePath: string;
  /** Lower-cased path segments, for suffix matching without re-splitting. */
  segments: string[];
}

interface FileIndex {
  at: number;
  byName: Map<string, IndexedFile[]>;
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

async function buildIndex(roots: readonly RevealRoot[]): Promise<FileIndex> {
  const byName = new Map<string, IndexedFile[]>();
  let budget = MAX_FILES;

  const add = (absolutePath: string): void => {
    const name = path.basename(absolutePath).toLowerCase();
    const existing = byName.get(name);
    if (existing === undefined) {
      byName.set(name, [
        { absolutePath, segments: splitLower(absolutePath) },
      ]);
      return;
    }
    if (existing.length >= MAX_PER_NAME) return;
    existing.push({ absolutePath, segments: splitLower(absolutePath) });
  };

  // Breadth-first, so when the budget runs out what is missing is the deepest
  // corner of the tree rather than whole roots listed later.
  let frontier = outermost(roots).map((root) => ({
    dir: root.rootPath,
    depth: 0,
  }));
  while (frontier.length > 0 && budget > 0) {
    const next: typeof frontier = [];
    const listings = await Promise.all(
      frontier.map(async (node) => {
        try {
          return {
            node,
            entries: await readdir(node.dir, { withFileTypes: true }),
          };
        } catch {
          return { node, entries: [] };
        }
      }),
    );
    for (const { node, entries } of listings) {
      for (const entry of entries) {
        if (budget <= 0) break;
        if (entry.isDirectory()) {
          if (SKIP_DIR_NAMES.has(entry.name)) continue;
          if (node.depth + 1 > MAX_DEPTH) continue;
          next.push({ dir: path.join(node.dir, entry.name), depth: node.depth + 1 });
          continue;
        }
        // Symlinks are neither followed nor indexed: a link's target is
        // already indexed under its real name, and following one invites a
        // cycle the budget would have to pay for.
        if (!entry.isFile()) continue;
        budget -= 1;
        add(path.join(node.dir, entry.name));
      }
    }
    frontier = next;
  }
  return { at: Date.now(), byName };
}

function splitLower(absolutePath: string): string[] {
  return absolutePath
    .toLowerCase()
    .split(path.sep)
    .filter((segment) => segment !== "");
}

async function getIndex(roots: readonly RevealRoot[]): Promise<FileIndex> {
  const key = outermost(roots)
    .map((root) => root.rootPath)
    .join("\n");
  if (cached !== null && cached.key === key && Date.now() - cached.index.at < INDEX_TTL_MS) {
    return cached.index;
  }
  if (building !== null && building.key === key) return building.promise;
  const promise = buildIndex(roots).then(
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
  if (wanted.length > file.segments.length) return false;
  const offset = file.segments.length - wanted.length;
  return wanted.every((segment, i) => file.segments[offset + i] === segment);
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
    if (match.segments.length !== best.segments.length) {
      if (match.segments.length < best.segments.length) best = match;
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
