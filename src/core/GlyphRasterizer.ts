import type opentype from "opentype.js";
import type { GlyphRenderOptions, GlyphAsset } from "../types";

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToDataUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (canvas instanceof HTMLCanvasElement) {
    return canvas.toDataURL("image/png");
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  if (canvas instanceof HTMLCanvasElement) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to convert canvas to PNG blob"));
          return;
        }
        blob
          .arrayBuffer()
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(reject);
      }, "image/png");
    });
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

/** opentype.js の glyph からセルサイズを計算するユーティリティ */
export function computeGlyphCellSize(
  font: opentype.Font,
  options: GlyphRenderOptions
): { cellHeight: number; ascender: number; scale: number } {
  const scale = options.fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = Math.abs(font.descender * scale);
  const cellHeight = Math.ceil(ascender + descender) + options.padding * 2;
  return { cellHeight, ascender, scale };
}

export interface RasterizeResult {
  assets: GlyphAsset[];
  skippedChars: string[];
}

export async function rasterizeGlyphs(
  font: opentype.Font,
  chars: string[],
  options: GlyphRenderOptions
): Promise<RasterizeResult> {
  const { padding, foreground, background } = options;
  const { ascender, cellHeight, scale } = computeGlyphCellSize(font, options);
  const assets: GlyphAsset[] = [];
  const skippedChars: string[] = [];

  for (const char of chars) {
    const glyph = font.charToGlyph(char);
    if (!glyph || glyph.index === 0) {
      skippedChars.push(char);
      continue;
    }

    const advanceWidth = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
    const cellWidth = Math.ceil(advanceWidth) + padding * 2;

    const canvas = createCanvas(cellWidth, cellHeight);
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) continue;

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, cellWidth, cellHeight);
    } else {
      ctx.clearRect(0, 0, cellWidth, cellHeight);
    }

    ctx.fillStyle = foreground;
    const path = glyph.getPath(padding, padding + ascender, options.fontSize);
    path.draw(ctx as CanvasRenderingContext2D);

    const pngDataUrl = await canvasToDataUrl(canvas);

    assets.push({
      char,
      pngDataUrl,
      width: cellWidth,
      height: cellHeight,
      advanceWidth: Math.ceil(advanceWidth),
    });
  }

  return { assets, skippedChars };
}

export interface RasterizePngResult {
  png: Uint8Array;
  width: number;
  height: number;
  advanceWidth: number;
}

export async function rasterizeGlyphToPng(
  font: opentype.Font,
  char: string,
  options: GlyphRenderOptions
): Promise<RasterizePngResult | null> {
  const { padding, foreground, background } = options;
  const { ascender, cellHeight, scale } = computeGlyphCellSize(font, options);

  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) return null;

  const advanceWidthScaled = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
  const cellWidth = Math.ceil(advanceWidthScaled) + padding * 2;

  const canvas = createCanvas(cellWidth, cellHeight);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cellWidth, cellHeight);
  } else {
    ctx.clearRect(0, 0, cellWidth, cellHeight);
  }

  ctx.fillStyle = foreground;
  const path = glyph.getPath(padding, padding + ascender, options.fontSize);
  path.draw(ctx as CanvasRenderingContext2D);

  const png = await canvasToPng(canvas);
  return { png, width: cellWidth, height: cellHeight, advanceWidth: Math.ceil(advanceWidthScaled) };
}

export interface RasterizeSvgResult {
  svg: Uint8Array;
  width: number;
  height: number;
  advanceWidth: number;
}

/**
 * グリフを SVG データとして生成する。
 * opentype.js の Path.toPathData() を使ってパス文字列を取得し、
 * 最小限の SVG ファイルとして返す。Scratch のベクターコスチュームとして使用可能。
 */
export function rasterizeGlyphToSvg(
  font: opentype.Font,
  char: string,
  options: GlyphRenderOptions
): RasterizeSvgResult | null {
  const { padding, foreground } = options;
  const { ascender, cellHeight, scale } = computeGlyphCellSize(font, options);

  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) return null;

  const advanceWidthScaled = (glyph.advanceWidth ?? font.unitsPerEm) * scale;
  const cellWidth = Math.ceil(advanceWidthScaled) + padding * 2;

  const path = glyph.getPath(padding, padding + ascender, options.fontSize);
  // opentype.js の Path には toPathData() メソッドがある
  const pathData: string = (path as unknown as { toPathData: (d: number) => string }).toPathData(2);

  const svgContent =
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${cellWidth}" height="${cellHeight}">` +
    (pathData ? `<path fill="${foreground}" d="${pathData}"/>` : "") +
    `</svg>`;

  const svg = new TextEncoder().encode(svgContent);
  return { svg, width: cellWidth, height: cellHeight, advanceWidth: Math.ceil(advanceWidthScaled) };
}
