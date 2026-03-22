export type CharsetId =
  | "ascii"
  | "hiragana"
  | "katakana"
  | "alphabet_fullwidth"
  | "kyoiku_kanji_grade1"
  | "kyoiku_kanji_grade2"
  | "kyoiku_kanji_grade3"
  | "kyoiku_kanji_grade4"
  | "kyoiku_kanji_grade5"
  | "kyoiku_kanji_grade6";

export interface CharsetDefinition {
  id: CharsetId;
  label: string;
  description: string;
  chars: string;
  count: number;
  grade?: number;
}

export interface Preset {
  id: string;
  label: string;
  description: string;
  charsetIds: CharsetId[];
}

export interface GlyphRenderOptions {
  fontSize: number;
  padding: number;
  foreground: string;
  background: string | null;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface GlyphAsset {
  char: string;
  pngDataUrl: string;
  width: number;
  height: number;
  advanceWidth: number;
}
