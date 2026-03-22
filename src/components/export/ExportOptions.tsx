import { useAppStore } from "../../store/appStore";
import type { ScratchExportOptions } from "../../types";

// ラジオグループの共通コンポーネント
function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
      <div className="flex flex-wrap gap-3">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
            <input
              type="radio"
              name={label}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-indigo-600"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ExportOptions() {
  const opts = useAppStore((s) => s.scratchExportOptions);
  const setOpts = useAppStore((s) => s.setScratchExportOptions);

  function update(patch: Partial<ScratchExportOptions>) {
    setOpts(patch);
  }

  return (
    <div className="space-y-3">
      {/* warp */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={opts.warp}
          onChange={(e) => update({ warp: e.target.checked })}
          className="accent-indigo-600 w-4 h-4"
        />
        <span className="text-sm font-medium text-gray-700">
          warp（高速実行）を有効にする
        </span>
      </label>

      {/* outputFormat */}
      <RadioGroup<ScratchExportOptions["outputFormat"]>
        label="コスチューム形式"
        options={[
          { value: "svg", label: "SVG（ベクター、推奨）" },
          { value: "png", label: "PNG（ラスター）" },
        ]}
        value={opts.outputFormat}
        onChange={(v) => update({ outputFormat: v })}
      />

      {/* renderMode */}
      <RadioGroup<ScratchExportOptions["renderMode"]>
        label="描画方式"
        options={[
          { value: "clone", label: "クローン式" },
          { value: "pen", label: "ペン式（スタンプ）" },
        ]}
        value={opts.renderMode}
        onChange={(v) => update({ renderMode: v })}
      />

      {/* alignment */}
      <RadioGroup<ScratchExportOptions["alignment"]>
        label="テキスト揃え"
        options={[
          { value: "left",   label: "左揃え" },
          { value: "center", label: "中央揃え" },
          { value: "right",  label: "右揃え" },
        ]}
        value={opts.alignment}
        onChange={(v) => update({ alignment: v })}
      />
    </div>
  );
}
