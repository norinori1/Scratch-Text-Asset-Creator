import { useAppStore } from "../../store/appStore";
import ExportButton from "./ExportButton";
import ProgressIndicator from "./ProgressIndicator";

export default function ExportPanel() {
  const isExporting = useAppStore((s) => s.isExporting);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const exportPhase = useAppStore((s) => s.exportPhase);
  const exportOptions = useAppStore((s) => s.exportOptions);
  const setExportOptions = useAppStore((s) => s.setExportOptions);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <h2 className="font-semibold text-gray-800">エクスポート設定</h2>

      {/* Output format */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">コスチューム形式</label>
        <select
          value={exportOptions.outputFormat}
          onChange={(e) => setExportOptions({ outputFormat: e.target.value as "svg" | "png" })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="svg">SVG（推奨・軽量）</option>
          <option value="png">PNG（互換性重視）</option>
        </select>
      </div>

      {/* Render mode */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">描画方式</label>
        <select
          value={exportOptions.renderMode}
          onChange={(e) => setExportOptions({ renderMode: e.target.value as "clone" | "pen" })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="clone">クローン式（推奨・拡張機能不要）</option>
          <option value="pen">ペン式（高速・長文向け）</option>
        </select>
        {exportOptions.renderMode === "pen" && (
          <p className="text-xs text-amber-600">
            ⚠️ ペン式はPen拡張が必要です。消去時はステージ全体のペン描画が消えます。
          </p>
        )}
      </div>

      {/* Text alignment (Font_Config default) */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-gray-700">テキスト揃え（Font_Configデフォルト）</label>
        <select
          value={exportOptions.align}
          onChange={(e) => setExportOptions({ align: e.target.value as "left" | "center" | "right" })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="left">左揃え</option>
          <option value="center">中央揃え</option>
          <option value="right">右揃え</option>
        </select>
        <p className="text-xs text-gray-500">
          Font_Config[8] の初期値になります。ブロック呼び出し時に揃えパラメーターで上書きできます。
        </p>
      </div>

      {/* Warp toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={exportOptions.warp}
          onChange={(e) => setExportOptions({ warp: e.target.checked })}
          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span className="text-sm font-medium text-gray-700">
          画面を再描画せずに実行（warp）
        </span>
      </label>
      <p className="text-xs text-gray-500 -mt-2">
        有効にするとテキスト表示が高速になります（推奨）。アニメーション演出が必要な場合は無効にしてください。
      </p>

      <ExportButton />
      {isExporting && (
        <ProgressIndicator progress={exportProgress} phase={exportPhase} />
      )}
    </div>
  );
}
