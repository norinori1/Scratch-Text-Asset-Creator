import { useAppStore } from "../../store/appStore";

export default function CustomCharInput() {
  const customChars = useAppStore((s) => s.customChars);
  const setCustomChars = useAppStore((s) => s.setCustomChars);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        カスタム文字
        <span className="ml-2 text-xs text-gray-400">（追加したい文字を直接入力）</span>
      </label>
      <textarea
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-300 focus:outline-none"
        rows={3}
        value={customChars}
        onChange={(e) => setCustomChars(e.target.value)}
        placeholder="例: 〒〠♪♫"
      />
      {customChars && (
        <p className="text-xs text-gray-500 mt-1">
          {Array.from(new Set(Array.from(customChars))).length} 文字
        </p>
      )}
    </div>
  );
}
