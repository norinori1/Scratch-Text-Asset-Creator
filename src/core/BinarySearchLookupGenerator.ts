/**
 * Binary Search Lookup Generator
 *
 * `__font_charMap` リスト（ペア形式: [char, advanceWidth, ...]）に対して
 * Scratch ブロック上で O(log n) バイナリサーチを実行するカスタムブロックを生成する。
 *
 * 仕様: docs/specifications/spec-v3.md §14
 */

// ── 最小限のブロック構造定義 ──────────────────────────────────────────────────

interface ScratchBlock {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown[]>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: Record<string, unknown>;
}

export type ScratchBlockMap = Record<string, ScratchBlock>;

// ── ユーティリティ関数 ─────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 20);
}

function mk(
  blocks: ScratchBlockMap,
  id: string,
  opcode: string,
  inputs: Record<string, unknown[]>,
  fields: Record<string, unknown>,
  topLevel = false,
  shadow = false,
  xy?: [number, number],
  mutation?: Record<string, unknown>
): void {
  blocks[id] = {
    opcode,
    next: null,
    parent: null,
    inputs,
    fields,
    shadow,
    topLevel,
    ...(xy !== undefined && { x: xy[0], y: xy[1] }),
    ...(mutation !== undefined && { mutation }),
  };
}

function chain(blocks: ScratchBlockMap, ids: string[]): void {
  for (let i = 0; i < ids.length - 1; i++) {
    blocks[ids[i]].next = ids[i + 1];
    blocks[ids[i + 1]].parent = ids[i];
  }
}

function setParent(blocks: ScratchBlockMap, child: string, parent: string): void {
  if (blocks[child]) blocks[child].parent = parent;
}

function numLit(n: number | string): unknown[] {
  return [1, [4, String(n)]];
}

function strLit(s: string): unknown[] {
  return [1, [10, s]];
}

function blockInput(blockId: string, fallbackNum = 0): unknown[] {
  return [3, blockId, [4, String(fallbackNum)]];
}

function blockInputStr(blockId: string, fallback = ""): unknown[] {
  return [3, blockId, [10, fallback]];
}

function boolInput(blockId: string): unknown[] {
  return [2, blockId];
}

function substackInput(blockId: string): unknown[] {
  return [2, blockId];
}

// ── バイナリサーチブロックの入出力に使う変数 ID セット ─────────────────────────

/**
 * バイナリサーチブロックが依存するすべての変数・リストの Scratch ID を保持する。
 */
export interface BinarySearchVarIds {
  /** `__font_charMap` リストの Scratch ID */
  listCharMapId: string;
  /** `__font_bsearch_result` 変数の Scratch ID（advance width を返す、未ヒット時は ""） */
  varBsResult: string;
  /** `__bsLo` 変数の Scratch ID */
  varBsLo: string;
  /** `__bsHi` 変数の Scratch ID */
  varBsHi: string;
  /** `__bsMid` 変数の Scratch ID */
  varBsMid: string;
  /** `__bsMidChar` 変数の Scratch ID */
  varBsMidChar: string;
}

/**
 * `generateBinarySearchBlocks` の戻り値。
 */
export interface BinarySearchBlockInfo {
  /** 生成した Scratch ブロック群（`ScratchScriptGenerator.ts` の blocks dict にマージする） */
  blocks: ScratchBlockMap;
  /** カスタムブロック定義ブロックの ID */
  defId: string;
  /** procedures_prototype の procCode（呼び出し時に使用） */
  procCode: string;
  /**
   * プロトタイプで定義した "target" 引数の Scratch ID。
   * 呼び出しブロック（procedures_call）の inputs キーとして使用する。
   */
  argTargetId: string;
}

/** バイナリサーチカスタムブロックの procCode */
export const BSEARCH_PROC_CODE = "__font_bsearch %s";

/**
 * `__font_bsearch (target)` カスタムブロック（warp: true）を生成する。
 *
 * - `__font_charMap` はペア形式: 奇数インデックス (1, 3, 5...) = 文字、偶数インデックス (2, 4, 6...) = advance width
 * - リストは Unicode コードポイント昇順でソート済みであることを前提とする
 * - `__font_bsearch_result` に advance width (number) をセットする。未ヒット時は "" をセット。
 *
 * @param varIds   バイナリサーチが参照する変数・リストの Scratch ID セット
 * @param xy       Scratch エディタ上の配置座標（省略可）
 */
