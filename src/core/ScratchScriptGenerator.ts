import type { ScratchExportOptions } from "../types";
import { DEFAULT_SCRATCH_EXPORT_OPTIONS } from "../types";

// ──────────────────────────────────────────────
// 内部型定義
// ──────────────────────────────────────────────
type BlockId = string;

interface ScratchBlock {
  opcode: string;
  next: BlockId | null;
  parent: BlockId | null;
  inputs: Record<string, unknown[]>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: Record<string, unknown>;
}

export interface ScratchCostume {
  assetId: string;
  name: string;
  bitmapResolution?: number;
  md5ext: string;
  dataFormat: string;
  rotationCenterX: number;
  rotationCenterY: number;
}

export interface GlyphInfo {
  char: string;
  advanceWidth: number;
}

interface ScratchTarget {
  isStage: boolean;
  name: string;
  variables: Record<string, [string, string | number]>;
  lists: Record<string, [string, (string | number)[]]>;
  broadcasts: Record<string, string>;
  blocks: Record<string, ScratchBlock>;
  costumes: ScratchCostume[];
  sounds: unknown[];
  currentCostume: number;
  layerOrder: number;
  volume: number;
  tempo?: number;
  videoState?: string;
  videoTransparency?: number;
  textToSpeechLanguage?: null;
  visible?: boolean;
  x?: number;
  y?: number;
  size?: number;
  direction?: number;
  draggable?: boolean;
  rotationStyle?: string;
}

// ──────────────────────────────────────────────
// ブロック生成ヘルパー関数
// ──────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 20);
}

// Scratch 3.0 input primitive type codes
const P_NUM = 4;   // any number literal
const P_TEXT = 10; // text/string literal

function numLit(n: number | string): unknown[] {
  return [1, [P_NUM, String(n)]];
}

function textLit(s: string): unknown[] {
  return [1, [P_TEXT, s]];
}

function blockInput(blockId: string, fallbackNum = 0): unknown[] {
  return [3, blockId, [P_NUM, String(fallbackNum)]];
}

function blockInputStr(blockId: string, fallback = ""): unknown[] {
  return [3, blockId, [P_TEXT, fallback]];
}

function boolInput(blockId: string): unknown[] {
  return [2, blockId];
}

function substackInput(blockId: string): unknown[] {
  return [2, blockId];
}

