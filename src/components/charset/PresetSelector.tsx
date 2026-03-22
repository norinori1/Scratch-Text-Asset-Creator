import { PRESETS } from "../../data/presets";
import { useAppStore } from "../../store/appStore";
import type { CharsetId } from "../../types";

export default function PresetSelector() {
  const setCharsetIds = useAppStore((s) => s.setCharsetIds);

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">クイックプリセット</p>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => setCharsetIds(preset.charsetIds as CharsetId[])}
            className="text-xs bg-white border border-indigo-300 text-indigo-700 rounded-full px-3 py-1 hover:bg-indigo-50 transition-colors"
            title={preset.description}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
