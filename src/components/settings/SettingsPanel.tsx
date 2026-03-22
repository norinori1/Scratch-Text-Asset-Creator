import { useAppStore } from "../../store/appStore";
import SizeSlider from "./SizeSlider";
import ColorPicker from "./ColorPicker";

export default function SettingsPanel() {
  const renderOptions = useAppStore((s) => s.renderOptions);
  const setRenderOptions = useAppStore((s) => s.setRenderOptions);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <h2 className="font-semibold text-gray-800">レンダリング設定</h2>

      <SizeSlider
        label="フォントサイズ"
        min={16}
        max={256}
        step={8}
        value={renderOptions.fontSize}
        onChange={(v) => setRenderOptions({ fontSize: v })}
      />

      <SizeSlider
        label="パディング"
        min={0}
        max={32}
        value={renderOptions.padding}
        onChange={(v) => setRenderOptions({ padding: v })}
      />

      <ColorPicker
        label="文字色"
        value={renderOptions.foreground}
        onChange={(v) => setRenderOptions({ foreground: v ?? "#000000" })}
      />

      <ColorPicker
        label="背景色"
        value={renderOptions.background}
        onChange={(v) => setRenderOptions({ background: v })}
        nullable
      />
    </div>
  );
}
