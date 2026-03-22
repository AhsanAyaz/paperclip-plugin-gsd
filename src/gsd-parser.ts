import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  GsdConfig,
  GsdPhase,
  GsdPlan,
  GsdProject,
  GsdRoadmap,
  GsdRoadmapPhase,
  GsdState,
  GsdStateFrontmatter,
} from "./gsd-types.js";

/**
 * Parse a GSD .planning/ directory into structured data.
 * Handles missing files gracefully — a workspace may not have GSD initialized.
 */
export async function parseGsdDirectory(
  workspaceCwd: string,
): Promise<GsdState | null> {
  const planningDir = path.join(workspaceCwd, ".planning");

  if (!(await exists(planningDir))) {
    return null;
  }

  const [project, roadmap, phases, config] = await Promise.all([
    parseProject(planningDir),
    parseRoadmap(planningDir),
    parsePhases(planningDir),
    parseConfig(planningDir),
  ]);

  return { project, roadmap, phases, config };
}

/**
 * Parse STATE.md frontmatter for current execution state.
 */
export async function parseStateFrontmatter(
  workspaceCwd: string,
): Promise<GsdStateFrontmatter | null> {
  const statePath = path.join(workspaceCwd, ".planning", "STATE.md");
  const content = await readFileOrNull(statePath);
  if (!content) return null;

  const frontmatter = extractFrontmatter(content);
  if (!frontmatter) return null;

  const progress = frontmatter.progress as Record<string, unknown> | undefined;

  return {
    milestone: String(frontmatter.milestone ?? ""),
    currentPhase: String(frontmatter.current_phase ?? ""),
    currentPhaseName: String(frontmatter.current_phase_name ?? ""),
    currentPlan: String(frontmatter.current_plan ?? ""),
    status: String(frontmatter.status ?? "unknown"),
    progress: {
      totalPhases: Number(progress?.total_phases ?? 0),
      completedPhases: Number(progress?.completed_phases ?? 0),
      totalPlans: Number(progress?.total_plans ?? 0),
      completedPlans: Number(progress?.completed_plans ?? 0),
      percent: Number(progress?.percent ?? 0),
    },
    lastUpdated: String(frontmatter.last_updated ?? ""),
  };
}

// --- Internal parsers ---

async function parseProject(
  planningDir: string,
): Promise<GsdProject | null> {
  const content = await readFileOrNull(
    path.join(planningDir, "PROJECT.md"),
  );
  if (!content) return null;

  const name = extractFirstHeading(content) ?? "Unknown Project";
  const description = extractSection(content, "What This Is") ?? "";
  const milestoneMatch = content.match(
    /##\s+Current Milestone:\s*(.+)/i,
  );
  const currentMilestone = milestoneMatch?.[1]?.trim() ?? "";

  return { name, description, currentMilestone };
}

