import { useAppStore } from "../../store/appStore";
import type { TextInputMode } from "../../types";
import { Mode2RichTextSettings } from "./Mode2RichTextSettings";
import { Mode3ConsoleSettings } from "./Mode3ConsoleSettings";

/**
 * テキスト入力モード選択コンポーネント (§15, §5)
 *
 * Mode 1: パラメータブロック式（初心者向け）
 * Mode 2: リッチテキストインライン式（中級者向け）
 * Mode 3: コンソールスクリプト式（上級者向け）
 */
export function TextInputModeSelector() {
  const textInputMode = useAppStore((s) => s.textInputMode);
  const setTextInputMode = useAppStore((s) => s.setTextInputMode);

  const modes: { value: TextInputMode; label: string; description: string }[] = [
    {
      value: "param",
      label: "パラメータブロック式（初心者向け）",
      description:
        "「テキストを表示する」ブロックに色・サイズ等の引数が付く。直感的で使いやすい。",
    },
    {
      value: "richtext",
      label: "リッチテキストインライン式（中級者向け）",
      description:
        "<c=100>赤文字</c> のようなタグをテキストに直接書く。動的なテキストでも使用可能。",
    },
    {
      value: "console",
      label: "コンソールスクリプト式（上級者向け）",
      description:
        "「文字表示コンソール」リストにスクリプトを書いて実行する。最も柔軟な演出が可能。",
    },
  ];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-gray-700">テキスト入力モード</legend>

      <div className="space-y-2">
        {modes.map((mode) => (
          <label
            key={mode.value}
            className={`flex cursor-pointer rounded-lg border p-3 transition-colors ${
              textInputMode === mode.value
                ? "border-green-500 bg-green-50"
                : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name="textInputMode"
              value={mode.value}
              checked={textInputMode === mode.value}
              onChange={() => setTextInputMode(mode.value)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600 focus:ring-green-500"
            />
            <div className="ml-3">
              <span className="block text-sm font-medium text-gray-800">{mode.label}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{mode.description}</span>
            </div>
          </label>
        ))}
      </div>

      {/* モード別サブ設定 */}
      {textInputMode === "richtext" && <Mode2RichTextSettings />}
      {textInputMode === "console" && <Mode3ConsoleSettings />}
    </fieldset>
  );
}
