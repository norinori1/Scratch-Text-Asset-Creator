/**
 * Rich Text Tag Parser
 *
 * Unity TextMeshPro 互換のインラインマークアップを解析する。
 * 仕様: docs/specifications/spec-v4.md §15
 *
 * ## サポートタグ（Mode 2）
 *   <c=N>         COLOR エフェクト値を直接指定 (0〜200)
 *   <ch=#RRGGBB>  CSS カラー → COLOR 近似変換
 *   <s=N>         サイズ (%)
 *   <g=N>         透明度 (0〜100)
 *   <b=N>         明るさ (-100〜100)
 *   <wave>        波打ちアニメーション
 *   <shake>       振動アニメーション
 *   <sp=N>        タイプライター速度上書き (ms/文字)
 *   <br>          改行（単独タグ）
 *
 * **制約:** 同名タグのネスト（例: `<c=100><c=50>text</c></c>`）はサポートしない。
 * 外側の `<c>` が最初の `</c>` で閉じられるため、期待通りに動作しない。
 * 異なるタグのネスト（例: `<s=200><c=100>text</c></s>`）は正しく動作する。
 *
 * ## rtQueue エントリ形式（全モード共通, §15-D）
 *   "文字|x|y|size|colorEffect|ghost|brightness|animType|animAmp|animSpd|typeDelay"
 */

export interface RtSegment {
  text: string;
  colorEffect?: number;  // 0〜200（Scratch COLOR エフェクト値）
  size?: number;         // % (デフォルト 100)
  ghost?: number;        // 0〜100
  brightness?: number;   // -100〜100
  wave?: boolean;
  shake?: boolean;
  typeDelay?: number;    // ms/文字
}

/**
 * リッチテキスト文字列からインラインタグを除去し、プレーンテキストを返す。
 *
 * タイプライター演出など、表示文字数のカウントや1文字ずつの処理が必要な
 * 場面でタグ文字が含まれないよう前処理するために使用する。
 *
 * 例:
 *   stripTags("<c=100>赤</c>テキスト") → "赤テキスト"
 *   stripTags("前<br>後")             → "前\n後"
 *   stripTags("<sp=80>ゆっくり</sp>") → "ゆっくり"
 */
export function stripTags(input: string): string {
  // <br> を改行に変換（parseRichText と同様の前処理）
  const preprocessed = input.replace(/<br\s*\/?>/gi, "\n");

  // タグ文字を状態機械でスキャンして除去する。
  // TypeScript 側で処理するため、<...> を単純に除去する。
  // タグ外（inTag = false）に現れた ">" は通常のテキスト文字として保持する。
  let result = "";
  let inTag = false;
  for (const ch of preprocessed) {
    if (ch === "<") {
      inTag = true;
    } else if (ch === ">") {
      if (inTag) {
        // タグの閉じ角括弧: タグモードを終了する
        inTag = false;
      } else {
        // タグ外の ">" はリテラル文字として出力する
        result += ch;
      }
    } else if (!inTag) {
      result += ch;
    }
  }
  return result;
}

/**
 * リッチテキスト文字列を RtSegment[] に分解する。
 * 不正タグはそのままプレーンテキストとして扱う（フォールバック）。
 *
 * **制約:** 同名タグのネスト（例: `<c=100><c=50>text</c></c>`）はサポートしない。
 * 外側の `<c>` が最初の `</c>` で閉じられるため、期待通りに動作しない。
 * 異なるタグのネスト（例: `<s=200><c=100>text</c></s>`）は正しく動作する。
 *
 * `<br>` は単独の改行タグとして処理され、`\n` に変換される。
 */
