import type { ExportOptions } from "../types";
import { generateBinarySearchBlocks, BSEARCH_PROC_CODE } from "./BinarySearchLookupGenerator";

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

function uid(): string {
  return crypto.randomUUID().replace(/-/g, "").substring(0, 20);
}

// Scratch 3.0 input primitive type codes (see scratch-vm/src/serialization/sb3.js)
// 4 = math_number, 5 = positive_number, 6 = positive_integer, 7 = integer,
// 8 = angle, 9 = color, 10 = text/string, 11 = broadcast, 12 = variable, 13 = list
const P_NUM = 4;   // any number literal
const P_TEXT = 10; // text/string literal

function numLit(n: number | string): unknown[] {
  return [1, [P_NUM, String(n)]];
}

function strLit(s: string): unknown[] {
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

function chain(blocks: Record<string, ScratchBlock>, ids: string[]): void {
  for (let i = 0; i < ids.length - 1; i++) {
    blocks[ids[i]].next = ids[i + 1];
    blocks[ids[i + 1]].parent = ids[i];
  }
}

function setParent(blocks: Record<string, ScratchBlock>, child: string, parent: string): void {
  if (blocks[child]) blocks[child].parent = parent;
}

// ── Helper: build "letter (varI) of (varStr)" operator block ──
function mkLetterOf(
  blocks: Record<string, ScratchBlock>,
  varIId: string, varIName: string,
  varStrId: string, varStrName: string
): string {
  const bLetter = uid();
  const bIVar = uid(), bStrVar = uid();
  mk(blocks, bIVar, "data_variable", {}, { VARIABLE: [varIName, varIId] });
  setParent(blocks, bIVar, bLetter);
  mk(blocks, bStrVar, "data_variable", {}, { VARIABLE: [varStrName, varStrId] });
  setParent(blocks, bStrVar, bLetter);
  mk(blocks, bLetter, "operator_letter_of", {
    LETTER: blockInput(bIVar, 1),
    STRING: blockInputStr(bStrVar),
  }, {});
  return bLetter;
}

// ── Build the block sequence that renders a single character ──
// Returns [firstBlockId, lastBlockId]
function buildRenderCharBlocks(
  blocks: Record<string, ScratchBlock>,
  varIId: string,
  varDisplayTextId: string,
  varCurXId: string, varCurYId: string,
  varBsResultId: string,
  varLetterSpacingId: string, varLetterSpacingName: string,
): [string, string] {
  // switch costume to (letter i of displayText)
  const bSwitch = uid();
  const bLetterCostume = mkLetterOf(blocks, varIId, "__font_i", varDisplayTextId, "__font_displayText");
  setParent(blocks, bLetterCostume, bSwitch);
  const bCostumeMenu = uid();
  mk(blocks, bCostumeMenu, "looks_costume", {}, { COSTUME: ["", null] }, false, true);
  setParent(blocks, bCostumeMenu, bSwitch);
  mk(blocks, bSwitch, "looks_switchcostumeto", {
    COSTUME: [3, bLetterCostume, bCostumeMenu],
  }, {});

  // go to x:(curX) y:(curY)
  const bGoto = uid();
  const bGotoXVar = uid(), bGotoYVar = uid();
  mk(blocks, bGotoXVar, "data_variable", {}, { VARIABLE: ["__font_curX", varCurXId] });
  setParent(blocks, bGotoXVar, bGoto);
  mk(blocks, bGotoYVar, "data_variable", {}, { VARIABLE: ["__font_curY", varCurYId] });
  setParent(blocks, bGotoYVar, bGoto);
  mk(blocks, bGoto, "motion_gotoxy", {
    X: blockInput(bGotoXVar),
    Y: blockInput(bGotoYVar),
  }, {});

  // create clone of myself
  const bClone = uid(), bCloneMenu = uid();
  mk(blocks, bCloneMenu, "control_create_clone_of_menu", {}, { CLONE_OPTION: ["_myself_", null] }, false, true);
  setParent(blocks, bCloneMenu, bClone);
  mk(blocks, bClone, "control_create_clone_of", { CLONE_OPTION: [1, bCloneMenu] }, {});

  // change curX by (__font_bsearch_result + letterSpacing)
  const bBsResVar = uid();
  mk(blocks, bBsResVar, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResultId] });
  const bItemVal = bBsResVar;

  // (itemVal + letterSpacing)
  const bLSVar = uid(), bAddLS = uid(), bChangeX = uid();
  mk(blocks, bLSVar, "data_variable", {}, { VARIABLE: [varLetterSpacingName, varLetterSpacingId] });
  setParent(blocks, bLSVar, bAddLS);
  setParent(blocks, bItemVal, bAddLS);
  mk(blocks, bAddLS, "operator_add", {
    NUM1: blockInput(bItemVal),
    NUM2: blockInput(bLSVar),
  }, {});
  setParent(blocks, bAddLS, bChangeX);
  mk(blocks, bChangeX, "data_changevariableby", {
    VALUE: blockInput(bAddLS),
  }, { VARIABLE: ["__font_curX", varCurXId] });

  chain(blocks, [bSwitch, bGoto, bClone, bChangeX]);
  return [bSwitch, bChangeX];
}

// ── Build the block sequence that renders a single character using pen/stamp ──
function buildStampCharBlocks(
  blocks: Record<string, ScratchBlock>,
  varIId: string,
  varDisplayTextId: string,
  varCurXId: string, varCurYId: string,
  varBsResultId: string,
  varLetterSpacingId: string, varLetterSpacingName: string,
): [string, string] {
  // switch costume
  const bSwitch = uid();
  const bLetterCostume = mkLetterOf(blocks, varIId, "__font_i", varDisplayTextId, "__font_displayText");
  setParent(blocks, bLetterCostume, bSwitch);
  const bCostumeMenu = uid();
  mk(blocks, bCostumeMenu, "looks_costume", {}, { COSTUME: ["", null] }, false, true);
  setParent(blocks, bCostumeMenu, bSwitch);
  mk(blocks, bSwitch, "looks_switchcostumeto", {
    COSTUME: [3, bLetterCostume, bCostumeMenu],
  }, {});

  // go to x:(curX) y:(curY)
  const bGoto = uid();
  const bGotoXVar = uid(), bGotoYVar = uid();
  mk(blocks, bGotoXVar, "data_variable", {}, { VARIABLE: ["__font_curX", varCurXId] });
  setParent(blocks, bGotoXVar, bGoto);
  mk(blocks, bGotoYVar, "data_variable", {}, { VARIABLE: ["__font_curY", varCurYId] });
  setParent(blocks, bGotoYVar, bGoto);
  mk(blocks, bGoto, "motion_gotoxy", {
    X: blockInput(bGotoXVar),
    Y: blockInput(bGotoYVar),
  }, {});

  // stamp
  const bStamp = uid();
  mk(blocks, bStamp, "pen_stamp", {}, {});

  // change curX by (__font_bsearch_result + letterSpacing)
  const bBsResVar = uid();
  mk(blocks, bBsResVar, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResultId] });
  const bItemVal = bBsResVar;
  const bLSVar = uid(), bAddLS = uid(), bChangeX = uid();
  mk(blocks, bLSVar, "data_variable", {}, { VARIABLE: [varLetterSpacingName, varLetterSpacingId] });
  setParent(blocks, bLSVar, bAddLS);
  setParent(blocks, bItemVal, bAddLS);
  mk(blocks, bAddLS, "operator_add", {
    NUM1: blockInput(bItemVal),
    NUM2: blockInput(bLSVar),
  }, {});
  setParent(blocks, bAddLS, bChangeX);
  mk(blocks, bChangeX, "data_changevariableby", {
    VALUE: blockInput(bAddLS),
  }, { VARIABLE: ["__font_curX", varCurXId] });

  chain(blocks, [bSwitch, bGoto, bStamp, bChangeX]);
  return [bSwitch, bChangeX];
}

