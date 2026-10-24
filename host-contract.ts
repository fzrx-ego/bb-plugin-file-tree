import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { directoryChangeSchema, treeEntrySchema } from "./contract";

export const hostSignals = { directoriesChanged: { payload: directoryChangeSchema } };

export const hostContract = defineRpcContract({
  syncDirectoryWatch: {
    input: directoryChangeSchema.extend({ rootPath: z.string().min(1) }),
    output: z.object({ ok: z.literal(true), reset: z.boolean() }),
  },
  statPath: {
    input: z.object({ rootPath: z.string().min(1), relativePath: z.string() }).strict(),
    output: z.object({ isDirectory: z.boolean() }).strict().nullable(),
  },
  listDirectory: {
    input: z.object({
      rootPath: z.string().min(1),
      relativePath: z.string(),
      showSkipped: z.boolean(),
    }).strict(),
    output: z.object({ entries: z.array(treeEntrySchema) }).strict(),
  },
});
