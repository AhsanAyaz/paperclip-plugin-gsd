/** Parsed state from a GSD .planning/ directory */
export interface GsdState {
  project: GsdProject | null;
  roadmap: GsdRoadmap | null;
  phases: GsdPhase[];
  config: GsdConfig | null;
}

export interface GsdProject {
  name: string;
  description: string;
  currentMilestone: string;
}

export interface GsdRoadmap {
  phases: GsdRoadmapPhase[];
}

export interface GsdRoadmapPhase {
  number: string;
  name: string;
  completed: boolean;
  milestone: string | null;
}

export type GsdPhaseStatus =
  | "not-started"    // In roadmap but no phase directory
  | "context"        // CONTEXT.md exists, no RESEARCH or PLANs
  | "researching"    // RESEARCH.md exists, no PLANs
  | "planned"        // PLANs exist, none executed yet
  | "executing"      // Some plans have SUMMARY.md
  | "verifying"      // All plans complete, VERIFICATION.md exists
  | "complete"       // All plans complete, roadmap marked [x]
  | "diagnosed"      // UAT found gaps

export interface GsdPhase {
  number: string;
  slug: string;
  dirName: string;
  plans: GsdPlan[];
  hasResearch: boolean;
  hasContext: boolean;
  hasVerification: boolean;
  hasUat: boolean;
  hasContinueHere: boolean;
  verificationStatus: "passed" | "gaps_found" | "human_needed" | null;
  uatStatus: "testing" | "complete" | "diagnosed" | null;
  /** Computed phase status based on file analysis */
  computedStatus: GsdPhaseStatus;
}

export interface GsdPlan {
  phaseNumber: string;
  planNumber: string;
  fileName: string;
  status: "pending" | "complete";
  objective: string | null;
  wave: number | null;
  autonomous: boolean;
  requirements: string[];
}

export interface GsdConfig {
  mode: string;
  depth: string;
  parallelization: boolean;
  modelProfile: string;
}

export interface GsdStateFrontmatter {
  milestone: string;
  currentPhase: string;
  currentPhaseName: string;
  currentPlan: string;
  status: string;
  progress: {
    totalPhases: number;
    completedPhases: number;
    totalPlans: number;
    completedPlans: number;
    percent: number;
  };
  lastUpdated: string;
}

/** Plugin state stored per project workspace */
export interface GsdPluginState {
  schemaVersion: 1;
  lastSyncAt: string;
  state: GsdStateFrontmatter | null;
  roadmap: GsdRoadmap | null;
  phases: GsdPhase[];
  phaseIssueLinks: Record<string, string>;
}

/** Adapter compatibility level */
export type AdapterCompat = "supported" | "partial" | "unsupported";

/** Summary for UI display */
export interface GsdProjectSummary {
  projectId: string;
  projectName: string;
  milestone: string | null;
  status: string | null;
  totalPhases: number;
  completedPhases: number;
  percent: number;
  lastSyncAt: string | null;
}