async function parseRoadmap(
  planningDir: string,
): Promise<GsdRoadmap | null> {
  const content = await readFileOrNull(
    path.join(planningDir, "ROADMAP.md"),
  );
  if (!content) return null;

  const phases: GsdRoadmapPhase[] = [];

  // Match checkbox phase lines: - [x] Phase 1: Name or - [ ] Phase 2: Name
  // Name ends at first ( or — or end of line
  const phaseLineRegex =
    /^-\s+\[(x| )\]\s+Phase\s+(\S+?):\s+(.+?)(?:\s+[\(\u2014].*)?$/gim;
  let match: RegExpExecArray | null;
  while ((match = phaseLineRegex.exec(content)) !== null) {
    phases.push({
      number: match[2],
      name: match[3].trim(),
      completed: match[1].toLowerCase() === "x",
      milestone: null,
    });
  }

  // If no checkbox format, try the progress table format
  if (phases.length === 0) {
    const tableRegex =
      /^\|\s*(\d+\S*)\.\s+(.+?)\s*\|\s*(\S+)\s*\|.*?\|\s*(Complete|In Progress|Pending|Planned)\s*\|/gim;
    while ((match = tableRegex.exec(content)) !== null) {
      phases.push({
        number: match[1],
        name: match[2].trim(),
        completed:
          match[4].toLowerCase() === "complete",
        milestone: match[3].trim(),
      });
    }
  }

  // Try ### Phase N: Name headers as fallback
  if (phases.length === 0) {
    const headerRegex = /^###\s+Phase\s+(\S+?):\s+(.+)$/gim;
    while ((match = headerRegex.exec(content)) !== null) {
      phases.push({
        number: match[1],
        name: match[2].trim(),
        completed: false,
        milestone: null,
      });
    }
  }

  return phases.length > 0 ? { phases } : null;
}

async function parsePhases(planningDir: string): Promise<GsdPhase[]> {
  const phasesDir = path.join(planningDir, "phases");
  if (!(await exists(phasesDir))) return [];

  const entries = await fs.readdir(phasesDir, { withFileTypes: true });
  const phaseDirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));

  const phases: GsdPhase[] = [];

  for (const dir of phaseDirs) {
    const phaseMatch = dir.name.match(/^(\d+(?:[A-Za-z])?(?:\.\d+)?)-(.+)$/);
    if (!phaseMatch) continue;

    const phaseNumber = phaseMatch[1];
    const slug = phaseMatch[2];
    const phaseDir = path.join(phasesDir, dir.name);

    const files = await fs.readdir(phaseDir);

    const plans: GsdPlan[] = [];
    const planFiles = files
      .filter((f) => f.match(/^\d+-\d+-PLAN\.md$/))
      .sort();

    for (const planFile of planFiles) {
      const planMatch = planFile.match(/^(\d+)-(\d+)-PLAN\.md$/);
      if (!planMatch) continue;

      const planContent = await readFileOrNull(
        path.join(phaseDir, planFile),
      );
      const summaryFile = planFile.replace("-PLAN.md", "-SUMMARY.md");
      const hasSummary = files.includes(summaryFile);

      const frontmatter = planContent
        ? extractFrontmatter(planContent)
        : null;

      // Extract objective from <objective> tag
      const objectiveMatch = planContent?.match(
        /<objective>\s*([\s\S]*?)\s*<\/objective>/i,
      );

      plans.push({
        phaseNumber: planMatch[1],
        planNumber: planMatch[2],
        fileName: planFile,
        status: hasSummary ? "complete" : "pending",
        objective: objectiveMatch?.[1]?.trim() ?? null,
        wave: frontmatter?.wave != null ? Number(frontmatter.wave) : null,
        autonomous: frontmatter?.autonomous !== false,
        requirements: Array.isArray(frontmatter?.requirements)
          ? (frontmatter.requirements as string[])
          : [],
      });
    }

    // Detect additional GSD artifacts
    const hasResearch = files.some((f) => f.match(/^\d+-RESEARCH\.md$/));
    const hasContext = files.some((f) => f.match(/^\d+-CONTEXT\.md$/));
    const hasVerification = files.some((f) => f.match(/^\d+-VERIFICATION\.md$/));
    const hasUat = files.some((f) => f.match(/^\d+-UAT\.md$/));
    const hasContinueHere = files.includes(".continue-here.md");

    // Parse verification status if present
    let verificationStatus: GsdPhase["verificationStatus"] = null;
    if (hasVerification) {
      const verFile = files.find((f) => f.match(/^\d+-VERIFICATION\.md$/));
      if (verFile) {
        const verContent = await readFileOrNull(path.join(phaseDir, verFile));
        if (verContent) {
          const verFm = extractFrontmatter(verContent);
          const s = String(verFm?.status ?? "");
          if (s === "passed" || s === "gaps_found" || s === "human_needed") {
            verificationStatus = s;
          }
        }
      }
    }

    // Parse UAT status if present
    let uatStatus: GsdPhase["uatStatus"] = null;
    if (hasUat) {
      const uatFile = files.find((f) => f.match(/^\d+-UAT\.md$/));
      if (uatFile) {
        const uatContent = await readFileOrNull(path.join(phaseDir, uatFile));
        if (uatContent) {
          const uatFm = extractFrontmatter(uatContent);
          const s = String(uatFm?.status ?? "");
          if (s === "testing" || s === "complete" || s === "diagnosed") {
            uatStatus = s;
          }
        }
      }
    }

    // Compute phase status from file state
    const totalPlans = plans.length;
    const completedPlans = plans.filter((p) => p.status === "complete").length;
    let computedStatus: GsdPhase["computedStatus"];

    if (totalPlans > 0 && completedPlans === totalPlans) {
      // All plans done — determine final status from verification/UAT
      if (uatStatus === "diagnosed") {
        computedStatus = "diagnosed";
      } else if (verificationStatus === "gaps_found" || verificationStatus === "human_needed") {
        computedStatus = "verifying";
      } else {
        // No verification, or verification passed, or UAT complete/testing — phase is done
        computedStatus = "complete";
      }
    } else if (totalPlans > 0 && completedPlans > 0) {
      computedStatus = "executing";
    } else if (totalPlans > 0) {
      // Plans exist but none executed — "planned" (ready to execute)
      computedStatus = "planned";
    } else if (hasResearch || hasContext) {
      computedStatus = hasResearch ? "researching" : "context";
    } else {
      computedStatus = "not-started";
    }

    phases.push({
      number: phaseNumber,
      slug,
      dirName: dir.name,
      plans,
      hasResearch,
      hasContext,
      hasVerification,
      hasUat,
      hasContinueHere,
      verificationStatus,
      uatStatus,
      computedStatus,
    });
  }

  return phases;
}

