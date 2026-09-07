import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { WorkspaceResult } from "../contract";

export async function workspaceForThread(
  bb: BbPluginApi,
  threadId: string,
): Promise<WorkspaceResult> {
  const thread = await bb.sdk.threads.get({ threadId });
  if (thread.environmentId === null) {
    return { ok: false, reason: "no_environment" };
  }
  const environment = await bb.sdk.environments.get({
    environmentId: thread.environmentId,
  });
  if (environment.path === null || environment.path === "") {
    return { ok: false, reason: "no_checkout" };
  }
  return {
    ok: true,
    workspace: {
      environmentId: environment.id,
      hostId: environment.hostId,
      rootPath: environment.path,
      rootName: path.basename(environment.path) || environment.path,
    },
  };
}
