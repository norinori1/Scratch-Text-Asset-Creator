import { useAppStore } from "../../store/appStore";
import ExportButton from "./ExportButton";
import ProgressIndicator from "./ProgressIndicator";

export default function ExportPanel() {
  const isExporting = useAppStore((s) => s.isExporting);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const exportPhase = useAppStore((s) => s.exportPhase);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <h2 className="font-semibold text-gray-800">エクスポート</h2>
      <ExportButton />
      {isExporting && (
        <ProgressIndicator progress={exportProgress} phase={exportPhase} />
      )}
    </div>
  );
}
