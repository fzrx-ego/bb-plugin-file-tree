/**
 * A "reveal in the tree" button on every path in a message that actually
 * exists in this thread's workspace.
 *
 * Two things are deliberate here.
 *
 * The button is appended *inside* the code element it belongs to. An earlier
 * version inserted it as a sibling; React re-renders the message subtree and
 * does not own that button, so old ones were left stranded next to unrelated
 * text while still carrying their original path. A child is removed together
 * with its element, so a stale button cannot drift onto another path.
 *
 * Which strings get a button is decided by the filesystem, not by a pattern.
 * `packs/gws` and `and/or` are lexically identical, so guessing either misses
 * real paths or decorates prose. The candidates go to the server and only the
 * ones that resolve come back.
 */
import { requestReveal } from "./reveal-bus";
import { writeStoredOpen } from "./rail-state";
import type { AnchorFix } from "../contract";

const BUTTON_ATTR = "data-file-tree-reveal";
const PATH_ATTR = "fileTreeRevealPath";
/** Marks a chat link this module answers instead of bb. */
const FIXED_ATTR = "data-file-tree-fixed";

// The app chrome uses the same inline elements as rendered Markdown. Restrict
// mutation to a message container so a workspace folder named "Settings" can
// never decorate BB's sidebar settings control.
// BB marks the rendered body of a conversation message with this CSS class.
// Keep the scanner scoped to that subtree: sidebar/footer controls can contain
// ordinary text or a `file:` link as well, but must never receive a reveal button.
const CHAT_MESSAGE_SELECTOR = ".group\\/message";

function isChatContent(element: Element): boolean {
  return element.closest(CHAT_MESSAGE_SELECTOR) !== null;
}

/**
 * A loose shape filter — anything that could plausibly name a file. Unicode
 * classes rather than `\w`, which is ASCII-only and dropped Cyrillic paths.
 * The server decides what actually exists; this only keeps obvious prose out
 * of the batch.
 */
const CANDIDATE_RE =
  /^[~.]?\/?[\p{L}\p{N}_.\-*[\]()][\p{L}\p{N}_.\-*[\]() /]*$/u;

/**
 * A bare token like `rules` or `packs` is a folder name as often as it is a
 * word, and only the filesystem can tell. Anything without whitespace is
 * cheap enough to ask about; prose with spaces is not worth the round trip.
 */
const BARE_NAME_RE = /^[\p{L}\p{N}_.\-]{3,}$/u;

const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10V7a2 2 0 0 0-2-2h-6l-2-2H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h5"/><path d="M14 15h8"/><path d="m18 11 4 4-4 4"/></svg>';

/** The element's own text, excluding any button this module added. */
function textOf(code: Element): string {
  let text = "";
  for (const node of Array.from(code.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).hasAttribute(BUTTON_ATTR)) continue;
      text += node.textContent ?? "";
      continue;
    }
    text += node.textContent ?? "";
  }
  return text.trim();
}

function candidateOf(code: Element): string | null {
  const text = textOf(code);
  if (text.length < 3 || text.length > 512) return null;
  if (text.includes("/")) return CANDIDATE_RE.test(text) ? text : null;
  return BARE_NAME_RE.test(text) ? text : null;
}

function makeButton(path: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_ATTR, "");
  button.dataset[PATH_ATTR] = path;
  button.title = `Reveal in the file tree: ${path}`;
  button.setAttribute("aria-label", `Reveal in the file tree: ${path}`);
  button.innerHTML = ICON_SVG;
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "vertical-align:text-bottom",
    "margin-left:4px",
    "padding:0",
    "border:0",
    "background:transparent",
    "color:currentColor",
    "opacity:0.55",
    "cursor:pointer",
    "line-height:1",
  ].join(";");
  return button;
}

export type PathValidator = (paths: string[]) => Promise<Set<string>>;
export type AnchorResolver = (
  anchors: { text: string; href: string }[],
) => Promise<AnchorFix[]>;
export type FixedOpener = (fix: AnchorFix) => void;
export type Reporter = (message: string) => void;

