import { describe, it, expect } from "vitest";
import {
  generateBinarySearchBlocks,
  BSEARCH_PROC_CODE,
  type BinarySearchVarIds,
} from "../../src/core/BinarySearchLookupGenerator";

function makeMockVarIds(): BinarySearchVarIds {
  return {
    listCharMapId: "listId_charMap",
    varBsResult:   "varId_bsResult",
    varBsLo:       "varId_bsLo",
    varBsHi:       "varId_bsHi",
    varBsMid:      "varId_bsMid",
    varBsMidChar:  "varId_bsMidChar",
  };
}

describe("BSEARCH_PROC_CODE", () => {
  it("has the expected proc code string", () => {
    expect(BSEARCH_PROC_CODE).toBe("__font_bsearch %s");
  });
});

describe("generateBinarySearchBlocks", () => {
  const varIds = makeMockVarIds();
  const info = generateBinarySearchBlocks(varIds, "true");
  const { blocks, defId, procCode, argTargetId } = info;

  it("returns a non-empty blocks map", () => {
    expect(Object.keys(blocks).length).toBeGreaterThan(0);
  });

  it("returns a defId that exists in blocks", () => {
    expect(blocks[defId]).toBeDefined();
    expect(blocks[defId].opcode).toBe("procedures_definition");
  });

  it("returns the correct procCode", () => {
    expect(procCode).toBe(BSEARCH_PROC_CODE);
  });

  it("returns an argTargetId that is used in the prototype", () => {
    const proto = Object.values(blocks).find(
      (b) => b.opcode === "procedures_prototype"
    );
    expect(proto).toBeDefined();
    // The prototype's inputs should contain the argTargetId
    expect(proto!.inputs).toHaveProperty(argTargetId);
  });

  it("prototype has warp: true mutation", () => {
    const proto = Object.values(blocks).find(
      (b) => b.opcode === "procedures_prototype"
    );
    expect(proto?.mutation?.warp).toBe("true");
  });

  it("definition block is a top-level block", () => {
    expect(blocks[defId].topLevel).toBe(true);
  });

  it("contains data_setvariableto blocks for __bsLo, __bsHi, __font_bsearch_result", () => {
    const setVarBlocks = Object.values(blocks).filter(
      (b) => b.opcode === "data_setvariableto"
    );
    const varNames = setVarBlocks.map((b) => {
      const field = b.fields["VARIABLE"];
      return Array.isArray(field) ? field[0] : "";
    });
    expect(varNames).toContain("__bsLo");
    expect(varNames).toContain("__bsHi");
    expect(varNames).toContain("__font_bsearch_result");
    expect(varNames).toContain("__bsMid");
    expect(varNames).toContain("__bsMidChar");
  });

  it("contains a control_repeat_until block for the search loop", () => {
    const repeatUntil = Object.values(blocks).find(
      (b) => b.opcode === "control_repeat_until"
    );
    expect(repeatUntil).toBeDefined();
  });

  it("contains operator_gt block for loop condition (__bsLo > __bsHi)", () => {
    const gtBlock = Object.values(blocks).find(
      (b) => b.opcode === "operator_gt"
    );
    expect(gtBlock).toBeDefined();
  });

  it("contains operator_mathop floor for mid calculation", () => {
    const floorBlock = Object.values(blocks).find(
      (b) => b.opcode === "operator_mathop" &&
             Array.isArray(b.fields["OPERATOR"]) &&
             b.fields["OPERATOR"][0] === "floor"
    );
    expect(floorBlock).toBeDefined();
  });

  it("contains operator_lt block for char comparison", () => {
    const ltBlock = Object.values(blocks).find(
      (b) => b.opcode === "operator_lt"
    );
    expect(ltBlock).toBeDefined();
  });

  it("contains data_itemoflist blocks for charMap access", () => {
    const itemBlocks = Object.values(blocks).filter(
      (b) => b.opcode === "data_itemoflist"
    );
    expect(itemBlocks.length).toBeGreaterThanOrEqual(2); // char and advance width
  });

  it("references the correct __font_charMap list ID", () => {
    const itemBlocks = Object.values(blocks).filter(
      (b) => b.opcode === "data_itemoflist"
    );
    const refsList = itemBlocks.map((b) => {
      const field = b.fields["LIST"];
      return Array.isArray(field) ? field[1] : "";
    });
    expect(refsList).toContain("listId_charMap");
  });

  it("references the correct __font_bsearch_result variable ID", () => {
    const setResBlocks = Object.values(blocks).filter(
      (b) =>
        b.opcode === "data_setvariableto" &&
        Array.isArray(b.fields["VARIABLE"]) &&
        b.fields["VARIABLE"][0] === "__font_bsearch_result"
    );
    expect(setResBlocks.length).toBeGreaterThanOrEqual(2); // init to "" and set to advance width
    const varId = (setResBlocks[0].fields["VARIABLE"] as [string, string])[1];
    expect(varId).toBe("varId_bsResult");
  });

  it("all blocks have null parent only for top-level blocks", () => {
    const topLevelBlocks = Object.values(blocks).filter((b) => b.topLevel);
    for (const b of topLevelBlocks) {
      expect(b.parent).toBeNull();
    }
    // Non-top-level, non-shadow blocks should have a parent
    const nonTopNonShadow = Object.values(blocks).filter(
      (b) => !b.topLevel && !b.shadow
    );
    for (const b of nonTopNonShadow) {
      expect(b.parent).not.toBeNull();
    }
  });

  it("accepts custom xy coordinates", () => {
    const info2 = generateBinarySearchBlocks(makeMockVarIds(), "true", [100, 200]);
    const def = info2.blocks[info2.defId];
    expect(def.x).toBe(100);
    expect(def.y).toBe(200);
  });

  it("defaults to x=1600 y=0 when xy is not provided", () => {
    const def = blocks[defId];
    expect(def.x).toBe(1600);
    expect(def.y).toBe(0);
  });

  it("contains both control_if_else blocks for the search branch", () => {
    const ifElseBlocks = Object.values(blocks).filter(
      (b) => b.opcode === "control_if_else"
    );
    // outer (hit vs miss) + inner (lt vs gt)
    expect(ifElseBlocks.length).toBeGreaterThanOrEqual(2);
  });
});
