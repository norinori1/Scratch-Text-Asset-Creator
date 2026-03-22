import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import ExportButton from "./ExportButton";
import ProgressIndicator from "./ProgressIndicator";
import ExportOptions from "./ExportOptions";

export default function ExportPanel() {
  const isExporting = useAppStore((s) => s.isExporting);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const exportPhase = useAppStore((s) => s.exportPhase);
  const [showOptions, setShowOptions] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">エクスポート</h2>
        <button
          onClick={() => setShowOptions((v) => !v)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showOptions ? "▲ オプションを隠す" : "▼ 詳細オプション"}
        </button>
      </div>

      {showOptions && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
          <ExportOptions />
        </div>
      )}

      <ExportButton />

      {isExporting && (
        <ProgressIndicator progress={exportProgress} phase={exportPhase} />
      )}
    </div>
  );
}
