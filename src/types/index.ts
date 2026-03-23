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

export type OutputFormat = "svg" | "png";
export type RenderMode = "clone" | "pen";
export type TextAlign = "left" | "center" | "right";
/** テキスト入力モード (§15) */
export type TextInputMode = "param" | "richtext" | "console";

export interface ExportOptions {
  /** Costume image format: SVG (vector, smaller) or PNG (raster, compatible) */
  outputFormat: OutputFormat;
  /** Whether the custom block runs without screen refresh (warp=true is faster) */
  warp: boolean;
  /** Clone-based rendering (standard) or Pen/stamp-based rendering (faster for many chars) */
  renderMode: RenderMode;
  /** Default text alignment baked into the generated script */
  align: TextAlign;
  /** Default letter spacing (pixels) – sets the initial value of __font_letterSpacing */
  letterSpacing: number;
  /** テキスト入力モード (§15): param = 10引数, richtext = インラインタグ, console = コンソールスクリプト */
  textInputMode?: TextInputMode;
}

export interface GlyphAsset {
  char: string;
  pngDataUrl: string;
  width: number;
  height: number;
  advanceWidth: number;
}