async function parseConfig(
  planningDir: string,
): Promise<GsdConfig | null> {
  const configPath = path.join(planningDir, "config.json");
  const content = await readFileOrNull(configPath);
  if (!content) return null;

  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    return {
      mode: String(raw.mode ?? "iterative"),
      depth: String(raw.depth ?? "standard"),
      parallelization: Boolean(raw.parallelization ?? false),
      modelProfile: String(raw.model_profile ?? "balanced"),
    };
  } catch {
    return null;
  }
}

// --- Utilities ---

function extractFrontmatter(
  content: string,
): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const raw = match[1];
  const result: Record<string, unknown> = {};

  // Simple YAML parser for flat and one-level nested keys
  const lines = raw.split("\n");
  let currentKey: string | null = null;
  let currentObj: Record<string, unknown> | null = null;

  for (const line of lines) {
    // Nested key (indented)
    const nestedMatch = line.match(/^  (\w[\w_]*)\s*:\s*(.*)$/);
    if (nestedMatch && currentKey) {
      if (!currentObj) {
        currentObj = {};
        result[currentKey] = currentObj;
      }
      const val = nestedMatch[2].trim();
      currentObj[nestedMatch[1]] = parseYamlValue(val);
      continue;
    }

    // Top-level key
    const topMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (topMatch) {
      currentKey = topMatch[1];
      const val = topMatch[2].trim();
      if (val === "" || val === "|") {
        // Potential nested object or multiline
        currentObj = null;
      } else {
        result[currentKey] = parseYamlValue(val);
        currentObj = null;
      }
      continue;
    }

    // Array item under current key
    const arrayMatch = line.match(/^\s+-\s+(.+)$/);
    if (arrayMatch && currentKey) {
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = [];
      }
      (result[currentKey] as unknown[]).push(
        parseYamlValue(arrayMatch[1].trim()),
      );
    }
  }

  return result;
}

function parseYamlValue(val: string): unknown {
  if (val === "true") return true;
  if (val === "false") return false;
  if (val === "null" || val === "~") return null;
  // Remove surrounding quotes
  if (
    (val.startsWith("'") && val.endsWith("'")) ||
    (val.startsWith('"') && val.endsWith('"'))
  ) {
    return val.slice(1, -1);
  }
  const num = Number(val);
  if (!Number.isNaN(num) && val !== "") return num;
  return val;
}

function extractFirstHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function extractSection(
  content: string,
  heading: string,
): string | null {
  const regex = new RegExp(
    `^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`,
    "im",
  );
  const match = content.match(regex);
  return match?.[1]?.trim() ?? null;
}

async function readFileOrNull(
  filePath: string,
): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
