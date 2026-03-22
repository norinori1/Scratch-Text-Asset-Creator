import { useAppStore } from "../../store/appStore";
import { resolveCharList } from "../../core/CharSetResolver";
import { rasterizeGlyphs } from "../../core/GlyphRasterizer";
import GlyphGrid from "./GlyphGrid";

export default function PreviewPanel() {
  const font = useAppStore((s) => s.font);
  const selectedCharsetIds = useAppStore((s) => s.selectedCharsetIds);
  const customChars = useAppStore((s) => s.customChars);
  const renderOptions = useAppStore((s) => s.renderOptions);
  const glyphAssets = useAppStore((s) => s.glyphAssets);
  const isRasterizing = useAppStore((s) => s.isRasterizing);
  const setGlyphAssets = useAppStore((s) => s.setGlyphAssets);
  const setIsRasterizing = useAppStore((s) => s.setIsRasterizing);

  async function handleGenerate() {
    if (!font) return;
    setIsRasterizing(true);
    const chars = resolveCharList(selectedCharsetIds, customChars);
    const result = await rasterizeGlyphs(font, chars, renderOptions);
    setGlyphAssets(result.assets);
    setIsRasterizing(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">プレビュー</h2>
        {glyphAssets.length > 0 && (
          <span className="text-xs text-gray-500">{glyphAssets.length} グリフ</span>
        )}
      </div>

      <button
        onClick={handleGenerate}
        disabled={!font || isRasterizing}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white font-semibold py-2 rounded-lg transition-colors"
      >
        {isRasterizing ? "レンダリング中..." : "プレビューを生成"}
      </button>

      {!font && (
        <p className="text-center text-gray-400 text-sm py-8">
          フォントファイルを読み込んでください
        </p>
      )}

      <div className="overflow-y-auto flex-1 max-h-[60vh]">
        <GlyphGrid assets={glyphAssets} />
      </div>
    </div>
  );
}