/** The filesystem path a `file://` link points at, or null for anything else. */
function anchorTargetPath(anchor: HTMLAnchorElement): string | null {
  const href = anchor.getAttribute("href") ?? "";
  if (!href.startsWith("file:")) return null;
  try {
    const url = new URL(href);
    if (url.host !== "") return null;
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function anchorKey(text: string, href: string): string {
  return `${text}\n${href}`;
}

export function mountChatPathButtons(
  signal: AbortSignal,
  validate: PathValidator,
  resolveAnchors: AnchorResolver,
  openFixed: FixedOpener,
  report: Reporter = () => undefined,
): void {
  /** path → exists in the workspace. Absent means "not asked yet". */
  const known = new Map<string, boolean>();
  const pending = new Set<string>();
  let flushTimer: number | null = null;
  let sweepQueued = false;

  const ensureButton = (code: Element, path: string): void => {
    const existing = code.querySelector(`button[${BUTTON_ATTR}]`);
    if (existing !== null) {
      if ((existing as HTMLElement).dataset[PATH_ATTR] === path) return;
      existing.remove();
    }
    code.appendChild(makeButton(path));
  };

  /**
   * key → the file bb's link should have pointed at, or null when bb's own
   * link is fine (or nothing better exists) and the click stays bb's.
   */
  const anchorFixes = new Map<string, AnchorFix | null>();
  const pendingAnchors = new Map<string, { text: string; href: string }>();
  let anchorTimer: number | null = null;

  const applyFix = (anchor: HTMLAnchorElement, fix: AnchorFix): void => {
    anchor.setAttribute(FIXED_ATTR, "");
    anchor.dataset.fileTreeFixedPath = fix.absolutePath;
    anchor.dataset.fileTreeFixedHost = fix.hostId;
    anchor.dataset.fileTreeFixedDir = fix.isDirectory ? "1" : "";
    anchor.title = fix.absolutePath;
  };

  const clearFix = (anchor: HTMLAnchorElement): void => {
    if (!anchor.hasAttribute(FIXED_ATTR)) return;
    anchor.removeAttribute(FIXED_ATTR);
    delete anchor.dataset.fileTreeFixedPath;
    delete anchor.dataset.fileTreeFixedHost;
    delete anchor.dataset.fileTreeFixedDir;
  };

  const sweepAnchors = (): void => {
    for (const anchor of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href^="file:"]'),
    )) {
      if (!isChatContent(anchor)) continue;
      const href = anchorTargetPath(anchor);
      const text = textOf(anchor);
      if (href === null || text === "") {
        clearFix(anchor);
        continue;
      }
      const key = anchorKey(text, href);
      const fix = anchorFixes.get(key);
      if (fix === undefined) {
        pendingAnchors.set(key, { text, href });
        continue;
      }
      if (fix === null) clearFix(anchor);
      else applyFix(anchor, fix);
    }
    if (pendingAnchors.size > 0) scheduleAnchorFlush();
  };

  const scheduleAnchorFlush = (): void => {
    if (anchorTimer !== null) return;
    anchorTimer = window.setTimeout(() => {
      anchorTimer = null;
      void flushAnchors();
    }, 150);
  };

  const flushAnchors = async (): Promise<void> => {
    const batch = Array.from(pendingAnchors.entries()).slice(0, 100);
    if (batch.length === 0) return;
    for (const [key] of batch) pendingAnchors.delete(key);
    let fixes: AnchorFix[];
    try {
      fixes = await resolveAnchors(batch.map(([, anchor]) => anchor));
    } catch {
      // Leave them unasked rather than caching a transport failure as "fine".
      return;
    }
    if (signal.aborted) return;
    for (const [key] of batch) anchorFixes.set(key, null);
    for (const fix of fixes) {
      anchorFixes.set(anchorKey(fix.text, fix.href), fix);
    }
    if (fixes.length > 0) {
      report(`anchor fixes ${fixes.length}/${batch.length}`);
    }
    queueSweep();
  };

  let lastReport = "";
  const sweep = (): void => {
    sweepQueued = false;
    let codes = 0;
    let candidates = 0;
    let wanted = 0;
    // Links too, not just code spans: bb renders file mentions as anchors and
    // gives them its own "open" glyph, which is a different action from
    // revealing the file in the tree.
    sweepAnchors();
    for (const code of Array.from(document.querySelectorAll("code, a"))) {
      if (!isChatContent(code)) continue;
      // A `<code>` inside an `<a>` matches twice; let the inner one win so the
      // path gets one button, not two.
      if (code.querySelector("code, a") !== null) continue;
      codes += 1;
      const path = candidateOf(code);
      if (path === null) {
        code.querySelector(`button[${BUTTON_ATTR}]`)?.remove();
        continue;
      }
      candidates += 1;
      const verdict = known.get(path);
      if (verdict === true) {
        wanted += 1;
        ensureButton(code, path);
        continue;
      }
      if (verdict === false) continue;
      pending.add(path);
    }
    if (pending.size > 0) scheduleFlush();

    // A live chat mutates constantly, so only report when the numbers that
    // actually matter move — otherwise this logs once a second forever.
    const present = document.querySelectorAll(`button[${BUTTON_ATTR}]`).length;
    const line = `sweep known=${wanted} buttonsInDom=${present}`;
    if (line !== lastReport) {
      lastReport = line;
      report(`${line} (codes=${codes} candidates=${candidates})`);
    }
  };

  const queueSweep = (): void => {
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(sweep);
  };

  const scheduleFlush = (): void => {
    if (flushTimer !== null) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void flush();
    }, 150);
  };

  const flush = async (): Promise<void> => {
    const batch = Array.from(pending).slice(0, 200);
    if (batch.length === 0) return;
    for (const path of batch) pending.delete(path);
    let resolved: Set<string>;
    try {
      resolved = await validate(batch);
    } catch {
      // Leave them unknown rather than caching a transport failure as "no".
      return;
    }
    if (signal.aborted) return;
    for (const path of batch) known.set(path, resolved.has(path));
    report(
      `validated ${batch.length}, known ${resolved.size}: ${Array.from(resolved)
        .slice(0, 5)
        .join(" | ")}`,
    );
    queueSweep();
  };

  const buttonFrom = (target: EventTarget | null): HTMLElement | null => {
    if (target === null || !(target instanceof Element)) return null;
    return target.closest<HTMLElement>(`button[${BUTTON_ATTR}]`);
  };

  /**
   * BB handles file-link clicks with a delegated capture-phase listener, and
   * the button can sit inside such a link, so claim the event first. Only the
   * click may call preventDefault(): doing it on pointerdown or mousedown
   * cancels the click that would otherwise follow.
   */
  const fixedAnchorFrom = (target: EventTarget | null): HTMLElement | null => {
    if (target === null || !(target instanceof Element)) return null;
    return target.closest<HTMLElement>(`a[${FIXED_ATTR}]`);
  };

  const onEarly = (event: Event): void => {
    const button = buttonFrom(event.target);
    if (button === null) {
      onFixedAnchor(event);
      return;
    }
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (event.type !== "click" && event.type !== "auxclick") return;
    event.preventDefault();
    const path = button.dataset[PATH_ATTR];
    if (path === undefined || path === "") return;
    writeStoredOpen(true);
    requestReveal(path);
  };

  /**
   * A link bb pointed at a file that is not there. bb would open a preview of
   * that missing path, so the click is answered here instead — with the file
   * the link text actually names.
   */
  const onFixedAnchor = (event: Event): void => {
    const anchor = fixedAnchorFrom(event.target);
    if (anchor === null) return;
    const absolutePath = anchor.dataset.fileTreeFixedPath;
    const hostId = anchor.dataset.fileTreeFixedHost;
    if (absolutePath === undefined || hostId === undefined) return;
    event.stopImmediatePropagation();
    event.stopPropagation();
    if (event.type !== "click" && event.type !== "auxclick") return;
    event.preventDefault();
    const isDirectory = anchor.dataset.fileTreeFixedDir === "1";
    writeStoredOpen(true);
    if (isDirectory) {
      // A folder has no preview; showing it in the tree is the whole action.
      requestReveal(textOf(anchor));
      return;
    }
    openFixed({
      text: textOf(anchor),
      href: anchor.getAttribute("href") ?? "",
      absolutePath,
      hostId,
      isDirectory,
    });
  };

  const opts: AddEventListenerOptions = { capture: true, signal };
  for (const type of [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "click",
    "auxclick",
  ]) {
    document.addEventListener(type, onEarly, opts);
  }

  const observer = new MutationObserver(queueSweep);
  observer.observe(document.body, { childList: true, subtree: true });
  signal.addEventListener(
    "abort",
    () => {
      observer.disconnect();
      for (const button of Array.from(
        document.querySelectorAll(`button[${BUTTON_ATTR}]`),
      )) {
        button.remove();
      }
      for (const anchor of Array.from(
        document.querySelectorAll<HTMLAnchorElement>(`a[${FIXED_ATTR}]`),
      )) {
        clearFix(anchor);
      }
    },
    { once: true },
  );

  queueSweep();
}
