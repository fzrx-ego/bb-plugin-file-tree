import { homedir } from "node:os";
import path from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { RootChoice, WorkspaceResult } from "../contract";
import { registerRoot } from "./roots";

function expandHome(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return path.join(homedir(), input.slice(2));
  return input;
}

export async function workspaceForThread(
  bb: BbPluginApi,
  threadId: string,
  treeRoot?: string,
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
  // BB represents a general, non-project conversation with its internal
  // personal project id. Only those scratch threads should browse the shared
  // Documents folder; every real project remains rooted in its own checkout.
  const usePersonalRoot = treeRoot !== undefined && thread.projectId === "proj_personal";
  const rootPath = usePersonalRoot ? path.resolve(expandHome(treeRoot)) : environment.path;
  return {
    ok: true,
    workspace: {
      // A configured tree root is a navigator location, not this thread's
      // workspace. Keeping it detached prevents UI actions from implying that
      // the thread itself was moved.
      environmentId: usePersonalRoot ? null : environment.id,
      hostId: environment.hostId,
      rootPath,
      rootName: path.basename(rootPath) || rootPath,
      rootId: registerRoot(environment.hostId, rootPath),
    },
  };
}

/**
 * A root composer has selected a project but no thread or environment yet.
 * Resolve its source directly so File Tree can be useful before the first
 * prompt is sent.
 */
export async function workspaceForProject(
  bb: BbPluginApi,
  projectId: string,
  treeRoot?: string,
): Promise<WorkspaceResult> {
  // The root composer supplies BB's implicit personal-project id. It is not
  // available through `projects.get`; the SDK requires `includePersonal` for
  // that metadata. Looking up every selected project this way keeps both new
  // project threads and projectless/personal compose on the same code path.
  const projectsIncludingPersonal = await bb.sdk.projects.list({ includePersonal: true });
  const project = projectsIncludingPersonal.find((candidate) => candidate.id === projectId);
  if (project === undefined) return { ok: false, reason: "no_checkout" };
  const usePersonalRoot = treeRoot !== undefined && project.kind === "personal";
  const source = project.sources.find((candidate) => candidate.isDefault) ?? project.sources[0];

  if (usePersonalRoot) {
    // Personal is a virtual project and deliberately has no source. Reuse the
    // host of any configured local project so its navigator can still browse
    // the configured Documents root before a thread/environment exists.
    const standardProjects = projectsIncludingPersonal.filter(
      (candidate) => candidate.kind !== "personal",
    );
    const hostSource = standardProjects
      .flatMap((candidate) => candidate.sources)
      .find((candidate) => candidate.isDefault) ??
      standardProjects.flatMap((candidate) => candidate.sources)[0];
    if (hostSource === undefined) return { ok: false, reason: "no_checkout" };

    const rootPath = path.resolve(expandHome(treeRoot));
    return {
      ok: true,
      workspace: {
        environmentId: null,
        hostId: hostSource.hostId,
        rootPath,
        rootName: path.basename(rootPath) || rootPath,
        rootId: registerRoot(hostSource.hostId, rootPath),
      },
    };
  }

  if (source === undefined) {
    return { ok: false, reason: "no_checkout" };
  }
  return {
    ok: true,
    workspace: {
      environmentId: null,
      hostId: source.hostId,
      rootPath: source.path,
      rootName: path.basename(source.path) || source.path,
      rootId: registerRoot(source.hostId, source.path),
    },
  };
}

/** Roots offered by the window-wide tree. IDs name durable BB records, never client paths. */
export async function listRootChoices(
  bb: BbPluginApi,
  input: { currentThreadId: string | null; pinnedThreadId: string | null },
  treeRoot?: string,
): Promise<RootChoice[]> {
  const projects = await bb.sdk.projects.list({ includePersonal: true });
  const choices: RootChoice[] = [];
  for (const project of projects) {
    if (project.kind === "personal") {
      if (treeRoot === undefined) continue;
      const resolved = await workspaceForProject(bb, project.id, treeRoot);
      if (resolved.ok) {
        choices.push({ id: `personal:${project.id}`, label: `${project.name} · ${resolved.workspace.rootPath}`, projectId: project.id, workspace: resolved.workspace });
      }
      continue;
    }
    for (const source of project.sources) {
      const rootPath = source.path;
      choices.push({
        id: `source:${source.id}`,
        label: `${project.name} · ${rootPath}`,
        projectId: project.id,
        workspace: {
          environmentId: null,
          hostId: source.hostId,
          rootPath,
          rootName: path.basename(rootPath) || rootPath,
          rootId: registerRoot(source.hostId, rootPath),
        },
      });
    }
  }

  const threadIds = new Set([input.currentThreadId, input.pinnedThreadId].filter((id): id is string => id !== null));
  for (const threadId of threadIds) {
    try {
      const resolved = await workspaceForThread(bb, threadId);
      if (resolved.ok) {
        choices.unshift({
          id: `thread:${threadId}`,
          label: `Thread workspace · ${resolved.workspace.rootPath}`,
          projectId: null,
          workspace: resolved.workspace,
        });
      }
    } catch (cause) {
      bb.log.warn(`Could not load file-tree root for thread ${threadId}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  return choices;
}