export function parseRichText(input: string): RtSegment[] {
  // まず <br> を \n に展開する（単独タグなので事前変換）
  const preprocessed = input.replace(/<br\s*\/?>/gi, "\n");

  const segments: RtSegment[] = [];
  const tagRegex = /<(\w+)(?:=([^>]*))?>(.*?)<\/\1>/gs;
  let lastIndex = 0;

  for (const match of preprocessed.matchAll(tagRegex)) {
    const [fullMatch, tagName, tagValue, inner] = match;
    const start = match.index!;

    // タグ前のプレーンテキスト
    if (start > lastIndex) {
      segments.push({ text: preprocessed.slice(lastIndex, start) });
    }

    // タグ付きセグメント（再帰パース対応）
    const innerSegments = parseRichText(inner);
    for (const seg of innerSegments) {
      segments.push(applyTag(seg, tagName, tagValue));
    }

    lastIndex = start + fullMatch.length;
  }

  // 末尾のプレーンテキスト
  if (lastIndex < preprocessed.length) {
    segments.push({ text: preprocessed.slice(lastIndex) });
  }

  return segments;
}

function applyTag(seg: RtSegment, tag: string, value?: string): RtSegment {
  switch (tag) {
    case "c":    return { ...seg, colorEffect: Number(value) };
    case "ch":   return { ...seg, colorEffect: value ? cssColorToScratchColorEffect(value) : 0 };
    case "s":    return { ...seg, size: Number(value) };
    case "g":    return { ...seg, ghost: Number(value) };
    case "b":    return { ...seg, brightness: Number(value) };
    case "wave": return { ...seg, wave: true };
    case "shake": return { ...seg, shake: true };
    case "sp":   return { ...seg, typeDelay: Number(value) };
    default:     return seg; // 未知タグは無視
  }
}

/**
 * CSS カラー (#RRGGBB) を Scratch の COLOR エフェクト値 (0〜200) に近似変換する。
 * Scratch の COLOR エフェクトは色相回転（0〜200 で一周）。
 */
export function cssColorToScratchColorEffect(hex: string): number {
  const hsl = hexToHsl(hex);
  return Math.round((hsl.h / 360) * 200);
}

interface Hsl {
  h: number; // 0〜360
  s: number; // 0〜1
  l: number; // 0〜1
}

function hexToHsl(hex: string): Hsl {
  // # プレフィックスを除去
  const cleaned = hex.replace(/^#/, "");
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s, l };
}

/**
 * RtSegment[] を __font_rtQueue エントリ形式（全モード共通, §15-D）にシリアライズする。
 *
 * 形式: "文字|x|y|size|colorEffect|ghost|brightness|animType|animAmp|animSpd|typeDelay"
 *
 * @param segments  parseRichText() の出力
 * @param startX    テキスト描画の開始 X 座標
 * @param startY    テキスト描画の開始 Y 座標
 * @param advances  文字 → advance width のマップ（バイナリサーチ結果から構築）
 * @param options   省略可能な描画オプション
 */
export function serializeSegmentsToQueue(
  segments: RtSegment[],
  startX = 0,
  startY = 0,
  advances: Record<string, number> = {},
  options: { letterSpacing?: number } = {}
): string[] {
  const entries: string[] = [];
  const ls = options.letterSpacing ?? 0;
  let curX = startX;
  let curY = startY;

  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      const size = seg.size ?? 100;
      const colorEffect = seg.colorEffect ?? 0;
      const ghost = seg.ghost ?? 0;
      const brightness = seg.brightness ?? 0;
      const animType = seg.wave ? "wave" : seg.shake ? "shake" : "";
      const animAmp = 0;
      const animSpd = 0;
      const typeDelay = seg.typeDelay ?? 0;

      if (ch === "\n") {
        // 改行マーカー
        entries.push(`\n|${curX}|${curY}|0|0|0|0|||0`);
        curX = startX;
        curY -= 72; // デフォルト行間（実際の値は呼び出し側で調整可）
        continue;
      }

      entries.push(
        `${ch}|${curX}|${curY}|${size}|${colorEffect}|${ghost}|${brightness}|${animType}|${animAmp}|${animSpd}|${typeDelay}`
      );

      const aw = advances[ch] ?? 0;
      curX += aw + ls;
    }
  }

  return entries;
}

