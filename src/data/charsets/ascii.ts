import type { CharsetDefinition } from "../../types";

export const ascii: CharsetDefinition = {
  id: "ascii",
  label: "ASCII",
  description: "ASCII 印字可能文字 95文字（スペース含む）",
  chars: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~",
  count: 95,
};
