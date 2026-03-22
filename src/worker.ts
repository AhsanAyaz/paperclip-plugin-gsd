import {
  definePlugin,
  runWorker,
  type PluginContext,
  type PluginEvent,
  type PluginWorkspace,
} from "@paperclipai/plugin-sdk";
import { getAdapterCompat, getAdapterCompatMessage } from "./adapter-compat.js";
import { ACTION_KEYS, DATA_KEYS } from "./constants.js";
import { parseGsdDirectory, parseStateFrontmatter } from "./gsd-parser.js";
import type {
  GsdPhase,
  GsdPluginState,
  GsdProjectSummary,
  GsdStateFrontmatter,
} from "./gsd-types.js";

type GsdConfig = {
  autoSyncEnabled?: boolean;
  syncIntervalSeconds?: number;
};

const DEFAULT_CONFIG: GsdConfig = {
  autoSyncEnabled: true,
  syncIntervalSeconds: 30,
};

let syncTimer: ReturnType<typeof setInterval> | null = null;
let storedCtx: PluginContext | null = null;

function emptyPluginState(): GsdPluginState {
  return {
    schemaVersion: 1,
    lastSyncAt: "",
    state: null,
    roadmap: null,
    phases: [],
    phaseIssueLinks: {},
  };
}

/**
 * Sync a single project workspace's GSD state.
 * Returns the new plugin state if GSD was found, null otherwise.
 */
async function syncWorkspace(
  ctx: PluginContext,
  workspace: PluginWorkspace,
  companyId: string,
  projectId: string,
): Promise<GsdPluginState | null> {
  if (!workspace.path) return null;

  const gsd = await parseGsdDirectory(workspace.path);
  if (!gsd) return null;

  const stateFm = await parseStateFrontmatter(workspace.path);

  // Load previous state
  const prevState = (await ctx.state.get({
    scopeKind: "project",
    scopeId: projectId,
    stateKey: "gsd",
  })) as GsdPluginState | null;

  const prev = prevState ?? emptyPluginState();

  // Build new state
  const newState: GsdPluginState = {
    schemaVersion: 1,
    lastSyncAt: new Date().toISOString(),
    state: stateFm,
    roadmap: gsd.roadmap,
    phases: gsd.phases,
    phaseIssueLinks: prev.phaseIssueLinks,
  };

  // Detect changes and update linked issues
  await syncIssuesToPhases(ctx, prev, newState, companyId);

  // Persist new state
  await ctx.state.set(
    { scopeKind: "project", scopeId: projectId, stateKey: "gsd" },
    newState,
  );

  return newState;
}

/**
 * Sync all projects across all companies.
 */
