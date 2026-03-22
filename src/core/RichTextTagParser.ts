/**
 * Rich Text Tag Parser
 *
 * Unity TextMeshPro 互換のインラインマークアップを解析する。
 * 仕様: docs/specifications/spec-v3.md §15
 *
 * 対応タグ:
 *   <c=#RRGGBB>  文字色
 *   <s=N>        サイズ (%)
 *   <g=N>        透明度 (0〜100)
 *   <b=N>        明るさ (-100〜100)
 *   <wave>       波打ちアニメーション
 *   <shake>      振動アニメーション
 *   <sp=N>       タイプライター速度上書き (ms/文字)
 */

export interface RtSegment {
  text: string;
  color?: string;        // CSS カラー文字列 (例: "#FF0000")
  size?: number;         // % (デフォルト 100)
  ghost?: number;        // 0〜100
  brightness?: number;   // -100〜100
  wave?: boolean;
  shake?: boolean;
  typeSpeed?: number;    // ms/文字
}

/**
 * リッチテキスト文字列を RtSegment[] に分解する。
 * 不正タグはそのままプレーンテキストとして扱う（フォールバック）。
 *
 * **制約:** 同名タグのネスト（例: `<c=red><c=blue>text</c></c>`）はサポートしない。
 * 外側の `<c>` が最初の `</c>` で閉じられるため、期待通りに動作しない。
 * 異なるタグのネスト（例: `<s=200><c=#F00>text</c></s>`）は正しく動作する。
 */
export function parseRichText(input: string): RtSegment[] {
  const segments: RtSegment[] = [];
  const tagRegex = /<(\w+)(?:=([^>]*))?>(.*?)<\/\1>/gs;
  let lastIndex = 0;

  for (const match of input.matchAll(tagRegex)) {
    const [fullMatch, tagName, tagValue, inner] = match;
    const start = match.index!;

    // タグ前のプレーンテキスト
    if (start > lastIndex) {
      segments.push({ text: input.slice(lastIndex, start) });
    }

    // タグ付きセグメント（再帰パース対応）
    const innerSegments = parseRichText(inner);
    for (const seg of innerSegments) {
      segments.push(applyTag(seg, tagName, tagValue));
    }

    lastIndex = start + fullMatch.length;
  }

  // 末尾のプレーンテキスト
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }

  return segments;
}

function applyTag(seg: RtSegment, tag: string, value?: string): RtSegment {
  switch (tag) {
    case "c":    return { ...seg, color: value };
    case "s":    return { ...seg, size: Number(value) };
    case "g":    return { ...seg, ghost: Number(value) };
    case "b":    return { ...seg, brightness: Number(value) };
    case "wave": return { ...seg, wave: true };
    case "shake": return { ...seg, shake: true };
    case "sp":   return { ...seg, typeSpeed: Number(value) };
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
 * RtSegment[] を __font_rtQueue エントリ形式にシリアライズする。
 * 形式: "文字|size|color|ghost|brightness|animType|animParam1|typeSpeed"
 */
export function serializeSegmentsToQueue(segments: RtSegment[]): string[] {
  const entries: string[] = [];
  for (const seg of segments) {
    for (const ch of Array.from(seg.text)) {
      const size = seg.size ?? 100;
      const colorEffect = seg.color ? cssColorToScratchColorEffect(seg.color) : 0;
      const ghost = seg.ghost ?? 0;
      const brightness = seg.brightness ?? 0;
      const animType = seg.wave ? "wave" : seg.shake ? "shake" : "none";
      const typeSpeed = seg.typeSpeed ?? 60;
      entries.push(`${ch}|${size}|${colorEffect}|${ghost}|${brightness}|${animType}|${typeSpeed}`);
    }
  }
  return entries;
}