// ── Mode 3: コンソールスクリプトパーサー ─────────────────────────────────────

/**
 * Mode 3 コンソールスクリプトの1ブロックを表す。
 * 仕様: docs/specifications/spec-v4.md §15-C
 */
export interface ConsoleBlock {
  text: string;
  x: number;
  y: number;
  size: number;
  colorEffect: number;   // 0〜200（直接値または colorHex からの変換値）
  ghost: number;
  brightness: number;
  align: "left" | "center" | "right";
  animType: "wave" | "shake" | "fade" | "bounce" | "none" | "";
  animAmp: number;
  animSpeed: number;
  typeDelay: number;
  maxWidth: number;
  letterSpacing: number;
  layer: number;
  lineHeight: number;
}

const DEFAULT_CONSOLE_BLOCK: ConsoleBlock = {
  text: "",
  x: 0,
  y: 0,
  size: 100,
  colorEffect: 0,
  ghost: 0,
  brightness: 0,
  align: "left",
  animType: "",
  animAmp: 8,
  animSpeed: 5,
  typeDelay: 0,
  maxWidth: 0,
  letterSpacing: 0,
  layer: 1,
  lineHeight: 0,
};

/**
 * Mode 3 コンソールスクリプト文字列を ConsoleBlock[] に解析する。
 * 仕様: docs/specifications/spec-v4.md §15-C
 *
 * - 空行・`//` で始まる行はコメントとして無視
 * - `---` はブロック区切り
 * - 各行は `キー:値` 形式（最初の `:` のみ区切りとして扱う → 値にコロン含み可）
 */
export function parseConsoleScript(script: string): ConsoleBlock[] {
  const blocks: ConsoleBlock[] = [];
  let current: ConsoleBlock = { ...DEFAULT_CONSOLE_BLOCK };
  let hasContent = false;

  for (const rawLine of script.split("\n")) {
    const line = rawLine.trimEnd(); // 末尾空白のみ除去（先頭は保持）

    // 空行・コメント行
    if (line.trim() === "" || line.trimStart().startsWith("//")) {
      continue;
    }

    // ブロック区切り
    if (line.trim() === "---") {
      if (hasContent) {
        blocks.push(current);
        current = { ...DEFAULT_CONSOLE_BLOCK };
        hasContent = false;
      }
      continue;
    }

    // "キー:値" パース（最初の `:` だけを区切りとする）
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1); // トリム不要（値にスペース含み可）

    hasContent = true;
    applyConsoleKey(current, key, val);
  }

  // 末尾 "---" なしでも最終ブロックをフラッシュ
  if (hasContent) {
    blocks.push(current);
  }

  return blocks;
}

function applyConsoleKey(block: ConsoleBlock, key: string, val: string): void {
  switch (key) {
    case "text":          block.text          = val; break;
    case "x":             block.x             = Number(val); break;
    case "y":             block.y             = Number(val); break;
    case "size":          block.size          = Number(val); break;
    case "color":         block.colorEffect   = Number(val); break;
    case "colorHex":      block.colorEffect   = cssColorToScratchColorEffect(val.trim()); break;
    case "ghost":         block.ghost         = Number(val); break;
    case "brightness":    block.brightness    = Number(val); break;
    case "align":         block.align         = val.trim() as ConsoleBlock["align"]; break;
    case "anim":          block.animType      = val.trim() as ConsoleBlock["animType"]; break;
    case "animAmp":       block.animAmp       = Number(val); break;
    case "animSpeed":     block.animSpeed     = Number(val); break;
    case "typeDelay":     block.typeDelay     = Number(val); break;
    case "maxWidth":      block.maxWidth      = Number(val); break;
    case "letterSpacing": block.letterSpacing = Number(val); break;
    case "layer":         block.layer         = Number(val); break;
    case "lineHeight":    block.lineHeight    = Number(val); break;
    // 未知キーは無視
  }
}

