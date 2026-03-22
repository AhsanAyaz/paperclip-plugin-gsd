import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseGsdDirectory,
  parseStateFrontmatter,
} from "../src/gsd-parser.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");

describe("parseGsdDirectory", () => {
  it("parses a complete .planning/ directory", async () => {
    const result = await parseGsdDirectory(FIXTURES_DIR);
    expect(result).not.toBeNull();

    // Project
    expect(result!.project).not.toBeNull();
    expect(result!.project!.name).toBe("Test Project");
    expect(result!.project!.description).toContain("test project");
    expect(result!.project!.currentMilestone).toBe("v1.0");

    // Roadmap
    expect(result!.roadmap).not.toBeNull();
    expect(result!.roadmap!.phases).toHaveLength(2);
    expect(result!.roadmap!.phases[0].number).toBe("1");
    expect(result!.roadmap!.phases[0].name).toBe("Foundation");
    expect(result!.roadmap!.phases[0].completed).toBe(true);
    expect(result!.roadmap!.phases[1].number).toBe("2");
    expect(result!.roadmap!.phases[1].name).toBe("API Layer");
    expect(result!.roadmap!.phases[1].completed).toBe(false);

    // Phases
    expect(result!.phases).toHaveLength(2);

    const phase1 = result!.phases[0];
    expect(phase1.number).toBe("01");
    expect(phase1.slug).toBe("foundation");
    expect(phase1.plans).toHaveLength(1);
    expect(phase1.plans[0].status).toBe("complete"); // has SUMMARY
    expect(phase1.computedStatus).toBe("complete"); // all plans done
    expect(phase1.hasContext).toBe(false);
    expect(phase1.hasResearch).toBe(false);
    expect(phase1.hasVerification).toBe(false);
    expect(phase1.hasUat).toBe(false);
    expect(phase1.hasContinueHere).toBe(false);

    const phase2 = result!.phases[1];
    expect(phase2.number).toBe("02");
    expect(phase2.slug).toBe("api-layer");
    expect(phase2.plans).toHaveLength(2);
    expect(phase2.plans[0].status).toBe("complete"); // 02-01 has SUMMARY
    expect(phase2.plans[1].status).toBe("pending"); // 02-02 has no SUMMARY
    expect(phase2.computedStatus).toBe("executing"); // some plans done, some pending

    // Config
    expect(result!.config).not.toBeNull();
    expect(result!.config!.mode).toBe("yolo");
    expect(result!.config!.parallelization).toBe(true);
    expect(result!.config!.modelProfile).toBe("balanced");
  });

  it("returns null for a directory without .planning/", async () => {
    const result = await parseGsdDirectory("/tmp/nonexistent-dir-12345");
    expect(result).toBeNull();
  });

  it("parses plan objectives from <objective> tags", async () => {
    const result = await parseGsdDirectory(FIXTURES_DIR);
    expect(result!.phases[0].plans[0].objective).toBe(
      "Set up the authentication system with session management.",
    );
    expect(result!.phases[1].plans[0].objective).toBe(
      "Build CRUD endpoints for the user resource.",
    );
  });

  it("parses plan frontmatter fields", async () => {
    const result = await parseGsdDirectory(FIXTURES_DIR);
    const plan1 = result!.phases[0].plans[0];
    expect(plan1.wave).toBe(1);
    expect(plan1.autonomous).toBe(true);
    expect(plan1.requirements).toEqual(["REQ-001"]);

    const plan2 = result!.phases[1].plans[1];
    expect(plan2.wave).toBe(2);
  });
});

describe("parseStateFrontmatter", () => {
  it("parses STATE.md frontmatter", async () => {
    const state = await parseStateFrontmatter(FIXTURES_DIR);
    expect(state).not.toBeNull();
    expect(state!.milestone).toBe("v1.0");
    expect(state!.currentPhase).toBe("2");
    expect(state!.currentPhaseName).toBe("API Layer");
    expect(state!.status).toBe("executing");
    expect(state!.progress.totalPhases).toBe(2);
    expect(state!.progress.completedPhases).toBe(1);
    expect(state!.progress.percent).toBe(80);
  });

  it("returns null when no STATE.md", async () => {
    const state = await parseStateFrontmatter("/tmp/nonexistent-dir-12345");
    expect(state).toBeNull();
  });
});
