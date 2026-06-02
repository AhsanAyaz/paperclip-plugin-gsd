import { useState } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginDetailTabProps,
  type PluginPageProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import type {
  GsdPhase,
  GsdPluginState,
  GsdProjectSummary,
} from "../gsd-types.js";

// --- Styles ---

const card: React.CSSProperties = {
  border: "1px solid var(--border-secondary, #374151)",
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  background: "var(--bg-secondary, #1f2937)",
};

const badge = (
  color: string,
): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#fff",
  background: color,
});

const progressBar: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  background: "var(--border-secondary, #374151)",
  overflow: "hidden",
  marginTop: 4,
};

const progressFill = (pct: number): React.CSSProperties => ({
  height: "100%",
  width: `${pct}%`,
  background: pct === 100 ? "#22c55e" : "#3b82f6",
  borderRadius: 4,
  transition: "width 0.3s ease",
});

const muted: React.CSSProperties = {
  color: "var(--text-tertiary, #9ca3af)",
  fontSize: 13,
};

const heading: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  marginBottom: 8,
};

const emptyState: React.CSSProperties = {
  textAlign: "center" as const,
  padding: 32,
  color: "var(--text-tertiary, #9ca3af)",
};

// --- Status helpers ---

function phaseStatusColor(phase: GsdPhase, isCurrent = false): string {
  const status = phase.computedStatus;
  if (isCurrent) return "#3b82f6";
  switch (status) {
    case "complete": return "#22c55e";
    case "verifying": return "#22c55e";
    case "executing": return "#f59e0b";
    case "planned": return "#8b5cf6";
    case "researching": return "#6366f1";
    case "context": return "#6366f1";
    case "diagnosed": return "#ef4444";
    case "not-started":
    default: return "#94a3b8";
  }
}

function phaseStatusLabel(phase: GsdPhase, isCurrent = false): string {
  // Current phase in STATE.md means GSD is actively working on it —
  // even if all SUMMARY.md exist, verification/UAT may still be running
  if (isCurrent) {
    const status = phase.computedStatus;
    if (status === "researching" || status === "context") return "Researching";
    if (status === "planned") return "Ready to Execute";
    if (status === "diagnosed") return "Gaps Found";
    if (status === "verifying") return "Verifying";
    // All plans done but still current phase → verification/UAT in progress
    if (status === "complete") return "Finishing";
    return "Executing";
  }
  switch (phase.computedStatus) {
    case "complete": return "Complete";
    case "verifying": return "Verifying";
    case "diagnosed": return "Gaps Found";
    case "executing": return "In Progress";
    case "planned": return "Planned";
    case "researching": return "Researched";
    case "context": return "Context Gathered";
    case "not-started":
    default: return "Not Started";
  }
}

// --- Dashboard Widget ---