export function generateScratchProject(
  costumes: ScratchCostume[],
  glyphInfos: GlyphInfo[],
  backdropAssetId: string,
  options: ExportOptions = { outputFormat: "svg", warp: true, renderMode: "clone", align: "left", letterSpacing: 0, textInputMode: "param" },
  lineHeight = 72
): object {
  const isPen = options.renderMode === "pen";
  const warpStr = options.warp ? "true" : "false";
  const textInputMode = options.textInputMode ?? "param";

  // IDs for Stage variables/broadcasts
  const varDisplayText = uid();
  const broadcastRender = uid();
  const broadcastClear = uid();

  // IDs for FontChar sprite variables
  // Binary search variables (§14)
  const varBsResult = uid();   // __font_bsearch_result
  const varBsLo = uid();       // __bsLo
  const varBsHi = uid();       // __bsHi
  const varBsMid = uid();      // __bsMid
  const varBsMidChar = uid();  // __bsMidChar
  const varX = uid();
  const varY = uid();
  const varI = uid();
  const varCurX = uid();
  const varCurY = uid();
  const varSize = uid();
  const varColor = uid();
  const varBrightness = uid();
  const varGhost = uid();
  const varLayer = uid();
  const varLetterSpacing = uid();
  const varLineHeight = uid();
  const varAlign = uid();
  const varTotalWidth = uid();
  const varJ = uid();
  // Typewriter variables (§17)
  const varTwRunning = uid();  // __tw_running
  const varTwSkip = uid();     // __tw_skip
  const varTwChar = uid();     // __tw_char
  // Number format variables (§18)
  const varFmtResult = uid();  // __fmt_result
  const varFmtStr = uid();     // __fmt_str
  const varFmtI = uid();       // __fmt_i
  const varFmtPos = uid();     // __fmt_pos
  const varFmtMin = uid();     // __fmt_min
  const varFmtSec = uid();     // __fmt_sec
  const varFmtFactor = uid();  // __fmt_factor
  const varFmtInt = uid();     // __fmt_int
  const varFmtMinStr = uid();  // __fmt_min_str
  // listCharMap
  const listCharMap = uid();
  // Stage-level lists (for all sprites)
  const listFontConfig = uid();
  const listInstruction = uid();
  // Mode 2 (richtext): tag-stripping variables (__pp_*)
  const varPpBuf = uid(), varPpI = uid(), varPpInTag = uid(), varPpCh = uid();
  // Mode 3 (console): console-script parsing variables (__con_*)
  const varConI = uid(), varConLine = uid(), varConColPos = uid();
  const varConJ = uid(), varConKey = uid(), varConVal = uid();
  // Mode 3 list
  const listConsole = uid();

  // Pre-populate __font_charMap: [char, advanceWidth, char, advanceWidth, ...]
  const charMapData: (string | number)[] = [];
  for (const g of glyphInfos) {
    charMapData.push(g.char, g.advanceWidth);
  }

  // Font_Config default values (index 1..9):
  // 1=x, 2=y, 3=size, 4=color, 5=brightness, 6=ghost, 7=layer, 8=align, 9=letterSpacing
  const fontConfigData: (string | number)[] = [
    0,                               // [1] x default
    0,                               // [2] y default
    100,                             // [3] size default
    0,                               // [4] color default
    0,                               // [5] brightness default
    0,                               // [6] ghost default
    1,                               // [7] layer default
    options.align ?? "left",         // [8] align default
    options.letterSpacing ?? 0,      // [9] letterSpacing default
  ];

  // Instruction list contents (Japanese user manual)
  const instructionData: string[] = [
    "=== Font_Config の設定方法 ===",
    "Font_Config[1]: x のデフォルト値",
    "Font_Config[2]: y のデフォルト値",
    "Font_Config[3]: サイズ のデフォルト値 (%)",
    "Font_Config[4]: 色 のデフォルト値 (0-200)",
    "Font_Config[5]: 明るさ のデフォルト値 (-100-100)",
    "Font_Config[6]: 透明度 のデフォルト値 (0-100)",
    "Font_Config[7]: レイヤー のデフォルト値 (1=前面 / -1=背面)",
    "Font_Config[8]: 揃え のデフォルト値 (left/center/right)",
    "Font_Config[9]: 文字間隔 のデフォルト値 (px)",
    "=== テキストを表示する の使い方 ===",
    "パラメーターを空にするとFont_Configの値が使われます",
    "揃え: left(左)/center(中央)/right(右)",
    "レイヤー: 1=前面, -1=背面 (その他の数値も有効)",
    "改行コード: \\n で改行できます",
    "=== テキストをすべてクリアする ===",
    "表示中のテキストを全て消去します",
    "=== テキストをタイプライター表示する ===",
    "1文字ずつ順に表示するタイプライター演出",
    "速さ: 0 = 即時, 60 = 60ms/文字",
    "スペースキーでスキップ可能",
    "=== 数値フォーマットユーティリティ ===",
    "__font_fmt_zeroPad (数値) (桁数) → __fmt_result",
    "__font_fmt_comma (数値) → __fmt_result",
    "__font_fmt_timer (秒数) → __fmt_result",
    "__font_fmt_fixed (数値) (小数桁) → __fmt_result",
  ];

  const blocks: Record<string, ScratchBlock> = {};

  // ── Binary search custom block (§14) ──────────────────────────────────────
  const bsInfo = generateBinarySearchBlocks({
    listCharMapId: listCharMap,
    varBsResult,
    varBsLo,
    varBsHi,
    varBsMid,
    varBsMidChar,
  }, [1600, 0]);
  Object.assign(blocks, bsInfo.blocks);
  const bsArgTargetId = bsInfo.argTargetId;

  // ── Script 1: When flag clicked → hide (clone mode) or show (pen mode) ──
  const bFlag = uid(), bFlagAction = uid();
  mk(blocks, bFlag, "event_whenflagclicked", {}, {}, true, false, [0, 0]);
  if (isPen) {
    mk(blocks, bFlagAction, "looks_show", {}, {});
  } else {
    mk(blocks, bFlagAction, "looks_hide", {}, {});
  }
  chain(blocks, [bFlag, bFlagAction]);

  // ── Script 2: When receive __font_clear ──
  const bRcvClear = uid();
  mk(blocks, bRcvClear, "event_whenbroadcastreceived", {},
    { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, true, false, [0, 200]);

  if (isPen) {
    // erase all pen marks
    const bErase = uid();
    mk(blocks, bErase, "pen_eraseAll", {}, {});
    chain(blocks, [bRcvClear, bErase]);
  } else {
    // delete this clone
    const bDelClone = uid();
    mk(blocks, bDelClone, "control_delete_this_clone", {}, {});
    chain(blocks, [bRcvClear, bDelClone]);
  }

  if (!isPen) {
    // ── Script 3: When I start as a clone → apply layer, show ──
    const bCloneStart = uid();
    mk(blocks, bCloneStart, "control_start_as_clone", {}, {}, true, false, [0, 380]);

    // if layer < 0 → go to back layer; else → go to front layer
    const bIfLayer = uid();
    const bLayerCond = uid(), bLayerVar = uid();
    mk(blocks, bLayerVar, "data_variable", {}, { VARIABLE: ["__font_layer", varLayer] });
    setParent(blocks, bLayerVar, bLayerCond);
    mk(blocks, bLayerCond, "operator_lt", {
      OPERAND1: blockInput(bLayerVar),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, bLayerCond, bIfLayer);

    // back layer block
    const bGoBack = uid();
    mk(blocks, bGoBack, "looks_gotofrontback", {}, { FRONT_BACK: ["back", null] });

    // front layer block
    const bGoFront = uid();
    mk(blocks, bGoFront, "looks_gotofrontback", {}, { FRONT_BACK: ["front", null] });

    mk(blocks, bIfLayer, "control_if_else", {
      CONDITION: boolInput(bLayerCond),
      SUBSTACK: substackInput(bGoBack),
      SUBSTACK2: substackInput(bGoFront),
    }, {});
    setParent(blocks, bGoBack, bIfLayer);
    setParent(blocks, bGoFront, bIfLayer);

    // show after layer assignment
    const bShowClone = uid();
    mk(blocks, bShowClone, "looks_show", {}, {});

    chain(blocks, [bCloneStart, bIfLayer, bShowClone]);
  }

  // ── Script 4: When receive __font_render → rendering loop ──
  const bRcvRender = uid();
  mk(blocks, bRcvRender, "event_whenbroadcastreceived", {},
    { BROADCAST_OPTION: ["__font_render", broadcastRender] }, true, false, [400, 0]);

  // Apply visual effects to main sprite (clones inherit them)
  // set size to __font_size %
  const bSetSize = uid(), bSizeVar = uid();
  mk(blocks, bSizeVar, "data_variable", {}, { VARIABLE: ["__font_size", varSize] });
  setParent(blocks, bSizeVar, bSetSize);
  mk(blocks, bSetSize, "looks_setsizeto", { SIZE: blockInput(bSizeVar) }, {});

  // set color effect to __font_color
  const bSetColorEff = uid(), bColorVar = uid();
  mk(blocks, bColorVar, "data_variable", {}, { VARIABLE: ["__font_color", varColor] });
  setParent(blocks, bColorVar, bSetColorEff);
  mk(blocks, bSetColorEff, "looks_seteffectto", {
    VALUE: blockInput(bColorVar),
  }, { EFFECT: ["color", null] });

  // set brightness effect to __font_brightness
  const bSetBrightEff = uid(), bBrightVar = uid();
  mk(blocks, bBrightVar, "data_variable", {}, { VARIABLE: ["__font_brightness", varBrightness] });
  setParent(blocks, bBrightVar, bSetBrightEff);
  mk(blocks, bSetBrightEff, "looks_seteffectto", {
    VALUE: blockInput(bBrightVar),
  }, { EFFECT: ["brightness", null] });

  // set ghost effect to __font_ghost
  const bSetGhostEff = uid(), bGhostVar = uid();
  mk(blocks, bGhostVar, "data_variable", {}, { VARIABLE: ["__font_ghost", varGhost] });
  setParent(blocks, bGhostVar, bSetGhostEff);
  mk(blocks, bSetGhostEff, "looks_seteffectto", {
    VALUE: blockInput(bGhostVar),
  }, { EFFECT: ["ghost", null] });

  // ── Alignment pre-pass (center / right): calculate total width of current line ──
  // set curX = x, curY = y first, then adjust for alignment
  const bSetCurX_initial = uid();
  const bXVar0 = uid();
  mk(blocks, bXVar0, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
  setParent(blocks, bXVar0, bSetCurX_initial);
  mk(blocks, bSetCurX_initial, "data_setvariableto", {
    VALUE: blockInput(bXVar0),
  }, { VARIABLE: ["__font_curX", varCurX] });

  const bSetCurY = uid();
  const bYVar0 = uid();
  mk(blocks, bYVar0, "data_variable", {}, { VARIABLE: ["__font_y", varY] });
  setParent(blocks, bYVar0, bSetCurY);
  mk(blocks, bSetCurY, "data_setvariableto", {
    VALUE: blockInput(bYVar0),
  }, { VARIABLE: ["__font_curY", varCurY] });

  // ── Dynamic alignment pre-pass (runtime if-else, always included) ──
  // Structure: if NOT (__font_align = "left") { pre-pass + curX adjustment }
  // Pre-pass: iterate displayText, accumulate totalWidth
  // Adjustment: center → curX = x - totalWidth/2; right → curX = x - totalWidth

  // set totalWidth to 0
  const bSetTW = uid();
  mk(blocks, bSetTW, "data_setvariableto", { VALUE: numLit(0) },
    { VARIABLE: ["__font_totalWidth", varTotalWidth] });

  // set j to 1
  const bSetJ = uid();
  mk(blocks, bSetJ, "data_setvariableto", { VALUE: numLit(1) },
    { VARIABLE: ["__font_j", varJ] });

  // inside pre-pass repeat:
  // call __font_bsearch (letter j of displayText)  → result in __font_bsearch_result
  const bLetterJ = mkLetterOf(blocks, varJ, "__font_j", varDisplayText, "__font_displayText");
  const bPreCallShadow = uid();
  mk(blocks, bPreCallShadow, "argument_reporter_string_number", {}, { VALUE: ["target", null] }, false, true);
  const bPreCallBS = uid();
  setParent(blocks, bLetterJ, bPreCallBS);
  setParent(blocks, bPreCallShadow, bPreCallBS);
  mk(blocks, bPreCallBS, "procedures_call", {
    [bsArgTargetId]: [3, bLetterJ, bPreCallShadow],
  }, {}, false, false, undefined, {
    tagName: "mutation",
    children: [],
    proccode: BSEARCH_PROC_CODE,
    argumentids: JSON.stringify([bsArgTargetId]),
    warp: "true",
  });

  // if __font_bsearch_result ≠ "": change totalWidth by bsearch_result + letterSpacing
  const bCondEq2 = uid(), bBsResVar2 = uid();
  mk(blocks, bBsResVar2, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
  setParent(blocks, bBsResVar2, bCondEq2);
  mk(blocks, bCondEq2, "operator_equals", {
    OPERAND1: blockInputStr(bBsResVar2),
    OPERAND2: strLit(""),
  }, {});
  const bCondNotEmpty2 = uid();
  setParent(blocks, bCondEq2, bCondNotEmpty2);
  mk(blocks, bCondNotEmpty2, "operator_not", {
    OPERAND: boolInput(bCondEq2),
  }, {});
  const bIfCI2 = uid();
  setParent(blocks, bCondNotEmpty2, bIfCI2);

  const bBsAdvVar2 = uid();
  mk(blocks, bBsAdvVar2, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
  const bLSVar2 = uid(), bAddLS2 = uid();
  mk(blocks, bLSVar2, "data_variable", {}, { VARIABLE: ["__font_letterSpacing", varLetterSpacing] });
  setParent(blocks, bBsAdvVar2, bAddLS2);
  setParent(blocks, bLSVar2, bAddLS2);
  mk(blocks, bAddLS2, "operator_add", {
    NUM1: blockInput(bBsAdvVar2),
    NUM2: blockInput(bLSVar2),
  }, {});
  const bChangeTW = uid();
  setParent(blocks, bAddLS2, bChangeTW);
  mk(blocks, bChangeTW, "data_changevariableby", {
    VALUE: blockInput(bAddLS2),
  }, { VARIABLE: ["__font_totalWidth", varTotalWidth] });

  mk(blocks, bIfCI2, "control_if", {
    CONDITION: boolInput(bCondNotEmpty2),
    SUBSTACK: substackInput(bChangeTW),
  }, {});
  setParent(blocks, bChangeTW, bIfCI2);

  // change j by 1
  const bChangeJ = uid();
  mk(blocks, bChangeJ, "data_changevariableby", { VALUE: numLit(1) },
    { VARIABLE: ["__font_j", varJ] });

  chain(blocks, [bPreCallBS, bIfCI2, bChangeJ]);

  // pre-pass repeat block
  const bRepeatPre = uid();
  const bLenDT2b = uid(), bLenDTVar2b = uid();
  mk(blocks, bLenDTVar2b, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLenDTVar2b, bLenDT2b);
  mk(blocks, bLenDT2b, "operator_length", { STRING: blockInputStr(bLenDTVar2b) }, {});
  setParent(blocks, bLenDT2b, bRepeatPre);
  mk(blocks, bRepeatPre, "control_repeat", {
    TIMES: blockInput(bLenDT2b, 10),
    SUBSTACK: substackInput(bPreCallBS),
  }, {});
  setParent(blocks, bPreCallBS, bRepeatPre);

  // ── curX adjustment: if center → x - totalWidth/2; else (right) → x - totalWidth ──
  // if __font_align = "center": center adjustment; else: right adjustment
  const bAlignVarC = uid();
  mk(blocks, bAlignVarC, "data_variable", {}, { VARIABLE: ["__font_align", varAlign] });
  const bAlignEqCenter = uid();
  mk(blocks, bAlignEqCenter, "operator_equals", {
    OPERAND1: blockInputStr(bAlignVarC),
    OPERAND2: strLit("center"),
  }, {});
  setParent(blocks, bAlignVarC, bAlignEqCenter);

  // center: curX = x - totalWidth / 2
  const bAdjustCenter = uid();
  const bXVarC = uid(), bTWVarC = uid();
  mk(blocks, bXVarC, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
  mk(blocks, bTWVarC, "data_variable", {}, { VARIABLE: ["__font_totalWidth", varTotalWidth] });
  const bDiv2 = uid();
  mk(blocks, bDiv2, "operator_divide", {
    NUM1: blockInput(bTWVarC),
    NUM2: numLit(2),
  }, {});
  setParent(blocks, bTWVarC, bDiv2);
  const bHalf = uid();
  mk(blocks, bHalf, "operator_subtract", {
    NUM1: blockInput(bXVarC),
    NUM2: blockInput(bDiv2),
  }, {});
  setParent(blocks, bXVarC, bHalf);
  setParent(blocks, bDiv2, bHalf);
  setParent(blocks, bHalf, bAdjustCenter);
  mk(blocks, bAdjustCenter, "data_setvariableto", {
    VALUE: blockInput(bHalf),
  }, { VARIABLE: ["__font_curX", varCurX] });

  // right: curX = x - totalWidth
  const bAdjustRight = uid();
  const bXVarR = uid(), bTWVarR = uid();
  mk(blocks, bXVarR, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
  mk(blocks, bTWVarR, "data_variable", {}, { VARIABLE: ["__font_totalWidth", varTotalWidth] });
  const bSub = uid();
  mk(blocks, bSub, "operator_subtract", {
    NUM1: blockInput(bXVarR),
    NUM2: blockInput(bTWVarR),
  }, {});
  setParent(blocks, bXVarR, bSub);
  setParent(blocks, bTWVarR, bSub);
  setParent(blocks, bSub, bAdjustRight);
  mk(blocks, bAdjustRight, "data_setvariableto", {
    VALUE: blockInput(bSub),
  }, { VARIABLE: ["__font_curX", varCurX] });

  // if-else for center vs right
  const bIfElseAlign = uid();
  mk(blocks, bIfElseAlign, "control_if_else", {
    CONDITION: boolInput(bAlignEqCenter),
    SUBSTACK: substackInput(bAdjustCenter),
    SUBSTACK2: substackInput(bAdjustRight),
  }, {});
  setParent(blocks, bAlignEqCenter, bIfElseAlign);
  setParent(blocks, bAdjustCenter, bIfElseAlign);
  setParent(blocks, bAdjustRight, bIfElseAlign);

  chain(blocks, [bSetTW, bSetJ, bRepeatPre, bIfElseAlign]);

  // ── Outer if: if NOT (__font_align = "left") { run pre-pass } ──
  const bAlignVarL = uid();
  mk(blocks, bAlignVarL, "data_variable", {}, { VARIABLE: ["__font_align", varAlign] });
  const bAlignEqLeft = uid();
  mk(blocks, bAlignEqLeft, "operator_equals", {
    OPERAND1: blockInputStr(bAlignVarL),
    OPERAND2: strLit("left"),
  }, {});
  setParent(blocks, bAlignVarL, bAlignEqLeft);
  const bAlignNotLeft = uid();
  mk(blocks, bAlignNotLeft, "operator_not", {
    OPERAND: boolInput(bAlignEqLeft),
  }, {});
  setParent(blocks, bAlignEqLeft, bAlignNotLeft);

  const bAlignIf = uid();
  mk(blocks, bAlignIf, "control_if", {
    CONDITION: boolInput(bAlignNotLeft),
    SUBSTACK: substackInput(bSetTW),
  }, {});
  setParent(blocks, bAlignNotLeft, bAlignIf);
  setParent(blocks, bSetTW, bAlignIf);

  // ── set i to 1 ──
  const bSetI = uid();
  mk(blocks, bSetI, "data_setvariableto", { VALUE: numLit(1) },
    { VARIABLE: ["__font_i", varI] });

  // ── Repeat block ──
  const bRepeat = uid();

  // TIMES: length of __font_displayText
  const bLenDT = uid(), bLenDTVar = uid();
  mk(blocks, bLenDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLenDTVar, bLenDT);
  mk(blocks, bLenDT, "operator_length", { STRING: blockInputStr(bLenDTVar) }, {});
  setParent(blocks, bLenDT, bRepeat);

  // ── Inside repeat: check for \n (newline) first ──
  //   if (letter i of displayText) = "\" then
  //     if (letter (i+1) of displayText) = "n" then
  //       set curX to x; change curY by -lineHeight; change i by 1 (skip "n")
  //     end
  //   else
  //     charIndex = item# of (letter i) in charMap
  //     if charIndex > 0: render char
  //   end
  //   change i by 1

  // Outer if: letter i = "\"
  const bIfBackslash = uid();
  const bCondBS = uid();
  const bLetterBS = mkLetterOf(blocks, varI, "__font_i", varDisplayText, "__font_displayText");
  setParent(blocks, bLetterBS, bCondBS);
  mk(blocks, bCondBS, "operator_equals", {
    OPERAND1: blockInputStr(bLetterBS),
    OPERAND2: strLit("\\"),
  }, {});
  setParent(blocks, bCondBS, bIfBackslash);

  // Inner if: letter (i+1) = "n"
  const bIfN = uid();
  const bCondN = uid();
  // i + 1
  const bIPlus1 = uid(), bIPlusIVar = uid();
  mk(blocks, bIPlusIVar, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
  setParent(blocks, bIPlusIVar, bIPlus1);
  mk(blocks, bIPlus1, "operator_add", { NUM1: blockInput(bIPlusIVar, 1), NUM2: numLit(1) }, {});
  setParent(blocks, bIPlus1, bCondN);
  // letter (i+1) of displayText
  const bLetterN = uid(), bNDTVar = uid();
  mk(blocks, bNDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bNDTVar, bLetterN);
  mk(blocks, bLetterN, "operator_letter_of", {
    LETTER: blockInput(bIPlus1, 1),
    STRING: blockInputStr(bNDTVar),
  }, {});
  setParent(blocks, bLetterN, bCondN);
  mk(blocks, bCondN, "operator_equals", {
    OPERAND1: blockInputStr(bLetterN),
    OPERAND2: strLit("n"),
  }, {});
  setParent(blocks, bCondN, bIfN);

  // Newline body:
  //   set curX to x
  //   change curY by -(__font_lineHeight)
  //   change i by 1 (skip the "n" character)
  const bResetCurX = uid(), bResetXVar = uid();
  mk(blocks, bResetXVar, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
  setParent(blocks, bResetXVar, bResetCurX);
  mk(blocks, bResetCurX, "data_setvariableto", {
    VALUE: blockInput(bResetXVar),
  }, { VARIABLE: ["__font_curX", varCurX] });

  const bChangeCurY = uid(), bNegLH = uid(), bLHVar = uid();
  mk(blocks, bLHVar, "data_variable", {}, { VARIABLE: ["__font_lineHeight", varLineHeight] });
  setParent(blocks, bLHVar, bNegLH);
  mk(blocks, bNegLH, "operator_subtract", {
    NUM1: numLit(0),
    NUM2: blockInput(bLHVar),
  }, {});
  setParent(blocks, bNegLH, bChangeCurY);
  mk(blocks, bChangeCurY, "data_changevariableby", {
    VALUE: blockInput(bNegLH),
  }, { VARIABLE: ["__font_curY", varCurY] });

  const bSkipN = uid();
  mk(blocks, bSkipN, "data_changevariableby", { VALUE: numLit(1) },
    { VARIABLE: ["__font_i", varI] });

  chain(blocks, [bResetCurX, bChangeCurY, bSkipN]);

  mk(blocks, bIfN, "control_if", {
    CONDITION: boolInput(bCondN),
    SUBSTACK: substackInput(bResetCurX),
  }, {});
  setParent(blocks, bResetCurX, bIfN);

  // Else branch (normal character):
  //   call __font_bsearch (letter i of displayText)
  //   if __font_bsearch_result ≠ "": render char
  const bLetterSearch = mkLetterOf(blocks, varI, "__font_i", varDisplayText, "__font_displayText");
  const bMainCallShadow = uid();
  mk(blocks, bMainCallShadow, "argument_reporter_string_number", {}, { VALUE: ["target", null] }, false, true);
  const bSetCI = uid(); // reuse name so chain/parent refs below still work
  setParent(blocks, bLetterSearch, bSetCI);
  setParent(blocks, bMainCallShadow, bSetCI);
  mk(blocks, bSetCI, "procedures_call", {
    [bsArgTargetId]: [3, bLetterSearch, bMainCallShadow],
  }, {}, false, false, undefined, {
    tagName: "mutation",
    children: [],
    proccode: BSEARCH_PROC_CODE,
    argumentids: JSON.stringify([bsArgTargetId]),
    warp: "true",
  });

  // if __font_bsearch_result ≠ "": render
  const bIfCI = uid();
  const bCondEqMain = uid(), bBsResMain = uid();
  mk(blocks, bBsResMain, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
  setParent(blocks, bBsResMain, bCondEqMain);
  mk(blocks, bCondEqMain, "operator_equals", {
    OPERAND1: blockInputStr(bBsResMain),
    OPERAND2: strLit(""),
  }, {});
  const bCond = uid(); // reuse name for compatibility with chain calls below
  setParent(blocks, bCondEqMain, bCond);
  mk(blocks, bCond, "operator_not", {
    OPERAND: boolInput(bCondEqMain),
  }, {});
  setParent(blocks, bCond, bIfCI);

  let renderFirst: string, renderLast: string;
  if (isPen) {
    [renderFirst, renderLast] = buildStampCharBlocks(
      blocks,
      varI, varDisplayText, varCurX, varCurY,
      varBsResult,
      varLetterSpacing, "__font_letterSpacing",
    );
  } else {
    [renderFirst, renderLast] = buildRenderCharBlocks(
      blocks,
      varI, varDisplayText, varCurX, varCurY,
      varBsResult,
      varLetterSpacing, "__font_letterSpacing",
    );
  }

  mk(blocks, bIfCI, "control_if", {
    CONDITION: boolInput(bCond),
    SUBSTACK: substackInput(renderFirst),
  }, {});
  setParent(blocks, renderFirst, bIfCI);
  setParent(blocks, renderLast, bIfCI);

  chain(blocks, [bSetCI, bIfCI]);

  // Outer if/else: backslash-check → inner if(n), else → char render
  mk(blocks, bIfBackslash, "control_if_else", {
    CONDITION: boolInput(bCondBS),
    SUBSTACK: substackInput(bIfN),
    SUBSTACK2: substackInput(bSetCI),
  }, {});
  setParent(blocks, bIfN, bIfBackslash);
  setParent(blocks, bSetCI, bIfBackslash);

  // change i by 1
  const bChangeI = uid();
  mk(blocks, bChangeI, "data_changevariableby", { VALUE: numLit(1) },
    { VARIABLE: ["__font_i", varI] });

  // Link repeat body
  chain(blocks, [bIfBackslash, bChangeI]);

  mk(blocks, bRepeat, "control_repeat", {
    TIMES: blockInput(bLenDT, 10),
    SUBSTACK: substackInput(bIfBackslash),
  }, {});
  setParent(blocks, bIfBackslash, bRepeat);

  // ── Warp helper block __font_doRender (always warp=true) ──
  // Wrapping the rendering loop in a warp custom block ensures that all clone
  // creation (or pen stamps) happen without screen refresh.  In clone mode this
  // means every clone's "when I start as a clone" startup script is queued
  // before any of them runs, so all characters become visible simultaneously
  // in the same frame rather than appearing left-to-right one at a time.
  const doRenderProcCode = "__font_doRender";
  const doRenderProtoId = uid(), doRenderDefId = uid();
  mk(blocks, doRenderProtoId, "procedures_prototype",
    {}, {},
    false, true, undefined,
    {
      tagName: "mutation",
      children: [],
      proccode: doRenderProcCode,
      argumentids: JSON.stringify([]),
      argumentnames: JSON.stringify([]),
      argumentdefaults: JSON.stringify([]),
      warp: "true",
    });
  setParent(blocks, doRenderProtoId, doRenderDefId);
  mk(blocks, doRenderDefId, "procedures_definition",
    { custom_block: [1, doRenderProtoId] }, {},
    true, false, [400, -400]);

  // For pen mode, reset effects after the loop
  if (isPen) {
    const bResetSize = uid();
    mk(blocks, bResetSize, "looks_setsizeto", { SIZE: numLit(100) }, {});
    const bClearFX = uid();
    mk(blocks, bClearFX, "looks_cleargraphiceffects", {}, {});
    chain(blocks, [bRepeat, bResetSize, bClearFX]);
    // Rendering blocks live under the warp helper definition
    chain(blocks, [doRenderDefId, bSetSize, bSetColorEff, bSetBrightEff, bSetGhostEff, bSetCurX_initial, bSetCurY, bAlignIf, bSetI, bRepeat]);
  } else {
    // Rendering blocks live under the warp helper definition
    chain(blocks, [doRenderDefId, bSetSize, bSetColorEff, bSetBrightEff, bSetGhostEff, bSetCurX_initial, bSetCurY, bAlignIf, bSetI, bRepeat]);
  }

  // __font_render broadcast handler: call the warp helper block
  const bCallDoRenderFromBc = uid();
  mk(blocks, bCallDoRenderFromBc, "procedures_call", {}, {}, false, false, undefined, {
    tagName: "mutation",
    children: [],
    proccode: doRenderProcCode,
    argumentids: JSON.stringify([]),
    warp: "true",
  });
  chain(blocks, [bRcvRender, bCallDoRenderFromBc]);

  // ── Helper: generate "if arg = '' → use Font_Config[index]; else → use arg" block ──
  // Returns the id of the if-else block (top of this sub-chain)
  function buildFontConfigLookup(
    varId: string,
    varName: string,
    argName: string,
    configIndex: number,
    isStr = false,
  ): string {
    // argument reporter
    const rArgCheck = uid();
    mk(blocks, rArgCheck, "argument_reporter_string_number", {}, { VALUE: [argName, null] });

    // condition: arg = ""
    const bEqEmpty = uid();
    mk(blocks, bEqEmpty, "operator_equals", {
      OPERAND1: blockInputStr(rArgCheck),
      OPERAND2: strLit(""),
    }, {});
    setParent(blocks, rArgCheck, bEqEmpty);

    // then-branch: set var to item(configIndex) of Font_Config
    const bItemCfg = uid();
    mk(blocks, bItemCfg, "data_itemoflist", {
      INDEX: numLit(configIndex),
    }, { LIST: ["Font_Config", listFontConfig] });
    const bSetFromCfg = uid();
    mk(blocks, bSetFromCfg, "data_setvariableto", {
      VALUE: isStr ? blockInputStr(bItemCfg) : blockInput(bItemCfg),
    }, { VARIABLE: [varName, varId] });
    setParent(blocks, bItemCfg, bSetFromCfg);

    // else-branch: set var to arg
    const rArgVal = uid();
    mk(blocks, rArgVal, "argument_reporter_string_number", {}, { VALUE: [argName, null] });
    const bSetFromArg = uid();
    mk(blocks, bSetFromArg, "data_setvariableto", {
      VALUE: isStr ? blockInputStr(rArgVal) : blockInput(rArgVal),
    }, { VARIABLE: [varName, varId] });
    setParent(blocks, rArgVal, bSetFromArg);

    // if-else block
    const bIfElse = uid();
    mk(blocks, bIfElse, "control_if_else", {
      CONDITION: boolInput(bEqEmpty),
      SUBSTACK: substackInput(bSetFromCfg),
      SUBSTACK2: substackInput(bSetFromArg),
    }, {});
    setParent(blocks, bEqEmpty, bIfElse);
    setParent(blocks, bSetFromCfg, bIfElse);
    setParent(blocks, bSetFromArg, bIfElse);

    return bIfElse;
  }

  // Helper: set var directly from Font_Config[configIndex] (no arg fallback, used by Mode 2/3)
  function buildFontConfigSet(varId: string, varName: string, configIndex: number, isStr = false): string {
    const bItemCfg = uid();
    mk(blocks, bItemCfg, "data_itemoflist", {
      INDEX: numLit(configIndex),
    }, { LIST: ["Font_Config", listFontConfig] });
    const bSet = uid();
    mk(blocks, bSet, "data_setvariableto", {
      VALUE: isStr ? blockInputStr(bItemCfg) : blockInput(bItemCfg),
    }, { VARIABLE: [varName, varId] });
    setParent(blocks, bItemCfg, bSet);
    return bSet;
  }

  // ── Script 5: Custom block ── テキストを表示する (Mode 1: param) ──
  if (textInputMode === "param") {
  // Parameters: text %s, x %s, y %s, size %s, color %s, brightness %s, ghost %s, layer %s, align %s, letterSpacing %s
  // All non-text parameters use "" as default → Font_Config lookup inside the block body
  const procCode = "テキストを表示する %s x: %s y: %s サイズ: %s 色: %s 明るさ: %s 透明度: %s レイヤー: %s 揃え: %s 文字間隔: %s";
  const argTextId = uid(), argXId = uid(), argYId = uid();
  const argSizeId = uid(), argColorId = uid(), argBrightId = uid(), argGhostId = uid(), argLayerId = uid();
  const argAlignId = uid(), argLSId = uid();
  const protoId = uid(), defId = uid();

  const argTextShadow = uid(), argXShadow = uid(), argYShadow = uid();
  const argSizeShadow = uid(), argColorShadow = uid(), argBrightShadow = uid(), argGhostShadow = uid(), argLayerShadow = uid();
  const argAlignShadow = uid(), argLSShadow = uid();

  mk(blocks, argTextShadow, "argument_reporter_string_number", {}, { VALUE: ["text", null] }, false, true);
  setParent(blocks, argTextShadow, protoId);
  mk(blocks, argXShadow, "argument_reporter_string_number", {}, { VALUE: ["x", null] }, false, true);
  setParent(blocks, argXShadow, protoId);
  mk(blocks, argYShadow, "argument_reporter_string_number", {}, { VALUE: ["y", null] }, false, true);
  setParent(blocks, argYShadow, protoId);
  mk(blocks, argSizeShadow, "argument_reporter_string_number", {}, { VALUE: ["size", null] }, false, true);
  setParent(blocks, argSizeShadow, protoId);
  mk(blocks, argColorShadow, "argument_reporter_string_number", {}, { VALUE: ["color", null] }, false, true);
  setParent(blocks, argColorShadow, protoId);
  mk(blocks, argBrightShadow, "argument_reporter_string_number", {}, { VALUE: ["brightness", null] }, false, true);
  setParent(blocks, argBrightShadow, protoId);
  mk(blocks, argGhostShadow, "argument_reporter_string_number", {}, { VALUE: ["ghost", null] }, false, true);
  setParent(blocks, argGhostShadow, protoId);
  mk(blocks, argLayerShadow, "argument_reporter_string_number", {}, { VALUE: ["layer", null] }, false, true);
  setParent(blocks, argLayerShadow, protoId);
  mk(blocks, argAlignShadow, "argument_reporter_string_number", {}, { VALUE: ["align", null] }, false, true);
  setParent(blocks, argAlignShadow, protoId);
  mk(blocks, argLSShadow, "argument_reporter_string_number", {}, { VALUE: ["letterSpacing", null] }, false, true);
  setParent(blocks, argLSShadow, protoId);

  mk(blocks, protoId, "procedures_prototype",
    {
      [argTextId]: [1, argTextShadow],
      [argXId]: [1, argXShadow],
      [argYId]: [1, argYShadow],
      [argSizeId]: [1, argSizeShadow],
      [argColorId]: [1, argColorShadow],
      [argBrightId]: [1, argBrightShadow],
      [argGhostId]: [1, argGhostShadow],
      [argLayerId]: [1, argLayerShadow],
      [argAlignId]: [1, argAlignShadow],
      [argLSId]: [1, argLSShadow],
    },
    {},
    false, true, undefined,
    {
      tagName: "mutation",
      children: [],
      proccode: procCode,
      argumentids: JSON.stringify([argTextId, argXId, argYId, argSizeId, argColorId, argBrightId, argGhostId, argLayerId, argAlignId, argLSId]),
      argumentnames: JSON.stringify(["text", "x", "y", "size", "color", "brightness", "ghost", "layer", "align", "letterSpacing"]),
      argumentdefaults: JSON.stringify(["", "", "", "", "", "", "", "", "", ""]),
      warp: warpStr,
    });
  setParent(blocks, protoId, defId);

  mk(blocks, defId, "procedures_definition", { custom_block: [1, protoId] }, {}, true, false, [800, 0]);

  // Block body:
  // 1. Set __font_displayText from "text" arg (always, no Font_Config fallback)
  const bSetDT = uid(), rArgDT = uid();
  mk(blocks, rArgDT, "argument_reporter_string_number", {}, { VALUE: ["text", null] });
  setParent(blocks, rArgDT, bSetDT);
  mk(blocks, bSetDT, "data_setvariableto",
    { VALUE: blockInputStr(rArgDT) },
    { VARIABLE: ["__font_displayText", varDisplayText] });

  // 2. For each numeric/string parameter: if arg = "" → use Font_Config; else → use arg
  //    Font_Config indices: 1=x, 2=y, 3=size, 4=color, 5=brightness, 6=ghost, 7=layer, 8=align, 9=letterSpacing
  const bSetX = buildFontConfigLookup(varX, "__font_x", "x", 1);
  const bSetY = buildFontConfigLookup(varY, "__font_y", "y", 2);
  const bSetSizeVar = buildFontConfigLookup(varSize, "__font_size", "size", 3);
  const bSetColorVar = buildFontConfigLookup(varColor, "__font_color", "color", 4);
  const bSetBrightVar = buildFontConfigLookup(varBrightness, "__font_brightness", "brightness", 5);
  const bSetGhostVar = buildFontConfigLookup(varGhost, "__font_ghost", "ghost", 6);
  const bSetLayerVar = buildFontConfigLookup(varLayer, "__font_layer", "layer", 7);
  const bSetAlignVar = buildFontConfigLookup(varAlign, "__font_align", "align", 8, true);
  const bSetLSVar = buildFontConfigLookup(varLetterSpacing, "__font_letterSpacing", "letterSpacing", 9);

  // 3. Clear existing text:
  //    - Pen mode: call テキストをすべてクリアする directly (pen_eraseAll is instant, no empty frame)
  //    - Clone mode: broadcast __font_clear WITHOUT wait, then immediately start rendering.
  //      Clones created by __font_render did not exist when __font_clear was sent, so they
  //      will NOT receive it. Old clones delete themselves concurrently with new clones being
  //      rendered → no empty-screen frame → flicker-free even when called every frame.
  let clearBlockId: string;
  if (isPen) {
    const bCallClear = uid();
    mk(blocks, bCallClear, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: "テキストをすべてクリアする",
      argumentids: JSON.stringify([]),
      warp: warpStr,
    });
    clearBlockId = bCallClear;
  } else {
    // broadcast __font_clear (no wait) — old clones delete concurrently while new ones render
    const bBcClearNW = uid(), bcClearNWMenu = uid();
    mk(blocks, bcClearNWMenu, "event_broadcast_menu", {},
      { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
    setParent(blocks, bcClearNWMenu, bBcClearNW);
    mk(blocks, bBcClearNW, "event_broadcast", { BROADCAST_INPUT: [1, bcClearNWMenu] }, {});
    clearBlockId = bBcClearNW;
  }

  // 4. Call __font_doRender directly (warp=true → all characters appear simultaneously)
  const bCallDoRender = uid();
  mk(blocks, bCallDoRender, "procedures_call", {}, {}, false, false, undefined, {
    tagName: "mutation",
    children: [],
    proccode: doRenderProcCode,
    argumentids: JSON.stringify([]),
    warp: "true",
  });

  chain(blocks, [defId, bSetDT, bSetX, bSetY, bSetSizeVar, bSetColorVar, bSetBrightVar, bSetGhostVar, bSetLayerVar, bSetAlignVar, bSetLSVar, clearBlockId, bCallDoRender]);
  } // end if (textInputMode === "param")

  // ── Script 5 (Mode 2): テキストを表示する (richText) x:(x) y:(y) ──
  if (textInputMode === "richtext") {
    const procCode2 = "テキストを表示する %s x: %s y: %s";
    const rt2TextId = uid(), rt2XId = uid(), rt2YId = uid();
    const rt2ProtoId = uid(), rt2DefId = uid();
    const rt2TextShadow = uid(), rt2XShadow = uid(), rt2YShadow = uid();

    mk(blocks, rt2TextShadow, "argument_reporter_string_number", {}, { VALUE: ["text", null] }, false, true);
    setParent(blocks, rt2TextShadow, rt2ProtoId);
    mk(blocks, rt2XShadow, "argument_reporter_string_number", {}, { VALUE: ["x", null] }, false, true);
    setParent(blocks, rt2XShadow, rt2ProtoId);
    mk(blocks, rt2YShadow, "argument_reporter_string_number", {}, { VALUE: ["y", null] }, false, true);
    setParent(blocks, rt2YShadow, rt2ProtoId);

    mk(blocks, rt2ProtoId, "procedures_prototype",
      {
        [rt2TextId]: [1, rt2TextShadow],
        [rt2XId]: [1, rt2XShadow],
        [rt2YId]: [1, rt2YShadow],
      },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: procCode2,
        argumentids: JSON.stringify([rt2TextId, rt2XId, rt2YId]),
        argumentnames: JSON.stringify(["text", "x", "y"]),
        argumentdefaults: JSON.stringify(["", "", ""]),
        warp: warpStr,
      });
    setParent(blocks, rt2ProtoId, rt2DefId);
    mk(blocks, rt2DefId, "procedures_definition", { custom_block: [1, rt2ProtoId] }, {}, true, false, [800, 0]);

    // 1. set __font_displayText = arg text
    const rt2SetDT = uid(), rt2ArgDT = uid();
    mk(blocks, rt2ArgDT, "argument_reporter_string_number", {}, { VALUE: ["text", null] });
    setParent(blocks, rt2ArgDT, rt2SetDT);
    mk(blocks, rt2SetDT, "data_setvariableto",
      { VALUE: blockInputStr(rt2ArgDT) },
      { VARIABLE: ["__font_displayText", varDisplayText] });

    // 2. x/y from arg (Font_Config fallback); size/color/etc. from Font_Config only
    const rt2SetX = buildFontConfigLookup(varX, "__font_x", "x", 1);
    const rt2SetY = buildFontConfigLookup(varY, "__font_y", "y", 2);
    const rt2SetSize  = buildFontConfigSet(varSize,         "__font_size",          3);
    const rt2SetColor = buildFontConfigSet(varColor,        "__font_color",         4);
    const rt2SetBright = buildFontConfigSet(varBrightness,  "__font_brightness",    5);
    const rt2SetGhost  = buildFontConfigSet(varGhost,       "__font_ghost",         6);
    const rt2SetLayer  = buildFontConfigSet(varLayer,       "__font_layer",         7);
    const rt2SetAlign  = buildFontConfigSet(varAlign,       "__font_align",         8, true);
    const rt2SetLS     = buildFontConfigSet(varLetterSpacing, "__font_letterSpacing", 9);

    // 3. Call __font_stripTags (strips <tag>...</tag> from __font_displayText)
    const rt2CallStrip = uid();
    mk(blocks, rt2CallStrip, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: "__font_stripTags",
      argumentids: JSON.stringify([]),
      warp: "true",
    });

    // 4. Clear + render
    let rt2ClearId: string;
    if (isPen) {
      const bCallClear2 = uid();
      mk(blocks, bCallClear2, "procedures_call", {}, {}, false, false, undefined, {
        tagName: "mutation",
        children: [],
        proccode: "テキストをすべてクリアする",
        argumentids: JSON.stringify([]),
        warp: warpStr,
      });
      rt2ClearId = bCallClear2;
    } else {
      const bBcClearNW2 = uid(), bcClearNWMenu2 = uid();
      mk(blocks, bcClearNWMenu2, "event_broadcast_menu", {},
        { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
      setParent(blocks, bcClearNWMenu2, bBcClearNW2);
      mk(blocks, bBcClearNW2, "event_broadcast", { BROADCAST_INPUT: [1, bcClearNWMenu2] }, {});
      rt2ClearId = bBcClearNW2;
    }

    const rt2CallRender = uid();
    mk(blocks, rt2CallRender, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: doRenderProcCode,
      argumentids: JSON.stringify([]),
      warp: "true",
    });

    chain(blocks, [rt2DefId, rt2SetDT, rt2SetX, rt2SetY, rt2SetSize, rt2SetColor, rt2SetBright, rt2SetGhost, rt2SetLayer, rt2SetAlign, rt2SetLS, rt2CallStrip, rt2ClearId, rt2CallRender]);

    // ── __font_stripTags helper (warp=true) ──
    // Strips <tag> markup from __font_displayText; uses __pp_* variables
    const stripProtoId = uid(), stripDefId = uid();
    mk(blocks, stripProtoId, "procedures_prototype",
      {}, {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: "__font_stripTags",
        argumentids: JSON.stringify([]),
        argumentnames: JSON.stringify([]),
        argumentdefaults: JSON.stringify([]),
        warp: "true",
      });
    setParent(blocks, stripProtoId, stripDefId);
    mk(blocks, stripDefId, "procedures_definition", { custom_block: [1, stripProtoId] }, {}, true, false, [800, 600]);

    // set __pp_buf = ""
    const sBufInit = uid();
    mk(blocks, sBufInit, "data_setvariableto", { VALUE: strLit("") }, { VARIABLE: ["__pp_buf", varPpBuf] });
    // set __pp_i = 1
    const sIInit = uid();
    mk(blocks, sIInit, "data_setvariableto", { VALUE: numLit(1) }, { VARIABLE: ["__pp_i", varPpI] });
    // set __pp_inTag = 0
    const sInTagInit = uid();
    mk(blocks, sInTagInit, "data_setvariableto", { VALUE: numLit(0) }, { VARIABLE: ["__pp_inTag", varPpInTag] });

    // repeat (length of __font_displayText)
    const sRepeatId = uid();
    const sLenDTStrip = uid(), sLenDTVarStrip = uid();
    mk(blocks, sLenDTVarStrip, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, sLenDTVarStrip, sLenDTStrip);
    mk(blocks, sLenDTStrip, "operator_length", { STRING: blockInputStr(sLenDTVarStrip) }, {});
    setParent(blocks, sLenDTStrip, sRepeatId);

    // set __pp_ch = letter(__pp_i) of __font_displayText
    const sSetCh = uid();
    const sLetterI = mkLetterOf(blocks, varPpI, "__pp_i", varDisplayText, "__font_displayText");
    setParent(blocks, sLetterI, sSetCh);
    mk(blocks, sSetCh, "data_setvariableto", { VALUE: blockInputStr(sLetterI) }, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sSetCh, sRepeatId);

    // if __pp_ch = "<": set __pp_inTag = 1
    const sChVarLt = uid(), sChEqLt = uid();
    mk(blocks, sChVarLt, "data_variable", {}, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sChVarLt, sChEqLt);
    mk(blocks, sChEqLt, "operator_equals", { OPERAND1: blockInputStr(sChVarLt), OPERAND2: strLit("<") }, {});
    const sSetInTag1 = uid();
    mk(blocks, sSetInTag1, "data_setvariableto", { VALUE: numLit(1) }, { VARIABLE: ["__pp_inTag", varPpInTag] });
    const sIfLt = uid();
    setParent(blocks, sChEqLt, sIfLt);
    setParent(blocks, sSetInTag1, sIfLt);
    mk(blocks, sIfLt, "control_if", { CONDITION: boolInput(sChEqLt), SUBSTACK: substackInput(sSetInTag1) }, {});

    // if __pp_ch = ">": set __pp_inTag = 0
    const sChVarGt = uid(), sChEqGt = uid();
    mk(blocks, sChVarGt, "data_variable", {}, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sChVarGt, sChEqGt);
    mk(blocks, sChEqGt, "operator_equals", { OPERAND1: blockInputStr(sChVarGt), OPERAND2: strLit(">") }, {});
    const sSetInTag0 = uid();
    mk(blocks, sSetInTag0, "data_setvariableto", { VALUE: numLit(0) }, { VARIABLE: ["__pp_inTag", varPpInTag] });
    const sIfGt = uid();
    setParent(blocks, sChEqGt, sIfGt);
    setParent(blocks, sSetInTag0, sIfGt);
    mk(blocks, sIfGt, "control_if", { CONDITION: boolInput(sChEqGt), SUBSTACK: substackInput(sSetInTag0) }, {});

    // if NOT (__pp_inTag = 1) AND NOT (__pp_ch = "<") AND NOT (__pp_ch = ">"): buf = join(buf, ch)
    const sInTagV = uid(), sInTagEq1 = uid(), sNotInTag = uid();
    mk(blocks, sInTagV, "data_variable", {}, { VARIABLE: ["__pp_inTag", varPpInTag] });
    setParent(blocks, sInTagV, sInTagEq1);
    mk(blocks, sInTagEq1, "operator_equals", { OPERAND1: blockInput(sInTagV), OPERAND2: numLit(1) }, {});
    setParent(blocks, sInTagEq1, sNotInTag);
    mk(blocks, sNotInTag, "operator_not", { OPERAND: boolInput(sInTagEq1) }, {});

    const sChVarLt2 = uid(), sChEqLt2 = uid(), sNotLt = uid();
    mk(blocks, sChVarLt2, "data_variable", {}, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sChVarLt2, sChEqLt2);
    mk(blocks, sChEqLt2, "operator_equals", { OPERAND1: blockInputStr(sChVarLt2), OPERAND2: strLit("<") }, {});
    setParent(blocks, sChEqLt2, sNotLt);
    mk(blocks, sNotLt, "operator_not", { OPERAND: boolInput(sChEqLt2) }, {});

    const sChVarGt2 = uid(), sChEqGt2 = uid(), sNotGt = uid();
    mk(blocks, sChVarGt2, "data_variable", {}, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sChVarGt2, sChEqGt2);
    mk(blocks, sChEqGt2, "operator_equals", { OPERAND1: blockInputStr(sChVarGt2), OPERAND2: strLit(">") }, {});
    setParent(blocks, sChEqGt2, sNotGt);
    mk(blocks, sNotGt, "operator_not", { OPERAND: boolInput(sChEqGt2) }, {});

    const sAndAB = uid();
    setParent(blocks, sNotInTag, sAndAB);
    setParent(blocks, sNotLt, sAndAB);
    mk(blocks, sAndAB, "operator_and", { OPERAND1: boolInput(sNotInTag), OPERAND2: boolInput(sNotLt) }, {});
    const sAndABC = uid();
    setParent(blocks, sAndAB, sAndABC);
    setParent(blocks, sNotGt, sAndABC);
    mk(blocks, sAndABC, "operator_and", { OPERAND1: boolInput(sAndAB), OPERAND2: boolInput(sNotGt) }, {});

    const sBufVar = uid(), sChVarJ = uid(), sJoin = uid(), sSetBuf = uid();
    mk(blocks, sBufVar, "data_variable", {}, { VARIABLE: ["__pp_buf", varPpBuf] });
    mk(blocks, sChVarJ, "data_variable", {}, { VARIABLE: ["__pp_ch", varPpCh] });
    setParent(blocks, sBufVar, sJoin);
    setParent(blocks, sChVarJ, sJoin);
    mk(blocks, sJoin, "operator_join", { STRING1: blockInputStr(sBufVar), STRING2: blockInputStr(sChVarJ) }, {});
    setParent(blocks, sJoin, sSetBuf);
    mk(blocks, sSetBuf, "data_setvariableto", { VALUE: blockInputStr(sJoin) }, { VARIABLE: ["__pp_buf", varPpBuf] });
    const sIfAppend = uid();
    setParent(blocks, sAndABC, sIfAppend);
    setParent(blocks, sSetBuf, sIfAppend);
    mk(blocks, sIfAppend, "control_if", { CONDITION: boolInput(sAndABC), SUBSTACK: substackInput(sSetBuf) }, {});

    // change __pp_i by 1
    const sChangeI = uid();
    mk(blocks, sChangeI, "data_changevariableby", { VALUE: numLit(1) }, { VARIABLE: ["__pp_i", varPpI] });

    chain(blocks, [sSetCh, sIfLt, sIfGt, sIfAppend, sChangeI]);
    mk(blocks, sRepeatId, "control_repeat", {
      TIMES: blockInput(sLenDTStrip, 10),
      SUBSTACK: substackInput(sSetCh),
    }, {});

    // set __font_displayText = __pp_buf
    const sBufVarFinal = uid(), sSetDTFinal = uid();
    mk(blocks, sBufVarFinal, "data_variable", {}, { VARIABLE: ["__pp_buf", varPpBuf] });
    setParent(blocks, sBufVarFinal, sSetDTFinal);
    mk(blocks, sSetDTFinal, "data_setvariableto", { VALUE: blockInputStr(sBufVarFinal) }, { VARIABLE: ["__font_displayText", varDisplayText] });

    chain(blocks, [stripDefId, sBufInit, sIInit, sInTagInit, sRepeatId, sSetDTFinal]);
  } // end if (textInputMode === "richtext")

  // ── Script 5 (Mode 3): __font_console_run ──
  if (textInputMode === "console") {
    const conProcCode = "__font_console_run";
    const conProtoId = uid(), conDefId = uid();
    mk(blocks, conProtoId, "procedures_prototype",
      {}, {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: conProcCode,
        argumentids: JSON.stringify([]),
        argumentnames: JSON.stringify([]),
        argumentdefaults: JSON.stringify([]),
        warp: warpStr,
      });
    setParent(blocks, conProtoId, conDefId);
    mk(blocks, conDefId, "procedures_definition", { custom_block: [1, conProtoId] }, {}, true, false, [800, 0]);

    // 1. Clear screen once at start
    let conClearId: string;
    if (isPen) {
      const bConClearPen = uid();
      mk(blocks, bConClearPen, "procedures_call", {}, {}, false, false, undefined, {
        tagName: "mutation",
        children: [],
        proccode: "テキストをすべてクリアする",
        argumentids: JSON.stringify([]),
        warp: warpStr,
      });
      conClearId = bConClearPen;
    } else {
      const bConClearBc = uid(), conClearMenu = uid();
      mk(blocks, conClearMenu, "event_broadcast_menu", {},
        { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
      setParent(blocks, conClearMenu, bConClearBc);
      mk(blocks, bConClearBc, "event_broadcast", { BROADCAST_INPUT: [1, conClearMenu] }, {});
      conClearId = bConClearBc;
    }

    // 2. Initialize style vars from Font_Config defaults
    const conInitSize  = buildFontConfigSet(varSize,         "__font_size",          3);
    const conInitColor = buildFontConfigSet(varColor,        "__font_color",         4);
    const conInitBright = buildFontConfigSet(varBrightness,  "__font_brightness",    5);
    const conInitGhost  = buildFontConfigSet(varGhost,       "__font_ghost",         6);
    const conInitLayer  = buildFontConfigSet(varLayer,       "__font_layer",         7);
    const conInitAlign  = buildFontConfigSet(varAlign,       "__font_align",         8, true);
    const conInitLS     = buildFontConfigSet(varLetterSpacing, "__font_letterSpacing", 9);
    const conInitX      = buildFontConfigSet(varX,           "__font_x",             1);
    const conInitY      = buildFontConfigSet(varY,           "__font_y",             2);
    const conInitDT = uid();
    mk(blocks, conInitDT, "data_setvariableto", { VALUE: strLit("") },
      { VARIABLE: ["__font_displayText", varDisplayText] });

    // 3. set __con_i = 1
    const conSetI = uid();
    mk(blocks, conSetI, "data_setvariableto", { VALUE: numLit(1) }, { VARIABLE: ["__con_i", varConI] });

    // ── outer repeat (length of [文字表示コンソール]) ──
    const conOuterRepeat = uid();
    const conLenList = uid();
    mk(blocks, conLenList, "data_lengthoflist", {}, { LIST: ["文字表示コンソール", listConsole] });
    setParent(blocks, conLenList, conOuterRepeat);

    // set __con_line = item(__con_i) of [文字表示コンソール]
    const conConIVar = uid(), conItemLine = uid(), conSetLine = uid();
    mk(blocks, conConIVar, "data_variable", {}, { VARIABLE: ["__con_i", varConI] });
    setParent(blocks, conConIVar, conItemLine);
    mk(blocks, conItemLine, "data_itemoflist", { INDEX: blockInput(conConIVar) }, { LIST: ["文字表示コンソール", listConsole] });
    setParent(blocks, conItemLine, conSetLine);
    mk(blocks, conSetLine, "data_setvariableto", { VALUE: blockInputStr(conItemLine) },
      { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conSetLine, conOuterRepeat);

    // skip check: NOT ((length=0) OR (letter1="/"))
    const conLineVar0 = uid(), conLenLine = uid(), conLenEqZero = uid();
    mk(blocks, conLineVar0, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conLineVar0, conLenLine);
    mk(blocks, conLenLine, "operator_length", { STRING: blockInputStr(conLineVar0) }, {});
    setParent(blocks, conLenLine, conLenEqZero);
    mk(blocks, conLenEqZero, "operator_equals", { OPERAND1: blockInput(conLenLine), OPERAND2: numLit(0) }, {});

    const conLineVar1 = uid(), conLetter1 = uid(), conLetter1EqSlash = uid();
    mk(blocks, conLineVar1, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conLineVar1, conLetter1);
    mk(blocks, conLetter1, "operator_letter_of", { LETTER: numLit(1), STRING: blockInputStr(conLineVar1) }, {});
    setParent(blocks, conLetter1, conLetter1EqSlash);
    mk(blocks, conLetter1EqSlash, "operator_equals",
      { OPERAND1: blockInputStr(conLetter1), OPERAND2: strLit("/") }, {});

    const conOrSkip = uid();
    setParent(blocks, conLenEqZero, conOrSkip);
    setParent(blocks, conLetter1EqSlash, conOrSkip);
    mk(blocks, conOrSkip, "operator_or",
      { OPERAND1: boolInput(conLenEqZero), OPERAND2: boolInput(conLetter1EqSlash) }, {});
    const conNotSkip = uid();
    setParent(blocks, conOrSkip, conNotSkip);
    mk(blocks, conNotSkip, "operator_not", { OPERAND: boolInput(conOrSkip) }, {});

    // separator check: __con_line = "---"
    const conLineVarSep = uid(), conLineEqSep = uid();
    mk(blocks, conLineVarSep, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conLineVarSep, conLineEqSep);
    mk(blocks, conLineEqSep, "operator_equals",
      { OPERAND1: blockInputStr(conLineVarSep), OPERAND2: strLit("---") }, {});

    // flush if displayText != "" (called on ---)
    const conDTVarEmp = uid(), conDTEqEmp = uid(), conNotDTEmp = uid();
    mk(blocks, conDTVarEmp, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, conDTVarEmp, conDTEqEmp);
    mk(blocks, conDTEqEmp, "operator_equals",
      { OPERAND1: blockInputStr(conDTVarEmp), OPERAND2: strLit("") }, {});
    setParent(blocks, conDTEqEmp, conNotDTEmp);
    mk(blocks, conNotDTEmp, "operator_not", { OPERAND: boolInput(conDTEqEmp) }, {});

    // call doRender (inside flush)
    const conCallRenderFlush = uid();
    mk(blocks, conCallRenderFlush, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: doRenderProcCode,
      argumentids: JSON.stringify([]),
      warp: "true",
    });

    // reset displayText + state vars after flush
    const conResetDT = uid();
    mk(blocks, conResetDT, "data_setvariableto", { VALUE: strLit("") },
      { VARIABLE: ["__font_displayText", varDisplayText] });
    const conResetSize  = buildFontConfigSet(varSize,          "__font_size",           3);
    const conResetColor = buildFontConfigSet(varColor,         "__font_color",          4);
    const conResetBright = buildFontConfigSet(varBrightness,   "__font_brightness",     5);
    const conResetGhost  = buildFontConfigSet(varGhost,        "__font_ghost",          6);
    const conResetLayer  = buildFontConfigSet(varLayer,        "__font_layer",          7);
    const conResetAlign  = buildFontConfigSet(varAlign,        "__font_align",          8, true);
    const conResetLS     = buildFontConfigSet(varLetterSpacing, "__font_letterSpacing", 9);
    const conResetX      = buildFontConfigSet(varX,            "__font_x",              1);
    const conResetY      = buildFontConfigSet(varY,            "__font_y",              2);
    chain(blocks, [conCallRenderFlush, conResetDT, conResetSize, conResetColor, conResetBright,
      conResetGhost, conResetLayer, conResetAlign, conResetLS, conResetX, conResetY]);

    const conIfHasDT = uid();
    setParent(blocks, conNotDTEmp, conIfHasDT);
    setParent(blocks, conCallRenderFlush, conIfHasDT);
    mk(blocks, conIfHasDT, "control_if",
      { CONDITION: boolInput(conNotDTEmp), SUBSTACK: substackInput(conCallRenderFlush) }, {});

    // ── key:value parse branch (else branch of --- check) ──
    // Find colon position
    const conFindRepeat = uid();
    const conSetColPos0 = uid();
    mk(blocks, conSetColPos0, "data_setvariableto", { VALUE: numLit(0) },
      { VARIABLE: ["__con_colPos", varConColPos] });
    const conSetJ1Find = uid();
    mk(blocks, conSetJ1Find, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__con_j", varConJ] });

    const conLineVarFind = uid(), conLenLineFind = uid();
    mk(blocks, conLineVarFind, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conLineVarFind, conLenLineFind);
    mk(blocks, conLenLineFind, "operator_length", { STRING: blockInputStr(conLineVarFind) }, {});
    setParent(blocks, conLenLineFind, conFindRepeat);

    const conFindJVar = uid(), conFindLineVar = uid(), conFindLetter = uid();
    mk(blocks, conFindJVar, "data_variable", {}, { VARIABLE: ["__con_j", varConJ] });
    mk(blocks, conFindLineVar, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conFindJVar, conFindLetter);
    setParent(blocks, conFindLineVar, conFindLetter);
    mk(blocks, conFindLetter, "operator_letter_of",
      { LETTER: blockInput(conFindJVar, 1), STRING: blockInputStr(conFindLineVar) }, {});
    const conFindEqColon = uid();
    setParent(blocks, conFindLetter, conFindEqColon);
    mk(blocks, conFindEqColon, "operator_equals",
      { OPERAND1: blockInputStr(conFindLetter), OPERAND2: strLit(":") }, {});

    const conColPosVarZ = uid(), conColPosEqZ = uid();
    mk(blocks, conColPosVarZ, "data_variable", {}, { VARIABLE: ["__con_colPos", varConColPos] });
    setParent(blocks, conColPosVarZ, conColPosEqZ);
    mk(blocks, conColPosEqZ, "operator_equals",
      { OPERAND1: blockInput(conColPosVarZ), OPERAND2: numLit(0) }, {});

    const conFindAnd = uid();
    setParent(blocks, conFindEqColon, conFindAnd);
    setParent(blocks, conColPosEqZ, conFindAnd);
    mk(blocks, conFindAnd, "operator_and",
      { OPERAND1: boolInput(conFindEqColon), OPERAND2: boolInput(conColPosEqZ) }, {});

    const conFindSetColPos = uid(), conFindJVarSet = uid();
    mk(blocks, conFindJVarSet, "data_variable", {}, { VARIABLE: ["__con_j", varConJ] });
    setParent(blocks, conFindJVarSet, conFindSetColPos);
    mk(blocks, conFindSetColPos, "data_setvariableto", { VALUE: blockInput(conFindJVarSet) },
      { VARIABLE: ["__con_colPos", varConColPos] });
    const conFindIf = uid();
    setParent(blocks, conFindAnd, conFindIf);
    setParent(blocks, conFindSetColPos, conFindIf);
    mk(blocks, conFindIf, "control_if",
      { CONDITION: boolInput(conFindAnd), SUBSTACK: substackInput(conFindSetColPos) }, {});

    const conFindChangeJ = uid();
    mk(blocks, conFindChangeJ, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__con_j", varConJ] });
    chain(blocks, [conFindIf, conFindChangeJ]);
    setParent(blocks, conFindIf, conFindRepeat);
    mk(blocks, conFindRepeat, "control_repeat", {
      TIMES: blockInput(conLenLineFind, 10),
      SUBSTACK: substackInput(conFindIf),
    }, {});

    // Extract key (chars 1..colPos-1)
    const conSetKey0 = uid();
    mk(blocks, conSetKey0, "data_setvariableto", { VALUE: strLit("") },
      { VARIABLE: ["__con_key", varConKey] });
    const conSetJKey = uid();
    mk(blocks, conSetJKey, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__con_j", varConJ] });

    const conKeyRepeat = uid();
    const conColPosVarKey = uid(), conColPosMinus1 = uid();
    mk(blocks, conColPosVarKey, "data_variable", {}, { VARIABLE: ["__con_colPos", varConColPos] });
    setParent(blocks, conColPosVarKey, conColPosMinus1);
    mk(blocks, conColPosMinus1, "operator_subtract",
      { NUM1: blockInput(conColPosVarKey), NUM2: numLit(1) }, {});
    setParent(blocks, conColPosMinus1, conKeyRepeat);

    const conKeyJVar = uid(), conKeyLineVar = uid(), conKeyLetter = uid();
    mk(blocks, conKeyJVar, "data_variable", {}, { VARIABLE: ["__con_j", varConJ] });
    mk(blocks, conKeyLineVar, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conKeyJVar, conKeyLetter);
    setParent(blocks, conKeyLineVar, conKeyLetter);
    mk(blocks, conKeyLetter, "operator_letter_of",
      { LETTER: blockInput(conKeyJVar, 1), STRING: blockInputStr(conKeyLineVar) }, {});
    const conKeyVar = uid(), conKeyJoin = uid(), conSetKey = uid();
    mk(blocks, conKeyVar, "data_variable", {}, { VARIABLE: ["__con_key", varConKey] });
    setParent(blocks, conKeyVar, conKeyJoin);
    setParent(blocks, conKeyLetter, conKeyJoin);
    mk(blocks, conKeyJoin, "operator_join",
      { STRING1: blockInputStr(conKeyVar), STRING2: blockInputStr(conKeyLetter) }, {});
    setParent(blocks, conKeyJoin, conSetKey);
    mk(blocks, conSetKey, "data_setvariableto", { VALUE: blockInputStr(conKeyJoin) },
      { VARIABLE: ["__con_key", varConKey] });
    const conKeyChangeJ = uid();
    mk(blocks, conKeyChangeJ, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__con_j", varConJ] });
    chain(blocks, [conSetKey, conKeyChangeJ]);
    setParent(blocks, conSetKey, conKeyRepeat);
    mk(blocks, conKeyRepeat, "control_repeat", {
      TIMES: blockInput(conColPosMinus1, 0),
      SUBSTACK: substackInput(conSetKey),
    }, {});

    // Extract value (chars colPos+1..end)
    const conSetVal0 = uid();
    mk(blocks, conSetVal0, "data_setvariableto", { VALUE: strLit("") },
      { VARIABLE: ["__con_val", varConVal] });
    const conColPosVarPlus = uid(), conColPosPlusOne = uid(), conSetJVal = uid();
    mk(blocks, conColPosVarPlus, "data_variable", {}, { VARIABLE: ["__con_colPos", varConColPos] });
    setParent(blocks, conColPosVarPlus, conColPosPlusOne);
    mk(blocks, conColPosPlusOne, "operator_add",
      { NUM1: blockInput(conColPosVarPlus), NUM2: numLit(1) }, {});
    setParent(blocks, conColPosPlusOne, conSetJVal);
    mk(blocks, conSetJVal, "data_setvariableto", { VALUE: blockInput(conColPosPlusOne) },
      { VARIABLE: ["__con_j", varConJ] });

    const conValRepeat = uid();
    const conLineVarVal = uid(), conLenLineVal = uid();
    mk(blocks, conLineVarVal, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conLineVarVal, conLenLineVal);
    mk(blocks, conLenLineVal, "operator_length", { STRING: blockInputStr(conLineVarVal) }, {});
    const conColPosVarMinus = uid(), conLenMinusCol = uid();
    mk(blocks, conColPosVarMinus, "data_variable", {}, { VARIABLE: ["__con_colPos", varConColPos] });
    setParent(blocks, conLenLineVal, conLenMinusCol);
    setParent(blocks, conColPosVarMinus, conLenMinusCol);
    mk(blocks, conLenMinusCol, "operator_subtract",
      { NUM1: blockInput(conLenLineVal), NUM2: blockInput(conColPosVarMinus) }, {});
    setParent(blocks, conLenMinusCol, conValRepeat);

    const conValJVar = uid(), conValLineVar = uid(), conValLetter = uid();
    mk(blocks, conValJVar, "data_variable", {}, { VARIABLE: ["__con_j", varConJ] });
    mk(blocks, conValLineVar, "data_variable", {}, { VARIABLE: ["__con_line", varConLine] });
    setParent(blocks, conValJVar, conValLetter);
    setParent(blocks, conValLineVar, conValLetter);
    mk(blocks, conValLetter, "operator_letter_of",
      { LETTER: blockInput(conValJVar, 1), STRING: blockInputStr(conValLineVar) }, {});
    const conValVar = uid(), conValJoin = uid(), conSetVal = uid();
    mk(blocks, conValVar, "data_variable", {}, { VARIABLE: ["__con_val", varConVal] });
    setParent(blocks, conValVar, conValJoin);
    setParent(blocks, conValLetter, conValJoin);
    mk(blocks, conValJoin, "operator_join",
      { STRING1: blockInputStr(conValVar), STRING2: blockInputStr(conValLetter) }, {});
    setParent(blocks, conValJoin, conSetVal);
    mk(blocks, conSetVal, "data_setvariableto", { VALUE: blockInputStr(conValJoin) },
      { VARIABLE: ["__con_val", varConVal] });
    const conValChangeJ = uid();
    mk(blocks, conValChangeJ, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__con_j", varConJ] });
    chain(blocks, [conSetVal, conValChangeJ]);
    setParent(blocks, conSetVal, conValRepeat);
    mk(blocks, conValRepeat, "control_repeat", {
      TIMES: blockInput(conLenMinusCol, 0),
      SUBSTACK: substackInput(conSetVal),
    }, {});

    // Key dispatch: if __con_key = "X" → set __font_X = __con_val
    function buildKeyDispatch(tVarId: string, tVarName: string, keyStr: string, isStr = false): string {
      const kKeyVar = uid(), kKeyEq = uid();
      mk(blocks, kKeyVar, "data_variable", {}, { VARIABLE: ["__con_key", varConKey] });
      setParent(blocks, kKeyVar, kKeyEq);
      mk(blocks, kKeyEq, "operator_equals",
        { OPERAND1: blockInputStr(kKeyVar), OPERAND2: strLit(keyStr) }, {});
      const kValVar = uid(), kValSet = uid();
      mk(blocks, kValVar, "data_variable", {}, { VARIABLE: ["__con_val", varConVal] });
      setParent(blocks, kValVar, kValSet);
      mk(blocks, kValSet, "data_setvariableto", {
        VALUE: isStr ? blockInputStr(kValVar) : blockInput(kValVar),
      }, { VARIABLE: [tVarName, tVarId] });
      const kIf = uid();
      setParent(blocks, kKeyEq, kIf);
      setParent(blocks, kValSet, kIf);
      mk(blocks, kIf, "control_if",
        { CONDITION: boolInput(kKeyEq), SUBSTACK: substackInput(kValSet) }, {});
      return kIf;
    }

    const dText   = buildKeyDispatch(varDisplayText,    "__font_displayText",   "text",          true);
    const dX      = buildKeyDispatch(varX,              "__font_x",             "x");
    const dY      = buildKeyDispatch(varY,              "__font_y",             "y");
    const dSize   = buildKeyDispatch(varSize,           "__font_size",          "size");
    const dColor  = buildKeyDispatch(varColor,          "__font_color",         "color");
    const dGhost  = buildKeyDispatch(varGhost,          "__font_ghost",         "ghost");
    const dBright = buildKeyDispatch(varBrightness,     "__font_brightness",    "brightness");
    const dAlign  = buildKeyDispatch(varAlign,          "__font_align",         "align",         true);
    const dLS     = buildKeyDispatch(varLetterSpacing,  "__font_letterSpacing", "letterSpacing");
    const dLayer  = buildKeyDispatch(varLayer,          "__font_layer",         "layer");
    chain(blocks, [dText, dX, dY, dSize, dColor, dGhost, dBright, dAlign, dLS, dLayer]);

    // if colPos != 0: run key/val extraction + dispatch
    const conColPosVarNZ = uid(), conColPosEqNZ = uid(), conNotColEqZ = uid();
    mk(blocks, conColPosVarNZ, "data_variable", {}, { VARIABLE: ["__con_colPos", varConColPos] });
    setParent(blocks, conColPosVarNZ, conColPosEqNZ);
    mk(blocks, conColPosEqNZ, "operator_equals",
      { OPERAND1: blockInput(conColPosVarNZ), OPERAND2: numLit(0) }, {});
    setParent(blocks, conColPosEqNZ, conNotColEqZ);
    mk(blocks, conNotColEqZ, "operator_not", { OPERAND: boolInput(conColPosEqNZ) }, {});

    // chain: setKey0 → setJKey → keyRepeat → setVal0 → setJVal → valRepeat → dispatch
    chain(blocks, [conSetKey0, conSetJKey, conKeyRepeat, conSetVal0, conSetJVal, conValRepeat, dText]);

    const conIfColFound = uid();
    setParent(blocks, conNotColEqZ, conIfColFound);
    setParent(blocks, conSetKey0, conIfColFound);
    mk(blocks, conIfColFound, "control_if",
      { CONDITION: boolInput(conNotColEqZ), SUBSTACK: substackInput(conSetKey0) }, {});

    // parse branch: setColPos0 → setJ1 → findRepeat → ifColFound
    chain(blocks, [conSetColPos0, conSetJ1Find, conFindRepeat, conIfColFound]);

    // if/else: line = "---" ? flush : parse
    const conIfSep = uid();
    setParent(blocks, conLineEqSep, conIfSep);
    setParent(blocks, conIfHasDT, conIfSep);
    setParent(blocks, conSetColPos0, conIfSep);
    mk(blocks, conIfSep, "control_if_else", {
      CONDITION: boolInput(conLineEqSep),
      SUBSTACK: substackInput(conIfHasDT),
      SUBSTACK2: substackInput(conSetColPos0),
    }, {});

    // outer if NOT skip
    const conChangeConI = uid();
    mk(blocks, conChangeConI, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__con_i", varConI] });
    const conIfNotSkip = uid();
    setParent(blocks, conNotSkip, conIfNotSkip);
    setParent(blocks, conIfSep, conIfNotSkip);
    mk(blocks, conIfNotSkip, "control_if",
      { CONDITION: boolInput(conNotSkip), SUBSTACK: substackInput(conIfSep) }, {});

    // body: setLine → ifNotSkip → changeConI
    chain(blocks, [conSetLine, conIfNotSkip, conChangeConI]);
    mk(blocks, conOuterRepeat, "control_repeat", {
      TIMES: blockInput(conLenList, 0),
      SUBSTACK: substackInput(conSetLine),
    }, {});

    // Final flush
    const conFinalDTVar = uid(), conFinalDTEq = uid(), conFinalNotEq = uid();
    mk(blocks, conFinalDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, conFinalDTVar, conFinalDTEq);
    mk(blocks, conFinalDTEq, "operator_equals",
      { OPERAND1: blockInputStr(conFinalDTVar), OPERAND2: strLit("") }, {});
    setParent(blocks, conFinalDTEq, conFinalNotEq);
    mk(blocks, conFinalNotEq, "operator_not", { OPERAND: boolInput(conFinalDTEq) }, {});
    const conFinalRender = uid();
    mk(blocks, conFinalRender, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: doRenderProcCode,
      argumentids: JSON.stringify([]),
      warp: "true",
    });
    const conFinalIf = uid();
    setParent(blocks, conFinalNotEq, conFinalIf);
    setParent(blocks, conFinalRender, conFinalIf);
    mk(blocks, conFinalIf, "control_if",
      { CONDITION: boolInput(conFinalNotEq), SUBSTACK: substackInput(conFinalRender) }, {});

    chain(blocks, [conDefId, conClearId, conInitSize, conInitColor, conInitBright, conInitGhost,
      conInitLayer, conInitAlign, conInitLS, conInitX, conInitY, conInitDT, conSetI,
      conOuterRepeat, conFinalIf]);
  } // end if (textInputMode === "console")

  // ── Script 6: Custom block ── テキストをすべてクリアする ──
  // This is the warp clear block called directly by テキストを表示する (no broadcast overhead)
  // PEN mode: directly calls pen_eraseAll
  // CLONE mode: broadcasts __font_clear and wait (so all clones can delete themselves)
  const clearProcCode = "テキストをすべてクリアする";
  const clearProtoId = uid(), clearDefId = uid();

  mk(blocks, clearProtoId, "procedures_prototype",
    {},
    {},
    false, true, undefined,
    {
      tagName: "mutation",
      children: [],
      proccode: clearProcCode,
      argumentids: JSON.stringify([]),
      argumentnames: JSON.stringify([]),
      argumentdefaults: JSON.stringify([]),
      warp: warpStr,
    });
  setParent(blocks, clearProtoId, clearDefId);

  mk(blocks, clearDefId, "procedures_definition", { custom_block: [1, clearProtoId] }, {}, true, false, [800, 500]);

  if (isPen) {
    // Pen mode: directly erase all pen marks (no broadcast needed)
    const bEraseDirect = uid();
    mk(blocks, bEraseDirect, "pen_eraseAll", {}, {});
    chain(blocks, [clearDefId, bEraseDirect]);
  } else {
    // Clone mode: broadcast __font_clear and wait (each clone will delete itself)
    const bClearBc = uid(), bClearBcMenu = uid();
    mk(blocks, bClearBcMenu, "event_broadcast_menu", {},
      { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
    setParent(blocks, bClearBcMenu, bClearBc);
    mk(blocks, bClearBc, "event_broadcastandwait", { BROADCAST_INPUT: [1, bClearBcMenu] }, {});
    chain(blocks, [clearDefId, bClearBc]);
  }

  // ── Script 7: Custom block ── テキストをタイプライター表示する ──
  // Renders text character by character with an optional per-character delay.
  // Warp is explicitly "false" so that wait blocks inside actually pause.
  // When space is pressed while running, __tw_skip is set to 1 to bypass waits.
  {
    const twProcCode = "テキストをタイプライター表示する %s x: %s y: %s 速さ: %s";
    const twArgTextId = uid(), twArgXId = uid(), twArgYId = uid(), twArgMsId = uid();
    const twProtoId = uid(), twDefId = uid();

    const twArgTextShadow = uid(), twArgXShadow = uid(), twArgYShadow = uid(), twArgMsShadow = uid();
    mk(blocks, twArgTextShadow, "argument_reporter_string_number", {}, { VALUE: ["text", null] }, false, true);
    setParent(blocks, twArgTextShadow, twProtoId);
    mk(blocks, twArgXShadow, "argument_reporter_string_number", {}, { VALUE: ["x", null] }, false, true);
    setParent(blocks, twArgXShadow, twProtoId);
    mk(blocks, twArgYShadow, "argument_reporter_string_number", {}, { VALUE: ["y", null] }, false, true);
    setParent(blocks, twArgYShadow, twProtoId);
    mk(blocks, twArgMsShadow, "argument_reporter_string_number", {}, { VALUE: ["msPerChar", null] }, false, true);
    setParent(blocks, twArgMsShadow, twProtoId);

    mk(blocks, twProtoId, "procedures_prototype",
      {
        [twArgTextId]: [1, twArgTextShadow],
        [twArgXId]: [1, twArgXShadow],
        [twArgYId]: [1, twArgYShadow],
        [twArgMsId]: [1, twArgMsShadow],
      },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: twProcCode,
        argumentids: JSON.stringify([twArgTextId, twArgXId, twArgYId, twArgMsId]),
        argumentnames: JSON.stringify(["text", "x", "y", "msPerChar"]),
        argumentdefaults: JSON.stringify(["", "", "", "60"]),
        warp: "false",
      });
    setParent(blocks, twProtoId, twDefId);
    mk(blocks, twDefId, "procedures_definition", { custom_block: [1, twProtoId] }, {}, true, false, [800, 700]);

    // 1. set __font_displayText = text arg
    const twSetDT = uid(), twArgDTVal = uid();
    mk(blocks, twArgDTVal, "argument_reporter_string_number", {}, { VALUE: ["text", null] });
    setParent(blocks, twArgDTVal, twSetDT);
    mk(blocks, twSetDT, "data_setvariableto",
      { VALUE: blockInputStr(twArgDTVal) },
      { VARIABLE: ["__font_displayText", varDisplayText] });

    // 2. set __font_x = x arg (if "" use Font_Config[1])
    const twSetX = uid(), twArgXVal = uid(), twXCond = uid(), twXItem = uid(), twXFromArg = uid(), twSetXIf = uid();
    mk(blocks, twArgXVal, "argument_reporter_string_number", {}, { VALUE: ["x", null] });
    mk(blocks, twXCond, "operator_equals", {
      OPERAND1: blockInputStr(twArgXVal),
      OPERAND2: strLit(""),
    }, {});
    setParent(blocks, twArgXVal, twXCond);
    mk(blocks, twXItem, "data_itemoflist", { INDEX: numLit(1) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetX, "data_setvariableto",
      { VALUE: blockInput(twXItem) },
      { VARIABLE: ["__font_x", varX] });
    setParent(blocks, twXItem, twSetX);
    const twArgXVal2 = uid();
    mk(blocks, twArgXVal2, "argument_reporter_string_number", {}, { VALUE: ["x", null] });
    mk(blocks, twXFromArg, "data_setvariableto",
      { VALUE: blockInput(twArgXVal2) },
      { VARIABLE: ["__font_x", varX] });
    setParent(blocks, twArgXVal2, twXFromArg);
    mk(blocks, twSetXIf, "control_if_else", {
      CONDITION: boolInput(twXCond),
      SUBSTACK: substackInput(twSetX),
      SUBSTACK2: substackInput(twXFromArg),
    }, {});
    setParent(blocks, twXCond, twSetXIf);
    setParent(blocks, twSetX, twSetXIf);
    setParent(blocks, twXFromArg, twSetXIf);

    // 3. set __font_y = y arg (if "" use Font_Config[2])
    const twSetY = uid(), twArgYVal = uid(), twYCond = uid(), twYItem = uid(), twYFromArg = uid(), twSetYIf = uid();
    mk(blocks, twArgYVal, "argument_reporter_string_number", {}, { VALUE: ["y", null] });
    mk(blocks, twYCond, "operator_equals", {
      OPERAND1: blockInputStr(twArgYVal),
      OPERAND2: strLit(""),
    }, {});
    setParent(blocks, twArgYVal, twYCond);
    mk(blocks, twYItem, "data_itemoflist", { INDEX: numLit(2) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetY, "data_setvariableto",
      { VALUE: blockInput(twYItem) },
      { VARIABLE: ["__font_y", varY] });
    setParent(blocks, twYItem, twSetY);
    const twArgYVal2 = uid();
    mk(blocks, twArgYVal2, "argument_reporter_string_number", {}, { VALUE: ["y", null] });
    mk(blocks, twYFromArg, "data_setvariableto",
      { VALUE: blockInput(twArgYVal2) },
      { VARIABLE: ["__font_y", varY] });
    setParent(blocks, twArgYVal2, twYFromArg);
    mk(blocks, twSetYIf, "control_if_else", {
      CONDITION: boolInput(twYCond),
      SUBSTACK: substackInput(twSetY),
      SUBSTACK2: substackInput(twYFromArg),
    }, {});
    setParent(blocks, twYCond, twSetYIf);
    setParent(blocks, twSetY, twSetYIf);
    setParent(blocks, twYFromArg, twSetYIf);

    // 4. Call テキストをすべてクリアする
    const twCallClear = uid();
    mk(blocks, twCallClear, "procedures_call", {}, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: clearProcCode,
      argumentids: JSON.stringify([]),
      warp: warpStr,
    });

    // 5. set __tw_running = 1
    const twSetRunning = uid();
    mk(blocks, twSetRunning, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__tw_running", varTwRunning] });

    // 6. set __tw_skip = 0
    const twSetSkip0 = uid();
    mk(blocks, twSetSkip0, "data_setvariableto", { VALUE: numLit(0) },
      { VARIABLE: ["__tw_skip", varTwSkip] });

    // 7-10. Set size/color/brightness/ghost from Font_Config
    const twCfgSzItem = uid(), twSetSz = uid();
    mk(blocks, twCfgSzItem, "data_itemoflist", { INDEX: numLit(3) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetSz, "data_setvariableto",
      { VALUE: blockInput(twCfgSzItem) },
      { VARIABLE: ["__font_size", varSize] });
    setParent(blocks, twCfgSzItem, twSetSz);

    const twCfgColItem = uid(), twSetCol = uid();
    mk(blocks, twCfgColItem, "data_itemoflist", { INDEX: numLit(4) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetCol, "data_setvariableto",
      { VALUE: blockInput(twCfgColItem) },
      { VARIABLE: ["__font_color", varColor] });
    setParent(blocks, twCfgColItem, twSetCol);

    const twCfgBrItem = uid(), twSetBr = uid();
    mk(blocks, twCfgBrItem, "data_itemoflist", { INDEX: numLit(5) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetBr, "data_setvariableto",
      { VALUE: blockInput(twCfgBrItem) },
      { VARIABLE: ["__font_brightness", varBrightness] });
    setParent(blocks, twCfgBrItem, twSetBr);

    const twCfgGhItem = uid(), twSetGh = uid();
    mk(blocks, twCfgGhItem, "data_itemoflist", { INDEX: numLit(6) }, { LIST: ["Font_Config", listFontConfig] });
    mk(blocks, twSetGh, "data_setvariableto",
      { VALUE: blockInput(twCfgGhItem) },
      { VARIABLE: ["__font_ghost", varGhost] });
    setParent(blocks, twCfgGhItem, twSetGh);

    // 11. set __font_curX = __font_x
    const twSetCurX = uid(), twXVar = uid();
    mk(blocks, twXVar, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
    setParent(blocks, twXVar, twSetCurX);
    mk(blocks, twSetCurX, "data_setvariableto",
      { VALUE: blockInput(twXVar) },
      { VARIABLE: ["__font_curX", varCurX] });

    // 12. set __font_curY = __font_y
    const twSetCurY = uid(), twYVar = uid();
    mk(blocks, twYVar, "data_variable", {}, { VARIABLE: ["__font_y", varY] });
    setParent(blocks, twYVar, twSetCurY);
    mk(blocks, twSetCurY, "data_setvariableto",
      { VALUE: blockInput(twYVar) },
      { VARIABLE: ["__font_curY", varCurY] });

    // 13-16. Apply visual effects to the sprite
    const twApplySz = uid(), twSzVar = uid();
    mk(blocks, twSzVar, "data_variable", {}, { VARIABLE: ["__font_size", varSize] });
    setParent(blocks, twSzVar, twApplySz);
    mk(blocks, twApplySz, "looks_setsizeto", { SIZE: blockInput(twSzVar) }, {});

    const twApplyCol = uid(), twColVar = uid();
    mk(blocks, twColVar, "data_variable", {}, { VARIABLE: ["__font_color", varColor] });
    setParent(blocks, twColVar, twApplyCol);
    mk(blocks, twApplyCol, "looks_seteffectto", { VALUE: blockInput(twColVar) }, { EFFECT: ["color", null] });

    const twApplyBr = uid(), twBrVar = uid();
    mk(blocks, twBrVar, "data_variable", {}, { VARIABLE: ["__font_brightness", varBrightness] });
    setParent(blocks, twBrVar, twApplyBr);
    mk(blocks, twApplyBr, "looks_seteffectto", { VALUE: blockInput(twBrVar) }, { EFFECT: ["brightness", null] });

    const twApplyGh = uid(), twGhVar = uid();
    mk(blocks, twGhVar, "data_variable", {}, { VARIABLE: ["__font_ghost", varGhost] });
    setParent(blocks, twGhVar, twApplyGh);
    mk(blocks, twApplyGh, "looks_seteffectto", { VALUE: blockInput(twGhVar) }, { EFFECT: ["ghost", null] });

    // 17. set __font_i = 1
    const twSetI = uid();
    mk(blocks, twSetI, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    // 18. Repeat (length of __font_displayText) times
    const twRepeat = uid();
    const twLenDTVar = uid(), twLenDT = uid();
    mk(blocks, twLenDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, twLenDTVar, twLenDT);
    mk(blocks, twLenDT, "operator_length", { STRING: blockInputStr(twLenDTVar) }, {});
    setParent(blocks, twLenDT, twRepeat);

    // a. set __tw_char = letter __font_i of __font_displayText
    const twSetChar = uid(), twLetterChar = mkLetterOf(blocks, varI, "__font_i", varDisplayText, "__font_displayText");
    setParent(blocks, twLetterChar, twSetChar);
    mk(blocks, twSetChar, "data_setvariableto",
      { VALUE: blockInputStr(twLetterChar) },
      { VARIABLE: ["__tw_char", varTwChar] });

    // b. if __tw_char = "\":
    //      if letter (__font_i + 1) of displayText = "n": handle newline
    const twIfBS = uid(), twCondBS = uid(), twCharVar = uid();
    mk(blocks, twCharVar, "data_variable", {}, { VARIABLE: ["__tw_char", varTwChar] });
    setParent(blocks, twCharVar, twCondBS);
    mk(blocks, twCondBS, "operator_equals", {
      OPERAND1: blockInputStr(twCharVar),
      OPERAND2: strLit("\\"),
    }, {});
    setParent(blocks, twCondBS, twIfBS);

    // i+1 block
    const twIPlusVar = uid(), twIPlus1 = uid();
    mk(blocks, twIPlusVar, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
    setParent(blocks, twIPlusVar, twIPlus1);
    mk(blocks, twIPlus1, "operator_add", { NUM1: blockInput(twIPlusVar, 1), NUM2: numLit(1) }, {});

    // letter (i+1) of displayText
    const twLetterNext = uid(), twNDTVar = uid();
    mk(blocks, twNDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
    setParent(blocks, twNDTVar, twLetterNext);
    setParent(blocks, twIPlus1, twLetterNext);
    mk(blocks, twLetterNext, "operator_letter_of", {
      LETTER: blockInput(twIPlus1, 1),
      STRING: blockInputStr(twNDTVar),
    }, {});

    const twIfN = uid(), twCondN = uid();
    setParent(blocks, twLetterNext, twCondN);
    mk(blocks, twCondN, "operator_equals", {
      OPERAND1: blockInputStr(twLetterNext),
      OPERAND2: strLit("n"),
    }, {});
    setParent(blocks, twCondN, twIfN);

    // newline body: set curX = x, change curY by -lineHeight, change i by 1
    const twNLResetCurX = uid(), twNLXVar = uid();
    mk(blocks, twNLXVar, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
    setParent(blocks, twNLXVar, twNLResetCurX);
    mk(blocks, twNLResetCurX, "data_setvariableto",
      { VALUE: blockInput(twNLXVar) },
      { VARIABLE: ["__font_curX", varCurX] });

    const twNLChangeCurY = uid(), twNLNegLH = uid(), twNLLHVar = uid();
    mk(blocks, twNLLHVar, "data_variable", {}, { VARIABLE: ["__font_lineHeight", varLineHeight] });
    setParent(blocks, twNLLHVar, twNLNegLH);
    mk(blocks, twNLNegLH, "operator_subtract", { NUM1: numLit(0), NUM2: blockInput(twNLLHVar) }, {});
    setParent(blocks, twNLNegLH, twNLChangeCurY);
    mk(blocks, twNLChangeCurY, "data_changevariableby",
      { VALUE: blockInput(twNLNegLH) },
      { VARIABLE: ["__font_curY", varCurY] });

    const twNLSkipN = uid();
    mk(blocks, twNLSkipN, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    chain(blocks, [twNLResetCurX, twNLChangeCurY, twNLSkipN]);

    mk(blocks, twIfN, "control_if", {
      CONDITION: boolInput(twCondN),
      SUBSTACK: substackInput(twNLResetCurX),
    }, {});
    setParent(blocks, twNLResetCurX, twIfN);

    // c. else: call __font_bsearch(__tw_char), if result ≠ "" render char
    const twCharVal = uid();
    mk(blocks, twCharVal, "data_variable", {}, { VARIABLE: ["__tw_char", varTwChar] });
    const twBsShadow = uid();
    mk(blocks, twBsShadow, "argument_reporter_string_number", {}, { VALUE: ["target", null] }, false, true);
    const twCallBS = uid();
    setParent(blocks, twCharVal, twCallBS);
    setParent(blocks, twBsShadow, twCallBS);
    mk(blocks, twCallBS, "procedures_call", {
      [bsArgTargetId]: [3, twCharVal, twBsShadow],
    }, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: BSEARCH_PROC_CODE,
      argumentids: JSON.stringify([bsArgTargetId]),
      warp: "true",
    });

    // if __font_bsearch_result ≠ "": render
    const twIfRes = uid(), twCondEq = uid(), twBsResVar = uid(), twCondNotEmpty = uid();
    mk(blocks, twBsResVar, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
    setParent(blocks, twBsResVar, twCondEq);
    mk(blocks, twCondEq, "operator_equals", {
      OPERAND1: blockInputStr(twBsResVar),
      OPERAND2: strLit(""),
    }, {});
    setParent(blocks, twCondEq, twCondNotEmpty);
    mk(blocks, twCondNotEmpty, "operator_not", { OPERAND: boolInput(twCondEq) }, {});
    setParent(blocks, twCondNotEmpty, twIfRes);

    // switch costume to __tw_char
    const twSwitch = uid(), twCharForCostume = uid(), twCostumeMenu = uid();
    mk(blocks, twCharForCostume, "data_variable", {}, { VARIABLE: ["__tw_char", varTwChar] });
    mk(blocks, twCostumeMenu, "looks_costume", {}, { COSTUME: ["", null] }, false, true);
    setParent(blocks, twCharForCostume, twSwitch);
    setParent(blocks, twCostumeMenu, twSwitch);
    mk(blocks, twSwitch, "looks_switchcostumeto", {
      COSTUME: [3, twCharForCostume, twCostumeMenu],
    }, {});

    // go to x: curX y: curY
    const twGoto = uid(), twGotoXVar = uid(), twGotoYVar = uid();
    mk(blocks, twGotoXVar, "data_variable", {}, { VARIABLE: ["__font_curX", varCurX] });
    setParent(blocks, twGotoXVar, twGoto);
    mk(blocks, twGotoYVar, "data_variable", {}, { VARIABLE: ["__font_curY", varCurY] });
    setParent(blocks, twGotoYVar, twGoto);
    mk(blocks, twGoto, "motion_gotoxy", {
      X: blockInput(twGotoXVar),
      Y: blockInput(twGotoYVar),
    }, {});

    // show (clone only) / stamp (pen) / hide (clone only), then change curX
    let twRenderFirst: string, twRenderLast: string;
    if (isPen) {
      const twStamp = uid();
      mk(blocks, twStamp, "pen_stamp", {}, {});
      const twBsResAdvVar = uid(), twLSAdvVar = uid(), twAddLS = uid(), twChangeCurX = uid();
      mk(blocks, twBsResAdvVar, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
      mk(blocks, twLSAdvVar, "data_variable", {}, { VARIABLE: ["__font_letterSpacing", varLetterSpacing] });
      setParent(blocks, twBsResAdvVar, twAddLS);
      setParent(blocks, twLSAdvVar, twAddLS);
      mk(blocks, twAddLS, "operator_add", {
        NUM1: blockInput(twBsResAdvVar),
        NUM2: blockInput(twLSAdvVar),
      }, {});
      setParent(blocks, twAddLS, twChangeCurX);
      mk(blocks, twChangeCurX, "data_changevariableby",
        { VALUE: blockInput(twAddLS) },
        { VARIABLE: ["__font_curX", varCurX] });
      chain(blocks, [twSwitch, twGoto, twStamp, twChangeCurX]);
      twRenderFirst = twSwitch;
      twRenderLast = twChangeCurX;
    } else {
      const twShow = uid();
      mk(blocks, twShow, "looks_show", {}, {});
      const twClone = uid(), twCloneMenu = uid();
      mk(blocks, twCloneMenu, "control_create_clone_of_menu", {}, { CLONE_OPTION: ["_myself_", null] }, false, true);
      setParent(blocks, twCloneMenu, twClone);
      mk(blocks, twClone, "control_create_clone_of", { CLONE_OPTION: [1, twCloneMenu] }, {});
      const twHide = uid();
      mk(blocks, twHide, "looks_hide", {}, {});
      const twBsResAdvVar = uid(), twLSAdvVar = uid(), twAddLS = uid(), twChangeCurX = uid();
      mk(blocks, twBsResAdvVar, "data_variable", {}, { VARIABLE: ["__font_bsearch_result", varBsResult] });
      mk(blocks, twLSAdvVar, "data_variable", {}, { VARIABLE: ["__font_letterSpacing", varLetterSpacing] });
      setParent(blocks, twBsResAdvVar, twAddLS);
      setParent(blocks, twLSAdvVar, twAddLS);
      mk(blocks, twAddLS, "operator_add", {
        NUM1: blockInput(twBsResAdvVar),
        NUM2: blockInput(twLSAdvVar),
      }, {});
      setParent(blocks, twAddLS, twChangeCurX);
      mk(blocks, twChangeCurX, "data_changevariableby",
        { VALUE: blockInput(twAddLS) },
        { VARIABLE: ["__font_curX", varCurX] });
      chain(blocks, [twSwitch, twGoto, twShow, twClone, twHide, twChangeCurX]);
      twRenderFirst = twSwitch;
      twRenderLast = twChangeCurX;
    }

    mk(blocks, twIfRes, "control_if", {
      CONDITION: boolInput(twCondNotEmpty),
      SUBSTACK: substackInput(twRenderFirst),
    }, {});
    setParent(blocks, twRenderFirst, twIfRes);
    setParent(blocks, twRenderLast, twIfRes);

    chain(blocks, [twCallBS, twIfRes]);

    // outer if/else: backslash → newline handler, else → bsearch+render
    mk(blocks, twIfBS, "control_if_else", {
      CONDITION: boolInput(twCondBS),
      SUBSTACK: substackInput(twIfN),
      SUBSTACK2: substackInput(twCallBS),
    }, {});
    setParent(blocks, twIfN, twIfBS);
    setParent(blocks, twCallBS, twIfBS);

    // d. if (msPerChar > 0) and (__tw_skip = 0): wait msPerChar/1000 seconds
    const twIfWait = uid();
    const twCondAnd = uid(), twCondMsGt0 = uid(), twCondSkip0 = uid();
    const twMsArgGt = uid();
    mk(blocks, twMsArgGt, "argument_reporter_string_number", {}, { VALUE: ["msPerChar", null] });
    setParent(blocks, twMsArgGt, twCondMsGt0);
    mk(blocks, twCondMsGt0, "operator_gt", {
      OPERAND1: blockInput(twMsArgGt),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, twCondMsGt0, twCondAnd);
    const twSkipVar = uid();
    mk(blocks, twSkipVar, "data_variable", {}, { VARIABLE: ["__tw_skip", varTwSkip] });
    setParent(blocks, twSkipVar, twCondSkip0);
    mk(blocks, twCondSkip0, "operator_equals", {
      OPERAND1: blockInput(twSkipVar),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, twCondSkip0, twCondAnd);
    mk(blocks, twCondAnd, "operator_and", {
      OPERAND1: boolInput(twCondMsGt0),
      OPERAND2: boolInput(twCondSkip0),
    }, {});
    setParent(blocks, twCondAnd, twIfWait);

    // wait (msPerChar / 1000) seconds
    const twWait = uid(), twWaitDiv = uid(), twMsArgDiv = uid();
    mk(blocks, twMsArgDiv, "argument_reporter_string_number", {}, { VALUE: ["msPerChar", null] });
    setParent(blocks, twMsArgDiv, twWaitDiv);
    mk(blocks, twWaitDiv, "operator_divide", {
      NUM1: blockInput(twMsArgDiv),
      NUM2: numLit(1000),
    }, {});
    setParent(blocks, twWaitDiv, twWait);
    mk(blocks, twWait, "control_wait", { DURATION: blockInput(twWaitDiv) }, {});

    mk(blocks, twIfWait, "control_if", {
      CONDITION: boolInput(twCondAnd),
      SUBSTACK: substackInput(twWait),
    }, {});
    setParent(blocks, twWait, twIfWait);

    // e. change __font_i by 1
    const twChangeI = uid();
    mk(blocks, twChangeI, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__font_i", varI] });

    // link repeat body: setChar → ifBS → ifWait → changeI
    chain(blocks, [twSetChar, twIfBS, twIfWait, twChangeI]);

    mk(blocks, twRepeat, "control_repeat", {
      TIMES: blockInput(twLenDT, 10),
      SUBSTACK: substackInput(twSetChar),
    }, {});
    setParent(blocks, twSetChar, twRepeat);

    // 19. set __tw_running = 0
    const twSetRunning0 = uid();
    mk(blocks, twSetRunning0, "data_setvariableto", { VALUE: numLit(0) },
      { VARIABLE: ["__tw_running", varTwRunning] });

    // link full definition body
    chain(blocks, [
      twDefId,
      twSetDT, twSetXIf, twSetYIf, twCallClear,
      twSetRunning, twSetSkip0,
      twSetSz, twSetCol, twSetBr, twSetGh,
      twSetCurX, twSetCurY,
      twApplySz, twApplyCol, twApplyBr, twApplyGh,
      twSetI, twRepeat, twSetRunning0,
    ]);

    // When [space] key pressed: if __tw_running = 1 → set __tw_skip = 1
    const twSpaceHat = uid();
    mk(blocks, twSpaceHat, "event_whenkeypressed", {}, { KEY_OPTION: ["space", null] }, true, false, [1200, 700]);

    const twIfRunning = uid(), twRunCond = uid(), twRunVar = uid();
    mk(blocks, twRunVar, "data_variable", {}, { VARIABLE: ["__tw_running", varTwRunning] });
    setParent(blocks, twRunVar, twRunCond);
    mk(blocks, twRunCond, "operator_equals", {
      OPERAND1: blockInput(twRunVar),
      OPERAND2: numLit(1),
    }, {});
    setParent(blocks, twRunCond, twIfRunning);

    const twSetSkipToOne = uid();
    mk(blocks, twSetSkipToOne, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__tw_skip", varTwSkip] });

    mk(blocks, twIfRunning, "control_if", {
      CONDITION: boolInput(twRunCond),
      SUBSTACK: substackInput(twSetSkipToOne),
    }, {});
    setParent(blocks, twSetSkipToOne, twIfRunning);

    chain(blocks, [twSpaceHat, twIfRunning]);
  }

  // ── Script 8: Number format utility blocks (§18) ──────────────────────────
  // All four blocks use warpStr (inherited from options.warp).
  //
  // Result is always stored in __fmt_result.
  //
  // Arg IDs for zeroPad are declared here so that the timer block can call
  // zeroPad and correctly reference those argument IDs in the call mutation.
  const padArgNumId = uid();
  const padArgDigId = uid();
  {
    // ── §18-A: __font_fmt_zeroPad %s %s ──────────────────────────────────────
    // Pads a number string with leading zeros to reach the given digit width.
    const zpProtoId = uid(), zpDefId = uid();
    const zpArgNumShadow = uid(), zpArgDigShadow = uid();
    mk(blocks, zpArgNumShadow, "argument_reporter_string_number", {}, { VALUE: ["number", null] }, false, true);
    setParent(blocks, zpArgNumShadow, zpProtoId);
    mk(blocks, zpArgDigShadow, "argument_reporter_string_number", {}, { VALUE: ["digits", null] }, false, true);
    setParent(blocks, zpArgDigShadow, zpProtoId);

    mk(blocks, zpProtoId, "procedures_prototype",
      {
        [padArgNumId]: [1, zpArgNumShadow],
        [padArgDigId]: [1, zpArgDigShadow],
      },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: "__font_fmt_zeroPad %s %s",
        argumentids: JSON.stringify([padArgNumId, padArgDigId]),
        argumentnames: JSON.stringify(["number", "digits"]),
        argumentdefaults: JSON.stringify(["0", "2"]),
        warp: warpStr,
      });
    setParent(blocks, zpProtoId, zpDefId);
    mk(blocks, zpDefId, "procedures_definition", { custom_block: [1, zpProtoId] }, {}, true, false, [800, 1200]);

    // set __fmt_result = number_arg
    const zpSetResult = uid(), zpNumArg = uid();
    mk(blocks, zpNumArg, "argument_reporter_string_number", {}, { VALUE: ["number", null] });
    setParent(blocks, zpNumArg, zpSetResult);
    mk(blocks, zpSetResult, "data_setvariableto",
      { VALUE: blockInputStr(zpNumArg) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    // repeat until (length of __fmt_result) >= digits_arg
    const zpRepeatUntil = uid();
    const zpCondGe = uid(), zpCondNot = uid(), zpCondLt = uid();
    const zpLenRes = uid(), zpLenResVar = uid();
    mk(blocks, zpLenResVar, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, zpLenResVar, zpLenRes);
    mk(blocks, zpLenRes, "operator_length", { STRING: blockInputStr(zpLenResVar) }, {});
    setParent(blocks, zpLenRes, zpCondGe);
    const zpDigArg = uid();
    mk(blocks, zpDigArg, "argument_reporter_string_number", {}, { VALUE: ["digits", null] });
    setParent(blocks, zpDigArg, zpCondGe);
    // length >= digits  ≡  NOT (length < digits)
    mk(blocks, zpCondLt, "operator_lt", {
      OPERAND1: blockInput(zpLenRes),
      OPERAND2: blockInput(zpDigArg),
    }, {});
    setParent(blocks, zpLenRes, zpCondLt);
    setParent(blocks, zpDigArg, zpCondLt);
    mk(blocks, zpCondNot, "operator_not", { OPERAND: boolInput(zpCondLt) }, {});
    setParent(blocks, zpCondLt, zpCondNot);
    setParent(blocks, zpCondNot, zpRepeatUntil);

    // body: set __fmt_result = join("0", __fmt_result)
    const zpJoin = uid(), zpResVar = uid();
    mk(blocks, zpResVar, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, zpResVar, zpJoin);
    mk(blocks, zpJoin, "operator_join", {
      STRING1: strLit("0"),
      STRING2: blockInputStr(zpResVar),
    }, {});
    const zpSetPad = uid();
    setParent(blocks, zpJoin, zpSetPad);
    mk(blocks, zpSetPad, "data_setvariableto",
      { VALUE: blockInputStr(zpJoin) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    mk(blocks, zpRepeatUntil, "control_repeat_until", {
      CONDITION: boolInput(zpCondNot),
      SUBSTACK: substackInput(zpSetPad),
    }, {});
    setParent(blocks, zpSetPad, zpRepeatUntil);

    chain(blocks, [zpDefId, zpSetResult, zpRepeatUntil]);

    // ── §18-B: __font_fmt_comma %s ────────────────────────────────────────────
    // Formats a number with thousands-separator commas.
    const cmArgNumId = uid();
    const cmProtoId = uid(), cmDefId = uid();
    const cmArgNumShadow = uid();
    mk(blocks, cmArgNumShadow, "argument_reporter_string_number", {}, { VALUE: ["number", null] }, false, true);
    setParent(blocks, cmArgNumShadow, cmProtoId);

    mk(blocks, cmProtoId, "procedures_prototype",
      { [cmArgNumId]: [1, cmArgNumShadow] },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: "__font_fmt_comma %s",
        argumentids: JSON.stringify([cmArgNumId]),
        argumentnames: JSON.stringify(["number"]),
        argumentdefaults: JSON.stringify(["0"]),
        warp: warpStr,
      });
    setParent(blocks, cmProtoId, cmDefId);
    mk(blocks, cmDefId, "procedures_definition", { custom_block: [1, cmProtoId] }, {}, true, false, [800, 1500]);

    // set __fmt_str = number_arg
    const cmSetStr = uid(), cmNumArg = uid();
    mk(blocks, cmNumArg, "argument_reporter_string_number", {}, { VALUE: ["number", null] });
    setParent(blocks, cmNumArg, cmSetStr);
    mk(blocks, cmSetStr, "data_setvariableto",
      { VALUE: blockInputStr(cmNumArg) },
      { VARIABLE: ["__fmt_str", varFmtStr] });

    // set __fmt_result = ""
    const cmSetResult = uid();
    mk(blocks, cmSetResult, "data_setvariableto", { VALUE: strLit("") },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    // set __fmt_i = 1
    const cmSetI = uid();
    mk(blocks, cmSetI, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__fmt_i", varFmtI] });

    // repeat (length of __fmt_str) times
    const cmRepeat = uid();
    const cmLenStr = uid(), cmLenStrVar = uid();
    mk(blocks, cmLenStrVar, "data_variable", {}, { VARIABLE: ["__fmt_str", varFmtStr] });
    setParent(blocks, cmLenStrVar, cmLenStr);
    mk(blocks, cmLenStr, "operator_length", { STRING: blockInputStr(cmLenStrVar) }, {});
    setParent(blocks, cmLenStr, cmRepeat);

    // set __fmt_pos = (length of __fmt_str) - __fmt_i + 1
    const cmSetPos = uid();
    const cmFmtIPosVar = uid(), cmLenStr2 = uid(), cmLenStr2Var = uid();
    mk(blocks, cmLenStr2Var, "data_variable", {}, { VARIABLE: ["__fmt_str", varFmtStr] });
    setParent(blocks, cmLenStr2Var, cmLenStr2);
    mk(blocks, cmLenStr2, "operator_length", { STRING: blockInputStr(cmLenStr2Var) }, {});
    mk(blocks, cmFmtIPosVar, "data_variable", {}, { VARIABLE: ["__fmt_i", varFmtI] });
    const cmPosSub = uid();
    setParent(blocks, cmLenStr2, cmPosSub);
    setParent(blocks, cmFmtIPosVar, cmPosSub);
    mk(blocks, cmPosSub, "operator_subtract", {
      NUM1: blockInput(cmLenStr2),
      NUM2: blockInput(cmFmtIPosVar),
    }, {});
    const cmPosAdd = uid();
    setParent(blocks, cmPosSub, cmPosAdd);
    mk(blocks, cmPosAdd, "operator_add", { NUM1: blockInput(cmPosSub), NUM2: numLit(1) }, {});
    setParent(blocks, cmPosAdd, cmSetPos);
    mk(blocks, cmSetPos, "data_setvariableto",
      { VALUE: blockInput(cmPosAdd) },
      { VARIABLE: ["__fmt_pos", varFmtPos] });

    // if (__fmt_i > 1) and ((__fmt_i - 1) mod 3 = 0): prepend ","
    const cmIfComma = uid(), cmCondAnd = uid();
    const cmCondGt1 = uid(), cmFmtIGtVar = uid();
    mk(blocks, cmFmtIGtVar, "data_variable", {}, { VARIABLE: ["__fmt_i", varFmtI] });
    setParent(blocks, cmFmtIGtVar, cmCondGt1);
    mk(blocks, cmCondGt1, "operator_gt", {
      OPERAND1: blockInput(cmFmtIGtVar),
      OPERAND2: numLit(1),
    }, {});
    setParent(blocks, cmCondGt1, cmCondAnd);

    // (__fmt_i - 1) mod 3 = 0
    const cmCondMod0 = uid(), cmMod = uid(), cmIMinus1 = uid(), cmFmtISub1 = uid();
    mk(blocks, cmFmtISub1, "data_variable", {}, { VARIABLE: ["__fmt_i", varFmtI] });
    setParent(blocks, cmFmtISub1, cmIMinus1);
    mk(blocks, cmIMinus1, "operator_subtract", { NUM1: blockInput(cmFmtISub1), NUM2: numLit(1) }, {});
    setParent(blocks, cmIMinus1, cmMod);
    mk(blocks, cmMod, "operator_mod", { NUM1: blockInput(cmIMinus1), NUM2: numLit(3) }, {});
    setParent(blocks, cmMod, cmCondMod0);
    mk(blocks, cmCondMod0, "operator_equals", {
      OPERAND1: blockInput(cmMod),
      OPERAND2: numLit(0),
    }, {});
    setParent(blocks, cmCondMod0, cmCondAnd);

    mk(blocks, cmCondAnd, "operator_and", {
      OPERAND1: boolInput(cmCondGt1),
      OPERAND2: boolInput(cmCondMod0),
    }, {});
    setParent(blocks, cmCondAnd, cmIfComma);

    // body: set __fmt_result = join(",", __fmt_result)
    const cmJoinComma = uid(), cmResVarC = uid();
    mk(blocks, cmResVarC, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, cmResVarC, cmJoinComma);
    mk(blocks, cmJoinComma, "operator_join", {
      STRING1: strLit(","),
      STRING2: blockInputStr(cmResVarC),
    }, {});
    const cmPrependComma = uid();
    setParent(blocks, cmJoinComma, cmPrependComma);
    mk(blocks, cmPrependComma, "data_setvariableto",
      { VALUE: blockInputStr(cmJoinComma) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    mk(blocks, cmIfComma, "control_if", {
      CONDITION: boolInput(cmCondAnd),
      SUBSTACK: substackInput(cmPrependComma),
    }, {});
    setParent(blocks, cmPrependComma, cmIfComma);

    // set __fmt_result = join(letter __fmt_pos of __fmt_str, __fmt_result)
    const cmLetterPos = uid(), cmFmtPosVar = uid(), cmFmtStrVar = uid();
    mk(blocks, cmFmtPosVar, "data_variable", {}, { VARIABLE: ["__fmt_pos", varFmtPos] });
    mk(blocks, cmFmtStrVar, "data_variable", {}, { VARIABLE: ["__fmt_str", varFmtStr] });
    setParent(blocks, cmFmtPosVar, cmLetterPos);
    setParent(blocks, cmFmtStrVar, cmLetterPos);
    mk(blocks, cmLetterPos, "operator_letter_of", {
      LETTER: blockInput(cmFmtPosVar, 1),
      STRING: blockInputStr(cmFmtStrVar),
    }, {});
    const cmJoinLetter = uid(), cmResVarL = uid();
    mk(blocks, cmResVarL, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, cmResVarL, cmJoinLetter);
    setParent(blocks, cmLetterPos, cmJoinLetter);
    mk(blocks, cmJoinLetter, "operator_join", {
      STRING1: blockInputStr(cmLetterPos),
      STRING2: blockInputStr(cmResVarL),
    }, {});
    const cmSetResLetter = uid();
    setParent(blocks, cmJoinLetter, cmSetResLetter);
    mk(blocks, cmSetResLetter, "data_setvariableto",
      { VALUE: blockInputStr(cmJoinLetter) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    // change __fmt_i by 1
    const cmChangeI = uid();
    mk(blocks, cmChangeI, "data_changevariableby", { VALUE: numLit(1) },
      { VARIABLE: ["__fmt_i", varFmtI] });

    chain(blocks, [cmSetPos, cmIfComma, cmSetResLetter, cmChangeI]);

    mk(blocks, cmRepeat, "control_repeat", {
      TIMES: blockInput(cmLenStr, 10),
      SUBSTACK: substackInput(cmSetPos),
    }, {});
    setParent(blocks, cmSetPos, cmRepeat);

    chain(blocks, [cmDefId, cmSetStr, cmSetResult, cmSetI, cmRepeat]);

    // ── §18-C: __font_fmt_timer %s ────────────────────────────────────────────
    // Converts a total-seconds value to "MM:SS" format.
    const tmArgSecId = uid();
    const tmProtoId = uid(), tmDefId = uid();
    const tmArgSecShadow = uid();
    mk(blocks, tmArgSecShadow, "argument_reporter_string_number", {}, { VALUE: ["totalSeconds", null] }, false, true);
    setParent(blocks, tmArgSecShadow, tmProtoId);

    mk(blocks, tmProtoId, "procedures_prototype",
      { [tmArgSecId]: [1, tmArgSecShadow] },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: "__font_fmt_timer %s",
        argumentids: JSON.stringify([tmArgSecId]),
        argumentnames: JSON.stringify(["totalSeconds"]),
        argumentdefaults: JSON.stringify(["0"]),
        warp: warpStr,
      });
    setParent(blocks, tmProtoId, tmDefId);
    mk(blocks, tmDefId, "procedures_definition", { custom_block: [1, tmProtoId] }, {}, true, false, [800, 1800]);

    // set __fmt_min = floor(totalSeconds / 60)
    const tmSetMin = uid(), tmFloorMin = uid(), tmDivMin = uid(), tmSecArgDiv = uid();
    mk(blocks, tmSecArgDiv, "argument_reporter_string_number", {}, { VALUE: ["totalSeconds", null] });
    setParent(blocks, tmSecArgDiv, tmDivMin);
    mk(blocks, tmDivMin, "operator_divide", {
      NUM1: blockInput(tmSecArgDiv),
      NUM2: numLit(60),
    }, {});
    setParent(blocks, tmDivMin, tmFloorMin);
    mk(blocks, tmFloorMin, "operator_mathop", { NUM: blockInput(tmDivMin) }, { OPERATOR: ["floor", null] });
    setParent(blocks, tmFloorMin, tmSetMin);
    mk(blocks, tmSetMin, "data_setvariableto",
      { VALUE: blockInput(tmFloorMin) },
      { VARIABLE: ["__fmt_min", varFmtMin] });

    // set __fmt_sec = totalSeconds mod 60
    const tmSetSec = uid(), tmModSec = uid(), tmSecArgMod = uid();
    mk(blocks, tmSecArgMod, "argument_reporter_string_number", {}, { VALUE: ["totalSeconds", null] });
    setParent(blocks, tmSecArgMod, tmModSec);
    mk(blocks, tmModSec, "operator_mod", {
      NUM1: blockInput(tmSecArgMod),
      NUM2: numLit(60),
    }, {});
    setParent(blocks, tmModSec, tmSetSec);
    mk(blocks, tmSetSec, "data_setvariableto",
      { VALUE: blockInput(tmModSec) },
      { VARIABLE: ["__fmt_sec", varFmtSec] });

    // call __font_fmt_zeroPad(__fmt_min, 2)
    const tmCallPadMin = uid();
    const tmPadMinNumSh = uid(), tmPadMinDigSh = uid();
    mk(blocks, tmPadMinNumSh, "argument_reporter_string_number", {}, { VALUE: ["number", null] }, false, true);
    mk(blocks, tmPadMinDigSh, "argument_reporter_string_number", {}, { VALUE: ["digits", null] }, false, true);
    setParent(blocks, tmPadMinNumSh, tmCallPadMin);
    setParent(blocks, tmPadMinDigSh, tmCallPadMin);
    const tmMinVar = uid();
    mk(blocks, tmMinVar, "data_variable", {}, { VARIABLE: ["__fmt_min", varFmtMin] });
    setParent(blocks, tmMinVar, tmCallPadMin);
    mk(blocks, tmCallPadMin, "procedures_call", {
      [padArgNumId]: [3, tmMinVar, tmPadMinNumSh],
      [padArgDigId]: [3, [P_NUM, "2"], tmPadMinDigSh],
    }, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: "__font_fmt_zeroPad %s %s",
      argumentids: JSON.stringify([padArgNumId, padArgDigId]),
      warp: warpStr,
    });

    // set __fmt_min_str = __fmt_result
    const tmSetMinStr = uid(), tmResVarMin = uid();
    mk(blocks, tmResVarMin, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, tmResVarMin, tmSetMinStr);
    mk(blocks, tmSetMinStr, "data_setvariableto",
      { VALUE: blockInputStr(tmResVarMin) },
      { VARIABLE: ["__fmt_min_str", varFmtMinStr] });

    // call __font_fmt_zeroPad(__fmt_sec, 2)
    const tmCallPadSec = uid();
    const tmPadSecNumSh = uid(), tmPadSecDigSh = uid();
    mk(blocks, tmPadSecNumSh, "argument_reporter_string_number", {}, { VALUE: ["number", null] }, false, true);
    mk(blocks, tmPadSecDigSh, "argument_reporter_string_number", {}, { VALUE: ["digits", null] }, false, true);
    setParent(blocks, tmPadSecNumSh, tmCallPadSec);
    setParent(blocks, tmPadSecDigSh, tmCallPadSec);
    const tmSecVar = uid();
    mk(blocks, tmSecVar, "data_variable", {}, { VARIABLE: ["__fmt_sec", varFmtSec] });
    setParent(blocks, tmSecVar, tmCallPadSec);
    mk(blocks, tmCallPadSec, "procedures_call", {
      [padArgNumId]: [3, tmSecVar, tmPadSecNumSh],
      [padArgDigId]: [3, [P_NUM, "2"], tmPadSecDigSh],
    }, {}, false, false, undefined, {
      tagName: "mutation",
      children: [],
      proccode: "__font_fmt_zeroPad %s %s",
      argumentids: JSON.stringify([padArgNumId, padArgDigId]),
      warp: warpStr,
    });

    // set __fmt_result = join(__fmt_min_str, join(":", __fmt_result))
    const tmSetResult = uid();
    const tmJoinColon = uid(), tmResVarSec = uid();
    mk(blocks, tmResVarSec, "data_variable", {}, { VARIABLE: ["__fmt_result", varFmtResult] });
    setParent(blocks, tmResVarSec, tmJoinColon);
    mk(blocks, tmJoinColon, "operator_join", {
      STRING1: strLit(":"),
      STRING2: blockInputStr(tmResVarSec),
    }, {});
    const tmMinStrVar = uid();
    mk(blocks, tmMinStrVar, "data_variable", {}, { VARIABLE: ["__fmt_min_str", varFmtMinStr] });
    const tmJoinFull = uid();
    setParent(blocks, tmMinStrVar, tmJoinFull);
    setParent(blocks, tmJoinColon, tmJoinFull);
    mk(blocks, tmJoinFull, "operator_join", {
      STRING1: blockInputStr(tmMinStrVar),
      STRING2: blockInputStr(tmJoinColon),
    }, {});
    setParent(blocks, tmJoinFull, tmSetResult);
    mk(blocks, tmSetResult, "data_setvariableto",
      { VALUE: blockInputStr(tmJoinFull) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    chain(blocks, [tmDefId, tmSetMin, tmSetSec, tmCallPadMin, tmSetMinStr, tmCallPadSec, tmSetResult]);

    // ── §18-D: __font_fmt_fixed %s %s ────────────────────────────────────────
    // Formats a number to a fixed number of decimal places.
    // Uses a loop to compute factor = 10^decimals (no exponent operator in Scratch).
    const fxArgNumId = uid(), fxArgDecId = uid();
    const fxProtoId = uid(), fxDefId = uid();
    const fxArgNumShadow = uid(), fxArgDecShadow = uid();
    mk(blocks, fxArgNumShadow, "argument_reporter_string_number", {}, { VALUE: ["number", null] }, false, true);
    setParent(blocks, fxArgNumShadow, fxProtoId);
    mk(blocks, fxArgDecShadow, "argument_reporter_string_number", {}, { VALUE: ["decimals", null] }, false, true);
    setParent(blocks, fxArgDecShadow, fxProtoId);

    mk(blocks, fxProtoId, "procedures_prototype",
      {
        [fxArgNumId]: [1, fxArgNumShadow],
        [fxArgDecId]: [1, fxArgDecShadow],
      },
      {},
      false, true, undefined,
      {
        tagName: "mutation",
        children: [],
        proccode: "__font_fmt_fixed %s %s",
        argumentids: JSON.stringify([fxArgNumId, fxArgDecId]),
        argumentnames: JSON.stringify(["number", "decimals"]),
        argumentdefaults: JSON.stringify(["0", "2"]),
        warp: warpStr,
      });
    setParent(blocks, fxProtoId, fxDefId);
    mk(blocks, fxDefId, "procedures_definition", { custom_block: [1, fxProtoId] }, {}, true, false, [800, 2100]);

    // set __fmt_factor = 1
    const fxSetFactor = uid();
    mk(blocks, fxSetFactor, "data_setvariableto", { VALUE: numLit(1) },
      { VARIABLE: ["__fmt_factor", varFmtFactor] });

    // repeat decimals_arg times: set __fmt_factor = __fmt_factor * 10
    const fxRepeat = uid(), fxDecArg = uid();
    mk(blocks, fxDecArg, "argument_reporter_string_number", {}, { VALUE: ["decimals", null] });
    setParent(blocks, fxDecArg, fxRepeat);

    const fxMul = uid(), fxFactorVar = uid();
    mk(blocks, fxFactorVar, "data_variable", {}, { VARIABLE: ["__fmt_factor", varFmtFactor] });
    setParent(blocks, fxFactorVar, fxMul);
    mk(blocks, fxMul, "operator_multiply", {
      NUM1: blockInput(fxFactorVar),
      NUM2: numLit(10),
    }, {});
    const fxSetFactor2 = uid();
    setParent(blocks, fxMul, fxSetFactor2);
    mk(blocks, fxSetFactor2, "data_setvariableto",
      { VALUE: blockInput(fxMul) },
      { VARIABLE: ["__fmt_factor", varFmtFactor] });

    mk(blocks, fxRepeat, "control_repeat", {
      TIMES: blockInput(fxDecArg, 0),
      SUBSTACK: substackInput(fxSetFactor2),
    }, {});
    setParent(blocks, fxSetFactor2, fxRepeat);

    // set __fmt_int = floor(number_arg * __fmt_factor)
    const fxSetInt = uid(), fxFloor = uid(), fxMulNum = uid();
    const fxNumArg = uid(), fxFactorVar2 = uid();
    mk(blocks, fxNumArg, "argument_reporter_string_number", {}, { VALUE: ["number", null] });
    mk(blocks, fxFactorVar2, "data_variable", {}, { VARIABLE: ["__fmt_factor", varFmtFactor] });
    setParent(blocks, fxNumArg, fxMulNum);
    setParent(blocks, fxFactorVar2, fxMulNum);
    mk(blocks, fxMulNum, "operator_multiply", {
      NUM1: blockInput(fxNumArg),
      NUM2: blockInput(fxFactorVar2),
    }, {});
    setParent(blocks, fxMulNum, fxFloor);
    mk(blocks, fxFloor, "operator_mathop", { NUM: blockInput(fxMulNum) }, { OPERATOR: ["floor", null] });
    setParent(blocks, fxFloor, fxSetInt);
    mk(blocks, fxSetInt, "data_setvariableto",
      { VALUE: blockInput(fxFloor) },
      { VARIABLE: ["__fmt_int", varFmtInt] });

    // set __fmt_result = join(floor(__fmt_int / __fmt_factor), join(".", __fmt_int mod __fmt_factor))
    // inner: __fmt_int mod __fmt_factor
    const fxModFrac = uid(), fxIntVarMod = uid(), fxFactorVarMod = uid();
    mk(blocks, fxIntVarMod, "data_variable", {}, { VARIABLE: ["__fmt_int", varFmtInt] });
    mk(blocks, fxFactorVarMod, "data_variable", {}, { VARIABLE: ["__fmt_factor", varFmtFactor] });
    setParent(blocks, fxIntVarMod, fxModFrac);
    setParent(blocks, fxFactorVarMod, fxModFrac);
    mk(blocks, fxModFrac, "operator_mod", {
      NUM1: blockInput(fxIntVarMod),
      NUM2: blockInput(fxFactorVarMod),
    }, {});

    // join(".", frac)
    const fxJoinDot = uid();
    setParent(blocks, fxModFrac, fxJoinDot);
    mk(blocks, fxJoinDot, "operator_join", {
      STRING1: strLit("."),
      STRING2: blockInputStr(fxModFrac),
    }, {});

    // floor(__fmt_int / __fmt_factor)
    const fxDivInt = uid(), fxIntVarDiv = uid(), fxFactorVarDiv = uid(), fxFloorInt = uid();
    mk(blocks, fxIntVarDiv, "data_variable", {}, { VARIABLE: ["__fmt_int", varFmtInt] });
    mk(blocks, fxFactorVarDiv, "data_variable", {}, { VARIABLE: ["__fmt_factor", varFmtFactor] });
    setParent(blocks, fxIntVarDiv, fxDivInt);
    setParent(blocks, fxFactorVarDiv, fxDivInt);
    mk(blocks, fxDivInt, "operator_divide", {
      NUM1: blockInput(fxIntVarDiv),
      NUM2: blockInput(fxFactorVarDiv),
    }, {});
    setParent(blocks, fxDivInt, fxFloorInt);
    mk(blocks, fxFloorInt, "operator_mathop", { NUM: blockInput(fxDivInt) }, { OPERATOR: ["floor", null] });

    // join(flooredInt, join(".", frac))
    const fxJoinFull = uid();
    setParent(blocks, fxFloorInt, fxJoinFull);
    setParent(blocks, fxJoinDot, fxJoinFull);
    mk(blocks, fxJoinFull, "operator_join", {
      STRING1: blockInputStr(fxFloorInt),
      STRING2: blockInputStr(fxJoinDot),
    }, {});

    const fxSetResult = uid();
    setParent(blocks, fxJoinFull, fxSetResult);
    mk(blocks, fxSetResult, "data_setvariableto",
      { VALUE: blockInputStr(fxJoinFull) },
      { VARIABLE: ["__fmt_result", varFmtResult] });

    chain(blocks, [fxDefId, fxSetFactor, fxRepeat, fxSetInt, fxSetResult]);
  }

  // ── Assemble variables for FontChar sprite ──
  const fontCharVariables: Record<string, [string, string | number]> = {
    [varBsResult]: ["__font_bsearch_result", ""],
    [varBsLo]: ["__bsLo", 0],
    [varBsHi]: ["__bsHi", 0],
    [varBsMid]: ["__bsMid", 0],
    [varBsMidChar]: ["__bsMidChar", ""],
    [varX]: ["__font_x", 0],
    [varY]: ["__font_y", 0],
    [varI]: ["__font_i", 0],
    [varCurX]: ["__font_curX", 0],
    [varCurY]: ["__font_curY", 0],
    [varSize]: ["__font_size", 100],
    [varColor]: ["__font_color", 0],
    [varBrightness]: ["__font_brightness", 0],
    [varGhost]: ["__font_ghost", 0],
    [varLayer]: ["__font_layer", 1],
    [varLetterSpacing]: ["__font_letterSpacing", options.letterSpacing ?? 0],
    [varLineHeight]: ["__font_lineHeight", lineHeight],
    [varAlign]: ["__font_align", options.align ?? "left"],
    [varTotalWidth]: ["__font_totalWidth", 0],
    [varJ]: ["__font_j", 0],
    // Typewriter effect variables (§17)
    [varTwRunning]: ["__tw_running", 0],
    [varTwSkip]: ["__tw_skip", 0],
    [varTwChar]: ["__tw_char", ""],
    // Number format variables (§18)
    [varFmtResult]: ["__fmt_result", ""],
    [varFmtStr]: ["__fmt_str", ""],
    [varFmtI]: ["__fmt_i", 0],
    [varFmtPos]: ["__fmt_pos", 0],
    [varFmtMin]: ["__fmt_min", 0],
    [varFmtSec]: ["__fmt_sec", 0],
    [varFmtFactor]: ["__fmt_factor", 1],
    [varFmtInt]: ["__fmt_int", 0],
    [varFmtMinStr]: ["__fmt_min_str", ""],
    // Mode 2 (richtext) tag-stripping variables
    ...(textInputMode === "richtext" ? {
      [varPpBuf]: ["__pp_buf", ""],
      [varPpI]: ["__pp_i", 0],
      [varPpInTag]: ["__pp_inTag", 0],
      [varPpCh]: ["__pp_ch", ""],
    } : {}),
    // Mode 3 (console) parsing variables
    ...(textInputMode === "console" ? {
      [varConI]: ["__con_i", 0],
      [varConLine]: ["__con_line", ""],
      [varConColPos]: ["__con_colPos", 0],
      [varConJ]: ["__con_j", 0],
      [varConKey]: ["__con_key", ""],
      [varConVal]: ["__con_val", ""],
    } : {}),
  };

  // ── Assemble targets ──
  const fontCharTarget: ScratchTarget = {
    isStage: false,
    name: "FontChar",
    variables: fontCharVariables,
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
    lists: {
      [listFontConfig]: ["Font_Config", fontConfigData],
      [listInstruction]: ["取扱説明書", instructionData],
      ...(textInputMode === "console" ? {
        [listConsole]: ["文字表示コンソール", []],
      } : {}),
    },
    broadcasts: {
      [broadcastRender]: "__font_render",
      [broadcastClear]: "__font_clear",
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

  const extensions: string[] = [];
  if (isPen) extensions.push("pen");

  return {
    targets: [stageTarget, fontCharTarget],
    monitors: [],
    extensions,
    meta: {
      semver: "3.0.0",
      vm: "0.2.0",
      agent: "ScratchFontAssetCreator/0.1.0",
    },
  };
}
