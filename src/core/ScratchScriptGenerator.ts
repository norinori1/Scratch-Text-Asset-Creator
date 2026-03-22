type BlockId = string;

interface ScratchBlock {
  opcode: string;
  next: BlockId | null;
  parent: BlockId | null;
  inputs: Record<string, unknown>;
  fields: Record<string, unknown>;
  shadow: boolean;
  topLevel: boolean;
  x?: number;
  y?: number;
  mutation?: Record<string, unknown>;
}

interface ScratchCostume {
  assetId: string;
  name: string;
  bitmapResolution?: number;
  md5ext: string;
  dataFormat: string;
  rotationCenterX: number;
  rotationCenterY: number;
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

export function generateScratchProject(
  costumes: ScratchCostume[],
  backdropAssetId: string
): { targets: ScratchTarget[]; meta: unknown } {
  const varCharIndex = uid();
  const varX = uid();
  const varY = uid();
  const varI = uid();
  const listCharMap = uid();

  const blocks: Record<string, ScratchBlock> = {};

  const procCode = "テキストを表示する %s %n %n";
  const argText = uid();
  const argX = uid();
  const argY = uid();

  const protoId = uid();
  const defId = uid();

  blocks[defId] = {
    opcode: "procedures_definition",
    next: null,
    parent: null,
    inputs: {
      custom_block: [1, protoId],
    },
    fields: {},
    shadow: false,
    topLevel: true,
    x: 0,
    y: 0,
  };

  blocks[protoId] = {
    opcode: "procedures_prototype",
    next: null,
    parent: defId,
    inputs: {
      [argText]: [1, argText + "_shadow"],
      [argX]: [1, argX + "_shadow"],
      [argY]: [1, argY + "_shadow"],
    },
    fields: {},
    shadow: true,
    topLevel: false,
    mutation: {
      tagName: "mutation",
      children: [],
      proccode: procCode,
      argumentids: JSON.stringify([argText, argX, argY]),
      argumentnames: JSON.stringify(["text", "x", "y"]),
      argumentdefaults: JSON.stringify(["", "0", "0"]),
      warp: "false",
    },
  };

  const argTextShadow = argText + "_shadow";
  const argXShadow = argX + "_shadow";
  const argYShadow = argY + "_shadow";

  blocks[argTextShadow] = {
    opcode: "argument_reporter_string_number",
    next: null,
    parent: protoId,
    inputs: {},
    fields: { VALUE: ["text", null] },
    shadow: true,
    topLevel: false,
  };

  blocks[argXShadow] = {
    opcode: "argument_reporter_string_number",
    next: null,
    parent: protoId,
    inputs: {},
    fields: { VALUE: ["x", null] },
    shadow: true,
    topLevel: false,
  };

  blocks[argYShadow] = {
    opcode: "argument_reporter_string_number",
    next: null,
    parent: protoId,
    inputs: {},
    fields: { VALUE: ["y", null] },
    shadow: true,
    topLevel: false,
  };

  const flagId = uid();
  const hideId = uid();

  blocks[flagId] = {
    opcode: "event_whenflagclicked",
    next: hideId,
    parent: null,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: true,
    x: 400,
    y: 0,
  };

  blocks[hideId] = {
    opcode: "looks_hide",
    next: null,
    parent: flagId,
    inputs: {},
    fields: {},
    shadow: false,
    topLevel: false,
  };

  const spriteTarget: ScratchTarget = {
    isStage: false,
    name: "FontChar",
    variables: {
      [varCharIndex]: ["__font_charIndex", 0],
      [varX]: ["__font_x", 0],
      [varY]: ["__font_y", 0],
      [varI]: ["__font_i", 0],
    },
    lists: {
      [listCharMap]: ["__font_charMap", []],
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
    variables: {},
    lists: {},
    broadcasts: {},
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
    targets: [stageTarget, spriteTarget],
    meta: {
      semver: "3.0.0",
      vm: "0.2.0",
      agent: "Scratch Font Asset Creator",
    },
  };
}
