import JSZip from "jszip";
import type opentype from "opentype.js";
import type { ExportOptions, GlyphRenderOptions } from "../types";
import { rasterizeGlyphToPng, rasterizeGlyphToSvg } from "./GlyphRasterizer";
import { md5Hex } from "../utils/md5";
import { generateScratchProject, type GlyphInfo } from "./ScratchScriptGenerator";

const BLANK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="480" height="360"></svg>`;

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  outputFormat: "svg",
  warp: true,
  renderMode: "clone",
  align: "left",
  letterSpacing: 0,
  textInputMode: "param",
};

export interface BuildProgress {
  current: number;
  total: number;
  phase: string;
}

export async function buildSb3(
  font: opentype.Font,
  chars: string[],
  options: GlyphRenderOptions,
  exportOptions: ExportOptions = DEFAULT_EXPORT_OPTIONS,
  onProgress?: (p: BuildProgress) => void
): Promise<Blob> {
  const zip = new JSZip();
  const costumes: Array<{
    assetId: string;
    name: string;
    md5ext: string;
    dataFormat: string;
    rotationCenterX: number;
    rotationCenterY: number;
  }> = [];
  const glyphInfos: GlyphInfo[] = [];

  onProgress?.({ current: 0, total: chars.length + 1, phase: "グリフをレンダリング中..." });

  // Calculate cell height for line-height hint (used by the generated Scratch script)
  const scale = options.fontSize / font.unitsPerEm;
  const ascender = font.ascender * scale;
  const descender = Math.abs(font.descender * scale);
  const cellHeight = Math.ceil(ascender + descender) + options.padding * 2;

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    if (exportOptions.outputFormat === "svg") {
      const result = rasterizeGlyphToSvg(font, char, options);
      if (!result) continue;

      const { svg, height, advanceWidth } = result;
      const assetId = md5Hex(svg);
      const filename = `${assetId}.svg`;

      zip.file(filename, svg);
      costumes.push({
        assetId,
        name: char,
        md5ext: filename,
        dataFormat: "svg",
        rotationCenterX: 0,
        rotationCenterY: Math.floor(height / 2),
      });
      glyphInfos.push({ char, advanceWidth });
    } else {
      const result = await rasterizeGlyphToPng(font, char, options);
      if (!result) continue;

      const { png, height, advanceWidth } = result;
      const assetId = md5Hex(png);
      const filename = `${assetId}.png`;

      zip.file(filename, png);
      costumes.push({
        assetId,
        name: char,
        md5ext: filename,
        dataFormat: "png",
        rotationCenterX: 0,
        rotationCenterY: Math.floor(height / 2),
      });
      glyphInfos.push({ char, advanceWidth });
    }

    onProgress?.({ current: i + 1, total: chars.length + 1, phase: "グリフをレンダリング中..." });
  }

  const svgBytes = new TextEncoder().encode(BLANK_SVG);
  const backdropAssetId = md5Hex(svgBytes);
  zip.file(`${backdropAssetId}.svg`, svgBytes);

  onProgress?.({ current: chars.length + 1, total: chars.length + 1, phase: "project.json を生成中..." });

  // §14.2: charMap は Unicode コードポイント昇順でソート済みであることをバイナリサーチが前提とする
  glyphInfos.sort((a, b) => (a.char.codePointAt(0) ?? 0) - (b.char.codePointAt(0) ?? 0));
  // costumes も同順にソートする（project.json 上の costume 順序を charMap と一致させる）
  costumes.sort((a, b) => (a.name.codePointAt(0) ?? 0) - (b.name.codePointAt(0) ?? 0));

  const projectData = generateScratchProject(costumes, glyphInfos, backdropAssetId, exportOptions, cellHeight);
  zip.file("project.json", JSON.stringify(projectData));

  return zip.generateAsync({ type: "blob" });
}