export function GsdDashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading } = usePluginData<{
    projects: GsdProjectSummary[];
  }>("gsd-overview", { companyId: context.companyId });

  if (loading) return <div style={muted}>Loading GSD status...</div>;

  const projects = data?.projects ?? [];

  if (projects.length === 0) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>No GSD projects</div>
        <div>GSD state will appear here after agents run with GSD enabled.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={heading}>GSD Progress</div>
      {projects.map((p) => (
        <div key={p.projectId} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <strong>{p.projectName}</strong>
            {p.milestone && (
              <span style={badge("#6366f1")}>{p.milestone}</span>
            )}
          </div>
          <div style={muted}>
            {p.completedPhases}/{p.totalPhases} phases \u2022 {p.percent}%
          </div>
          <div style={progressBar}>
            <div style={progressFill(p.percent)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Project Detail Tab ---

export function GsdProjectTab({ context }: PluginDetailTabProps) {
  const projectId = context.entityId;
  const { data, loading, refresh } = usePluginData<GsdPluginState | null>(
    "gsd-project-detail",
    { projectId, companyId: context.companyId },
  );
  const syncProject = usePluginAction("sync-project");
  const toast = usePluginToast();

  const handleSync = async () => {
    await syncProject({ projectId, companyId: context.companyId });
    refresh();
    toast({ title: "GSD synced", tone: "success" });
  };

  if (loading) return <div style={muted}>Loading GSD state...</div>;

  if (!data || data.phases.length === 0) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: 20, marginBottom: 8 }}>
          No GSD data found
        </div>
        <div style={{ marginBottom: 16 }}>
          GSD state will appear here once an agent runs with GSD enabled in
          this project's workspace.
        </div>
        <button onClick={handleSync} style={syncButtonStyle}>
          Sync GSD
        </button>
      </div>
    );
  }

  const state = data.state;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div>
          <div style={heading}>
            GSD Roadmap
            {state?.milestone && (
              <span style={{ ...badge("#6366f1"), marginLeft: 8 }}>
                {state.milestone}
              </span>
            )}
          </div>
          {state && (
            <div style={muted}>
              Phase {state.currentPhase}: {state.currentPhaseName} \u2022{" "}
              {state.status} \u2022 {state.progress.percent}% overall
            </div>
          )}
        </div>
        <button onClick={handleSync} style={syncButtonStyle}>
          Sync GSD
        </button>
      </div>

      {/* Overall progress */}
      {state && (
        <div style={{ marginBottom: 16 }}>
          <div style={progressBar}>
            <div style={progressFill(state.progress.percent)} />
          </div>
          <div style={{ ...muted, marginTop: 4 }}>
            {state.progress.completedPhases}/{state.progress.totalPhases}{" "}
            phases \u2022 {state.progress.completedPlans}/
            {state.progress.totalPlans} plans
          </div>
        </div>
      )}

      {/* Phase list */}
      {data.phases.map((phase) => (
        <PhaseCard
          key={phase.number}
          phase={phase}
          linkedIssueId={data.phaseIssueLinks[phase.number] ?? null}
          isCurrent={state?.currentPhase === phase.number}
        />
      ))}

      {/* Last sync */}
      {data.lastSyncAt && (
        <div style={{ ...muted, marginTop: 16 }}>
          Last synced: {new Date(data.lastSyncAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function PhaseCard({
  phase,
  linkedIssueId,
  isCurrent,
}: {
  phase: GsdPhase;
  linkedIssueId: string | null;
  isCurrent: boolean;
}) {
  const total = phase.plans.length;
  const done = phase.plans.filter((p) => p.status === "complete").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      style={{
        ...card,
        borderLeft: isCurrent
          ? "3px solid #3b82f6"
          : "1px solid var(--border-secondary, #374151)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ fontWeight: 600 }}>
            Phase {phase.number}:{" "}
          </span>
          <span>{phase.slug.replace(/-/g, " ")}</span>
          {isCurrent && (
            <span
              style={{ ...badge("#3b82f6"), marginLeft: 8, fontSize: 11 }}
            >
              CURRENT
            </span>
          )}
        </div>
        <span style={badge(phaseStatusColor(phase, isCurrent))}>
          {phaseStatusLabel(phase, isCurrent)}
        </span>
      </div>

      {total > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={progressBar}>
            <div style={progressFill(pct)} />
          </div>
          <div style={{ ...muted, marginTop: 2 }}>
            {done}/{total} plans
          </div>
        </div>
      )}

      {/* Phase artifacts */}
      <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {phase.hasContext && (
          <span style={artifactBadge}>Context</span>
        )}
        {phase.hasResearch && (
          <span style={artifactBadge}>Research</span>
        )}
        {phase.hasVerification && (
          <span style={{
            ...artifactBadge,
            color: phase.verificationStatus === "passed" ? "#22c55e"
              : phase.verificationStatus === "gaps_found" ? "#ef4444"
              : "#f59e0b",
          }}>
            {phase.verificationStatus === "passed" ? "Verified"
              : phase.verificationStatus === "gaps_found" ? "Gaps Found"
              : phase.verificationStatus === "human_needed" ? "Needs Review"
              : "Verified"}
          </span>
        )}
        {phase.hasUat && (
          <span style={{
            ...artifactBadge,
            color: phase.uatStatus === "complete" ? "#22c55e"
              : phase.uatStatus === "diagnosed" ? "#ef4444"
              : "#f59e0b",
          }}>
            UAT {phase.uatStatus === "complete" ? "Passed"
              : phase.uatStatus === "diagnosed" ? "Diagnosed"
              : "Testing"}
          </span>
        )}
        {phase.hasContinueHere && (
          <span style={{ ...artifactBadge, color: "#f59e0b" }}>Paused</span>
        )}
      </div>

      {!linkedIssueId && (
        <div style={{ ...muted, marginTop: 4, fontStyle: "italic" }}>
          Not linked to an issue
        </div>
      )}
    </div>
  );
}

// --- Issue Detail Tab ---

export function GsdIssueTab({ context }: PluginDetailTabProps) {
  const { data, loading } = usePluginData<{
    linked: boolean;
    phase: GsdPhase | null;
    state: { currentPhase: string; status: string } | null;
  } | null>("gsd-issue-phase", {
    issueId: context.entityId,
    projectId: context.projectId ?? context.parentEntityId,
    companyId: context.companyId,
  });

  if (loading) return <div style={muted}>Loading...</div>;
  if (!data || !data.linked) {
    return (
      <div style={emptyState}>
        <div style={{ fontSize: 18, marginBottom: 8 }}>
          No GSD phase linked
        </div>
        <div>
          Link this issue to a GSD phase from the project's GSD tab.
        </div>
      </div>
    );
  }

  if (!data.phase) {
    return <div style={muted}>Linked phase not found in current GSD state.</div>;
  }

  const phase = data.phase;
  const total = phase.plans.length;
  const done = phase.plans.filter((p) => p.status === "complete").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div style={heading}>
        Phase {phase.number}: {phase.slug.replace(/-/g, " ")}
      </div>
      <div style={{ marginBottom: 12 }}>
        <span style={badge(phaseStatusColor(phase))}>
          {phaseStatusLabel(phase)}
        </span>
        {phase.hasVerification && (
          <span style={{ ...badge("#22c55e"), marginLeft: 8 }}>
            Verified
          </span>
        )}
      </div>

      {total > 0 && (
        <>
          <div style={progressBar}>
            <div style={progressFill(pct)} />
          </div>
          <div style={{ ...muted, marginTop: 4, marginBottom: 12 }}>
            {done}/{total} plans complete ({pct}%)
          </div>

          {/* Plan list */}
          {phase.plans.map((plan) => (
            <div
              key={`${plan.phaseNumber}-${plan.planNumber}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
                borderBottom:
                  "1px solid var(--border-secondary, #f1f5f9)",
              }}
            >
              <span style={{ fontSize: 14 }}>
                {plan.status === "complete" ? "\u2705" : "\u2B1C"}
              </span>
              <span>
                Plan {plan.planNumber}
                {plan.objective && (
                  <span style={muted}> \u2014 {plan.objective.slice(0, 80)}{plan.objective.length > 80 ? "..." : ""}</span>
                )}
              </span>
              {plan.wave != null && (
                <span style={{ ...muted, fontSize: 11 }}>
                  wave {plan.wave}
                </span>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// --- Sync Toolbar Button ---

export function GsdSyncButton({ context }: PluginDetailTabProps) {
  const syncProject = usePluginAction("sync-project");
  const toast = usePluginToast();

  const handleSync = async () => {
    await syncProject({
      projectId: context.entityId,
      companyId: context.companyId,
    });
    toast({ title: "GSD synced", tone: "success" });
  };

  return (
    <button onClick={handleSync} style={syncButtonStyle}>
      Sync GSD
    </button>
  );
}

// --- Settings Page ---

export function GsdSettingsPage({ context }: PluginPageProps) {
  const { data: compatData, loading: compatLoading } = usePluginData<{
    agents: Array<{
      agentId: string;
      agentName: string;
      adapterType: string;
      compatibility: string;
      message: string;
    }>;
  }>("gsd-adapter-compat", { companyId: context.companyId });
  const { data: configData, loading: configLoading, refresh: refreshConfig } = usePluginData<{
    autoSyncEnabled: boolean;
    syncIntervalSeconds: number;
  }>("gsd-config", {});
  const syncAll = usePluginAction("sync-all");
  const updateConfig = usePluginAction("update-config");
  const toast = usePluginToast();

  const [autoSync, setAutoSync] = useState<boolean | null>(null);
  const [interval, setInterval] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Use local state if set, otherwise fall back to server data
  const currentAutoSync = autoSync ?? configData?.autoSyncEnabled ?? true;
  const currentInterval = interval || String(configData?.syncIntervalSeconds ?? 30);

  const handleSyncAll = async () => {
    const result = (await syncAll({
      companyId: context.companyId,
    })) as { ok: boolean; synced: number } | undefined;
    toast({
      title: `Synced ${result?.synced ?? 0} workspace(s)`,
      tone: "success",
    });
  };

  const handleSaveConfig = async () => {
    const parsedInterval = Math.max(10, Math.min(600, Number(currentInterval) || 30));
    setSaving(true);
    try {
      await updateConfig({
        autoSyncEnabled: currentAutoSync,
        syncIntervalSeconds: parsedInterval,
      });
      refreshConfig();
      setAutoSync(null);
      setInterval("");
      toast({ title: "Settings saved", tone: "success" });
    } catch {
      toast({ title: "Failed to save settings", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    autoSync !== null ||
    (interval !== "" && Number(interval) !== configData?.syncIntervalSeconds);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={heading}>GSD Settings</div>

      {/* Auto-sync configuration */}
      <div style={{ ...card, marginBottom: 24 }}>
        <div style={{ ...heading, marginBottom: 12 }}>Auto-Sync</div>

        {configLoading ? (
          <div style={muted}>Loading configuration...</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={currentAutoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                <span>Enable periodic sync</span>
              </label>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4 }}>
                <span style={muted}>Sync interval (seconds, 10\u2013600)</span>
              </label>
              <input
                type="number"
                min={10}
                max={600}
                value={currentInterval}
                onChange={(e) => setInterval(e.target.value)}
                disabled={!currentAutoSync}
                style={{
                  ...inputStyle,
                  opacity: currentAutoSync ? 1 : 0.5,
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSaveConfig}
                disabled={saving || !hasChanges}
                style={{
                  ...syncButtonStyle,
                  opacity: saving || !hasChanges ? 0.5 : 1,
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={handleSyncAll} style={syncButtonStyle}>
                Sync All Projects
              </button>
            </div>
          </>
        )}
      </div>

      {/* Agent compatibility */}
      <div style={heading}>Agent Compatibility</div>
      {compatLoading && <div style={muted}>Loading...</div>}

      {compatData?.agents.map((agent) => (
        <div key={agent.agentId} style={card}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <strong>{agent.agentName}</strong>
            <span
              style={badge(
                agent.compatibility === "supported"
                  ? "#22c55e"
                  : agent.compatibility === "partial"
                    ? "#f59e0b"
                    : "#ef4444",
              )}
            >
              {agent.compatibility}
            </span>
          </div>
          <div style={{ ...muted, marginTop: 4 }}>
            {agent.adapterType} — {agent.message}
          </div>
        </div>
      ))}

      {!compatLoading && (!compatData?.agents || compatData.agents.length === 0) && (
        <div style={muted}>No agents found for this company.</div>
      )}
    </div>
  );
}

// --- Shared styles ---

const artifactBadge: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-tertiary, #9ca3af)",
  border: "1px solid var(--border-secondary, #374151)",
  borderRadius: 4,
  padding: "1px 6px",
};

const syncButtonStyle: React.CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "1px solid var(--border-secondary, #374151)",
  background: "var(--bg-secondary, #1f2937)",
  color: "var(--text-primary, #e5e7eb)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid var(--border-secondary, #374151)",
  background: "var(--bg-primary, #111827)",
  color: "var(--text-primary, #e5e7eb)",
  fontSize: 13,
  width: 120,
};
