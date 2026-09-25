import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { treeEntrySchema } from "./contract";

export const hostContract = defineRpcContract({
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
