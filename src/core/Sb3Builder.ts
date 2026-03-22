import JSZip from "jszip";
import type opentype from "opentype.js";
import type { GlyphRenderOptions } from "../types";
import { rasterizeGlyphToPng } from "./GlyphRasterizer";
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
  options: GlyphRenderOptions,
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

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
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

    onProgress?.({ current: i + 1, total: chars.length + 1, phase: "グリフをレンダリング中..." });
  }

  const svgBytes = new TextEncoder().encode(BLANK_SVG);
  const backdropAssetId = md5Hex(svgBytes);
  zip.file(`${backdropAssetId}.svg`, svgBytes);

  onProgress?.({ current: chars.length + 1, total: chars.length + 1, phase: "project.json を生成中..." });

  const projectData = generateScratchProject(costumes, glyphInfos, backdropAssetId);
  zip.file("project.json", JSON.stringify(projectData));

  return zip.generateAsync({ type: "blob" });
}
