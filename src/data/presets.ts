import type { Preset } from "../types";

export const PRESETS: Preset[] = [
  {
    id: "ascii_only",
    label: "ASCII のみ",
    description: "英数字・記号（95文字）",
    charsetIds: ["ascii"],
  },
  {
    id: "ascii_kana",
    label: "ASCII + かな",
    description: "ASCII・ひらがな・カタカナ（約260文字）",
    charsetIds: ["ascii", "hiragana", "katakana"],
  },
  {
    id: "japanese_basic",
    label: "日本語基本セット",
    description: "ASCII + かな + 教育漢字 全学年（約1,400文字）",
    charsetIds: [
      "ascii", "hiragana", "katakana",
      "kyoiku_kanji_grade1", "kyoiku_kanji_grade2",
      "kyoiku_kanji_grade3", "kyoiku_kanji_grade4",
      "kyoiku_kanji_grade5", "kyoiku_kanji_grade6",
    ],
  },
];
