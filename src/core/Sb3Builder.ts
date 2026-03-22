import JSZip from "jszip";
import type opentype from "opentype.js";
import type { GlyphRenderOptions, ScratchExportOptions } from "../types";
import { DEFAULT_SCRATCH_EXPORT_OPTIONS } from "../types";
import { rasterizeGlyphToPng, rasterizeGlyphToSvg, computeGlyphCellSize } from "./GlyphRasterizer";
import { md5Hex } from "../utils/md5";
import { generateScratchProject, type GlyphInfo } from "./ScratchScriptGenerator";

const BLANK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="480" height="360"></svg>`;

export interface BuildProgress {
  current: number;
  total: number;
  phase: string;
}

export async function buildSb3(
  font: opentype.Font,
  chars: string[],
  glyphOptions: GlyphRenderOptions,
  exportOptions: ScratchExportOptions = DEFAULT_SCRATCH_EXPORT_OPTIONS,
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
  const useSvg = exportOptions.outputFormat === "svg";

  onProgress?.({ current: 0, total: chars.length + 1, phase: "グリフをレンダリング中..." });

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    if (useSvg) {
      const result = rasterizeGlyphToSvg(font, char, glyphOptions);
      if (!result) {
        onProgress?.({ current: i + 1, total: chars.length + 1, phase: "グリフをレンダリング中..." });
        continue;
      }
      const { svg, height, advanceWidth } = result;
      const assetId = md5Hex(svg);
      zip.file(`${assetId}.svg`, svg);
      costumes.push({
        assetId,
        name: char,
        md5ext: `${assetId}.svg`,
        dataFormat: "svg",
        rotationCenterX: 0,
        rotationCenterY: Math.floor(height / 2),
      });
      glyphInfos.push({ char, advanceWidth });
    } else {
      const result = await rasterizeGlyphToPng(font, char, glyphOptions);
      if (!result) {
        onProgress?.({ current: i + 1, total: chars.length + 1, phase: "グリフをレンダリング中..." });
        continue;
      }
      const { png, height, advanceWidth } = result;
      const assetId = md5Hex(png);
      zip.file(`${assetId}.png`, png);
      costumes.push({
        assetId,
        name: char,
        md5ext: `${assetId}.png`,
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

  // 行送り量をフォントメトリクスから算出する
  const { cellHeight } = computeGlyphCellSize(font, glyphOptions);

  const projectData = generateScratchProject(
    costumes, glyphInfos, backdropAssetId, exportOptions, cellHeight
  );
  zip.file("project.json", JSON.stringify(projectData));

  return zip.generateAsync({ type: "blob" });
}
