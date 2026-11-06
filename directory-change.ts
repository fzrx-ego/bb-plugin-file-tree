import { z } from "zod";

/** Zod-only so the app bundle can validate changes without pulling in the plugin SDK. */
export const directoryChangeSchema = z.object({
  watchId: z.string().uuid(),
  rootId: z.string().min(1),
  relativePaths: z.array(z.string().max(4096)).max(256),
}).strict();
