import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "venv",
]);

export const SKIP_FILE_NAMES = new Set([".DS_Store"]);

export const treeEntrySchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  kind: z.enum(["file", "directory"]),
});
export type TreeEntry = z.infer<typeof treeEntrySchema>;

export const workspaceSchema = z.object({
  /**
   * Null when the root on screen is not this thread's environment — a reveal
   * that landed in another registered project re-roots the tree there.
   */
  environmentId: z.string().nullable(),
  hostId: z.string(),
  rootPath: z.string(),
  rootName: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspaceResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    workspace: workspaceSchema,
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["no_thread", "no_environment", "no_checkout"]),
  }),
]);
export type WorkspaceResult = z.infer<typeof workspaceResultSchema>;

/** Where a reveal landed, when that is not the thread's own workspace. */
export const revealRootSchema = z.object({
  hostId: z.string(),
  rootPath: z.string(),
  rootName: z.string(),
});
export type RevealRoot = z.infer<typeof revealRootSchema>;

export const revealResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    relativePath: z.string(),
    isDirectory: z.boolean(),
    /**
     * Set when the path lives in another registered project. Agents cite
     * paths from anywhere, so the tree re-roots there rather than reporting
     * a path the user can plainly see is real.
     */
    root: revealRootSchema.nullable(),
  }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type RevealResult = z.infer<typeof revealResultSchema>;

/**
 * One row in the find-a-file list: enough to draw it, and the absolute path a
 * click hands back to the same reveal that chat paths use.
 */
export const searchHitSchema = z.object({
  name: z.string(),
  /** Relative to the root named below, so a row can show where the file lives. */
  relativePath: z.string(),
  absolutePath: z.string(),
  rootName: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

/**
 * A chat link bb aimed at a file that is not there, and the file the same text
 * really names. `text` and `href` identify the anchor the fix belongs to.
 */
export const anchorFixSchema = z.object({
  text: z.string(),
  href: z.string(),
  absolutePath: z.string(),
  hostId: z.string(),
  isDirectory: z.boolean(),
});
export type AnchorFix = z.infer<typeof anchorFixSchema>;

export const rpcContract = defineRpcContract({
  workspaceForThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: workspaceResultSchema,
  },
  workspaceForProject: {
    input: z.object({ projectId: z.string().min(1) }).strict(),
    output: workspaceResultSchema,
  },
  /** Turn a path as written in a chat message into a workspace-relative one. */
  resolveInWorkspace: {
    input: z
      .object({
        threadId: z.string().min(1),
        path: z.string().trim().min(1).max(4096),
      })
      .strict(),
    output: revealResultSchema,
  },
  /**
   * Which of these candidates are real paths in the thread's workspace.
   * `packs/gws` and `and/or` are the same shape, so the filesystem decides
   * which strings in a message get a reveal affordance.
   */
  /** Diagnostics from the browser, so DOM behaviour is observable in bb.log. */
  clientLog: {
    input: z.object({ message: z.string().max(2000) }).strict(),
    output: z.object({ ok: z.boolean() }),
  },
  resolvePaths: {
    input: z
      .object({
        threadId: z.string().min(1),
        paths: z.array(z.string().trim().min(1).max(4096)).max(200),
      })
      .strict(),
    output: z.object({ known: z.array(z.string()) }),
  },
  /**
   * Find a file by name, or by part of its path, across the thread workspace
   * and the search roots. This is the typed query behind the tree's search
   * box; `resolveInWorkspace` is the same question asked about one written
   * string.
   */
  searchFiles: {
    input: z
      .object({
        threadId: z.string().min(1),
        query: z.string().trim().min(1).max(1024),
        limit: z.number().int().min(1).max(50),
      })
      .strict(),
    output: z.object({ hits: z.array(searchHitSchema) }),
  },
  /**
   * Which of these chat links point at a file that does not exist, and where
   * the linked text actually lives. bb resolves a path written in a message
   * against the thread's own workspace root, so a message that names a file in
   * another project links to a path that was never there.
   */
  resolveFileAnchors: {
    input: z
      .object({
        threadId: z.string().min(1),
        anchors: z
          .array(
            z.object({
              text: z.string().trim().min(1).max(512),
              href: z.string().trim().min(1).max(4096),
            }),
          )
          .max(100),
      })
      .strict(),
    output: z.object({ fixes: z.array(anchorFixSchema) }),
  },
  listDir: {
    input: z
      .object({
        hostId: z.string().min(1),
        rootPath: z.string().min(1),
        relativePath: z.string(),
        showSkipped: z.boolean(),
      })
      .strict(),
    output: z.object({ entries: z.array(treeEntrySchema) }),
  },
  revealInFinder: {
    input: z
      .object({
        rootPath: z.string().min(1),
        relativePath: z.string(),
      })
      .strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), message: z.string() }),
    ]),
  },
  copyFileToClipboard: {
    input: z
      .object({
        rootPath: z.string().min(1),
        relativePath: z.string(),
      })
      .strict(),
    output: z.discriminatedUnion("ok", [
      z.object({ ok: z.literal(true) }),
      z.object({ ok: z.literal(false), message: z.string() }),
    ]),
  },
});
