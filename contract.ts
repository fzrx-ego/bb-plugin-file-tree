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
  environmentId: z.string(),
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

export const rpcContract = defineRpcContract({
  workspaceForThread: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
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
