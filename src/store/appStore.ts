import { create } from "zustand";
import type opentype from "opentype.js";
import type { CharsetId, ExportOptions, GlyphAsset, GlyphRenderOptions } from "../types";
import { DEFAULT_EXPORT_OPTIONS } from "../core/Sb3Builder";

interface AppState {
  font: opentype.Font | null;
  fontFileName: string;
  selectedCharsetIds: CharsetId[];
  customChars: string;
  renderOptions: GlyphRenderOptions;
  exportOptions: ExportOptions;
  glyphAssets: GlyphAsset[];
  isRasterizing: boolean;
  exportProgress: number;
  exportPhase: string;
  isExporting: boolean;

  setFont: (font: opentype.Font, fileName: string) => void;
  toggleCharset: (id: CharsetId) => void;
  setCharsetIds: (ids: CharsetId[]) => void;
  setCustomChars: (chars: string) => void;
  setRenderOptions: (opts: Partial<GlyphRenderOptions>) => void;
  setExportOptions: (opts: Partial<ExportOptions>) => void;
  setGlyphAssets: (assets: GlyphAsset[]) => void;
  setIsRasterizing: (v: boolean) => void;
  setExportProgress: (current: number, total: number, phase: string) => void;
  setIsExporting: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  font: null,
  fontFileName: "",
  selectedCharsetIds: ["ascii"],
  customChars: "",
  renderOptions: {
    fontSize: 64,
    padding: 4,
    foreground: "#000000",
    background: null,
  },
  exportOptions: DEFAULT_EXPORT_OPTIONS,
  glyphAssets: [],
  isRasterizing: false,
  exportProgress: 0,
  exportPhase: "",
  isExporting: false,

  setFont: (font, fileName) => set({ font, fontFileName: fileName, glyphAssets: [] }),
  toggleCharset: (id) =>
    set((s) => ({
      selectedCharsetIds: s.selectedCharsetIds.includes(id)
        ? s.selectedCharsetIds.filter((x) => x !== id)
        : [...s.selectedCharsetIds, id],
    })),
  setCharsetIds: (ids) => set({ selectedCharsetIds: ids }),
  setCustomChars: (chars) => set({ customChars: chars }),
  setRenderOptions: (opts) =>
    set((s) => ({ renderOptions: { ...s.renderOptions, ...opts } })),
  setExportOptions: (opts) =>
    set((s) => ({ exportOptions: { ...s.exportOptions, ...opts } })),
  setGlyphAssets: (assets) => set({ glyphAssets: assets }),
  setIsRasterizing: (v) => set({ isRasterizing: v }),
  setExportProgress: (current, total, phase) =>
    set({ exportProgress: total > 0 ? Math.round((current / total) * 100) : 0, exportPhase: phase }),
  setIsExporting: (v) => set({ isExporting: v }),
}));