/** ブロックを blocks マップに登録する */
function mk(
  blocks: Record<string, ScratchBlock>,
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

/** 配列内のブロックを順番に next/parent でチェーンする */
function chain(blocks: Record<string, ScratchBlock>, ids: string[]): void {
  for (let i = 0; i < ids.length - 1; i++) {
    blocks[ids[i]].next = ids[i + 1];
    blocks[ids[i + 1]].parent = ids[i];
  }
}

/** 子ブロックの parent を設定する */
function setParent(blocks: Record<string, ScratchBlock>, child: string, parent: string): void {
  if (blocks[child]) blocks[child].parent = parent;
}

// ──────────────────────────────────────────────
// メイン生成関数
// ──────────────────────────────────────────────

/**
 * .sb3 の project.json オブジェクトを生成する。
 *
 * 生成されるカスタムブロック:
 *   - テキストを表示する %s x: %n y: %n サイズ: %n 揃え: %s 色効果: %n 明るさ: %n 透明度: %n 文字間隔: %n
 *   - テキストをすべてクリアする
 *
 * 機能:
 *   - warp オプション対応（デフォルト有効）
 *   - SVG / PNG コスチューム対応（outputFormat による）
 *   - クローン式 / ペン式（renderMode による）
 *   - テキストアライメント（left / center / right）
 *   - 改行（\n）検出と自動折り返し
 *   - 色効果・明るさ・透明度・サイズ パラメータ
 *   - 文字間隔パラメータ
 */
export function generateScratchProject(
  costumes: ScratchCostume[],
  glyphInfos: GlyphInfo[],
  backdropAssetId: string,
  options: ScratchExportOptions = DEFAULT_SCRATCH_EXPORT_OPTIONS,
  /** 改行時の行送り量 (Scratch 座標単位)。デフォルト 80。 */
  lineHeight = 80
): object {
  const opts: ScratchExportOptions = { ...DEFAULT_SCRATCH_EXPORT_OPTIONS, ...options };
  const isCloneMode = opts.renderMode !== "pen";
  const warpStr = opts.warp ? "true" : "false";

  // ── 変数 / ブロードキャスト ID ──────────────────
  const varDisplayText = uid(); // Stage
  const broadcastRender = uid();
  const broadcastClear = uid();

  // Sprite 変数
  const varX = uid();
  const varY = uid();
  const varSize = uid();
  const varAlign = uid();
  const varColor = uid();
  const varBrightness = uid();
  const varGhost = uid();
  const varSpacing = uid();
  const varLineHeight = uid();
  const varCharIndex = uid();
  const varI = uid();
  const varRow = uid();
  const varStartX = uid();
  const varTotalWidth = uid();
  const listCharMap = uid();

  // charMap データ: [char, advanceWidth, char, advanceWidth, ...]
  const charMapData: (string | number)[] = [];
  for (const g of glyphInfos) {
    charMapData.push(g.char, g.advanceWidth);
  }

  const blocks: Record<string, ScratchBlock> = {};

  // ── Script 1: フラグが押されたとき → 非表示 ─────
  {
    const bFlag = uid(), bHide = uid();
    mk(blocks, bFlag, "event_whenflagclicked", {}, {}, true, false, [0, 0]);
    mk(blocks, bHide, "looks_hide", {}, {});
    chain(blocks, [bFlag, bHide]);
  }

  // ── Script 2: __font_clear を受信したとき ────────
  {
    const bRcvClear = uid();
    mk(blocks, bRcvClear, "event_whenbroadcastreceived", {},
      { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, true, false, [0, 200]);

    if (isCloneMode) {
      // クローン式: このクローンを削除する
      const bDelClone = uid();
      mk(blocks, bDelClone, "control_delete_this_clone", {}, {});
      chain(blocks, [bRcvClear, bDelClone]);
    } else {
      // ペン式: 全部消す
      const bPenClear = uid();
      mk(blocks, bPenClear, "pen_clear", {}, {});
      chain(blocks, [bRcvClear, bPenClear]);
    }
  }

  // ── Script 3: クローンとして起動したとき → 表示（クローン式のみ）──
  if (isCloneMode) {
    const bCloneStart = uid(), bShowClone = uid();
    mk(blocks, bCloneStart, "control_start_as_clone", {}, {}, true, false, [0, 380]);
    mk(blocks, bShowClone, "looks_show", {}, {});
    chain(blocks, [bCloneStart, bShowClone]);
  }

  // ── Script 4: __font_render を受信 → レンダリングループ ──────────
  {
    const bRcvRender = uid();
    mk(blocks, bRcvRender, "event_whenbroadcastreceived", {},
      { BROADCAST_OPTION: ["__font_render", broadcastRender] }, true, false, [400, 0]);

    // set __font_row to 0
    const bSetRow = uid();
    mk(blocks, bSetRow, "data_setvariableto",
      { VALUE: numLit(0) },
      { VARIABLE: ["__font_row", varRow] });

    // set __font_startX to __font_x
    const bSetStartX = uid();
    const bReadX_s = uid();
    mk(blocks, bReadX_s, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
    setParent(blocks, bReadX_s, bSetStartX);
    mk(blocks, bSetStartX, "data_setvariableto",
      { VALUE: blockInput(bReadX_s) },
      { VARIABLE: ["__font_startX", varStartX] });

    // set __font_i to 1
    const bSetI_r = uid();
    mk(blocks, bSetI_r, "data_setvariableto",
      { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    // repeat (length of __font_displayText)
    const bRepeat_r = uid();
    const bLenDT_r = uid(), bLenDTVar_r = uid();
    mk(blocks, bLenDTVar_r, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLenDTVar_r, bLenDT_r);
    mk(blocks, bLenDT_r, "operator_length", { STRING: blockInputStr(bLenDTVar_r) }, {});
    setParent(blocks, bLenDT_r, bRepeat_r);

    // ── 外側 if/else: 改行文字か？ ──────────────────
    const bOuterIfElse = uid();

    // 条件: letter i of displayText = "\n"
    const bEqNewline = uid();
    const bLetterI_nl = uid(), bLetterIVar_nl = uid(), bLetterDTVar_nl = uid();
    mk(blocks, bLetterIVar_nl, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
    setParent(blocks, bLetterIVar_nl, bLetterI_nl);
    mk(blocks, bLetterDTVar_nl, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLetterDTVar_nl, bLetterI_nl);
    mk(blocks, bLetterI_nl, "operator_letter_of", {
      LETTER: blockInput(bLetterIVar_nl, 1),
      STRING: blockInputStr(bLetterDTVar_nl),
    }, {});
    setParent(blocks, bLetterI_nl, bEqNewline);
    mk(blocks, bEqNewline, "operator_equals", {
      OPERAND1: blockInputStr(bLetterI_nl),
      OPERAND2: textLit("\n"),
    }, {});
    setParent(blocks, bEqNewline, bOuterIfElse);

    // 真 branch: 行を進めて X をリセット
    const bChangeRow = uid();
    mk(blocks, bChangeRow, "data_changevariableby",
      { VALUE: numLit(1) },
      { VARIABLE: ["__font_row", varRow] });
    const bResetX = uid(), bStartXVar_r = uid();
    mk(blocks, bStartXVar_r, "data_variable", {}, { VARIABLE: ["__font_startX", varStartX] });
    setParent(blocks, bStartXVar_r, bResetX);
    mk(blocks, bResetX, "data_setvariableto",
      { VALUE: blockInput(bStartXVar_r) },
      { VARIABLE: ["__font_x", varX] });
    chain(blocks, [bChangeRow, bResetX]);

    // 偽 branch: charIndex を取得して描画
    const bSetCI_r = uid(), bItemNum_r = uid(), bLetterSearch_r = uid();
    const bLetterIVar_r = uid(), bLetterDTVar_r = uid();
    mk(blocks, bLetterIVar_r, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
    setParent(blocks, bLetterIVar_r, bLetterSearch_r);
    mk(blocks, bLetterDTVar_r, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLetterDTVar_r, bLetterSearch_r);
    mk(blocks, bLetterSearch_r, "operator_letter_of", {
      LETTER: blockInput(bLetterIVar_r, 1),
      STRING: blockInputStr(bLetterDTVar_r),
    }, {});
    setParent(blocks, bLetterSearch_r, bItemNum_r);
    mk(blocks, bItemNum_r, "data_itemnumoflist", {
      ITEM: blockInputStr(bLetterSearch_r),
    }, { LIST: ["__font_charMap", listCharMap] });
    setParent(blocks, bItemNum_r, bSetCI_r);
    mk(blocks, bSetCI_r, "data_setvariableto",
      { VALUE: blockInput(bItemNum_r) },
      { VARIABLE: ["__font_charIndex", varCharIndex] });

    // ── 内側 if: charIndex > 0 ──────────────────────
    const bInnerIf = uid();
    const bCondGt0 = uid(), bCondCIVar = uid();
    mk(blocks, bCondCIVar, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
    setParent(blocks, bCondCIVar, bCondGt0);
    mk(blocks, bCondGt0, "operator_gt", {
      OPERAND1: blockInput(bCondCIVar),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, bCondGt0, bInnerIf);

    // コスチュームを切り替える
    const bSwitch_r = uid(), bLetterCostume_r = uid();
    const bLCIVar_r = uid(), bLCDTVar_r = uid();
    mk(blocks, bLCIVar_r, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
    setParent(blocks, bLCIVar_r, bLetterCostume_r);
    mk(blocks, bLCDTVar_r, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLCDTVar_r, bLetterCostume_r);
    mk(blocks, bLetterCostume_r, "operator_letter_of", {
      LETTER: blockInput(bLCIVar_r, 1),
      STRING: blockInputStr(bLCDTVar_r),
    }, {});
    setParent(blocks, bLetterCostume_r, bSwitch_r);
    const bCostumeMenu_r = uid();
    mk(blocks, bCostumeMenu_r, "looks_costume", {}, { COSTUME: ["", null] }, false, true);
    setParent(blocks, bCostumeMenu_r, bSwitch_r);
    mk(blocks, bSwitch_r, "looks_switchcostumeto", {
      COSTUME: [3, bLetterCostume_r, bCostumeMenu_r],
    }, {});

    // サイズを設定
    const bSetSize_r = uid(), bSizeVar_r = uid();
    mk(blocks, bSizeVar_r, "data_variable", {}, { VARIABLE: ["__font_size", varSize] });
    setParent(blocks, bSizeVar_r, bSetSize_r);
    mk(blocks, bSetSize_r, "looks_setsizeto", { SIZE: blockInput(bSizeVar_r) }, {});

    // 色効果を設定
    const bSetColorEff = uid(), bColorVar_r = uid();
    mk(blocks, bColorVar_r, "data_variable", {}, { VARIABLE: ["__font_color", varColor] });
    setParent(blocks, bColorVar_r, bSetColorEff);
    mk(blocks, bSetColorEff, "looks_seteffectto",
      { VALUE: blockInput(bColorVar_r) },
      { EFFECT: ["COLOR", null] });

    // 明るさ効果を設定
    const bSetBrightEff = uid(), bBrightVar_r = uid();
    mk(blocks, bBrightVar_r, "data_variable", {}, { VARIABLE: ["__font_brightness", varBrightness] });
    setParent(blocks, bBrightVar_r, bSetBrightEff);
    mk(blocks, bSetBrightEff, "looks_seteffectto",
      { VALUE: blockInput(bBrightVar_r) },
      { EFFECT: ["BRIGHTNESS", null] });

    // 透明度効果を設定
    const bSetGhostEff = uid(), bGhostVar_r = uid();
    mk(blocks, bGhostVar_r, "data_variable", {}, { VARIABLE: ["__font_ghost", varGhost] });
    setParent(blocks, bGhostVar_r, bSetGhostEff);
    mk(blocks, bSetGhostEff, "looks_seteffectto",
      { VALUE: blockInput(bGhostVar_r) },
      { EFFECT: ["GHOST", null] });

    // go to x:__font_x y:(__font_y - __font_row * __font_lineHeight)
    const bGoto_r = uid();
    const bGotoXVar_r = uid();
    mk(blocks, bGotoXVar_r, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
    setParent(blocks, bGotoXVar_r, bGoto_r);
    // Y = __font_y - (__font_row * __font_lineHeight)
    const bGotoY_r = uid(), bRowOffset_r = uid();
    const bFontYVar_r = uid(), bRowVar_r = uid(), bLHVar_r = uid();
    mk(blocks, bFontYVar_r, "data_variable", {}, { VARIABLE: ["__font_y", varY] });
    setParent(blocks, bFontYVar_r, bGotoY_r);
    mk(blocks, bRowVar_r, "data_variable", {}, { VARIABLE: ["__font_row", varRow] });
    setParent(blocks, bRowVar_r, bRowOffset_r);
    mk(blocks, bLHVar_r, "data_variable", {}, { VARIABLE: ["__font_lineHeight", varLineHeight] });
    setParent(blocks, bLHVar_r, bRowOffset_r);
    mk(blocks, bRowOffset_r, "operator_multiply", {
      NUM1: blockInput(bRowVar_r),
      NUM2: blockInput(bLHVar_r),
    }, {});
    setParent(blocks, bRowOffset_r, bGotoY_r);
    mk(blocks, bGotoY_r, "operator_subtract", {
      NUM1: blockInput(bFontYVar_r),
      NUM2: blockInput(bRowOffset_r),
    }, {});
    setParent(blocks, bGotoY_r, bGoto_r);
    mk(blocks, bGoto_r, "motion_gotoxy", {
      X: blockInput(bGotoXVar_r),
      Y: blockInput(bGotoY_r),
    }, {});

    // クローン式 / ペン式 の描画アクション
    let bRenderActionFirst: string;
    let bRenderActionLast: string;
    if (isCloneMode) {
      const bShow_r = uid(), bClone_r = uid(), bCloneMenu_r = uid(), bHide_r = uid();
      mk(blocks, bShow_r, "looks_show", {}, {});
      mk(blocks, bCloneMenu_r, "control_create_clone_of_menu", {}, { CLONE_OPTION: ["_myself_", null] }, false, true);
      setParent(blocks, bCloneMenu_r, bClone_r);
      mk(blocks, bClone_r, "control_create_clone_of", { CLONE_OPTION: [1, bCloneMenu_r] }, {});
      mk(blocks, bHide_r, "looks_hide", {}, {});
      chain(blocks, [bShow_r, bClone_r, bHide_r]);
      bRenderActionFirst = bShow_r;
      bRenderActionLast = bHide_r;
    } else {
      const bShow_r = uid(), bStamp_r = uid(), bHide_r = uid();
      mk(blocks, bShow_r, "looks_show", {}, {});
      mk(blocks, bStamp_r, "pen_stamp", {}, {});
      mk(blocks, bHide_r, "looks_hide", {}, {});
      chain(blocks, [bShow_r, bStamp_r, bHide_r]);
      bRenderActionFirst = bShow_r;
      bRenderActionLast = bHide_r;
    }

    // グラフィック効果をクリア
    const bClearEff_r = uid();
    mk(blocks, bClearEff_r, "looks_cleargraphiceffects", {}, {});

    // change __font_x by (item (__font_charIndex + 1) + __font_spacing)
    const bChangeX_r = uid(), bAdvanceExpr_r = uid();
    const bItemVal_r = uid(), bAddOne_r = uid(), bCIVar_r = uid(), bSpacingVar_r = uid();
    mk(blocks, bCIVar_r, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
    setParent(blocks, bCIVar_r, bAddOne_r);
    mk(blocks, bAddOne_r, "operator_add", {
      NUM1: blockInput(bCIVar_r),
      NUM2: numLit(1),
    }, {});
    setParent(blocks, bAddOne_r, bItemVal_r);
    mk(blocks, bItemVal_r, "data_itemoflist", {
      INDEX: blockInput(bAddOne_r, 1),
    }, { LIST: ["__font_charMap", listCharMap] });
    setParent(blocks, bItemVal_r, bAdvanceExpr_r);
    mk(blocks, bSpacingVar_r, "data_variable", {}, { VARIABLE: ["__font_spacing", varSpacing] });
    setParent(blocks, bSpacingVar_r, bAdvanceExpr_r);
    mk(blocks, bAdvanceExpr_r, "operator_add", {
      NUM1: blockInput(bItemVal_r),
      NUM2: blockInput(bSpacingVar_r),
    }, {});
    setParent(blocks, bAdvanceExpr_r, bChangeX_r);
    mk(blocks, bChangeX_r, "data_changevariableby", {
      VALUE: blockInput(bAdvanceExpr_r),
    }, { VARIABLE: ["__font_x", varX] });

    // 内側 if の substack を連鎖
    chain(blocks, [bSwitch_r, bSetSize_r, bSetColorEff, bSetBrightEff, bSetGhostEff,
      bGoto_r, bRenderActionFirst]);
    chain(blocks, [bRenderActionLast, bClearEff_r, bChangeX_r]);

    mk(blocks, bInnerIf, "control_if", {
      CONDITION: boolInput(bCondGt0),
      SUBSTACK: substackInput(bSwitch_r),
    }, {});
    setParent(blocks, bSwitch_r, bInnerIf);

    // 偽 branch: bSetCI_r → bInnerIf
    chain(blocks, [bSetCI_r, bInnerIf]);

    // 外側 if/else を構築
    mk(blocks, bOuterIfElse, "control_if_else", {
      CONDITION: boolInput(bEqNewline),
      SUBSTACK: substackInput(bChangeRow),
      SUBSTACK2: substackInput(bSetCI_r),
    }, {});
    setParent(blocks, bChangeRow, bOuterIfElse);
    setParent(blocks, bSetCI_r, bOuterIfElse);

    // change __font_i by 1
    const bChangeI_r = uid();
    mk(blocks, bChangeI_r, "data_changevariableby",
      { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    // repeat ボディ: bOuterIfElse → bChangeI_r
    chain(blocks, [bOuterIfElse, bChangeI_r]);

    mk(blocks, bRepeat_r, "control_repeat", {
      TIMES: blockInput(bLenDT_r, 10),
      SUBSTACK: substackInput(bOuterIfElse),
    }, {});
    setParent(blocks, bOuterIfElse, bRepeat_r);

    // トップレベルのレンダリングスクリプトを連鎖
    chain(blocks, [bRcvRender, bSetRow, bSetStartX, bSetI_r, bRepeat_r]);
  }

  // ── Custom block 1: テキストを表示する ─────────────────────────────────
  //    %s x: %n y: %n サイズ: %n 揃え: %s 色効果: %n 明るさ: %n 透明度: %n 文字間隔: %n
  {
    const procCode =
      "テキストを表示する %s x: %n y: %n サイズ: %n 揃え: %s 色効果: %n 明るさ: %n 透明度: %n 文字間隔: %n";
    const argNames = ["text", "x", "y", "size", "align", "color", "brightness", "ghost", "spacing"];
    const argDefaults = ["", "0", "0", "100", "left", "0", "0", "0", "0"];
    const argIds = argNames.map(() => uid());
    const argShadowIds = argNames.map(() => uid());
    const protoId = uid(), defId = uid();

    // shadow argument blocks in prototype
    argNames.forEach((name, i) => {
      mk(blocks, argShadowIds[i], "argument_reporter_string_number", {},
        { VALUE: [name, null] }, false, true);
      setParent(blocks, argShadowIds[i], protoId);
    });

    const protoInputs: Record<string, unknown[]> = {};
    argIds.forEach((aid, i) => {
      protoInputs[aid] = [1, argShadowIds[i]];
    });

    mk(blocks, protoId, "procedures_prototype",
      protoInputs,
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: procCode,
        argumentids: JSON.stringify(argIds),
        argumentnames: JSON.stringify(argNames),
        argumentdefaults: JSON.stringify(argDefaults),
        warp: warpStr,
      });
    setParent(blocks, protoId, defId);
    mk(blocks, defId, "procedures_definition",
      { custom_block: [1, protoId] }, {}, true, false, [800, 0]);

    // ── ブロック本体 ─────────────────────────────────────────────────────

    // 引数リポータを 1 回 1 個生成するヘルパー
    function argRep(argName: string, parentId: string): string {
      const id = uid();
      mk(blocks, id, "argument_reporter_string_number", {}, { VALUE: [argName, null] });
      setParent(blocks, id, parentId);
      return id;
    }

    // set __font_displayText to text
    const bSetDT = uid();
    const rText = argRep("text", bSetDT);
    mk(blocks, bSetDT, "data_setvariableto",
      { VALUE: blockInputStr(rText) },
      { VARIABLE: ["__font_displayText", varDisplayText] });

    // set __font_y to y
    const bSetY = uid();
    const rY = argRep("y", bSetY);
    mk(blocks, bSetY, "data_setvariableto",
      { VALUE: blockInput(rY) },
      { VARIABLE: ["__font_y", varY] });

    // set __font_size to size
    const bSetSizeVar = uid();
    const rSize = argRep("size", bSetSizeVar);
    mk(blocks, bSetSizeVar, "data_setvariableto",
      { VALUE: blockInput(rSize) },
      { VARIABLE: ["__font_size", varSize] });

    // set __font_align to align
    const bSetAlignVar = uid();
    const rAlign = argRep("align", bSetAlignVar);
    mk(blocks, bSetAlignVar, "data_setvariableto",
      { VALUE: blockInputStr(rAlign) },
      { VARIABLE: ["__font_align", varAlign] });

    // set __font_color to color
    const bSetColorVar = uid();
    const rColor = argRep("color", bSetColorVar);
    mk(blocks, bSetColorVar, "data_setvariableto",
      { VALUE: blockInput(rColor) },
      { VARIABLE: ["__font_color", varColor] });

    // set __font_brightness to brightness
    const bSetBrightnessVar = uid();
    const rBrightness = argRep("brightness", bSetBrightnessVar);
    mk(blocks, bSetBrightnessVar, "data_setvariableto",
      { VALUE: blockInput(rBrightness) },
      { VARIABLE: ["__font_brightness", varBrightness] });

    // set __font_ghost to ghost
    const bSetGhostVar = uid();
    const rGhost = argRep("ghost", bSetGhostVar);
    mk(blocks, bSetGhostVar, "data_setvariableto",
      { VALUE: blockInput(rGhost) },
      { VARIABLE: ["__font_ghost", varGhost] });

    // set __font_spacing to spacing
    const bSetSpacingVar = uid();
    const rSpacing = argRep("spacing", bSetSpacingVar);
    mk(blocks, bSetSpacingVar, "data_setvariableto",
      { VALUE: blockInput(rSpacing) },
      { VARIABLE: ["__font_spacing", varSpacing] });

    // ── 幅計算ループ（揃え用）─────────────────────────────────────────
    // set __font_totalWidth to 0
    const bSetTW0 = uid();
    mk(blocks, bSetTW0, "data_setvariableto",
      { VALUE: numLit(0) },
      { VARIABLE: ["__font_totalWidth", varTotalWidth] });

    // set __font_i to 1
    const bSetIWidth = uid();
    mk(blocks, bSetIWidth, "data_setvariableto",
      { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    // repeat (length of __font_displayText)
    const bRepeatWidth = uid();
    const bLenDT_w = uid(), bLenDTVar_w = uid();
    mk(blocks, bLenDTVar_w, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLenDTVar_w, bLenDT_w);
    mk(blocks, bLenDT_w, "operator_length", { STRING: blockInputStr(bLenDTVar_w) }, {});
    setParent(blocks, bLenDT_w, bRepeatWidth);

    // 幅計算ループ本体: set ci, if > 0 { change totalWidth }, change i
    const bSetCI_w = uid(), bItemNum_w = uid(), bLetterSearch_w = uid();
    const bLetterIVar_w = uid(), bLetterDTVar_w = uid();
    mk(blocks, bLetterIVar_w, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
    setParent(blocks, bLetterIVar_w, bLetterSearch_w);
    mk(blocks, bLetterDTVar_w, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, bLetterDTVar_w, bLetterSearch_w);
    mk(blocks, bLetterSearch_w, "operator_letter_of", {
      LETTER: blockInput(bLetterIVar_w, 1),
      STRING: blockInputStr(bLetterDTVar_w),
    }, {});
    setParent(blocks, bLetterSearch_w, bItemNum_w);
    mk(blocks, bItemNum_w, "data_itemnumoflist", {
      ITEM: blockInputStr(bLetterSearch_w),
    }, { LIST: ["__font_charMap", listCharMap] });
    setParent(blocks, bItemNum_w, bSetCI_w);
    mk(blocks, bSetCI_w, "data_setvariableto",
      { VALUE: blockInput(bItemNum_w) },
      { VARIABLE: ["__font_charIndex", varCharIndex] });

    // if ci > 0: change totalWidth by (item(ci+1) + spacing)
    const bIfGtW = uid(), bCondGtW = uid(), bCondVarW = uid();
    mk(blocks, bCondVarW, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
    setParent(blocks, bCondVarW, bCondGtW);
    mk(blocks, bCondGtW, "operator_gt", {
      OPERAND1: blockInput(bCondVarW),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, bCondGtW, bIfGtW);

    const bChangeTW = uid(), bTWAdvance = uid();
    const bTWItemVal = uid(), bTWAddOne = uid(), bTWCIVar = uid(), bTWSpacingVar = uid();
    mk(blocks, bTWCIVar, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
    setParent(blocks, bTWCIVar, bTWAddOne);
    mk(blocks, bTWAddOne, "operator_add", {
      NUM1: blockInput(bTWCIVar),
      NUM2: numLit(1),
    }, {});
    setParent(blocks, bTWAddOne, bTWItemVal);
    mk(blocks, bTWItemVal, "data_itemoflist", {
      INDEX: blockInput(bTWAddOne, 1),
    }, { LIST: ["__font_charMap", listCharMap] });
    setParent(blocks, bTWItemVal, bTWAdvance);
    mk(blocks, bTWSpacingVar, "data_variable", {}, { VARIABLE: ["__font_spacing", varSpacing] });
    setParent(blocks, bTWSpacingVar, bTWAdvance);
    mk(blocks, bTWAdvance, "operator_add", {
      NUM1: blockInput(bTWItemVal),
      NUM2: blockInput(bTWSpacingVar),
    }, {});
    setParent(blocks, bTWAdvance, bChangeTW);
    mk(blocks, bChangeTW, "data_changevariableby", {
      VALUE: blockInput(bTWAdvance),
    }, { VARIABLE: ["__font_totalWidth", varTotalWidth] });

    mk(blocks, bIfGtW, "control_if", {
      CONDITION: boolInput(bCondGtW),
      SUBSTACK: substackInput(bChangeTW),
    }, {});
    setParent(blocks, bChangeTW, bIfGtW);

    const bChangeI_w = uid();
    mk(blocks, bChangeI_w, "data_changevariableby",
      { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    chain(blocks, [bSetCI_w, bIfGtW, bChangeI_w]);
    mk(blocks, bRepeatWidth, "control_repeat", {
      TIMES: blockInput(bLenDT_w, 10),
      SUBSTACK: substackInput(bSetCI_w),
    }, {});
    setParent(blocks, bSetCI_w, bRepeatWidth);

    // ── 揃え適用: set __font_x to x (デフォルト: 左揃え) ────────────
    const bSetXDefault = uid();
    const rX_default = argRep("x", bSetXDefault);
    mk(blocks, bSetXDefault, "data_setvariableto",
      { VALUE: blockInput(rX_default) },
      { VARIABLE: ["__font_x", varX] });

    // if __font_align = "center": set __font_x to (x - totalWidth / 2)
    const bIfCenter = uid(), bEqCenter = uid(), bAlignVarC = uid();
    mk(blocks, bAlignVarC, "data_variable", {}, { VARIABLE: ["__font_align", varAlign] });
    setParent(blocks, bAlignVarC, bEqCenter);
    mk(blocks, bEqCenter, "operator_equals", {
      OPERAND1: blockInputStr(bAlignVarC),
      OPERAND2: textLit("center"),
    }, {});
    setParent(blocks, bEqCenter, bIfCenter);

    const bSetXCenter = uid(), bXMinusHalf = uid(), bHalfWidth = uid();
    const bTWVar_c = uid();
    const rX_center = argRep("x", bXMinusHalf);
    mk(blocks, bTWVar_c, "data_variable", {}, { VARIABLE: ["__font_totalWidth", varTotalWidth] });
    setParent(blocks, bTWVar_c, bHalfWidth);
    mk(blocks, bHalfWidth, "operator_divide", {
      NUM1: blockInput(bTWVar_c),
      NUM2: numLit(2),
    }, {});
    setParent(blocks, bHalfWidth, bXMinusHalf);
    mk(blocks, bXMinusHalf, "operator_subtract", {
      NUM1: blockInput(rX_center),
      NUM2: blockInput(bHalfWidth),
    }, {});
    setParent(blocks, bXMinusHalf, bSetXCenter);
    mk(blocks, bSetXCenter, "data_setvariableto",
      { VALUE: blockInput(bXMinusHalf) },
      { VARIABLE: ["__font_x", varX] });
    mk(blocks, bIfCenter, "control_if", {
      CONDITION: boolInput(bEqCenter),
      SUBSTACK: substackInput(bSetXCenter),
    }, {});
    setParent(blocks, bSetXCenter, bIfCenter);

    // if __font_align = "right": set __font_x to (x - totalWidth)
    const bIfRight = uid(), bEqRight = uid(), bAlignVarR = uid();
    mk(blocks, bAlignVarR, "data_variable", {}, { VARIABLE: ["__font_align", varAlign] });
    setParent(blocks, bAlignVarR, bEqRight);
    mk(blocks, bEqRight, "operator_equals", {
      OPERAND1: blockInputStr(bAlignVarR),
      OPERAND2: textLit("right"),
    }, {});
    setParent(blocks, bEqRight, bIfRight);

    const bSetXRight = uid(), bXMinusWidth = uid();
    const bTWVar_r = uid();
    const rX_right = argRep("x", bXMinusWidth);
    mk(blocks, bTWVar_r, "data_variable", {}, { VARIABLE: ["__font_totalWidth", varTotalWidth] });
    setParent(blocks, bTWVar_r, bXMinusWidth);
    mk(blocks, bXMinusWidth, "operator_subtract", {
      NUM1: blockInput(rX_right),
      NUM2: blockInput(bTWVar_r),
    }, {});
    setParent(blocks, bXMinusWidth, bSetXRight);
    mk(blocks, bSetXRight, "data_setvariableto",
      { VALUE: blockInput(bXMinusWidth) },
      { VARIABLE: ["__font_x", varX] });
    mk(blocks, bIfRight, "control_if", {
      CONDITION: boolInput(bEqRight),
      SUBSTACK: substackInput(bSetXRight),
    }, {});
    setParent(blocks, bSetXRight, bIfRight);

    // broadcast __font_clear and wait
    const bBcClear_cb = uid(), bcClearMenu_cb = uid();
    mk(blocks, bcClearMenu_cb, "event_broadcast_menu", {},
      { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
    setParent(blocks, bcClearMenu_cb, bBcClear_cb);
    mk(blocks, bBcClear_cb, "event_broadcastandwait", { BROADCAST_INPUT: [1, bcClearMenu_cb] }, {});

    // broadcast __font_render and wait
    const bBcRender_cb = uid(), bcRenderMenu_cb = uid();
    mk(blocks, bcRenderMenu_cb, "event_broadcast_menu", {},
      { BROADCAST_OPTION: ["__font_render", broadcastRender] }, false, true);
    setParent(blocks, bcRenderMenu_cb, bBcRender_cb);
    mk(blocks, bBcRender_cb, "event_broadcastandwait", { BROADCAST_INPUT: [1, bcRenderMenu_cb] }, {});

    // カスタムブロック本体を連鎖
    chain(blocks, [
      defId, bSetDT, bSetY, bSetSizeVar, bSetAlignVar,
      bSetColorVar, bSetBrightnessVar, bSetGhostVar, bSetSpacingVar,
      bSetTW0, bSetIWidth, bRepeatWidth,
      bSetXDefault, bIfCenter, bIfRight,
      bBcClear_cb, bBcRender_cb,
    ]);
  }

  // ── Custom block 2: テキストをすべてクリアする ────────────────────────
  {
    const procCode2 = "テキストをすべてクリアする";
    const protoId2 = uid(), defId2 = uid();

    mk(blocks, protoId2, "procedures_prototype",
      {},
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: procCode2,
        argumentids: JSON.stringify([]),
        argumentnames: JSON.stringify([]),
        argumentdefaults: JSON.stringify([]),
        warp: "true",
      });
    setParent(blocks, protoId2, defId2);
    mk(blocks, defId2, "procedures_definition",
      { custom_block: [1, protoId2] }, {}, true, false, [1200, 0]);

    // broadcast __font_clear and wait
    const bBcClear2 = uid(), bClearMenu2 = uid();
    mk(blocks, bClearMenu2, "event_broadcast_menu", {},
      { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
    setParent(blocks, bClearMenu2, bBcClear2);
    mk(blocks, bBcClear2, "event_broadcastandwait", { BROADCAST_INPUT: [1, bClearMenu2] }, {});

    chain(blocks, [defId2, bBcClear2]);
  }

  // ── ターゲット組み立て ─────────────────────────────────────────────

  const spriteVariables: Record<string, [string, string | number]> = {
    [varX]:          ["__font_x",          0],
    [varY]:          ["__font_y",          0],
    [varSize]:       ["__font_size",       100],
    [varAlign]:      ["__font_align",      "left"],
    [varColor]:      ["__font_color",      0],
    [varBrightness]: ["__font_brightness", 0],
    [varGhost]:      ["__font_ghost",      0],
    [varSpacing]:    ["__font_spacing",    0],
    [varLineHeight]: ["__font_lineHeight", lineHeight],
    [varCharIndex]:  ["__font_charIndex",  0],
    [varI]:          ["__font_i",          0],
    [varRow]:        ["__font_row",        0],
    [varStartX]:     ["__font_startX",     0],
    [varTotalWidth]: ["__font_totalWidth", 0],
  };

  const fontCharTarget: ScratchTarget = {
    isStage: false,
    name: "FontChar",
    variables: spriteVariables,
    lists: {
      [listCharMap]: ["__font_charMap", charMapData],
    },
    broadcasts: {},
    blocks,
    costumes: costumes.length > 0 ? costumes : [{
      assetId: "cd21514d0531fdffb22204e0ec5ed84a",
      name: "空白",
      md5ext: "cd21514d0531fdffb22204e0ec5ed84a.svg",
      dataFormat: "svg",
      rotationCenterX: 0,
      rotationCenterY: 0,
    }],
    sounds: [],
    currentCostume: 0,
    layerOrder: 1,
    volume: 100,
    visible: false,
    x: 0,
    y: 0,
    size: 100,
    direction: 90,
    draggable: false,
    rotationStyle: "all around",
  };

  const stageTarget: ScratchTarget = {
    isStage: true,
    name: "Stage",
    variables: {
      [varDisplayText]: ["__font_displayText", ""],
    },
    lists: {},
    broadcasts: {
      [broadcastRender]: "__font_render",
      [broadcastClear]:  "__font_clear",
    },
    blocks: {},
    costumes: [
      {
        assetId: backdropAssetId,
        name: "背景",
        md5ext: `${backdropAssetId}.svg`,
        dataFormat: "svg",
        rotationCenterX: 240,
        rotationCenterY: 180,
      },
    ],
    sounds: [],
    currentCostume: 0,
    layerOrder: 0,
    volume: 100,
    tempo: 60,
    videoState: "on",
    videoTransparency: 50,
    textToSpeechLanguage: null,
  };

  return {
    targets: [stageTarget, fontCharTarget],
    monitors: [],
    extensions: isCloneMode ? [] : ["pen"],
    meta: {
      semver: "3.0.0",
      vm: "0.2.0",
      agent: "ScratchFontAssetCreator/0.2.0",
    },
  };
}
