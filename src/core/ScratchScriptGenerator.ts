import type { ExportOptions } from "../types";

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

// ── Helper: build "item# of (X) in [list]" block ──
function mkItemNumOf(
  blocks: Record<string, ScratchBlock>,
  itemBlockId: string,
  listName: string, listId: string
): string {
  const bItemNum = uid();
  mk(blocks, bItemNum, "data_itemnumoflist", {
    ITEM: blockInputStr(itemBlockId),
  }, { LIST: [listName, listId] });
  setParent(blocks, itemBlockId, bItemNum);
  return bItemNum;
}

// ── Helper: build "item (expr + 1) of [list]" block ──
function mkItemOfList(
  blocks: Record<string, ScratchBlock>,
  indexVarId: string, indexVarName: string,
  listName: string, listId: string
): string {
  const bAddOne = uid(), bAddVar = uid(), bItemVal = uid();
  mk(blocks, bAddVar, "data_variable", {}, { VARIABLE: [indexVarName, indexVarId] });
  setParent(blocks, bAddVar, bAddOne);
  mk(blocks, bAddOne, "operator_add", {
    NUM1: blockInput(bAddVar),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bAddOne, bItemVal);
  mk(blocks, bItemVal, "data_itemoflist", {
    INDEX: blockInput(bAddOne, 1),
  }, { LIST: [listName, listId] });
  return bItemVal;
}

// ── Build the block sequence that renders a single character ──
// Returns [firstBlockId, lastBlockId]
function buildRenderCharBlocks(
  blocks: Record<string, ScratchBlock>,
  varIId: string,
  varDisplayTextId: string,
  varCurXId: string, varCurYId: string,
  varCharIndexId: string, varCharIndexName: string,
  varLetterSpacingId: string, varLetterSpacingName: string,
  listCharMapId: string,
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

  // change curX by (item (charIndex + 1) of charMap + letterSpacing)
  const bItemVal = mkItemOfList(blocks, varCharIndexId, varCharIndexName, "__font_charMap", listCharMapId);

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
  varCharIndexId: string, varCharIndexName: string,
  varLetterSpacingId: string, varLetterSpacingName: string,
  listCharMapId: string,
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

  // change curX by (item (charIndex + 1) of charMap + letterSpacing)
  const bItemVal = mkItemOfList(blocks, varCharIndexId, varCharIndexName, "__font_charMap", listCharMapId);
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
  options: ExportOptions = { outputFormat: "svg", warp: true, renderMode: "clone", align: "left", letterSpacing: 0 },
  lineHeight = 72
): object {
  const isPen = options.renderMode === "pen";
  const warpStr = options.warp ? "true" : "false";

  // IDs for Stage variables/broadcasts
  const varDisplayText = uid();
  const broadcastRender = uid();
  const broadcastClear = uid();

  // IDs for FontChar sprite variables
  const varCharIndex = uid();
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
  // listCharMap
  const listCharMap = uid();
  // Stage-level lists (for all sprites)
  const listFontConfig = uid();
  const listInstruction = uid();

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
  ];

  const blocks: Record<string, ScratchBlock> = {};

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
  // set ci2 to item# of (letter j of displayText) in charMap
  const bSetCI2 = uid();
  const bLetterJ = mkLetterOf(blocks, varJ, "__font_j", varDisplayText, "__font_displayText");
  const bItemNum2 = mkItemNumOf(blocks, bLetterJ, "__font_charMap", listCharMap);
  setParent(blocks, bItemNum2, bSetCI2);
  mk(blocks, bSetCI2, "data_setvariableto",
    { VALUE: blockInput(bItemNum2) },
    { VARIABLE: ["__font_ci2", varCharIndex] }); // reuse varCharIndex as ci2

  // if ci2 > 0: change totalWidth by advanceWidth + letterSpacing
  const bIfCI2 = uid();
  const bCondCI2 = uid(), bCondCI2Var = uid();
  mk(blocks, bCondCI2Var, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
  setParent(blocks, bCondCI2Var, bCondCI2);
  mk(blocks, bCondCI2, "operator_gt", {
    OPERAND1: blockInput(bCondCI2Var),
    OPERAND2: numLit(0),
  }, {});
  setParent(blocks, bCondCI2, bIfCI2);

  const bItemAdv = mkItemOfList(blocks, varCharIndex, "__font_charIndex", "__font_charMap", listCharMap);
  const bLSVar2 = uid(), bAddLS2 = uid();
  mk(blocks, bLSVar2, "data_variable", {}, { VARIABLE: ["__font_letterSpacing", varLetterSpacing] });
  setParent(blocks, bLSVar2, bAddLS2);
  setParent(blocks, bItemAdv, bAddLS2);
  mk(blocks, bAddLS2, "operator_add", {
    NUM1: blockInput(bItemAdv),
    NUM2: blockInput(bLSVar2),
  }, {});
  const bChangeTW = uid();
  setParent(blocks, bAddLS2, bChangeTW);
  mk(blocks, bChangeTW, "data_changevariableby", {
    VALUE: blockInput(bAddLS2),
  }, { VARIABLE: ["__font_totalWidth", varTotalWidth] });

  mk(blocks, bIfCI2, "control_if", {
    CONDITION: boolInput(bCondCI2),
    SUBSTACK: substackInput(bChangeTW),
  }, {});
  setParent(blocks, bChangeTW, bIfCI2);

  // change j by 1
  const bChangeJ = uid();
  mk(blocks, bChangeJ, "data_changevariableby", { VALUE: numLit(1) },
    { VARIABLE: ["__font_j", varJ] });

  chain(blocks, [bSetCI2, bIfCI2, bChangeJ]);

  // pre-pass repeat block
  const bRepeatPre = uid();
  const bLenDT2b = uid(), bLenDTVar2b = uid();
  mk(blocks, bLenDTVar2b, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLenDTVar2b, bLenDT2b);
  mk(blocks, bLenDT2b, "operator_length", { STRING: blockInputStr(bLenDTVar2b) }, {});
  setParent(blocks, bLenDT2b, bRepeatPre);
  mk(blocks, bRepeatPre, "control_repeat", {
    TIMES: blockInput(bLenDT2b, 10),
    SUBSTACK: substackInput(bSetCI2),
  }, {});
  setParent(blocks, bSetCI2, bRepeatPre);

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
  //   set charIndex to item# of (letter i of displayText) in charMap
  //   if charIndex > 0: render char
  const bSetCI = uid();
  const bLetterSearch = mkLetterOf(blocks, varI, "__font_i", varDisplayText, "__font_displayText");
  const bItemNum = mkItemNumOf(blocks, bLetterSearch, "__font_charMap", listCharMap);
  setParent(blocks, bItemNum, bSetCI);
  mk(blocks, bSetCI, "data_setvariableto",
    { VALUE: blockInput(bItemNum) },
    { VARIABLE: ["__font_charIndex", varCharIndex] });

  // if charIndex > 0: render
  const bIfCI = uid();
  const bCond = uid(), bCondVar = uid();
  mk(blocks, bCondVar, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
  setParent(blocks, bCondVar, bCond);
  mk(blocks, bCond, "operator_gt", {
    OPERAND1: blockInput(bCondVar),
    OPERAND2: numLit(0),
  }, {});
  setParent(blocks, bCond, bIfCI);

  let renderFirst: string, renderLast: string;
  if (isPen) {
    [renderFirst, renderLast] = buildStampCharBlocks(
      blocks,
      varI, varDisplayText, varCurX, varCurY,
      varCharIndex, "__font_charIndex",
      varLetterSpacing, "__font_letterSpacing",
      listCharMap,
    );
  } else {
    [renderFirst, renderLast] = buildRenderCharBlocks(
      blocks,
      varI, varDisplayText, varCurX, varCurY,
      varCharIndex, "__font_charIndex",
      varLetterSpacing, "__font_letterSpacing",
      listCharMap,
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

  // ── Script 5: Custom block ── テキストを表示する ──
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

  // ── Assemble variables for FontChar sprite ──
  const fontCharVariables: Record<string, [string, string | number]> = {
    [varCharIndex]: ["__font_charIndex", 0],
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
