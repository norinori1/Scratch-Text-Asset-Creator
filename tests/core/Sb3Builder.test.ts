import { describe, it, expect } from "vitest";
import { generateScratchProject } from "../../src/core/ScratchScriptGenerator";
import type { ExportOptions } from "../../src/types";

const defaultOptions: ExportOptions = {
  outputFormat: "svg",
  warp: true,
  renderMode: "clone",
  align: "left",
  letterSpacing: 0,
};

describe("generateScratchProject", () => {
  it("produces a project with two targets", () => {
    const project = generateScratchProject([], [], "abc123") as { targets: { isStage: boolean; name: string; costumes: { name: string }[] }[]; monitors: unknown[]; extensions: unknown[]; meta: unknown };
    expect(project.targets).toHaveLength(2);
  });

  it("stage target is first", () => {
    const project = generateScratchProject([], [], "abc123") as { targets: { isStage: boolean }[] };
    expect(project.targets[0].isStage).toBe(true);
  });

  it("sprite target has FontChar name", () => {
    const project = generateScratchProject([], [], "abc123") as { targets: { name: string }[] };
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
    const project = generateScratchProject(costumes, [], "abc123") as { targets: { costumes: { name: string }[] }[] };
    expect(project.targets[1].costumes).toHaveLength(1);
    expect(project.targets[1].costumes[0].name).toBe("A");
  });

  it("includes meta", () => {
    const project = generateScratchProject([], [], "abc123") as { meta: unknown };
    expect(project.meta).toBeDefined();
  });

  it("includes monitors and extensions at top level", () => {
    const project = generateScratchProject([], [], "abc123") as { monitors: unknown[]; extensions: unknown[] };
    expect(Array.isArray(project.monitors)).toBe(true);
    expect(Array.isArray(project.extensions)).toBe(true);
  });

  it("stage has __font_displayText variable", () => {
    const project = generateScratchProject([], [], "abc123") as { targets: { variables: Record<string, [string, unknown]> }[] };
    const stageVarNames = Object.values(project.targets[0].variables).map(([name]) => name);
    expect(stageVarNames).toContain("__font_displayText");
  });

  it("pre-populates charMap with glyph data", () => {
    const glyphInfos = [
      { char: "A", advanceWidth: 40 },
      { char: "B", advanceWidth: 42 },
    ];
    const project = generateScratchProject([], glyphInfos, "abc123") as {
      targets: { lists: Record<string, [string, (string | number)[]]> }[]
    };
    const sprite = project.targets[1];
    const charMapEntry = Object.values(sprite.lists).find(([name]) => name === "__font_charMap");
    expect(charMapEntry).toBeDefined();
    const data = charMapEntry![1];
    expect(data).toContain("A");
    expect(data).toContain(40);
    expect(data).toContain("B");
    expect(data).toContain(42);
  });

  it("sprite has render/clear broadcast handlers", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string; fields: Record<string, unknown> }> }[]
    };
    const sprite = project.targets[1];
    const broadcastHandlers = Object.values(sprite.blocks)
      .filter((b) => b.opcode === "event_whenbroadcastreceived")
      .map((b) => (b.fields.BROADCAST_OPTION as [string])[0]);
    expect(broadcastHandlers).toContain("__font_render");
    expect(broadcastHandlers).toContain("__font_clear");
  });

  it("warp is true by default", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string; mutation?: { proccode?: string; warp: string } }> }[]
    };
    const sprite = project.targets[1];
    const proto = Object.values(sprite.blocks).find((b) => b.opcode === "procedures_prototype" && b.mutation?.proccode?.includes("テキストを表示する"));
    expect(proto?.mutation?.warp).toBe("true");
  });

  it("warp is false when specified in options", () => {
    const opts: ExportOptions = { ...defaultOptions, warp: false };
    const project = generateScratchProject([], [], "abc123", opts) as {
      targets: { blocks: Record<string, { opcode: string; mutation?: { proccode?: string; warp: string } }> }[]
    };
    const sprite = project.targets[1];
    const proto = Object.values(sprite.blocks).find((b) => b.opcode === "procedures_prototype" && b.mutation?.proccode?.includes("テキストを表示する"));
    expect(proto?.mutation?.warp).toBe("false");
  });

  it("テキストを表示する custom block has extended parameters including 揃え and 文字間隔", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string; mutation?: { proccode: string } }> }[]
    };
    const sprite = project.targets[1];
    const proto = Object.values(sprite.blocks).find((b) => b.opcode === "procedures_prototype" && b.mutation?.proccode?.includes("テキストを表示する"));
    expect(proto?.mutation?.proccode).toContain("サイズ");
    expect(proto?.mutation?.proccode).toContain("色");
    expect(proto?.mutation?.proccode).toContain("明るさ");
    expect(proto?.mutation?.proccode).toContain("透明度");
    expect(proto?.mutation?.proccode).toContain("レイヤー");
    expect(proto?.mutation?.proccode).toContain("揃え");
    expect(proto?.mutation?.proccode).toContain("文字間隔");
  });

  it("テキストを表示する calls テキストをすべてクリアする via procedures_call (not broadcast)", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string; mutation?: { proccode?: string } }> }[]
    };
    const sprite = project.targets[1];
    const callBlock = Object.values(sprite.blocks).find(
      (b) => b.opcode === "procedures_call" && b.mutation?.proccode === "テキストをすべてクリアする"
    );
    expect(callBlock).toBeDefined();
  });

  it("テキストをすべてクリアする custom block is present", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string; mutation?: { proccode: string } }> }[]
    };
    const sprite = project.targets[1];
    const clearProto = Object.values(sprite.blocks).find(
      (b) => b.opcode === "procedures_prototype" && b.mutation?.proccode === "テキストをすべてクリアする"
    );
    expect(clearProto).toBeDefined();
  });

  it("pen mode: テキストをすべてクリアする body uses pen_eraseAll directly (no __font_clear broadcast)", () => {
    const opts: ExportOptions = { ...defaultOptions, renderMode: "pen" };
    const project = generateScratchProject([], [], "abc123", opts) as {
      targets: { blocks: Record<string, { opcode: string; next: string | null }> }[]
    };
    const sprite = project.targets[1];
    const allDefs = Object.entries(sprite.blocks).filter(([, b]) => b.opcode === "procedures_definition");
    let foundEraseAll = false;
    for (const [, defBlock] of allDefs) {
      if (defBlock.next && sprite.blocks[defBlock.next]?.opcode === "pen_eraseAll") {
        foundEraseAll = true;
        break;
      }
    }
    expect(foundEraseAll).toBe(true);
  });

  it("clone mode: テキストをすべてクリアする body uses broadcast __font_clear and wait", () => {
    const project = generateScratchProject([], [], "abc123", defaultOptions) as {
      targets: { blocks: Record<string, { opcode: string; next: string | null; mutation?: { proccode?: string } }> }[]
    };
    const sprite = project.targets[1];
    const allDefs = Object.entries(sprite.blocks).filter(([, b]) => b.opcode === "procedures_definition");
    let foundBroadcastWait = false;
    for (const [, defBlock] of allDefs) {
      if (defBlock.next && sprite.blocks[defBlock.next]?.opcode === "event_broadcastandwait") {
        foundBroadcastWait = true;
        break;
      }
    }
    expect(foundBroadcastWait).toBe(true);
  });

  it("pen mode adds pen extension", () => {
    const opts: ExportOptions = { ...defaultOptions, renderMode: "pen" };
    const project = generateScratchProject([], [], "abc123", opts) as { extensions: string[] };
    expect(project.extensions).toContain("pen");
  });

  it("clone mode does not add pen extension", () => {
    const project = generateScratchProject([], [], "abc123", defaultOptions) as { extensions: string[] };
    expect(project.extensions).not.toContain("pen");
  });

  it("sprite has size, color, brightness, ghost, layer variables", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { variables: Record<string, [string, string | number]> }[]
    };
    const sprite = project.targets[1];
    const varNames = Object.values(sprite.variables).map(([name]) => name);
    expect(varNames).toContain("__font_size");
    expect(varNames).toContain("__font_color");
    expect(varNames).toContain("__font_brightness");
    expect(varNames).toContain("__font_ghost");
    expect(varNames).toContain("__font_layer");
    expect(varNames).toContain("__font_letterSpacing");
    expect(varNames).toContain("__font_lineHeight");
  });

  it("__font_size defaults to 100", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { variables: Record<string, [string, string | number]> }[]
    };
    const sprite = project.targets[1];
    const sizeEntry = Object.values(sprite.variables).find(([name]) => name === "__font_size");
    expect(sizeEntry?.[1]).toBe(100);
  });

  it("__font_letterSpacing uses value from options", () => {
    const opts: ExportOptions = { ...defaultOptions, letterSpacing: 5 };
    const project = generateScratchProject([], [], "abc123", opts) as {
      targets: { variables: Record<string, [string, string | number]> }[]
    };
    const sprite = project.targets[1];
    const lsEntry = Object.values(sprite.variables).find(([name]) => name === "__font_letterSpacing");
    expect(lsEntry?.[1]).toBe(5);
  });

  it("sprite has __font_align, __font_totalWidth, __font_j variables", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { variables: Record<string, [string, string | number]> }[]
    };
    const sprite = project.targets[1];
    const varNames = Object.values(sprite.variables).map(([name]) => name);
    expect(varNames).toContain("__font_align");
    expect(varNames).toContain("__font_totalWidth");
    expect(varNames).toContain("__font_j");
  });

  it("__font_align default matches options.align", () => {
    const opts: ExportOptions = { ...defaultOptions, align: "center" };
    const project = generateScratchProject([], [], "abc123", opts) as {
      targets: { variables: Record<string, [string, string | number]> }[]
    };
    const sprite = project.targets[1];
    const alignEntry = Object.values(sprite.variables).find(([name]) => name === "__font_align");
    expect(alignEntry?.[1]).toBe("center");
  });

  it("stage has Font_Config list (for all sprites)", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { isStage: boolean; lists: Record<string, [string, (string | number)[]]> }[]
    };
    const stage = project.targets[0];
    expect(stage.isStage).toBe(true);
    const fontConfig = Object.values(stage.lists).find(([name]) => name === "Font_Config");
    expect(fontConfig).toBeDefined();
    expect(fontConfig![1]).toHaveLength(9);
  });

  it("Font_Config has correct default values from options", () => {
    const opts: ExportOptions = { ...defaultOptions, align: "right", letterSpacing: 3 };
    const project = generateScratchProject([], [], "abc123", opts) as {
      targets: { isStage: boolean; lists: Record<string, [string, (string | number)[]]> }[]
    };
    const stage = project.targets[0];
    const fontConfig = Object.values(stage.lists).find(([name]) => name === "Font_Config");
    expect(fontConfig).toBeDefined();
    const data = fontConfig![1];
    // index 8 (0-based: 7) = align, index 9 (0-based: 8) = letterSpacing
    expect(data[7]).toBe("right");   // Font_Config[8] = align
    expect(data[8]).toBe(3);          // Font_Config[9] = letterSpacing
    expect(data[2]).toBe(100);        // Font_Config[3] = size default
  });

  it("stage has 取扱説明書 instruction list (for all sprites)", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { isStage: boolean; lists: Record<string, [string, (string | number)[]]> }[]
    };
    const stage = project.targets[0];
    expect(stage.isStage).toBe(true);
    const instruction = Object.values(stage.lists).find(([name]) => name === "取扱説明書");
    expect(instruction).toBeDefined();
    expect((instruction![1] as string[]).length).toBeGreaterThan(0);
  });

  it("render script contains dynamic alignment blocks (operator_not and control_if)", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string }> }[]
    };
    const sprite = project.targets[1];
    const opcodes = Object.values(sprite.blocks).map((b) => b.opcode);
    expect(opcodes).toContain("operator_not");
    // Dynamic alignment always adds a control_if wrapping the pre-pass
    expect(opcodes).toContain("control_if");
    // And a control_if_else for center vs right
    expect(opcodes).toContain("control_if_else");
  });

  it("テキストを表示する body uses Font_Config lookup (control_if_else blocks for each param)", () => {
    const project = generateScratchProject([], [], "abc123") as {
      targets: { blocks: Record<string, { opcode: string }> }[]
    };
    const sprite = project.targets[1];
    // Font_Config lookup generates one control_if_else per non-text parameter (9 params)
    const ifElseBlocks = Object.values(sprite.blocks).filter((b) => b.opcode === "control_if_else");
    // At minimum: 9 Font_Config lookups (x,y,size,color,brightness,ghost,layer,align,letterSpacing) + 1 alignment (center vs right)
    expect(ifElseBlocks.length).toBeGreaterThanOrEqual(10);
  });
});