async function syncAllCompanies(ctx: PluginContext): Promise<void> {
  try {
    const companies = await ctx.companies.list();

    for (const company of companies) {
      const projects = await ctx.projects.list({
        companyId: company.id,
        limit: 100,
        offset: 0,
      });

      for (const project of projects) {
        const workspaces = await ctx.projects.listWorkspaces(
          project.id,
          company.id,
        );
        for (const ws of workspaces) {
          await syncWorkspace(ctx, ws, company.id, project.id);
        }
      }
    }
  } catch (err) {
    ctx.logger.error("Periodic GSD sync failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Start or restart the periodic sync timer.
 */
function startPeriodicSync(ctx: PluginContext, config: GsdConfig): void {
  stopPeriodicSync();

  if (!config.autoSyncEnabled) {
    ctx.logger.info("GSD auto-sync disabled");
    return;
  }

  const intervalMs = Math.max(10, config.syncIntervalSeconds ?? 30) * 1000;
  ctx.logger.info(`GSD auto-sync started (every ${intervalMs / 1000}s)`);

  syncTimer = setInterval(() => {
    syncAllCompanies(ctx).catch((err) => {
      ctx.logger.error("GSD periodic sync error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
}

function stopPeriodicSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

/**
 * Compare previous and new GSD state, update linked Paperclip issues.
 */
async function syncIssuesToPhases(
  ctx: PluginContext,
  prev: GsdPluginState,
  next: GsdPluginState,
  companyId: string,
): Promise<void> {
  const links = next.phaseIssueLinks;

  for (const phase of next.phases) {
    const issueId = links[phase.number];
    if (!issueId) continue;

    const prevPhase = prev.phases.find((p) => p.number === phase.number);
    const completedPlans = phase.plans.filter((p) => p.status === "complete").length;
    const totalPlans = phase.plans.length;
    const prevCompleted = prevPhase
      ? prevPhase.plans.filter((p) => p.status === "complete").length
      : 0;

    // Only comment if progress changed
    if (completedPlans !== prevCompleted && totalPlans > 0) {
      const percent = Math.round((completedPlans / totalPlans) * 100);
      const phaseLabel = `Phase ${phase.number}: ${phase.slug}`;

      if (completedPlans === totalPlans) {
        await safeCreateComment(
          ctx,
          issueId,
          companyId,
          `**GSD** ${phaseLabel} \u2014 All ${totalPlans} plans complete (100%)`,
        );
      } else {
        await safeCreateComment(
          ctx,
          issueId,
          companyId,
          `**GSD** ${phaseLabel} \u2014 ${completedPlans}/${totalPlans} plans complete (${percent}%)`,
        );
      }
    }

    // Update issue description with current phase objective if first plan has one
    if (prevPhase == null && phase.plans.length > 0 && phase.plans[0].objective) {
      const objective = phase.plans[0].objective;
      await safeCreateComment(
        ctx,
        issueId,
        companyId,
        `**GSD** Phase ${phase.number} started: ${phase.slug}\n\n> ${objective}`,
      );
    }
  }
}

async function safeCreateComment(
  ctx: PluginContext,
  issueId: string,
  companyId: string,
  body: string,
): Promise<void> {
  try {
    await ctx.issues.createComment(issueId, { body }, companyId);
  } catch (err) {
    ctx.logger.warn("Failed to create issue comment", {
      issueId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// --- Plugin definition ---

const plugin = definePlugin({
  async setup(ctx) {
    // --- Start periodic sync ---
    storedCtx = ctx;
    const rawConfig = await ctx.config.get();
    const config: GsdConfig = { ...DEFAULT_CONFIG, ...(rawConfig as GsdConfig) };
    startPeriodicSync(ctx, config);

    // --- Event: agent run finished => sync GSD state ---
    ctx.events.on("agent.run.finished", async (event: PluginEvent) => {
      const agentId = event.entityId;
      const companyId = event.companyId;
      if (!agentId) return;

      try {
        // Get agent to check adapter compatibility
        const agent = await ctx.agents.get(agentId);
        const compat = getAdapterCompat(agent.adapterType);
        if (compat === "unsupported") return;

        // Find workspaces for this agent's projects
        const projects = await ctx.projects.list({ companyId, limit: 100, offset: 0 });

        for (const project of projects) {
          const workspaces = await ctx.projects.listWorkspaces(project.id, companyId);
          for (const ws of workspaces) {
            const result = await syncWorkspace(ctx, ws, companyId, project.id);
            if (result) {
              ctx.logger.info("GSD sync completed", {
                projectId: project.id,
                phases: result.phases.length,
              });
              await ctx.activity.log({
                companyId,
                message: `GSD synced: ${result.phases.length} phases found`,
                entityType: "project",
                entityId: project.id,
                metadata: {
                  milestone: result.state?.milestone ?? null,
                  percent: result.state?.progress.percent ?? null,
                },
              });
            }
          }
        }
      } catch (err) {
        ctx.logger.error("GSD sync failed on agent.run.finished", {
          agentId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // --- Event: workspace created => initial sync ---
    ctx.events.on(
      "project.workspace_created",
      async (event: PluginEvent) => {
        const companyId = event.companyId;
        const projectId =
          (event.payload as Record<string, unknown>)?.projectId as
            | string
            | undefined;
        const workspaceId = event.entityId;
        if (!projectId || !workspaceId) return;

        try {
          const workspaces = await ctx.projects.listWorkspaces(
            projectId,
            companyId,
          );
          const ws = workspaces.find((w: PluginWorkspace) => w.id === workspaceId);
          if (ws) {
            await syncWorkspace(ctx, ws, companyId, projectId);
          }
        } catch (err) {
          ctx.logger.warn("GSD initial sync failed for new workspace", {
            workspaceId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );

    // --- Data providers ---

    ctx.data.register(DATA_KEYS.OVERVIEW, async (params) => {
      const companyId = params?.companyId as string;
      if (!companyId) return { projects: [] };

      const projects = await ctx.projects.list({
        companyId,
        limit: 100,
        offset: 0,
      });

      const summaries: GsdProjectSummary[] = [];
      for (const project of projects) {
        const state = (await ctx.state.get({
          scopeKind: "project",
          scopeId: project.id,
          stateKey: "gsd",
        })) as GsdPluginState | null;

        if (state && state.phases.length > 0) {
          summaries.push({
            projectId: project.id,
            projectName: project.name,
            milestone: state.state?.milestone ?? null,
            status: state.state?.status ?? null,
            totalPhases: state.state?.progress.totalPhases ?? state.phases.length,
            completedPhases: state.state?.progress.completedPhases ?? 0,
            percent: state.state?.progress.percent ?? 0,
            lastSyncAt: state.lastSyncAt,
          });
        }
      }

      return { projects: summaries };
    });

    ctx.data.register(DATA_KEYS.PROJECT_DETAIL, async (params) => {
      const projectId = params?.projectId as string;
      if (!projectId) return null;

      const state = (await ctx.state.get({
        scopeKind: "project",
        scopeId: projectId,
        stateKey: "gsd",
      })) as GsdPluginState | null;

      return state ?? null;
    });

    ctx.data.register(DATA_KEYS.ISSUE_PHASE, async (params) => {
      const issueId = params?.issueId as string;
      const projectId = params?.projectId as string;
      if (!issueId || !projectId) return null;

      const state = (await ctx.state.get({
        scopeKind: "project",
        scopeId: projectId,
        stateKey: "gsd",
      })) as GsdPluginState | null;

      if (!state) return null;

      // Find which phase is linked to this issue
      const linkedPhaseNumber = Object.entries(state.phaseIssueLinks).find(
        ([, id]) => id === issueId,
      )?.[0];

      if (!linkedPhaseNumber) return { linked: false, phase: null };

      const phase = state.phases.find(
        (p) => p.number === linkedPhaseNumber,
      );
      return { linked: true, phase: phase ?? null, state: state.state };
    });

    ctx.data.register(DATA_KEYS.ADAPTER_COMPAT, async (params) => {
      const companyId = params?.companyId as string;
      if (!companyId) return { agents: [] };

      const agents = await ctx.agents.list({ companyId });
      return {
        agents: agents.map((a) => {
          const compat = getAdapterCompat(a.adapterType);
          return {
            agentId: a.id,
            agentName: a.name,
            adapterType: a.adapterType,
            compatibility: compat,
            message: getAdapterCompatMessage(a.adapterType, compat),
          };
        }),
      };
    });

    ctx.data.register(DATA_KEYS.CONFIG, async () => {
      const savedConfig = (await ctx.state.get({
        scopeKind: "instance",
        stateKey: "gsd-config",
      })) as GsdConfig | null;
      return { ...DEFAULT_CONFIG, ...savedConfig };
    });

    // --- Actions ---

    ctx.actions.register(ACTION_KEYS.SYNC_PROJECT, async (params) => {
      const projectId = params?.projectId as string;
      const companyId = params?.companyId as string;
      if (!projectId || !companyId) {
        return { ok: false, error: "projectId and companyId required" };
      }

      const workspaces = await ctx.projects.listWorkspaces(
        projectId,
        companyId,
      );

      let synced = 0;
      for (const ws of workspaces) {
        const result = await syncWorkspace(ctx, ws, companyId, projectId);
        if (result) synced++;
      }

      return { ok: true, synced };
    });

    ctx.actions.register(ACTION_KEYS.SYNC_ALL, async (params) => {
      const companyId = params?.companyId as string;
      if (!companyId) {
        return { ok: false, error: "companyId required" };
      }

      const projects = await ctx.projects.list({
        companyId,
        limit: 100,
        offset: 0,
      });

      let synced = 0;
      for (const project of projects) {
        const workspaces = await ctx.projects.listWorkspaces(
          project.id,
          companyId,
        );
        for (const ws of workspaces) {
          const result = await syncWorkspace(ctx, ws, companyId, project.id);
          if (result) synced++;
        }
      }

      return { ok: true, synced };
    });

    ctx.actions.register(ACTION_KEYS.UPDATE_CONFIG, async (params) => {
      const autoSyncEnabled = params?.autoSyncEnabled as boolean | undefined;
      const syncIntervalSeconds = params?.syncIntervalSeconds as number | undefined;

      // Read current config from state
      const current = (await ctx.state.get({
        scopeKind: "instance",
        stateKey: "gsd-config",
      })) as GsdConfig | null;

      const updated: GsdConfig = {
        ...DEFAULT_CONFIG,
        ...current,
        ...(autoSyncEnabled !== undefined ? { autoSyncEnabled } : {}),
        ...(syncIntervalSeconds !== undefined ? { syncIntervalSeconds } : {}),
      };

      await ctx.state.set(
        { scopeKind: "instance", stateKey: "gsd-config" },
        updated,
      );

      // Restart timer with new config
      startPeriodicSync(ctx, updated);

      return { ok: true, config: updated };
    });

    ctx.actions.register(ACTION_KEYS.LINK_PHASE, async (params) => {
      const projectId = params?.projectId as string;
      const phaseNumber = params?.phaseNumber as string;
      const issueId = params?.issueId as string;
      if (!projectId || !phaseNumber || !issueId) {
        return {
          ok: false,
          error: "projectId, phaseNumber, and issueId required",
        };
      }

      const state = (await ctx.state.get({
        scopeKind: "project",
        scopeId: projectId,
        stateKey: "gsd",
      })) as GsdPluginState | null;

      if (!state) {
        return { ok: false, error: "No GSD state found for project" };
      }

      state.phaseIssueLinks[phaseNumber] = issueId;
      await ctx.state.set(
        { scopeKind: "project", scopeId: projectId, stateKey: "gsd" },
        state,
      );

      return { ok: true };
    });
  },

  async onConfigChanged(newConfig) {
    if (storedCtx) {
      const config: GsdConfig = { ...DEFAULT_CONFIG, ...(newConfig as GsdConfig) };
      startPeriodicSync(storedCtx, config);
    }
  },

  async onShutdown() {
    stopPeriodicSync();
  },
});

export default plugin;

// Worker entrypoint
runWorker(plugin, import.meta.url);
