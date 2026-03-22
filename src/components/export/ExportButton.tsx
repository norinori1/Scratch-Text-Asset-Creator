import { useAppStore } from "../../store/appStore";
import { resolveCharList } from "../../core/CharSetResolver";
import { buildSb3 } from "../../core/Sb3Builder";

export default function ExportButton() {
  const font = useAppStore((s) => s.font);
  const fontFileName = useAppStore((s) => s.fontFileName);
  const selectedCharsetIds = useAppStore((s) => s.selectedCharsetIds);
  const customChars = useAppStore((s) => s.customChars);
  const renderOptions = useAppStore((s) => s.renderOptions);
  const isExporting = useAppStore((s) => s.isExporting);
  const setIsExporting = useAppStore((s) => s.setIsExporting);
  const setExportProgress = useAppStore((s) => s.setExportProgress);

  async function handleExport() {
    if (!font) return;
    setIsExporting(true);
    const chars = resolveCharList(selectedCharsetIds, customChars);
    try {
      const blob = await buildSb3(font, chars, renderOptions, (p) => {
        setExportProgress(p.current, p.total, p.phase);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fontFileName.replace(/\.[^.]+$/, "") + "_font.sb3";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setIsExporting(false);
      setExportProgress(0, 1, "");
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={!font || isExporting}
      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-lg transition-colors"
    >
      {isExporting ? "エクスポート中..." : "🎯 .sb3 ファイルをエクスポート"}
    </button>
  );
}
