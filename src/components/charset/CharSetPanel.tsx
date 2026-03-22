import { useAppStore } from "../../store/appStore";
import type { CharsetId, CharsetDefinition } from "../../types";
import { ascii } from "../../data/charsets/ascii";
import { hiragana } from "../../data/charsets/hiragana";
import { katakana } from "../../data/charsets/katakana";
import { alphabet_fullwidth } from "../../data/charsets/alphabet";
import {
  kyoiku_kanji_grade1,
  kyoiku_kanji_grade2,
  kyoiku_kanji_grade3,
  kyoiku_kanji_grade4,
  kyoiku_kanji_grade5,
  kyoiku_kanji_grade6,
} from "../../data/charsets/kyoiku_kanji";
import CharCountBadge from "./CharCountBadge";
import CustomCharInput from "./CustomCharInput";
import PresetSelector from "./PresetSelector";
import { resolveCharList } from "../../core/CharSetResolver";

const ALL_CHARSETS: CharsetDefinition[] = [
  ascii,
  hiragana,
  katakana,
  alphabet_fullwidth,
  kyoiku_kanji_grade1,
  kyoiku_kanji_grade2,
  kyoiku_kanji_grade3,
  kyoiku_kanji_grade4,
  kyoiku_kanji_grade5,
  kyoiku_kanji_grade6,
];

export default function CharSetPanel() {
  const selectedCharsetIds = useAppStore((s) => s.selectedCharsetIds);
  const customChars = useAppStore((s) => s.customChars);
  const toggleCharset = useAppStore((s) => s.toggleCharset);

  const totalChars = resolveCharList(selectedCharsetIds, customChars).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">文字セット</h2>
        <CharCountBadge count={totalChars} />
      </div>

      <PresetSelector />

      <div className="space-y-2">
        {ALL_CHARSETS.map((cs) => (
          <label key={cs.id} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selectedCharsetIds.includes(cs.id as CharsetId)}
              onChange={() => toggleCharset(cs.id as CharsetId)}
              className="accent-indigo-600"
            />
            <span className="text-sm text-gray-700 group-hover:text-indigo-700 flex-1">
              {cs.label}
            </span>
            <span className="text-xs text-gray-400">{cs.count}字</span>
          </label>
        ))}
      </div>

      <CustomCharInput />
    </div>
  );
}