export function generateBinarySearchBlocks(
  varIds: BinarySearchVarIds,
  xy?: [number, number]
): BinarySearchBlockInfo {
  const blocks: ScratchBlockMap = {};

  const { listCharMapId, varBsResult, varBsLo, varBsHi, varBsMid, varBsMidChar } = varIds;

  // ── Custom block prototype ──────────────────────────────────────────────────
  const argTargetId = uid();        // "target" 引数の ID（prototype と call で共有）
  const argTargetShadow = uid();    // prototype 上のシャドウ reporter
  const protoId = uid();
  const defId = uid();

  mk(blocks, argTargetShadow, "argument_reporter_string_number",
    {}, { VALUE: ["target", null] }, false, true);
  setParent(blocks, argTargetShadow, protoId);

  mk(blocks, protoId, "procedures_prototype",
    { [argTargetId]: [1, argTargetShadow] },
    {},
    false, true, undefined,
    {
      tagName: "mutation",
      children: [],
      proccode: BSEARCH_PROC_CODE,
      argumentids: JSON.stringify([argTargetId]),
      argumentnames: JSON.stringify(["target"]),
      argumentdefaults: JSON.stringify([""]),
      warp: "true",   // バイナリサーチブロックは常に warp=true
    });
  setParent(blocks, protoId, defId);

  mk(blocks, defId, "procedures_definition",
    { custom_block: [1, protoId] },
    {},
    true, false,
    xy ?? [1600, 0]);

  // ── Block body ──────────────────────────────────────────────────────────────

  // set [__bsLo] to (1)
  const bSetLo = uid();
  mk(blocks, bSetLo, "data_setvariableto",
    { VALUE: numLit(1) },
    { VARIABLE: ["__bsLo", varBsLo] });

  // set [__bsHi] to ((length of [__font_charMap]) / 2)
  const bLenList = uid();
  mk(blocks, bLenList, "data_lengthoflist", {}, { LIST: ["__font_charMap", listCharMapId] });
  const bDiv2 = uid();
  mk(blocks, bDiv2, "operator_divide", {
    NUM1: blockInput(bLenList),
    NUM2: numLit(2),
  }, {});
  setParent(blocks, bLenList, bDiv2);
  const bSetHi = uid();
  setParent(blocks, bDiv2, bSetHi);
  mk(blocks, bSetHi, "data_setvariableto",
    { VALUE: blockInput(bDiv2) },
    { VARIABLE: ["__bsHi", varBsHi] });

  // set [__font_bsearch_result] to ("")
  const bSetResult = uid();
  mk(blocks, bSetResult, "data_setvariableto",
    { VALUE: strLit("") },
    { VARIABLE: ["__font_bsearch_result", varBsResult] });

  // ── repeat until (__bsLo > __bsHi) ──
  const bUntil = uid();

  // condition: __bsLo > __bsHi
  const bCondLoVar = uid(), bCondHiVar = uid(), bCondGt = uid();
  mk(blocks, bCondLoVar, "data_variable", {}, { VARIABLE: ["__bsLo", varBsLo] });
  setParent(blocks, bCondLoVar, bCondGt);
  mk(blocks, bCondHiVar, "data_variable", {}, { VARIABLE: ["__bsHi", varBsHi] });
  setParent(blocks, bCondHiVar, bCondGt);
  mk(blocks, bCondGt, "operator_gt", {
    OPERAND1: blockInput(bCondLoVar),
    OPERAND2: blockInput(bCondHiVar),
  }, {});
  setParent(blocks, bCondGt, bUntil);

  // ── Loop body ──
  // set [__bsMid] to (floor ((__bsLo + __bsHi) / 2))
  const bLoVar = uid(), bHiVar = uid();
  mk(blocks, bLoVar, "data_variable", {}, { VARIABLE: ["__bsLo", varBsLo] });
  mk(blocks, bHiVar, "data_variable", {}, { VARIABLE: ["__bsHi", varBsHi] });
  const bAdd = uid();
  mk(blocks, bAdd, "operator_add", {
    NUM1: blockInput(bLoVar),
    NUM2: blockInput(bHiVar),
  }, {});
  setParent(blocks, bLoVar, bAdd);
  setParent(blocks, bHiVar, bAdd);
  const bDiv = uid();
  mk(blocks, bDiv, "operator_divide", {
    NUM1: blockInput(bAdd),
    NUM2: numLit(2),
  }, {});
  setParent(blocks, bAdd, bDiv);
  const bFloor = uid();
  mk(blocks, bFloor, "operator_mathop", {
    NUM: blockInput(bDiv),
  }, { OPERATOR: ["floor", null] });
  setParent(blocks, bDiv, bFloor);
  const bSetMid = uid();
  setParent(blocks, bFloor, bSetMid);
  mk(blocks, bSetMid, "data_setvariableto",
    { VALUE: blockInput(bFloor) },
    { VARIABLE: ["__bsMid", varBsMid] });

  // set [__bsMidChar] to (item ((__bsMid * 2) - 1) of [__font_charMap])
  // index = (__bsMid * 2) - 1
  const bMidVar1 = uid();
  mk(blocks, bMidVar1, "data_variable", {}, { VARIABLE: ["__bsMid", varBsMid] });
  const bMul2 = uid();
  mk(blocks, bMul2, "operator_multiply", {
    NUM1: blockInput(bMidVar1),
    NUM2: numLit(2),
  }, {});
  setParent(blocks, bMidVar1, bMul2);
  const bSub1 = uid();
  mk(blocks, bSub1, "operator_subtract", {
    NUM1: blockInput(bMul2),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bMul2, bSub1);
  const bItemChar = uid();
  setParent(blocks, bSub1, bItemChar);
  mk(blocks, bItemChar, "data_itemoflist", {
    INDEX: blockInput(bSub1, 1),
  }, { LIST: ["__font_charMap", listCharMapId] });
  const bSetMidChar = uid();
  setParent(blocks, bItemChar, bSetMidChar);
  mk(blocks, bSetMidChar, "data_setvariableto",
    { VALUE: blockInputStr(bItemChar) },
    { VARIABLE: ["__bsMidChar", varBsMidChar] });

  // ── if (__bsMidChar = target) → HIT ──
  // HIT: set result to item(__bsMid * 2) of charMap; set Lo to Hi+1 (exit)

  // argument reporter: target
  const rTarget = uid();
  mk(blocks, rTarget, "argument_reporter_string_number", {}, { VALUE: ["target", null] });

  // condition: __bsMidChar = target
  const bMidCharVar1 = uid();
  mk(blocks, bMidCharVar1, "data_variable", {}, { VARIABLE: ["__bsMidChar", varBsMidChar] });
  const bEqTarget = uid();
  mk(blocks, bEqTarget, "operator_equals", {
    OPERAND1: blockInputStr(bMidCharVar1),
    OPERAND2: blockInputStr(rTarget),
  }, {});
  setParent(blocks, bMidCharVar1, bEqTarget);
  setParent(blocks, rTarget, bEqTarget);

  // item (__bsMid * 2) of [__font_charMap] → advance width
  const bMidVar2 = uid();
  mk(blocks, bMidVar2, "data_variable", {}, { VARIABLE: ["__bsMid", varBsMid] });
  const bMul2b = uid();
  mk(blocks, bMul2b, "operator_multiply", {
    NUM1: blockInput(bMidVar2),
    NUM2: numLit(2),
  }, {});
  setParent(blocks, bMidVar2, bMul2b);
  const bItemAdv = uid();
  setParent(blocks, bMul2b, bItemAdv);
  mk(blocks, bItemAdv, "data_itemoflist", {
    INDEX: blockInput(bMul2b, 2),
  }, { LIST: ["__font_charMap", listCharMapId] });

  // set result = item(__bsMid * 2) of charMap
  const bSetResHit = uid();
  setParent(blocks, bItemAdv, bSetResHit);
  mk(blocks, bSetResHit, "data_setvariableto",
    { VALUE: blockInput(bItemAdv) },
    { VARIABLE: ["__font_bsearch_result", varBsResult] });

  // set Lo = Hi + 1  (loop exit)
  const bHiVar2 = uid();
  mk(blocks, bHiVar2, "data_variable", {}, { VARIABLE: ["__bsHi", varBsHi] });
  const bHiPlus1 = uid();
  mk(blocks, bHiPlus1, "operator_add", {
    NUM1: blockInput(bHiVar2),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bHiVar2, bHiPlus1);
  const bSetLoExit = uid();
  setParent(blocks, bHiPlus1, bSetLoExit);
  mk(blocks, bSetLoExit, "data_setvariableto",
    { VALUE: blockInput(bHiPlus1) },
    { VARIABLE: ["__bsLo", varBsLo] });

  chain(blocks, [bSetResHit, bSetLoExit]);

  // ── else if (__bsMidChar < target) → move Lo up ──
  // condition: __bsMidChar < target
  const bMidCharVar2 = uid();
  mk(blocks, bMidCharVar2, "data_variable", {}, { VARIABLE: ["__bsMidChar", varBsMidChar] });
  const rTarget2 = uid();
  mk(blocks, rTarget2, "argument_reporter_string_number", {}, { VALUE: ["target", null] });
  const bLtTarget = uid();
  mk(blocks, bLtTarget, "operator_lt", {
    OPERAND1: blockInputStr(bMidCharVar2),
    OPERAND2: blockInputStr(rTarget2),
  }, {});
  setParent(blocks, bMidCharVar2, bLtTarget);
  setParent(blocks, rTarget2, bLtTarget);

  // set Lo = Mid + 1
  const bMidVar3 = uid();
  mk(blocks, bMidVar3, "data_variable", {}, { VARIABLE: ["__bsMid", varBsMid] });
  const bMidPlus1 = uid();
  mk(blocks, bMidPlus1, "operator_add", {
    NUM1: blockInput(bMidVar3),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bMidVar3, bMidPlus1);
  const bSetLoUp = uid();
  setParent(blocks, bMidPlus1, bSetLoUp);
  mk(blocks, bSetLoUp, "data_setvariableto",
    { VALUE: blockInput(bMidPlus1) },
    { VARIABLE: ["__bsLo", varBsLo] });

  // ── else → move Hi down ──
  // set Hi = Mid - 1
  const bMidVar4 = uid();
  mk(blocks, bMidVar4, "data_variable", {}, { VARIABLE: ["__bsMid", varBsMid] });
  const bMidMinus1 = uid();
  mk(blocks, bMidMinus1, "operator_subtract", {
    NUM1: blockInput(bMidVar4),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bMidVar4, bMidMinus1);
  const bSetHiDown = uid();
  setParent(blocks, bMidMinus1, bSetHiDown);
  mk(blocks, bSetHiDown, "data_setvariableto",
    { VALUE: blockInput(bMidMinus1) },
    { VARIABLE: ["__bsHi", varBsHi] });

  // ── if HIT then ... else (if LT then Lo++ else Hi--) ──
  const bInnerIfElse = uid();
  mk(blocks, bInnerIfElse, "control_if_else", {
    CONDITION: boolInput(bLtTarget),
    SUBSTACK: substackInput(bSetLoUp),
    SUBSTACK2: substackInput(bSetHiDown),
  }, {});
  setParent(blocks, bLtTarget, bInnerIfElse);
  setParent(blocks, bSetLoUp, bInnerIfElse);
  setParent(blocks, bSetHiDown, bInnerIfElse);

  const bOuterIfElse = uid();
  mk(blocks, bOuterIfElse, "control_if_else", {
    CONDITION: boolInput(bEqTarget),
    SUBSTACK: substackInput(bSetResHit),
    SUBSTACK2: substackInput(bInnerIfElse),
  }, {});
  setParent(blocks, bEqTarget, bOuterIfElse);
  setParent(blocks, bSetResHit, bOuterIfElse);
  setParent(blocks, bInnerIfElse, bOuterIfElse);

  mk(blocks, bUntil, "control_repeat_until", {
    CONDITION: boolInput(bCondGt),
    SUBSTACK: substackInput(bSetMid),
  }, {});
  setParent(blocks, bCondGt, bUntil);
  setParent(blocks, bSetMid, bUntil);

  // Chain loop body: setMid → setMidChar → outerIfElse
  chain(blocks, [bSetMid, bSetMidChar, bOuterIfElse]);

  // Chain top-level body: setLo → setHi → setResult → until
  chain(blocks, [defId, bSetLo, bSetHi, bSetResult, bUntil]);

  return {
    blocks,
    defId,
    procCode: BSEARCH_PROC_CODE,
    argTargetId,
  };
}
