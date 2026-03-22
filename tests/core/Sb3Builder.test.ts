import { describe, it, expect } from "vitest";
import { generateScratchProject } from "../../src/core/ScratchScriptGenerator";

describe("generateScratchProject", () => {
  it("produces a project with two targets", () => {
    const project = generateScratchProject([], "abc123");
    expect(project.targets).toHaveLength(2);
  });

  it("stage target is first", () => {
    const project = generateScratchProject([], "abc123");
    expect(project.targets[0].isStage).toBe(true);
  });

  it("sprite target has FontChar name", () => {
    const project = generateScratchProject([], "abc123");
    expect(project.targets[1].name).toBe("FontChar");
  });

  it("includes costumes in sprite", () => {
    const costumes = [
      {
        assetId: "test123",
        name: "A",
        md5ext: "test123.png",
        dataFormat: "png",
        rotationCenterX: 0,
        rotationCenterY: 0,
      },
    ];
    const project = generateScratchProject(costumes, "abc123");
    expect(project.targets[1].costumes).toHaveLength(1);
    expect(project.targets[1].costumes[0].name).toBe("A");
  });

  it("includes meta", () => {
    const project = generateScratchProject([], "abc123");
    expect(project.meta).toBeDefined();
  });
});
