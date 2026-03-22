import { describe, it, expect } from "vitest";
import { generateScratchProject } from "../../src/core/ScratchScriptGenerator";
import type { ScratchExportOptions } from "../../src/types";

const defaultOpts: ScratchExportOptions = {
  warp: true,
  outputFormat: "svg",
  renderMode: "clone",
  alignment: "left",
};

describe("generateScratchProject", () => {
  it("produces a project with two targets", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: unknown[];
    };
    expect(project.targets).toHaveLength(2);
  });

  it("stage target is first", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { isStage: boolean }[];
    };
    expect(project.targets[0].isStage).toBe(true);
  });

  it("sprite target has FontChar name", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { name: string }[];
    };
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
    const project = generateScratchProject(costumes, [], "abc123", defaultOpts) as {
      targets: { costumes: { name: string }[] }[];
    };
    expect(project.targets[1].costumes).toHaveLength(1);
    expect(project.targets[1].costumes[0].name).toBe("A");
  });

  it("includes meta", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as { meta: unknown };
    expect(project.meta).toBeDefined();
  });

  it("includes monitors and extensions at top level", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      monitors: unknown[];
      extensions: unknown[];
    };
    expect(Array.isArray(project.monitors)).toBe(true);
    expect(Array.isArray(project.extensions)).toBe(true);
  });

  it("stage has __font_displayText variable", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { variables: Record<string, [string, unknown]> }[];
    };
    const stageVarNames = Object.values(project.targets[0].variables).map(([name]) => name);
    expect(stageVarNames).toContain("__font_displayText");
  });

  it("pre-populates charMap with glyph data", () => {
    const glyphInfos = [
      { char: "A", advanceWidth: 40 },
      { char: "B", advanceWidth: 42 },
    ];
    const project = generateScratchProject([], glyphInfos, "abc123", defaultOpts) as {
      targets: { lists: Record<string, [string, (string | number)[]]> }[];
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
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: {
        blocks: Record<string, { opcode: string; fields: Record<string, unknown> }>;
      }[];
    };
    const sprite = project.targets[1];
    const broadcastHandlers = Object.values(sprite.blocks)
      .filter((b) => b.opcode === "event_whenbroadcastreceived")
      .map((b) => (b.fields.BROADCAST_OPTION as [string])[0]);
    expect(broadcastHandlers).toContain("__font_render");
    expect(broadcastHandlers).toContain("__font_clear");
  });

  // ── 新機能テスト ──────────────────────────────────────────────────────

  it("warp=true generates warp:true in procedure mutation", () => {
    const project = generateScratchProject([], [], "abc123", { ...defaultOpts, warp: true }) as {
      targets: { blocks: Record<string, { opcode: string; mutation?: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    const protos = Object.values(sprite.blocks).filter(
      (b) => b.opcode === "procedures_prototype"
    );
    const displayProto = protos.find(
      (b) => b.mutation && (b.mutation.proccode as string).startsWith("テキストを表示する")
    );
    expect(displayProto?.mutation?.warp).toBe("true");
  });

  it("warp=false generates warp:false in procedure mutation", () => {
    const project = generateScratchProject([], [], "abc123", { ...defaultOpts, warp: false }) as {
      targets: { blocks: Record<string, { opcode: string; mutation?: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    const protos = Object.values(sprite.blocks).filter(
      (b) => b.opcode === "procedures_prototype"
    );
    const displayProto = protos.find(
      (b) => b.mutation && (b.mutation.proccode as string).startsWith("テキストを表示する")
    );
    expect(displayProto?.mutation?.warp).toBe("false");
  });

  it("テキストをすべてクリアする custom block is generated", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { blocks: Record<string, { opcode: string; mutation?: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    const clearProto = Object.values(sprite.blocks).find(
      (b) =>
        b.opcode === "procedures_prototype" &&
        b.mutation?.proccode === "テキストをすべてクリアする"
    );
    expect(clearProto).toBeDefined();
  });

  it("pen mode adds pen to extensions", () => {
    const project = generateScratchProject([], [], "abc123", {
      ...defaultOpts,
      renderMode: "pen",
    }) as { extensions: string[] };
    expect(project.extensions).toContain("pen");
  });

  it("clone mode does not add pen to extensions", () => {
    const project = generateScratchProject([], [], "abc123", {
      ...defaultOpts,
      renderMode: "clone",
    }) as { extensions: string[] };
    expect(project.extensions).not.toContain("pen");
  });

  it("clone mode has delete_this_clone in clear handler", () => {
    const project = generateScratchProject([], [], "abc123", {
      ...defaultOpts,
      renderMode: "clone",
    }) as {
      targets: { blocks: Record<string, { opcode: string; next: string | null; fields: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    // Find the __font_clear receiver block
    const clearReceiver = Object.values(sprite.blocks).find(
      (b) =>
        b.opcode === "event_whenbroadcastreceived" &&
        (b.fields.BROADCAST_OPTION as [string])[0] === "__font_clear"
    );
    expect(clearReceiver).toBeDefined();
    const nextBlock = clearReceiver!.next ? sprite.blocks[clearReceiver!.next] : null;
    expect(nextBlock?.opcode).toBe("control_delete_this_clone");
  });

  it("pen mode has pen_clear in clear handler", () => {
    const project = generateScratchProject([], [], "abc123", {
      ...defaultOpts,
      renderMode: "pen",
    }) as {
      targets: {
        blocks: Record<string, { opcode: string; next: string | null; fields: Record<string, unknown> }>;
      }[];
    };
    const sprite = project.targets[1];
    const clearReceiver = Object.values(sprite.blocks).find(
      (b) =>
        b.opcode === "event_whenbroadcastreceived" &&
        (b.fields.BROADCAST_OPTION as [string])[0] === "__font_clear"
    );
    expect(clearReceiver).toBeDefined();
    const nextBlock = clearReceiver!.next ? sprite.blocks[clearReceiver!.next] : null;
    expect(nextBlock?.opcode).toBe("pen_clear");
  });

  it("sprite has __font_lineHeight variable with default value", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts, 75) as {
      targets: { variables: Record<string, [string, unknown]> }[];
    };
    const spriteVarNames = Object.values(project.targets[1].variables).map(([name]) => name);
    expect(spriteVarNames).toContain("__font_lineHeight");
    const lhEntry = Object.values(project.targets[1].variables).find(
      ([name]) => name === "__font_lineHeight"
    );
    expect(lhEntry?.[1]).toBe(75);
  });

  it("sprite has size/color/brightness/ghost variables", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { variables: Record<string, [string, unknown]> }[];
    };
    const varNames = Object.values(project.targets[1].variables).map(([name]) => name);
    expect(varNames).toContain("__font_size");
    expect(varNames).toContain("__font_color");
    expect(varNames).toContain("__font_brightness");
    expect(varNames).toContain("__font_ghost");
    expect(varNames).toContain("__font_spacing");
  });

  it("custom block includes size/align/color/brightness/ghost/spacing parameters", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { blocks: Record<string, { opcode: string; mutation?: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    const displayProto = Object.values(sprite.blocks).find(
      (b) =>
        b.opcode === "procedures_prototype" &&
        (b.mutation?.proccode as string | undefined)?.startsWith("テキストを表示する")
    );
    expect(displayProto).toBeDefined();
    const proccode = displayProto!.mutation!.proccode as string;
    expect(proccode).toContain("サイズ:");
    expect(proccode).toContain("揃え:");
    expect(proccode).toContain("色効果:");
    expect(proccode).toContain("明るさ:");
    expect(proccode).toContain("透明度:");
    expect(proccode).toContain("文字間隔:");
  });

  it("render loop uses looks_seteffectto for color effect", () => {
    const project = generateScratchProject([], [], "abc123", defaultOpts) as {
      targets: { blocks: Record<string, { opcode: string; fields: Record<string, unknown> }> }[];
    };
    const sprite = project.targets[1];
    const colorEff = Object.values(sprite.blocks).find(
      (b) => b.opcode === "looks_seteffectto" && (b.fields.EFFECT as [string])[0] === "COLOR"
    );
    expect(colorEff).toBeDefined();
  });
});
