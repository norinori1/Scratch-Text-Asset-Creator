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

export function generateScratchProject(
  costumes: ScratchCostume[],
  glyphInfos: GlyphInfo[],
  backdropAssetId: string
): object {
  // IDs for Stage variables/broadcasts
  const varDisplayText = uid();
  const broadcastRender = uid();
  const broadcastClear = uid();

  // IDs for FontChar sprite variables/lists
  const varCharIndex = uid();
  const varX = uid();
  const varY = uid();
  const varI = uid();
  const listCharMap = uid();

  // Pre-populate __font_charMap: [char, advanceWidth, char, advanceWidth, ...]
  // Stored directly in project.json — no initialization blocks needed.
  const charMapData: (string | number)[] = [];
  for (const g of glyphInfos) {
    charMapData.push(g.char, g.advanceWidth);
  }

  const blocks: Record<string, ScratchBlock> = {};

  // ── Script 1: When flag clicked → hide ──
  const bFlag = uid(), bHide = uid();
  mk(blocks, bFlag, "event_whenflagclicked", {}, {}, true, false, [0, 0]);
  mk(blocks, bHide, "looks_hide", {}, {});
  chain(blocks, [bFlag, bHide]);

  // ── Script 2: When receive __font_clear → delete this clone ──
  const bRcvClear = uid(), bDelClone = uid();
  mk(blocks, bRcvClear, "event_whenbroadcastreceived", {},
    { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, true, false, [0, 200]);
  mk(blocks, bDelClone, "control_delete_this_clone", {}, {});
  chain(blocks, [bRcvClear, bDelClone]);

  // ── Script 3: When I start as a clone → show ──
  const bCloneStart = uid(), bShowClone = uid();
  mk(blocks, bCloneStart, "control_start_as_clone", {}, {}, true, false, [0, 380]);
  mk(blocks, bShowClone, "looks_show", {}, {});
  chain(blocks, [bCloneStart, bShowClone]);

  // ── Script 4: When receive __font_render → rendering loop ──
  //   set i to 1
  //   repeat (length of [__font_displayText])
  //     set charIndex to (item # of (letter i of displayText) in [charMap])
  //     if charIndex > 0 then
  //       switch costume to (letter i of displayText)
  //       go to x:(font_x) y:(font_y)
  //       show; create clone; hide
  //       change font_x by (item (charIndex + 1) of charMap)
  //     end
  //     change i by 1
  //   end

  const bRcvRender = uid();
  mk(blocks, bRcvRender, "event_whenbroadcastreceived", {},
    { BROADCAST_OPTION: ["__font_render", broadcastRender] }, true, false, [400, 0]);

  // set i to 1
  const bSetI = uid();
  mk(blocks, bSetI, "data_setvariableto",
    { VALUE: numLit(1) },
    { VARIABLE: ["__font_i", varI] });

  // ── repeat block (built bottom-up) ──
  const bRepeat = uid();

  // length of __font_displayText (for TIMES)
  const bLenDT = uid();
  const bLenDTVar = uid();
  mk(blocks, bLenDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLenDTVar, bLenDT);
  mk(blocks, bLenDT, "operator_length", { STRING: blockInputStr(bLenDTVar) }, {});
  setParent(blocks, bLenDT, bRepeat);

  // ── set charIndex to (item # of (letter i of displayText) in charMap) ──
  const bSetCI = uid();
  const bItemNum = uid();

  // letter i of displayText  (for item# search)
  const bLetterSearch = uid();
  const bLetterIVar = uid(), bLetterDTVar = uid();
  mk(blocks, bLetterIVar, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
  setParent(blocks, bLetterIVar, bLetterSearch);
  mk(blocks, bLetterDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLetterDTVar, bLetterSearch);
  mk(blocks, bLetterSearch, "operator_letter_of", {
    LETTER: blockInput(bLetterIVar, 1),
    STRING: blockInputStr(bLetterDTVar),
  }, {});
  setParent(blocks, bLetterSearch, bItemNum);

  mk(blocks, bItemNum, "data_itemnumoflist", {
    ITEM: blockInputStr(bLetterSearch),
  }, { LIST: ["__font_charMap", listCharMap] });
  setParent(blocks, bItemNum, bSetCI);

  mk(blocks, bSetCI, "data_setvariableto",
    { VALUE: blockInput(bItemNum) },
    { VARIABLE: ["__font_charIndex", varCharIndex] });

  // ── if charIndex > 0 ──
  const bIf = uid();
  const bCond = uid();
  const bCondVar = uid();
  mk(blocks, bCondVar, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
  setParent(blocks, bCondVar, bCond);
  mk(blocks, bCond, "operator_gt", {
    OPERAND1: blockInput(bCondVar),
    OPERAND2: numLit(0),
  }, {});
  setParent(blocks, bCond, bIf);

  // ── switch costume to (letter i of displayText) ──
  const bSwitch = uid();
  const bLetterCostume = uid();
  const bLCIVar = uid(), bLCDTVar = uid();
  mk(blocks, bLCIVar, "data_variable", {}, { VARIABLE: ["__font_i", varI] });
  setParent(blocks, bLCIVar, bLetterCostume);
  mk(blocks, bLCDTVar, "data_variable", {}, { VARIABLE: ["__font_displayText", varDisplayText] });
  setParent(blocks, bLCDTVar, bLetterCostume);
  mk(blocks, bLetterCostume, "operator_letter_of", {
    LETTER: blockInput(bLCIVar, 1),
    STRING: blockInputStr(bLCDTVar),
  }, {});
  setParent(blocks, bLetterCostume, bSwitch);
  const bCostumeMenu = uid();
  mk(blocks, bCostumeMenu, "looks_costume", {}, { COSTUME: ["", null] }, false, true);
  setParent(blocks, bCostumeMenu, bSwitch);
  mk(blocks, bSwitch, "looks_switchcostumeto", {
    COSTUME: [3, bLetterCostume, bCostumeMenu],
  }, {});

  // ── go to x:(font_x) y:(font_y) ──
  const bGoto = uid();
  const bGotoXVar = uid(), bGotoYVar = uid();
  mk(blocks, bGotoXVar, "data_variable", {}, { VARIABLE: ["__font_x", varX] });
  setParent(blocks, bGotoXVar, bGoto);
  mk(blocks, bGotoYVar, "data_variable", {}, { VARIABLE: ["__font_y", varY] });
  setParent(blocks, bGotoYVar, bGoto);
  mk(blocks, bGoto, "motion_gotoxy", {
    X: blockInput(bGotoXVar),
    Y: blockInput(bGotoYVar),
  }, {});

  // ── show ──
  const bShow = uid();
  mk(blocks, bShow, "looks_show", {}, {});

  // ── create clone of myself ──
  const bClone = uid(), bCloneMenu = uid();
  mk(blocks, bCloneMenu, "control_create_clone_of_menu", {}, { CLONE_OPTION: ["_myself_", null] }, false, true);
  setParent(blocks, bCloneMenu, bClone);
  mk(blocks, bClone, "control_create_clone_of", { CLONE_OPTION: [1, bCloneMenu] }, {});

  // ── hide ──
  const bHideAfter = uid();
  mk(blocks, bHideAfter, "looks_hide", {}, {});

  // ── change x by (item (charIndex + 1) of charMap) ──
  const bChangeX = uid();
  const bItemVal = uid();
  const bAddOne = uid();
  const bAddVar = uid();
  mk(blocks, bAddVar, "data_variable", {}, { VARIABLE: ["__font_charIndex", varCharIndex] });
  setParent(blocks, bAddVar, bAddOne);
  mk(blocks, bAddOne, "operator_add", {
    NUM1: blockInput(bAddVar),
    NUM2: numLit(1),
  }, {});
  setParent(blocks, bAddOne, bItemVal);
  mk(blocks, bItemVal, "data_itemoflist", {
    INDEX: blockInput(bAddOne, 1),
  }, { LIST: ["__font_charMap", listCharMap] });
  setParent(blocks, bItemVal, bChangeX);
  mk(blocks, bChangeX, "data_changevariableby", {
    VALUE: blockInput(bItemVal),
  }, { VARIABLE: ["__font_x", varX] });

  // Link the if-substack body
  chain(blocks, [bSwitch, bGoto, bShow, bClone, bHideAfter, bChangeX]);

  mk(blocks, bIf, "control_if", {
    CONDITION: boolInput(bCond),
    SUBSTACK: substackInput(bSwitch),
  }, {});
  setParent(blocks, bSwitch, bIf);

  // change i by 1
  const bChangeI = uid();
  mk(blocks, bChangeI, "data_changevariableby",
    { VALUE: numLit(1) },
    { VARIABLE: ["__font_i", varI] });

  // Link repeat body
  chain(blocks, [bSetCI, bIf, bChangeI]);

  mk(blocks, bRepeat, "control_repeat", {
    TIMES: blockInput(bLenDT, 10),
    SUBSTACK: substackInput(bSetCI),
  }, {});
  setParent(blocks, bSetCI, bRepeat);

  // Top-level render script chain
  chain(blocks, [bRcvRender, bSetI, bRepeat]);

  // ── Script 5: Custom block ── テキストを表示する (text) x:(x) y:(y) ──
  //   set displayText to (text)
  //   set x to (x)
  //   set y to (y)
  //   broadcast __font_clear and wait
  //   broadcast __font_render and wait
  // procCode format: %s = string argument, %n = number argument (Scratch procedure spec syntax)
  const procCode = "テキストを表示する %s %n %n";
  const argTextId = uid(), argXId = uid(), argYId = uid();
  const protoId = uid(), defId = uid();

  const argTextShadow = uid(), argXShadow = uid(), argYShadow = uid();
  mk(blocks, argTextShadow, "argument_reporter_string_number", {}, { VALUE: ["text", null] }, false, true);
  setParent(blocks, argTextShadow, protoId);
  mk(blocks, argXShadow, "argument_reporter_string_number", {}, { VALUE: ["x", null] }, false, true);
  setParent(blocks, argXShadow, protoId);
  mk(blocks, argYShadow, "argument_reporter_string_number", {}, { VALUE: ["y", null] }, false, true);
  setParent(blocks, argYShadow, protoId);

  mk(blocks, protoId, "procedures_prototype",
    { [argTextId]: [1, argTextShadow], [argXId]: [1, argXShadow], [argYId]: [1, argYShadow] },
    {},
    false, true, undefined,
    {
      tagName: "mutation",
      children: [],
      proccode: procCode,
      argumentids: JSON.stringify([argTextId, argXId, argYId]),
      argumentnames: JSON.stringify(["text", "x", "y"]),
      argumentdefaults: JSON.stringify(["", "0", "0"]),
      warp: "false",
    });
  setParent(blocks, protoId, defId);

  mk(blocks, defId, "procedures_definition", { custom_block: [1, protoId] }, {}, true, false, [800, 0]);

  // set displayText to (text arg)
  const bSetDT = uid(), rText = uid();
  mk(blocks, rText, "argument_reporter_string_number", {}, { VALUE: ["text", null] });
  setParent(blocks, rText, bSetDT);
  mk(blocks, bSetDT, "data_setvariableto",
    { VALUE: blockInputStr(rText) },
    { VARIABLE: ["__font_displayText", varDisplayText] });

  // set x to (x arg)
  const bSetX = uid(), rX = uid();
  mk(blocks, rX, "argument_reporter_string_number", {}, { VALUE: ["x", null] });
  setParent(blocks, rX, bSetX);
  mk(blocks, bSetX, "data_setvariableto",
    { VALUE: blockInput(rX) },
    { VARIABLE: ["__font_x", varX] });

  // set y to (y arg)
  const bSetY = uid(), rY = uid();
  mk(blocks, rY, "argument_reporter_string_number", {}, { VALUE: ["y", null] });
  setParent(blocks, rY, bSetY);
  mk(blocks, bSetY, "data_setvariableto",
    { VALUE: blockInput(rY) },
    { VARIABLE: ["__font_y", varY] });

  // broadcast __font_clear and wait
  const bBcClear = uid(), bcClearMenu = uid();
  mk(blocks, bcClearMenu, "event_broadcast_menu", {},
    { BROADCAST_OPTION: ["__font_clear", broadcastClear] }, false, true);
  setParent(blocks, bcClearMenu, bBcClear);
  mk(blocks, bBcClear, "event_broadcastandwait", { BROADCAST_INPUT: [1, bcClearMenu] }, {});

  // broadcast __font_render and wait
  const bBcRender = uid(), bcRenderMenu = uid();
  mk(blocks, bcRenderMenu, "event_broadcast_menu", {},
    { BROADCAST_OPTION: ["__font_render", broadcastRender] }, false, true);
  setParent(blocks, bcRenderMenu, bBcRender);
  mk(blocks, bBcRender, "event_broadcastandwait", { BROADCAST_INPUT: [1, bcRenderMenu] }, {});

  // Link custom block body
  chain(blocks, [defId, bSetDT, bSetX, bSetY, bBcClear, bBcRender]);

  // ── Assemble targets ──
  const fontCharTarget: ScratchTarget = {
    isStage: false,
    name: "FontChar",
    variables: {
      [varCharIndex]: ["__font_charIndex", 0],
      [varX]: ["__font_x", 0],
      [varY]: ["__font_y", 0],
      [varI]: ["__font_i", 0],
    },
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

  return {
    targets: [stageTarget, fontCharTarget],
    monitors: [],
    extensions: [],
    meta: {
      semver: "3.0.0",
      vm: "0.2.0",
      agent: "ScratchFontAssetCreator/0.1.0",
    },
  };
}
